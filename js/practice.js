// js/practice.js — Practice Mode controller
// Guided breathing sessions at the user's saved resonance frequency.
// Collects a per-second coherence trace, chimes at timer zero,
// shows summary, and saves the full session to IndexedDB.

import { AppState, subscribe, unsubscribe } from './state.js';
import { initAudio, startPacer, stopPacer, playChime, setStyle, setVolume } from './audio.js';
import { initDSP, tick } from './dsp.js';
import { startRendering, stopRendering } from './renderer.js';
import { saveSession } from './storage.js';

// ---- Module state ----

let _sessionStart = 0;           // Date.now() at session start
let _sessionDurationMs = 0;      // selected duration in ms
let _dspInterval = null;         // setInterval handle (1s DSP tick)
let _coherenceTrace = [];        // array of coherence scores (1 per second)
let _chimePlayed = false;        // prevents double chime
let _pausedForReconnect = false; // true when BLE disconnects mid-session
let _selectedDuration = 20;     // minutes (default 20)
let _active = false;            // true when a session is running

// Named listener references for clean unsubscribe
let _connectedResumeListener = null;
let _freqDisplayListener = null;
let _startBtnListener = null;
let _connectedStartListener = null;

// ---- DOM helpers ----

function _getEl(id) {
  return document.getElementById(id);
}

function _show(el) {
  if (el) el.style.display = '';
}

function _hide(el) {
  if (el) el.style.display = 'none';
}

// ---- Public API ----

/**
 * Entry point. Call from a user gesture so AudioContext can init.
 * Reads AppState.savedResonanceFreq and starts a guided breathing session.
 */
export function startPractice() {
  if (_active) return;
  const savedFreq = AppState.savedResonanceFreq;
  if (!savedFreq) return;

  _active = true;
  _chimePlayed = false;
  _pausedForReconnect = false;
  _coherenceTrace = [];
  _sessionStart = Date.now();
  _sessionDurationMs = _selectedDuration * 60 * 1000;

  AppState.sessionPhase = 'practice';
  AppState.pacingFreq = savedFreq;
  AppState.sessionStartTime = _sessionStart;

  // Show session viz, hide placeholder and summary
  const sessionViz = _getEl('practice-session-viz');
  if (sessionViz) {
    sessionViz.style.display = 'flex';
    sessionViz.style.flexDirection = 'column';
  }
  _hide(_getEl('practice-placeholder'));
  _hide(_getEl('practice-summary'));

  // Reset End Session button text
  const endBtn = _getEl('practice-end-btn');
  if (endBtn) {
    endBtn.textContent = 'End Session';
    endBtn.classList.remove('chime-pulse');
  }

  // Get canvas elements
  const waveformCanvas = _getEl('practice-waveform-canvas');
  const gaugeCanvas = _getEl('practice-gauge-canvas');
  const pacerCanvas = _getEl('practice-pacer-canvas');

  // Init audio and DSP
  initAudio();
  initDSP();

  // Start renderer in countdown mode (sessionDuration > 0)
  startRendering(
    waveformCanvas,
    null,           // no spectrum canvas in practice mode
    gaugeCanvas,
    pacerCanvas,
    _sessionStart,
    _selectedDuration * 60
  );

  // Start pacer audio at saved resonance frequency
  startPacer(savedFreq);

  // Start 1-second DSP tick interval
  _dspInterval = setInterval(() => {
    const elapsed = (Date.now() - _sessionStart) / 1000;
    tick(elapsed);
    _coherenceTrace.push(AppState.coherenceScore);

    // When timer reaches zero, play chime then auto-end session
    if (elapsed >= _selectedDuration * 60 && !_chimePlayed) {
      _chimePlayed = true;
      playChime();
      // Brief delay so the chime is audible before session teardown
      setTimeout(() => stopPractice(), 500);
    }
  }, 1000);
}

/**
 * Stop the session, compute summary, save, and show summary screen.
 */
export function stopPractice() {
  if (!_active) return;
  _active = false;

  // Teardown DSP and audio
  if (_dspInterval) {
    clearInterval(_dspInterval);
    _dspInterval = null;
  }
  stopPacer();
  stopRendering();

  // Compute and display summary
  const summary = _computeSummary();
  _saveSession(summary);
  _showSummary(summary);
}

/**
 * Called by main.js when BLE disconnects.
 * Pauses audio and waits for reconnect.
 */
export function onDisconnect() {
  if (!_active) return;
  _pausedForReconnect = true;
  stopPacer();

  // Subscribe to connected state — resume on reconnect
  _connectedResumeListener = (connected) => {
    if (connected && _pausedForReconnect) {
      _pausedForReconnect = false;
      unsubscribe('connected', _connectedResumeListener);
      _connectedResumeListener = null;
      // Resume pacer at saved frequency
      startPacer(AppState.pacingFreq);
    }
  };
  subscribe('connected', _connectedResumeListener);
}

/**
 * Set selected session duration and update duration picker UI.
 * @param {number} minutes
 */
export function setDuration(minutes) {
  _selectedDuration = minutes;
  document.querySelectorAll('#practice-duration-picker .duration-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.minutes, 10) === minutes);
  });
}

