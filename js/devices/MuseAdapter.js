// js/devices/MuseAdapter.js — Muse-S BLE adapter
// Implements the DeviceAdapter interface for the Muse-S EEG headband.
// Connects via Web Bluetooth service 0xfe8d, sends p50 preset to enable
// dual EEG+PPG streaming, parses notifications into AppState circular buffers.
//
// Protocol reference: muse-js v3.3.0 (Respiire/MuseJS) — ported to vanilla JS, no RxJS.

import { AppState } from '../state.js';
import { getSetting, setSetting } from '../storage.js';
import { initEEGPipeline, stopEEGPipeline } from '../museSignalProcessing.js';

// ---- Constants ----

const CONNECT_TIMEOUT_MS = 12000;

// Primary Muse service UUID
const MUSE_SERVICE = 0xfe8d;

// Control characteristic — used to send preset + start commands
const MUSE_CONTROL_UUID = '273e0001-4e6f-7265-6d49-6d6f62697665';

// EEG channel characteristics: TP9, AF7, AF8, TP10 (indices 0-3)
// Note: Muse has a 5th EEG channel (AUX/273e0008) omitted here — 4 channels used.
const EEG_UUIDS = [
  '273e0003-4e6f-7265-6d49-6d6f62697665', // TP9  (index 0)
  '273e0004-4e6f-7265-6d49-6d6f62697665', // AF7  (index 1)
  '273e0005-4e6f-7265-6d49-6d6f62697665', // AF8  (index 2)
  '273e0006-4e6f-7265-6d49-6d6f62697665', // TP10 (index 3)
];

// PPG channel characteristics: Ch0 (IR), Ch1 (Green), Ch2
const PPG_UUIDS = [
  '273e000f-4e6f-7265-6d49-6d6f62697665', // Ch0 — Infrared
  '273e0010-4e6f-7265-6d49-6d6f62697665', // Ch1 — Green (best cardiac signal)
  '273e0011-4e6f-7265-6d49-6d6f62697665', // Ch2
];

// ---- Module state ----

let _device = null;
let _controlChar = null;
let _eegChars = [];
let _ppgChars = [];

// Bound handler references (kept so we can removeEventListener precisely)
let _eegHandlers = [];
let _ppgHandlers = [];
let _disconnectHandler = null;

// External callback hooks (Plans 02 and 03 wire in their processing functions)
let _ppgCallback = null;
let _eegCallback = null;

// ---- Public API (DeviceAdapter interface) ----

/**
 * Open BLE picker (or quick reconnect) and establish full GATT connection.
 * Sends p50 preset to enable EEG+PPG streaming, subscribes all characteristics.
 * Must be called from a user gesture (button click).
 *
 * @returns {Promise<void>}
 */
export async function connect() {
  // Try quick reconnect if we have a saved name
  const savedName = await getSetting('museName');

  if (savedName) {
    if (typeof navigator.bluetooth.getDevices === 'function') {
      try {
        const devices = await navigator.bluetooth.getDevices();
        const muse = devices.find(d => d.name === savedName);
        if (muse) {
          _device = muse;
          await _connectGATT();
          return;
        }
      } catch (err) {
        console.warn('Muse quick reconnect failed, falling back to picker:', err.message);
      }
    }
  }

  // Fall back to picker
  _device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [MUSE_SERVICE] }],
  });
  await _connectGATT();
}

/**
 * Clean up all characteristic event listeners and disconnect GATT.
 * Resets all AppState Muse fields and clears circular buffers.
 *
 * @returns {void}
 */
export function disconnect() {
  _cleanupListeners();

  if (_device && _device.gatt && _device.gatt.connected) {
    _device.gatt.disconnect();
  }

  // Stop EEG pipeline (Plan 03)
  stopEEGPipeline();

  _resetAppState();
  _resetBuffers();
}

/**
 * Return the static capability set for this adapter.
 *
 * @returns {{ hr: boolean, rr: boolean, eeg: boolean, ppg: boolean }}
 */
export function getCapabilities() {
  return { hr: true, rr: true, eeg: true, ppg: true };
}

/**
 * Return the stable string identifier used as the adapter slot key in DeviceManager.
 *
 * @returns {'muse-s'}
 */
export function getDeviceType() {
  return 'muse-s';
}

