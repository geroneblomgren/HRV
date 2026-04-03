// js/devices/DeviceManager.js — Multi-device orchestrator
// Holds adapter slots, manages HR source priority, derives backward-compatible AppState fields.
// Phase 6: chest strap slot active; Muse slot wired in Phase 7.

import { AppState, subscribe } from '../state.js';
import { setSetting } from '../storage.js';
import {
  connect as hrmConnect,
  disconnect as hrmDisconnect,
  getCapabilities as hrmCaps,
  getDeviceType as hrmType,
} from './HRMAdapter.js';

// ---- Adapter slots ----
// Each slot must satisfy the DeviceAdapter interface (connect, disconnect, getCapabilities, getDeviceType).
const _adapters = {
  chestStrap: {
    connect: hrmConnect,
    disconnect: hrmDisconnect,
    getCapabilities: hrmCaps,
    getDeviceType: hrmType,
  },
  muse: null, // Phase 7 wires this
};

// ---- Public API ----

/**
 * Initialize DeviceManager.
 * Subscribes to per-device connection events and derives backward-compatible AppState fields.
 * Must be called once on app startup (after AppState is available).
 *
 * @returns {Promise<void>}
 */
export async function init() {
  // Derive AppState.connected and AppState.connectionStatus from per-device state
  subscribe('chestStrapConnected', () => {
    _deriveBackwardCompat();
    _updateHRSource();
    _updateCapabilities();
  });

  subscribe('museConnected', () => {
    _deriveBackwardCompat();
    _updateHRSource();
    _updateCapabilities();
  });

  subscribe('chestStrapStatus', () => {
    _deriveBackwardCompat();
  });

  subscribe('museStatus', () => {
    _deriveBackwardCompat();
  });

  subscribe('chestStrapName', (name) => {
    AppState.savedDeviceName = name; // mirror for legacy code
  });
}

/**
 * Open the BLE picker (or quick reconnect) for the chest strap and establish GATT connection.
 * Must be called from a user gesture.
 *
 * @returns {Promise<void>}
 */
export async function connectChestStrap() {
  await _adapters.chestStrap.connect();
  // Update capabilities in AppState after successful connect
  AppState.chestStrapCapabilities = _adapters.chestStrap.getCapabilities();
}

/**
 * Phase 6 Muse stub: open the BLE picker to allow pairing, store device name.
 * Does NOT attempt GATT connect — no Muse adapter exists yet (Phase 7).
 * Must be called from a user gesture.
 *
 * The optionalServices: [0xfe8d] ensures Phase 7 can reuse the pairing without re-prompting.
 *
 * @returns {Promise<void>}
 */
export async function connectMuse() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'Muse' }],
      optionalServices: [0xfe8d], // Muse data service — required for Phase 7 GATT access
    });
    const name = device.name;
    await setSetting('museName', name);
    AppState.museName = name;
    // Mark as paired but not connected — GATT connection added in Phase 7
    AppState.museStatus = 'paired';
  } catch (err) {
    console.warn('Muse pairing cancelled or failed:', err.message);
  }
}

/**
 * Disconnect all connected adapters.
 *
 * @returns {void}
 */
export function disconnectAll() {
  for (const [key, adapter] of Object.entries(_adapters)) {
    if (adapter && AppState[`${key}Connected`]) {
      adapter.disconnect();
    }
  }
}

// ---- Internal: HR source priority ----

/**
 * Determine which HR source label to display.
 * Priority: chest strap (gold standard) > Muse PPG > none.
 * Does NOT change source if a session is active (hrSourceLocked = true).
 */
function _updateHRSource() {
  if (AppState.hrSourceLocked) return; // prevent mid-session switch

  if (AppState.chestStrapConnected && AppState.chestStrapCapabilities.rr) {
    AppState.hrSourceLabel = 'Chest Strap';
  } else if (AppState.museConnected && AppState.museCapabilities.ppg) {
    AppState.hrSourceLabel = 'Muse PPG';
  } else {
    AppState.hrSourceLabel = null;
  }
}

// ---- Internal: capability merge ----

/**
 * Merge capabilities from all connected adapters via logical OR per flag.
 * Writes the combined result to AppState.activeCapabilities.
 * This tells UI what data is available from ANY connected source.
 */
function _updateCapabilities() {
  const combined = { hr: false, rr: false, eeg: false, ppg: false };

  if (AppState.chestStrapConnected) {
    const caps = AppState.chestStrapCapabilities;
    combined.hr = combined.hr || caps.hr;
    combined.rr = combined.rr || caps.rr;
    combined.eeg = combined.eeg || caps.eeg;
    combined.ppg = combined.ppg || caps.ppg;
  }

  if (AppState.museConnected) {
    const caps = AppState.museCapabilities;
    combined.hr = combined.hr || caps.hr;
    combined.rr = combined.rr || caps.rr;
    combined.eeg = combined.eeg || caps.eeg;
    combined.ppg = combined.ppg || caps.ppg;
  }

  AppState.activeCapabilities = combined;
}

// ---- Internal: backward compatibility ----

/**
 * Derive backward-compatible AppState fields that legacy code reads.
 * AppState.connected = OR of all per-device connected flags.
 * AppState.connectionStatus = chest strap status when relevant, else muse, else 'disconnected'.
 */
function _deriveBackwardCompat() {
  // Derive connected
  AppState.connected = AppState.chestStrapConnected || AppState.museConnected;

  // Derive connectionStatus — prefer chest strap, fall back to muse
  if (AppState.chestStrapConnected || AppState.chestStrapStatus === 'connecting' || AppState.chestStrapStatus === 'reconnecting') {
    AppState.connectionStatus = AppState.chestStrapStatus;
  } else if (AppState.museConnected || AppState.museStatus === 'connecting' || AppState.museStatus === 'reconnecting') {
    AppState.connectionStatus = AppState.museStatus;
  } else {
    AppState.connectionStatus = 'disconnected';
  }
}
