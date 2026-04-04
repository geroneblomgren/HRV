// js/audio.js — AudioEngine: lookahead scheduler + bowl tone with echo subdivisions
// Drift-free breathing pacer audio using Web Audio API scheduled timing.
// All audio param scheduling uses AudioContext.currentTime, never Date.now().
//
// Bowl strikes mark inhale/exhale transitions. Three quieter echoes subdivide
// each half-breath into perfect fourths, so the user can track pace eyes-closed.
// Example at 4.5 BPM (13.33s breath, 6.667s per half):
//   Bowl - 1.667s - echo - 1.667s - echo - 1.667s - echo - 1.667s - Bowl

import { AppState } from './state.js';

// ---- Module state (no AudioContext created at module level) ----
let _ctx = null;
let _masterGain = null;
let _nextCueTime = 0;
let _nextPhase = 'inhale';
let _schedulerTimer = null;

// ---- Scheduler constants ----
const LOOKAHEAD_MS = 25;         // setTimeout interval (ms)
const SCHEDULE_AHEAD_SEC = 0.1;  // how far ahead to schedule audio events (sec)

// ---- Echo configuration ----
const ECHO_COUNT = 3;            // number of echo subdivisions per half-breath
const ECHO_GAIN = 0.25;          // echo volume relative to main strike (0-1)

// ---- Public API ----

/**
 * Create AudioContext and master GainNode. MUST be called inside a user
 * gesture handler (e.g., startSession click chain) to satisfy Chrome's
 * autoplay policy. If already created, resumes a suspended context.
 */
export function initAudio() {
  if (_ctx) {
    if (_ctx.state === 'suspended') {
      _ctx.resume();
    }
    return;
  }
  _ctx = new (window.AudioContext || window.webkitAudioContext)();
  _masterGain = _ctx.createGain();
  _masterGain.gain.value = 0.4;
  _masterGain.connect(_ctx.destination);
}

/**
 * Start the breathing pacer scheduler.
 * @param {number} pacingFreqHz — breathing frequency in Hz (e.g., 0.0833 = 5 bpm)
 */
export function startPacer(pacingFreqHz) {
  if (!_ctx) return;
  // Stop any running scheduler to prevent overlap with old cues
  if (_schedulerTimer !== null) {
    clearTimeout(_schedulerTimer);
    _schedulerTimer = null;
  }
  AppState.pacingFreq = pacingFreqHz;
  // Start scheduling past the lookahead window so already-queued
  // AudioContext nodes from the previous tempo finish without overlap
  _nextCueTime = _ctx.currentTime + SCHEDULE_AHEAD_SEC + 0.05;
  _nextPhase = 'inhale';
  AppState.pacerEpoch = _nextCueTime;
  _schedulerTick();
}

/**
 * Stop the scheduler. Does NOT close AudioContext (reused on next session).
 */
export function stopPacer() {
  if (_schedulerTimer !== null) {
    clearTimeout(_schedulerTimer);
    _schedulerTimer = null;
  }
}

/**
 * Set master volume with click-free transition.
 * @param {number} value — 0.0 to 1.0
 */
export function setVolume(value) {
  if (!_masterGain || !_ctx) return;
  _masterGain.gain.setTargetAtTime(value, _ctx.currentTime, 0.05);
}

/**
 * Return current AudioContext time (seconds). Renderer uses this for visual sync.
 * @returns {number}
 */
export function getAudioTime() {
  return _ctx ? _ctx.currentTime : 0;
}

/**
 * Play a single bowl strike immediately. Used by Discovery (inter-block)
 * and Practice (session end) to signal transitions.
 * No-op if AudioContext not initialized.
 */
export function playChime() {
  if (!_ctx) return;
  _scheduleBowlStrike(_ctx.currentTime + 0.05, 'inhale', 0.7);
}

// ---- Internal: Lookahead scheduler ----

function _schedulerTick() {
  const halfPeriod = 1 / (AppState.pacingFreq * 2);
  while (_nextCueTime < _ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    _scheduleCue(_nextCueTime, _nextPhase, halfPeriod);
    AppState.nextCueTime = _nextCueTime;
    AppState.nextCuePhase = _nextPhase;
    _nextCueTime += halfPeriod;
    _nextPhase = _nextPhase === 'inhale' ? 'exhale' : 'inhale';
  }
  _schedulerTimer = setTimeout(_schedulerTick, LOOKAHEAD_MS);
}

/**
 * Schedule a main bowl strike + 3 echo subdivisions for one half-breath.
 * The main strike plays at 'time'. Echoes are spaced evenly across the
 * half-period, dividing it into 4 equal parts (perfect fourths).
 *
 * @param {number} time - AudioContext time for the main strike
 * @param {'inhale'|'exhale'} phase - current breath phase
 * @param {number} halfPeriod - duration of one half-breath in seconds
 */
function _scheduleCue(time, phase, halfPeriod) {
  // Main bowl strike at the transition point
  _scheduleBowlStrike(time, phase, 0.7);

  // 3 echoes dividing the half-breath into perfect fourths
  const interval = halfPeriod / (ECHO_COUNT + 1);
  for (let i = 1; i <= ECHO_COUNT; i++) {
    const echoTime = time + interval * i;
    _scheduleBowlStrike(echoTime, phase, ECHO_GAIN);
  }
}

// ---- Bowl strike (main + echo) ----

/**
 * Schedule a single bowl strike at the given time and volume.
 * Uses two slightly detuned sine oscillators for a rich, bell-like tone.
 *
 * @param {number} time - AudioContext time to play
 * @param {'inhale'|'exhale'} phase - determines pitch (inhale=higher, exhale=lower)
 * @param {number} peakGain - strike volume (0.7 for main, 0.25 for echoes)
 */
function _scheduleBowlStrike(time, phase, peakGain) {
  const osc1 = _ctx.createOscillator();
  const osc2 = _ctx.createOscillator();
  const gain = _ctx.createGain();

  osc1.type = 'sine';
  osc2.type = 'sine';

  // Different pitches for inhale/exhale
  const freq = phase === 'inhale' ? 280 : 220;
  osc1.frequency.setValueAtTime(freq, time);
  osc2.frequency.setValueAtTime(freq * 1.005, time); // slight detune for warmth

  // Fast strike attack (30ms) then exponential decay
  // Shorter decay for echoes (0.4s) vs main strikes (1.0s)
  const decayTC = peakGain >= 0.5 ? 1.0 : 0.4;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(peakGain, time + 0.03);
  gain.gain.setTargetAtTime(0.001, time + 0.03, decayTC);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(_masterGain);

  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + 5);
  osc2.stop(time + 5);
}
