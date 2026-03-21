// js/ble.js — BLEService: GATT connect, 0x2A37 parsing, artifact rejection, reconnect
// Connects to Garmin HRM 600 via Web Bluetooth, streams and cleans RR intervals.

import { AppState } from './state.js';
import { setSetting } from './storage.js';

// ---- Constants ----
const CONNECT_TIMEOUT_MS = 12000;
const RECONNECT_TIMEOUTS = [0, 1000, 2000, 4000, 8000]; // 5 attempts: immediate, then exponential
const MEDIAN_WINDOW = 5;
const MAX_DEVIATION = 0.20; // 20% relative threshold
const RR_MIN_MS = 300;
const RR_MAX_MS = 2000;
const RR_HISTORY_MAX = 20;
const BUFFER_SIZE = 512;

// ---- Module state ----
let _device = null;
let _reconnectAttempt = 0;
let _reconnectTimer = null;
let _rrHistory = []; // last N clean RR values for median computation

// ---- Connection ----

/**
 * Initiate a new BLE connection via the browser device picker.
 * Must be called from a user gesture (button click).
 */
export async function initiateConnection() {
  _device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }]
  });
  AppState.savedDeviceName = _device.name;
  AppState.deviceName = _device.name;
  await setSetting('deviceName', _device.name);
  await connect();
}

/**
 * Attempt to reconnect to a previously paired device without showing the picker.
 * Falls back to initiateConnection() if getDevices() is unavailable or device not found.
 */
export async function tryQuickConnect() {
  if (typeof navigator.bluetooth.getDevices !== 'function') {
    return initiateConnection();
  }
  try {
    const devices = await navigator.bluetooth.getDevices();
    const hrm = devices.find(d => d.name === AppState.savedDeviceName);
    if (hrm) {
      _device = hrm;
      await connect();
    } else {
      return initiateConnection();
    }
  } catch (err) {
    console.warn('Quick connect failed, falling back to picker:', err.message);
    return initiateConnection();
  }
}

/**
 * Disconnect from the current BLE device.
 */
export function disconnect() {
  cancelReconnect();
  if (_device && _device.gatt && _device.gatt.connected) {
    _device.gatt.disconnect();
  }
  AppState.connectionStatus = 'disconnected';
  AppState.connected = false;
}

// ---- Internal connection logic ----

/**
 * Connect to the stored device with a Promise.race timeout.
 * Sets up GATT service, characteristic, and notification listener.
 */
async function connect() {
  AppState.connectionStatus = 'connecting';
  try {
    const server = await connectWithTimeout(_device);
    const service = await server.getPrimaryService('heart_rate');
    const characteristic = await service.getCharacteristic('heart_rate_measurement');
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleNotification);

    // Listen for unexpected disconnects
    _device.addEventListener('gattserverdisconnected', onDisconnected);

    // Success
    _reconnectAttempt = 0;
    AppState.connected = true;
    AppState.connectionStatus = 'connected';
    AppState.lastConnectTime = Date.now();
    AppState.showManualReconnect = false;
  } catch (err) {
    AppState.connectionStatus = 'disconnected';
    throw err;
  }
}

/**
 * Wrap gatt.connect() in a Promise.race with a timeout to prevent hung promises.
 */
function connectWithTimeout(device) {
  const connectPromise = device.gatt.connect();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('GATT connect timeout')), CONNECT_TIMEOUT_MS)
  );
  return Promise.race([connectPromise, timeoutPromise]);
}

// ---- Reconnect state machine ----

function onDisconnected() {
  AppState.connected = false;
  AppState.connectionStatus = 'reconnecting';
  scheduleReconnect();
}

function scheduleReconnect() {
  if (_reconnectAttempt >= RECONNECT_TIMEOUTS.length) {
    AppState.connectionStatus = 'disconnected';
    AppState.showManualReconnect = true;
    return;
  }
  const delay = RECONNECT_TIMEOUTS[_reconnectAttempt++];
  _reconnectTimer = setTimeout(async () => {
    try {
      await connect();
    } catch (err) {
      console.warn(`Reconnect attempt ${_reconnectAttempt} failed:`, err.message);
      scheduleReconnect();
    }
  }, delay);
}

