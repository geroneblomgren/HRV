// js/state.js — Proxy-based reactive AppState with pub/sub
// Central data bus for all modules. All inter-module communication
// goes through AppState subscriptions, not direct imports.

const _listeners = {};

export const AppState = new Proxy({
  // BLE state (Phase 1)
  connectionStatus: 'disconnected',  // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  connected: false,
  deviceName: null,
  connectionUptime: 0,              // seconds since last connect
  lastConnectTime: null,
  showManualReconnect: false,

  // RR stream (Phase 1 — BLEService writes)
  rrBuffer: new Float32Array(512),  // circular buffer: clean RR intervals in ms
  rrHead: 0,                        // write pointer into circular buffer
  rrCount: 0,                       // total clean RR intervals received this session
  artifactCount: 0,                 // total rejected artifacts this session
  currentHR: 0,                     // bpm computed from last clean RR interval

  // Session state (used by phases 3-4)
  sessionPhase: 'idle',             // 'idle' | 'discovery' | 'practice'
  sessionStartTime: null,

  // DSP results (populated by Phase 2)
  coherenceScore: 0,
  lfPower: 0,
  spectralBuffer: null,
  calibrating: true,

  // Pacer (Phase 3)
  pacingFreq: 0.0833,               // Hz = 5 breaths/min default
  pacerEpoch: 0,                    // AudioContext time when pacer started (for circle sync)
  nextCueTime: 0,
  nextCuePhase: 'inhale',

  // Storage-backed settings (Phase 1 — loaded on startup)
  savedResonanceFreq: null,
  savedDeviceName: null,

  // Oura (Phase 5)
  ouraData: null,
  ouraConnected: false,

  // Multi-device state (Phase 6)
  chestStrapConnected: false,
  chestStrapStatus: 'disconnected',   // 'disconnected'|'connecting'|'connected'|'reconnecting'
  chestStrapName: null,
  chestStrapCapabilities: { hr: false, rr: false, eeg: false, ppg: false },

  museConnected: false,
  museStatus: 'disconnected',
  museName: null,
  museCapabilities: { hr: false, rr: false, eeg: false, ppg: false },

  // HR source routing (Phase 6)
  hrSourceLabel: null,           // 'Chest Strap' | 'Muse PPG' | null (no device)
  hrSourceLocked: false,         // true during active session — prevents mid-session switch

  // Active capabilities (Phase 6) — logical OR of all connected adapters
  activeCapabilities: { hr: false, rr: false, eeg: false, ppg: false },
}, {
  set(target, key, value) {
    target[key] = value;
    (_listeners[key] || []).forEach(fn => fn(value));
    return true;
  }
});

/**
 * Subscribe to changes on a specific AppState key.
 * @param {string} key - The AppState property name to watch
 * @param {Function} fn - Callback receiving the new value
 */
export function subscribe(key, fn) {
  if (!_listeners[key]) _listeners[key] = [];
  _listeners[key].push(fn);
}

/**
 * Unsubscribe a previously registered callback.
 * @param {string} key - The AppState property name
 * @param {Function} fn - The exact function reference to remove
 */
export function unsubscribe(key, fn) {
  if (_listeners[key]) {
    _listeners[key] = _listeners[key].filter(f => f !== fn);
  }
}
