// js/devices/HRMAdapter.js — Garmin HRM 600 (and compatible chest straps) adapter
// Implements the DeviceAdapter interface. Extracted from js/ble.js.
// Satisfies: connect, disconnect, getCapabilities, getDeviceType exports.

import { AppState } from '../state.js';
import { getSetting, setSetting } from '../storage.js';

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

// ---- Public API (DeviceAdapter interface) ----

/**
 * Open BLE picker or attempt quick reconnect, then establish GATT connection.
 * Must be called from a user gesture (button click).
 *
 * Storage key migration: reads 'chestStrapName' first; falls back to legacy 'deviceName'.
 * If legacy key found, migrates to 'chestStrapName' without data loss.
 *
 * @returns {Promise<void>}
 */
export async function connect() {
  // Load saved name — prefer new key, fall back to legacy
  let savedName = await getSetting('chestStrapName');
  if (!savedName) {
    const legacyName = await getSetting('deviceName');
    if (legacyName) {
      savedName = legacyName;
      await setSetting('chestStrapName', legacyName); // migrate
    }
  }

  if (savedName) {
    // Attempt quick reconnect first
    if (typeof navigator.bluetooth.getDevices === 'function') {
      try {
        const devices = await navigator.bluetooth.getDevices();
        const hrm = devices.find(d => d.name === savedName);
        if (hrm) {
          _device = hrm;
          await _connect();
          return;
        }
      } catch (err) {
        console.warn('Quick connect failed, falling back to picker:', err.message);
      }
    }
  }

  // Fall through to picker
  _device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }]
  });
  AppState.chestStrapName = _device.name;
  AppState.savedDeviceName = _device.name; // backward compat
  await setSetting('chestStrapName', _device.name);
  await setSetting('deviceName', _device.name); // backward compat
  await _connect();
}

/**
 * Cancel any pending reconnect timers and cleanly disconnect GATT.
 *
 * @returns {void}
 */
export function disconnect() {
  cancelReconnect();
  if (_device && _device.gatt && _device.gatt.connected) {
    _device.gatt.disconnect();
  }
  AppState.chestStrapStatus = 'disconnected';
  AppState.chestStrapConnected = false;
}

/**
 * Return the static capability set for this adapter.
 *
 * @returns {{ hr: boolean, rr: boolean, eeg: boolean, ppg: boolean }}
 */
export function getCapabilities() {
  return { hr: true, rr: true, eeg: false, ppg: false };
}

/**
 * Return the stable string identifier used as the adapter slot key in DeviceManager.
 *
 * @returns {'chestStrap'}
 */
export function getDeviceType() {
  return 'chestStrap';
}

// ---- Internal connection logic ----

/**
 * Connect to the stored _device with a Promise.race timeout.
 * Sets up GATT service, characteristic, and notification listener.
 * Removes any stale gattserverdisconnected listener before adding a fresh one
 * to prevent listener accumulation across reconnect cycles.
 */
async function _connect() {
  AppState.chestStrapStatus = 'connecting';
  try {
    const server = await connectWithTimeout(_device);
    const service = await server.getPrimaryService('heart_rate');
    const characteristic = await service.getCharacteristic('heart_rate_measurement');
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleNotification);

    // Remove stale listener before adding fresh one (prevents listener accumulation)
    _device.removeEventListener('gattserverdisconnected', onDisconnected);
    _device.addEventListener('gattserverdisconnected', onDisconnected);

    // Success
    _reconnectAttempt = 0;
    AppState.chestStrapConnected = true;
    AppState.chestStrapStatus = 'connected';
    AppState.lastConnectTime = Date.now();
    AppState.showManualReconnect = false;

    // Update name in AppState if not already set
    if (_device.name && !AppState.chestStrapName) {
      AppState.chestStrapName = _device.name;
      AppState.savedDeviceName = _device.name; // backward compat
    }
  } catch (err) {
    AppState.chestStrapStatus = 'disconnected';
    throw err;
  }
}

/**
 * Wrap gatt.connect() in a Promise.race with a timeout to prevent hung promises.
 *
 * @param {BluetoothDevice} device
 * @returns {Promise<BluetoothRemoteGATTServer>}
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
  AppState.chestStrapConnected = false;
  AppState.chestStrapStatus = 'reconnecting';
  scheduleReconnect();
}

function scheduleReconnect() {
  if (_reconnectAttempt >= RECONNECT_TIMEOUTS.length) {
    AppState.chestStrapStatus = 'disconnected';
    AppState.showManualReconnect = true;
    return;
  }
  const delay = RECONNECT_TIMEOUTS[_reconnectAttempt++];
  _reconnectTimer = setTimeout(async () => {
    try {
      await _connect();
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