function cancelReconnect() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  _reconnectAttempt = 0;
}

// ---- 0x2A37 Notification Parsing ----

/**
 * Parse a Heart Rate Measurement (0x2A37) notification.
 * Extracts HR value and ALL RR interval values per the Bluetooth SIG HRS v1.0 spec.
 * RR values are in 1/1024 second resolution (Garmin), converted to milliseconds.
 *
 * @param {Event} event - characteristicvaluechanged event
 * @returns {{ bpm: number, rrValues: number[] }}
 */
function parseHRMNotification(event) {
  const view = event.target.value;
  const flags = view.getUint8(0);
  const hr16bit = (flags & 0x01) !== 0;
  const eePresent = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;

  // HR value starts at byte 1
  const bpm = hr16bit
    ? view.getUint16(1, true)
    : view.getUint8(1);

  // Offset past flags (1) + HR (1 or 2) + optional Energy Expended (2)
  let offset = 1 + (hr16bit ? 2 : 1) + (eePresent ? 2 : 0);

  // Extract ALL RR interval pairs (UINT16 LE, 1/1024 sec resolution)
  const rrValues = [];
  if (rrPresent) {
    while (offset + 1 < view.byteLength) {
      const rawRR = view.getUint16(offset, true);
      const ms = (rawRR / 1024) * 1000;
      rrValues.push(ms);
      offset += 2;
    }
  }

  return { bpm, rrValues };
}

// ---- Artifact Rejection ----

/**
 * Two-tier artifact rejection:
 * Tier 1: Absolute bounds (< 300ms or > 2000ms)
 * Tier 2: Relative bounds (> 20% deviation from 5-beat running median)
 *
 * @param {number} ms - RR interval in milliseconds
 * @returns {boolean} true if artifact (should be rejected)
 */
function rejectArtifact(ms) {
  // Tier 1: absolute bounds
  if (ms < RR_MIN_MS || ms > RR_MAX_MS) return true;

  // Tier 2: relative bounds (need minimum history)
  if (_rrHistory.length >= MEDIAN_WINDOW) {
    const window = _rrHistory.slice(-MEDIAN_WINDOW);
    const sorted = [...window].sort((a, b) => a - b);
    const median = sorted[Math.floor(MEDIAN_WINDOW / 2)];
    if (Math.abs(ms - median) / median > MAX_DEVIATION) return true;
  }

  return false;
}

/**
 * Process an array of RR values: reject artifacts and interpolate, accept clean values.
 * Updates AppState counters and circular buffer.
 *
 * @param {number[]} rrValues - Array of RR intervals in ms
 */
function ingestRRValues(rrValues) {
  for (const ms of rrValues) {
    if (rejectArtifact(ms)) {
      AppState.artifactCount++;
      // Interpolate: use last clean value, or accept raw if no history yet
      const fillValue = _rrHistory.length > 0
        ? _rrHistory[_rrHistory.length - 1]
        : ms;
      writeToCircularBuffer(fillValue);
    } else {
      _rrHistory.push(ms);
      if (_rrHistory.length > RR_HISTORY_MAX) _rrHistory.shift();
      AppState.rrCount++;
      AppState.currentHR = Math.round(60000 / ms);
      writeToCircularBuffer(ms);
    }
  }
}

/**
 * Write an RR interval to the circular Float32Array buffer in AppState.
 *
 * @param {number} ms - RR interval in milliseconds
 */
function writeToCircularBuffer(ms) {
  AppState.rrBuffer[AppState.rrHead] = ms;
  AppState.rrHead = (AppState.rrHead + 1) % BUFFER_SIZE;
}

// ---- Notification Handler ----

/**
 * Handle incoming BLE heart rate measurement notifications.
 * Parses HR and RR values, updates AppState.
 */
function handleNotification(event) {
  const { bpm, rrValues } = parseHRMNotification(event);
  AppState.currentHR = bpm;
  if (rrValues.length > 0) {
    ingestRRValues(rrValues);
  }
}