/**
 * Register a callback that receives filtered PPG samples per-channel.
 * Called by Plan 02's PPG pipeline after writing to debug buffers.
 *
 * @param {((channelIndex: number, samples: number[]) => void) | null} fn
 */
export function setPPGCallback(fn) {
  _ppgCallback = fn;
}

/**
 * Register a callback that receives parsed EEG samples per-channel.
 * Called by Plan 03's EEG FFT pipeline after writing to eegBuffers.
 *
 * @param {((channelIndex: number, samples: number[]) => void) | null} fn
 */
export function setEEGCallback(fn) {
  _eegCallback = fn;
}

// ---- Internal: encoding ----

/**
 * Encode a string command to the Muse control characteristic format.
 * Source: muse-js src/lib/muse-utils.ts
 *
 * @param {string} cmd
 * @returns {Uint8Array}
 */
function encodeCommand(cmd) {
  const encoded = new TextEncoder().encode(`X${cmd}\n`);
  encoded[0] = encoded.length - 1; // first byte = payload length
  return encoded;
}

// ---- Internal: parsing ----

/**
 * Unpack 12-bit samples from a 3-bytes-per-2-samples packed format.
 * Source: muse-js src/lib/muse-parse.ts decodeUnsigned12BitData
 *
 * @param {Uint8Array} samples
 * @returns {number[]}
 */
function decodeUnsigned12BitData(samples) {
  const result = [];
  for (let i = 0; i < samples.length; i += 3) {
    const a = (samples[i] << 4) | (samples[i + 1] >> 4);
    const b = ((samples[i + 1] & 0xF) << 8) | samples[i + 2];
    result.push(a, b);
  }
  return result;
}

/**
 * Handle an EEG characteristicvaluechanged notification.
 * Parses 12-bit packed data, converts to microvolts, writes to AppState.eegBuffers.
 * Increments AppState.eegHead only from channel 0 (TP9) to maintain a single time reference.
 *
 * @param {Event} event
 * @param {number} channelIndex - 0=TP9, 1=AF7, 2=AF8, 3=TP10
 */
function parseEEGNotification(event, channelIndex) {
  const rawBytes = new Uint8Array(event.target.value.buffer, 2); // skip 2-byte event index
  const raw12bit = decodeUnsigned12BitData(rawBytes);
  const microvolts = raw12bit.map(n => 0.48828125 * (n - 0x800));

  // Write 12 samples to the circular buffer for this channel
  const buf = AppState.eegBuffers[channelIndex];
  const baseHead = AppState.eegHead;
  for (let i = 0; i < microvolts.length; i++) {
    buf[(baseHead + i) % 512] = microvolts[i];
  }

  // Only advance the shared head pointer from TP9 (channel 0)
  if (channelIndex === 0) {
    AppState.eegHead = baseHead + microvolts.length;
  }

  if (_eegCallback) {
    _eegCallback(channelIndex, microvolts);
  }
}

/**
 * Handle a PPG characteristicvaluechanged notification.
 * Parses 6 x 24-bit unsigned samples (3 bytes each, big-endian).
 * Writes to AppState.ppgDebugBuffers.
 * Increments AppState.ppgDebugHead only from channel 0 to maintain a single time reference.
 *
 * CRITICAL: PPG samples are 24-bit (3 bytes each), NOT 16-bit.
 *
 * @param {Event} event
 * @param {number} channelIndex - 0=IR, 1=Green, 2=Unknown
 */
function parsePPGNotification(event, channelIndex) {
  const bytes = new Uint8Array(event.target.value.buffer, 2); // skip 2-byte event index
  const samples = [];
  for (let i = 0; i < bytes.length; i += 3) {
    samples.push((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]);
  }

  // Write 6 samples to the debug circular buffer for this channel
  const buf = AppState.ppgDebugBuffers[channelIndex];
  const baseHead = AppState.ppgDebugHead;
  for (let i = 0; i < samples.length; i++) {
    buf[(baseHead + i) % 256] = samples[i];
  }

  // Only advance the shared head pointer from channel 0 (IR)
  if (channelIndex === 0) {
    AppState.ppgDebugHead = baseHead + samples.length;
  }

  if (_ppgCallback) {
    _ppgCallback(channelIndex, samples);
  }
}

// ---- Internal: connection logic ----

/**
 * Establish GATT connection to the stored _device with a timeout.
 * Fetches all characteristics, subscribes notifications (before sending commands),
 * then sends the p50 preset command sequence: h → p50 → s → d.
 *
 * @returns {Promise<void>}
 */