/**
 * Initialize practice UI subscriptions and event listeners.
 * Called from main.js on app init.
 */
export function initPracticeUI() {
  // Update frequency display when savedResonanceFreq changes
  _freqDisplayListener = (freq) => {
    const freqDisplay = _getEl('practice-freq-display');
    if (!freqDisplay) return;
    if (freq) {
      const bpm = (freq * 60).toFixed(1);
      freqDisplay.textContent = `Your frequency: ${bpm} breaths/min`;
    } else {
      freqDisplay.textContent = 'No frequency set — complete Discovery first.';
    }
    _updateStartBtn();
  };
  subscribe('savedResonanceFreq', _freqDisplayListener);

  // Fire immediately with current value
  _freqDisplayListener(AppState.savedResonanceFreq);

  // Toggle start button on connected state change
  _connectedStartListener = () => _updateStartBtn();
  subscribe('connected', _connectedStartListener);

  // Duration picker buttons
  document.querySelectorAll('#practice-duration-picker .duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDuration(parseInt(btn.dataset.minutes, 10));
    });
  });

  // Start button
  const startBtn = _getEl('practice-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => startPractice());
  }

  // End button
  const endBtn = _getEl('practice-end-btn');
  if (endBtn) {
    endBtn.addEventListener('click', () => stopPractice());
  }

  // Done button (returns to placeholder)
  const doneBtn = _getEl('practice-done-btn');
  if (doneBtn) {
    doneBtn.addEventListener('click', () => _onDone());
  }

  // Practice tab audio style buttons
  document.querySelectorAll('#practice-style-buttons .style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#practice-style-buttons .style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setStyle(btn.dataset.style);
    });
  });

  // Practice tab volume slider
  const practiceVolSlider = _getEl('practice-volume-slider');
  if (practiceVolSlider) {
    practiceVolSlider.addEventListener('input', e => {
      setVolume(e.target.value / 100);
    });
  }
}

// ---- Internal functions ----

/**
 * Enable/disable start button based on connected + savedResonanceFreq state.
 */
function _updateStartBtn() {
  const startBtn = _getEl('practice-start-btn');
  if (!startBtn) return;
  const canStart = AppState.connected && !!AppState.savedResonanceFreq;
  startBtn.disabled = !canStart;
}

/**
 * Compute session summary metrics from the coherence trace.
 * @returns {{durationSeconds: number, mean: number, peak: number, timeInHigh: number, trace: number[]}}
 */
function _computeSummary() {
  const trace = _coherenceTrace.slice();
  const durationSeconds = trace.length > 0
    ? trace.length
    : Math.round((Date.now() - _sessionStart) / 1000);

  if (trace.length === 0) {
    return { durationSeconds, mean: 0, peak: 0, timeInHigh: 0, trace };
  }

  const sum = trace.reduce((acc, v) => acc + v, 0);
  const mean = Math.round(sum / trace.length);
  const peak = Math.round(Math.max(...trace));
  const timeInHigh = trace.filter(v => v >= 66).length; // seconds in "Locked In" zone

  return { durationSeconds, mean, peak, timeInHigh, trace };
}

/**
 * Format seconds as mm:ss string.
 * @param {number} totalSeconds
 * @returns {string}
 */
function _formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Hide session viz, show summary section, populate 4 metrics.
 * @param {{durationSeconds: number, mean: number, peak: number, timeInHigh: number}} summary
 */
function _showSummary(summary) {
  _hide(_getEl('practice-session-viz'));
  _hide(_getEl('practice-placeholder'));

  const summaryEl = _getEl('practice-summary');
  if (summaryEl) summaryEl.style.display = '';

  // Populate metrics
  const durationEl = _getEl('summary-duration');
  if (durationEl) durationEl.textContent = _formatTime(summary.durationSeconds);

  const meanEl = _getEl('summary-mean');
  if (meanEl) meanEl.textContent = summary.mean;

  const peakEl = _getEl('summary-peak');
  if (peakEl) peakEl.textContent = summary.peak;

  const lockedInEl = _getEl('summary-locked-in');
  if (lockedInEl) lockedInEl.textContent = _formatTime(summary.timeInHigh);
}

/**
 * Persist session data to IndexedDB with full coherence trace.
 * @param {{durationSeconds: number, mean: number, peak: number, timeInHigh: number, trace: number[]}} summary
 */
async function _saveSession(summary) {
  try {
    await saveSession({
      mode: 'practice',
      date: new Date().toISOString(),
      durationSeconds: summary.durationSeconds,
      frequencyHz: AppState.pacingFreq,
      meanCoherence: summary.mean,
      peakCoherence: summary.peak,
      timeInHighSeconds: summary.timeInHigh,
      coherenceTrace: summary.trace,
    });
  } catch (err) {
    console.error('Practice: failed to save session', err);
  }
}

/**
 * Return to idle state: hide summary, show placeholder, reset sessionPhase.
 */
function _onDone() {
  _hide(_getEl('practice-summary'));
  _hide(_getEl('practice-session-viz'));
  _show(_getEl('practice-placeholder'));
  AppState.sessionPhase = 'idle';
  AppState.sessionStartTime = null;
}
