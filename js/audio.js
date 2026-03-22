// js/audio.js — AudioEngine: lookahead scheduler + three tone synthesizers
// Drift-free breathing pacer audio using Web Audio API scheduled timing.
// All audio param scheduling uses AudioContext.currentTime, never Date.now().

import { AppState } from './state.js';

// ---- Module state (no AudioContext created at module level) ----
let _ctx = null;
let _masterGain = null;
let _currentStyle = 'pitch';   // 'pitch' | 'swell' | 'bowl'
let _nextCueTime = 0;
let _nextPhase = 'inhale';
let _schedulerTimer = null;

// ---- Scheduler constants ----
const LOOKAHEAD_MS = 25;         // setTimeout interval (ms)
const SCHEDULE_AHEAD_SEC = 0.1;  // how far ahead to schedule audio events (sec)

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
  const halfPeriod = 1 / (pacingFreqHz * 2);
  _nextCueTime = _ctx.currentTime + 0.1;
  _nextPhase = 'inhale';
  _schedulerTick(halfPeriod);
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
 * Set the audio tone style. Takes effect on the next scheduled cue.
 * @param {'pitch'|'swell'|'bowl'} style
 */
export function setStyle(style) {
  _currentStyle = style;
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

// ---- Internal: Lookahead scheduler ----

function _schedulerTick(halfPeriod) {
  while (_nextCueTime < _ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    _scheduleCue(_nextCueTime, _nextPhase, halfPeriod);
    AppState.nextCueTime = _nextCueTime;
    AppState.nextCuePhase = _nextPhase;
    _nextCueTime += halfPeriod;
    _nextPhase = _nextPhase === 'inhale' ? 'exhale' : 'inhale';
  }
  _schedulerTimer = setTimeout(() => _schedulerTick(halfPeriod), LOOKAHEAD_MS);
}

function _scheduleCue(time, phase, halfPeriod) {
  switch (_currentStyle) {
    case 'pitch':
      _schedulePitchCue(time, phase, halfPeriod);
      break;
    case 'swell':
      _scheduleSwellCue(time, phase, halfPeriod);
      break;
    case 'bowl':
      _scheduleBowlCue(time, phase, halfPeriod);
      break;
  }
}

// ---- Style 1: Pitch (frequency sweep) ----

function _schedulePitchCue(time, phase, halfPeriod) {
  const osc = _ctx.createOscillator();
  const gain = _ctx.createGain();

  osc.type = 'sine';

  // Frequency: inhale ramps 220->350 Hz, exhale ramps 350->220 Hz
  const startFreq = phase === 'inhale' ? 220 : 350;
  const endFreq = phase === 'inhale' ? 350 : 220;
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(endFreq, time + halfPeriod);

  // Gain envelope: 200ms attack, fade to silence over halfPeriod
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.6, time + 0.2);
  gain.gain.linearRampToValueAtTime(0, time + halfPeriod);

  osc.connect(gain);
  gain.connect(_masterGain);

  osc.start(time);
  osc.stop(time + halfPeriod + 0.05);
}

// ---- Style 2: Swell (volume sweep) ----

function _scheduleSwellCue(time, phase, halfPeriod) {
  const osc = _ctx.createOscillator();
  const gain = _ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(240, time);  // warmer, more audible than 180

  const peak = phase === 'inhale' ? 0.8 : 0.5;
  const mid = halfPeriod / 2;

  // Gain: swell up to peak at midpoint, fade back down
  // Use higher floor (0.05) so it's always audible
  gain.gain.setValueAtTime(0.05, time);
  gain.gain.linearRampToValueAtTime(peak, time + mid);
  gain.gain.linearRampToValueAtTime(0.05, time + halfPeriod);

  osc.connect(gain);
  gain.connect(_masterGain);

  osc.start(time);
  osc.stop(time + halfPeriod + 0.05);
}

// ---- Style 3: Bowl (strike + decay) ----

function _scheduleBowlCue(time, phase, halfPeriod) {
  // Use two slightly detuned oscillators for a richer, more bowl-like tone
  const osc1 = _ctx.createOscillator();
  const osc2 = _ctx.createOscillator();
  const gain = _ctx.createGain();

  osc1.type = 'sine';
  osc2.type = 'sine';

  // Different pitches for inhale/exhale — both clearly audible
  const freq = phase === 'inhale' ? 280 : 220;
  osc1.frequency.setValueAtTime(freq, time);
  osc2.frequency.setValueAtTime(freq * 1.005, time); // slight detune for warmth

  // Fast strike attack (30ms) then exponential decay (timeConstant=1.0s)
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.7, time + 0.03);
  gain.gain.setTargetAtTime(0.001, time + 0.03, 1.0);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(_masterGain);

  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + 5);
  osc2.stop(time + 5);
}