async function _connectGATT() {
  AppState.museStatus = 'connecting';

  try {
    // Connect with timeout (mirrors HRMAdapter pattern)
    const connectPromise = _device.gatt.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('GATT connect timeout')), CONNECT_TIMEOUT_MS)
    );
    const server = await Promise.race([connectPromise, timeoutPromise]);

    // Get primary Muse service
    const service = await server.getPrimaryService(MUSE_SERVICE);

    // Fetch control + all EEG + all PPG characteristics up front
    _controlChar = await service.getCharacteristic(MUSE_CONTROL_UUID);
    _eegChars = await Promise.all(EEG_UUIDS.map(uuid => service.getCharacteristic(uuid)));
    _ppgChars = await Promise.all(PPG_UUIDS.map(uuid => service.getCharacteristic(uuid)));

    // Subscribe ALL characteristics BEFORE sending commands
    for (const ch of [..._eegChars, ..._ppgChars]) {
      await ch.startNotifications();
    }

    // Attach handlers — store bound references for precise cleanup later
    _eegHandlers = _eegChars.map((ch, i) => {
      const handler = (e) => parseEEGNotification(e, i);
      ch.addEventListener('characteristicvaluechanged', handler);
      return handler;
    });

    _ppgHandlers = _ppgChars.map((ch, i) => {
      const handler = (e) => parsePPGNotification(e, i);
      ch.addEventListener('characteristicvaluechanged', handler);
      return handler;
    });

    // Register disconnect listener (remove stale one first to prevent accumulation)
    _disconnectHandler = _onDisconnected;
    _device.removeEventListener('gattserverdisconnected', _disconnectHandler);
    _device.addEventListener('gattserverdisconnected', _disconnectHandler);

    // Send p50 preset command sequence
    await _controlChar.writeValue(encodeCommand('h'));
    await _controlChar.writeValue(encodeCommand('p50'));
    await _controlChar.writeValue(encodeCommand('s'));
    await _controlChar.writeValue(encodeCommand('d'));

    // Persist name and update AppState
    await setSetting('museName', _device.name);
    AppState.museName = _device.name;
    AppState.museConnected = true;
    AppState.museStatus = 'streaming';
    AppState.museCapabilities = { hr: true, rr: true, eeg: true, ppg: true };

    // Start EEG pipeline (Plan 03)
    initEEGPipeline();

  } catch (err) {
    AppState.museStatus = 'disconnected';
    throw err;
  }
}

/**
 * Handle GATT server disconnect event.
 * No auto-reconnect in Phase 7 — user must press Connect again.
 */
function _onDisconnected() {
  _cleanupListeners();
  // Stop EEG pipeline on unexpected disconnect (Plan 03)
  stopEEGPipeline();
  _resetAppState();
  // Note: do NOT resetBuffers on disconnect — preserve last data for debugging
}

/**
 * Remove all characteristic event listeners precisely.
 */
function _cleanupListeners() {
  _eegChars.forEach((ch, i) => {
    if (_eegHandlers[i]) {
      ch.removeEventListener('characteristicvaluechanged', _eegHandlers[i]);
    }
  });
  _ppgChars.forEach((ch, i) => {
    if (_ppgHandlers[i]) {
      ch.removeEventListener('characteristicvaluechanged', _ppgHandlers[i]);
    }
  });

  if (_device && _disconnectHandler) {
    _device.removeEventListener('gattserverdisconnected', _disconnectHandler);
  }

  _eegHandlers = [];
  _ppgHandlers = [];
  _disconnectHandler = null;
}

/**
 * Reset AppState Muse connection fields to disconnected defaults.
 */
function _resetAppState() {
  AppState.museConnected = false;
  AppState.museStatus = 'disconnected';
  AppState.museCapabilities = { hr: false, rr: false, eeg: false, ppg: false };
}

/**
 * Clear EEG and PPG circular buffers and reset head pointers.
 * Called on explicit disconnect (not on unexpected disconnect — preserve last data).
 */
function _resetBuffers() {
  AppState.eegBuffers.forEach(buf => buf.fill(0));
  AppState.eegHead = 0;
  AppState.ppgDebugBuffers.forEach(buf => buf.fill(0));
  AppState.ppgDebugHead = 0;
}
