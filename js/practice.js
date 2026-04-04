// js/practice.js — Practice Mode controller
// Guided breathing sessions at the user's saved resonance frequency.
// Collects a per-second coherence trace, chimes at timer zero,
// shows summary, and saves the full session to IndexedDB.

import { AppState, subscribe, unsubscribe } from './state.js';
import { initAudio, startPacer, stopPacer, playChime, setVolume } from './audio.js';
import { initDSP, tick } from './dsp.js';
import { startRendering, stopRendering, startTuningRenderer, stopTuningRenderer } from './renderer.js';
import { saveSession } from './storage.js';
import { startTuning, stopTuning } from './tuning.js';

// ---- Module state ----

let _sessionStart = 0;           // Date.now() at session start
let _sessionDurationMs = 0;      // selected duration in ms
let _dspInterval = null;         // setInterval handle (1s DSP tick)
let _coherenceTrace = [];        // array of coherence scores (1 per second)
let _neuralCalmTrace = [];       // array of Neural Calm scores (1 per second, Muse-S only)
let _hrTrace = [];               // array of HR values (1 per second)
let _hrvTrace = [];              // array of RMSSD values (1 per second)
let _lastRRCount = 0;            // tracks rrCount to detect new beats for RMSSD
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
 * Runs a 60-second tuning phase, then starts the guided breathing session
 * at the tuned resonance frequency.
 */
export async function startPractice() {
  if (_active) return;

  _active = true;
  _chimePlayed = false;
  _pausedForReconnect = false;
  _coherenceTrace = [];
  _neuralCalmTrace = [];
  _hrTrace = [];
  _hrvTrace = [];

  // ---- Tuning phase ----

  // Show tuning overlay, hide placeholder and summary
  const tuningOverlay = _getEl('tuning-overlay');
  _show(tuningOverlay);
  _hide(_getEl('practice-placeholder'));
  _hide(_getEl('practice-summary'));
  _hide(_getEl('practice-session-viz'));

  // Init audio and DSP before tuning starts
  initAudio();
  initDSP();

  // Start the tuning scanning ring animation
  const tuningRingCanvas = _getEl('tuning-ring-canvas');
  startTuningRenderer(tuningRingCanvas);

  // Update UI countdown and current candidate freq every second
  const tuningStartEpoch = Date.now();
  let _tuningUIInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - tuningStartEpoch) / 1000);
    const remaining = Math.max(0, 60 - elapsed);
    const timeEl = _getEl('tuning-time-remaining');
    if (timeEl) timeEl.textContent = `${remaining}s remaining`;
    const freqEl = _getEl('tuning-current-freq');
    if (freqEl && AppState.tuningCurrentFreqBPM > 0) {
      freqEl.textContent = `${AppState.tuningCurrentFreqBPM.toFixed(2)} BPM`;
    }
  }, 1000);

  // Run tuning — awaits ~60 seconds
  let result;
  try {
    result = await startTuning(AppState.savedResonanceFreq);
  } catch (err) {
    console.error('Practice: tuning failed', err);
    // Fall back to saved freq or a safe default
    const fallback = AppState.savedResonanceFreq || (5.0 / 60);
    result = { freqHz: fallback, freqBPM: fallback * 60, rsaAmplitude: 0 };
  }

  // Tear down tuning UI
  stopTuningRenderer();
  clearInterval(_tuningUIInterval);
  _hide(tuningOverlay);

  // ---- Result display ----

  const resultEl = _getEl('tuning-result');
  const resultFreqEl = _getEl('tuning-result-freq');
  const resultCompEl = _getEl('tuning-result-comparison');
  const celebrationEl = _getEl('tuning-result-celebration');

  if (resultFreqEl) resultFreqEl.textContent = `Today: ${result.freqBPM.toFixed(1)} BPM`;

  let showCelebration = false;
  const stored = AppState.tuningStoredFreqBPM;
  if (stored > 0) {
    if (resultCompEl) resultCompEl.textContent = `Previously: ${stored.toFixed(1)} BPM`;
    const shift = Math.abs(result.freqBPM - stored);
    if (shift > 0.3 && celebrationEl) {
      const direction = result.freqBPM < stored ? '\u2193' : '\u2191';
      celebrationEl.textContent = `Your resonance shifted from ${stored.toFixed(1)} to ${result.freqBPM.toFixed(1)} BPM ${direction} — improved vagal tone`;
      _show(celebrationEl);
      showCelebration = true;
    }
  } else {
    if (resultCompEl) resultCompEl.textContent = 'First tuned session';
    if (celebrationEl) _hide(celebrationEl);
  }

  _show(resultEl);

  // Wait 3s (4s if celebration is shown)
  await new Promise(resolve => setTimeout(resolve, showCelebration ? 4000 : 3000));

  _hide(resultEl);

  // ---- Start actual session at tuned frequency ----

  // If stopped during tuning/result display, abort
  if (!_active) return;

  _lastRRCount = AppState.rrCount;
  _sessionStart = Date.now();
  _sessionDurationMs = _selectedDuration * 60 * 1000;

  AppState.sessionPhase = 'practice';
  AppState.pacingFreq = result.freqHz;
  AppState.savedResonanceFreq = result.freqHz;
  AppState.sessionStartTime = _sessionStart;

  // Show session viz
  const sessionViz = _getEl('practice-session-viz');
  if (sessionViz) {
    sessionViz.style.display = 'flex';
    sessionViz.style.flexDirection = 'column';
  }

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
  const neuralCalmCanvas = _getEl('practice-neural-calm-gauge-canvas');
  const eegCanvas = _getEl('practice-eeg-waveform-canvas');

  // Start renderer in countdown mode (sessionDuration > 0)
  startRendering(
    waveformCanvas,
    null,           // no spectrum canvas in practice mode
    gaugeCanvas,
    pacerCanvas,
    _sessionStart,
    _selectedDuration * 60,
    neuralCalmCanvas,
    eegCanvas
  );

  // Start pacer audio at tuned resonance frequency
  startPacer(result.freqHz);

  // Start 1-second DSP tick interval
  _dspInterval = setInterval(() => {
    const elapsed = (Date.now() - _sessionStart) / 1000;
    tick(elapsed);
    _coherenceTrace.push(AppState.coherenceScore);
    _hrTrace.push(AppState.currentHR);
    _hrvTrace.push(_computeCurrentRMSSD());
    if (AppState.museConnected) _neuralCalmTrace.push(AppState.neuralCalm);

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
 * Stop the session (or abort during tuning phase), compute summary, save, and show summary screen.
 */
export function stopPractice() {
  if (!_active) return;
  _active = false;

  // If tuning is still running, stop it
  if (AppState.tuningPhase === 'scanning') {
    stopTuning();
    stopTuningRenderer();
    _hide(_getEl('tuning-overlay'));
    _hide(_getEl('tuning-result'));
  }

  // Teardown DSP and audio
  if (_dspInterval) {
    clearInterval(_dspInterval);
    _dspInterval = null;
  }
  stopPacer();
  stopRendering();

  // Reset tuning AppState fields
  AppState.tuningPhase = 'idle';
  AppState.tuningProgress = 0;
  AppState.tuningCandidateIndex = -1;
  AppState.tuningResults = [];

  // Only show summary if session actually started (has trace data or session started)
  if (_sessionStart > 0) {
    const summary = _computeSummary();
    _saveSession(summary);
    _showSummary(summary);
  } else {
    // Aborted during tuning — return to placeholder
    _hide(_getEl('practice-session-viz'));
    _hide(_getEl('practice-summary'));
    _show(_getEl('practice-placeholder'));
    AppState.sessionPhase = 'idle';
    _sessionStart = 0;
  }
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
      freqDisplay.textContent = 'Tuning will find your frequency';
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
  // Tuning handles null savedResonanceFreq — only require connected
  const canStart = AppState.connected;
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

  let mean = 0, peak = 0, timeInHigh = 0;
  if (trace.length > 0) {
    const sum = trace.reduce((acc, v) => acc + v, 0);
    mean = Math.round(sum / trace.length);
    peak = Math.round(Math.max(...trace));
    timeInHigh = trace.filter(v => v >= 66).length; // seconds in "Locked In" zone
  }

  // Neural Calm summary (only when Muse-S was connected during session)
  const calmTrace = _neuralCalmTrace.slice();
  let meanCalm = null, peakCalm = null, timeInHighCalm = null;
  if (calmTrace.length > 0) {
    meanCalm = Math.round(calmTrace.reduce((a, v) => a + v, 0) / calmTrace.length);
    peakCalm = Math.round(Math.max(...calmTrace));
    timeInHighCalm = calmTrace.filter(v => v >= 75).length; // seconds above threshold
  }

  const hrTraceOut = _hrTrace.slice();
  const hrvTraceOut = _hrvTrace.slice();
  return { durationSeconds, mean, peak, timeInHigh, trace, meanCalm, peakCalm, timeInHighCalm, calmTrace, hrTrace: hrTraceOut, hrvTrace: hrvTraceOut };
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
 * Compute current RMSSD from the last 30 RR intervals in the circular buffer.
 * RMSSD = root mean square of successive differences between adjacent RR intervals.
 * This is a standard short-term HRV metric (higher = more parasympathetic activity).
 * @returns {number} RMSSD in milliseconds, or 0 if insufficient data
 */
function _computeCurrentRMSSD() {
  const bufSize = 512;
  const head = AppState.rrHead;
  const count = Math.min(30, AppState.rrCount - _lastRRCount > 0 ? AppState.rrCount : 30);
  if (count < 3) return 0;

  // Read last 'count' RR intervals from circular buffer
  const intervals = [];
  for (let i = 0; i < count; i++) {
    const idx = ((head - count + i) % bufSize + bufSize) % bufSize;
    const val = AppState.rrBuffer[idx];
    if (val > 0) intervals.push(val);
  }

  if (intervals.length < 3) return 0;

  // Compute successive differences squared
  let sumSqDiff = 0;
  let n = 0;
  for (let i = 1; i < intervals.length; i++) {
    const diff = intervals[i] - intervals[i - 1];
    sumSqDiff += diff * diff;
    n++;
  }

  return n > 0 ? Math.round(Math.sqrt(sumSqDiff / n)) : 0;
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

  // Neural Calm section (only when Muse was used)
  const calmSection = _getEl('summary-neural-calm-section');
  if (summary.meanCalm !== null && summary.meanCalm !== undefined) {
    if (calmSection) calmSection.style.display = '';
    const meanCalmEl = _getEl('summary-mean-calm');
    if (meanCalmEl) meanCalmEl.textContent = summary.meanCalm;
    const peakCalmEl = _getEl('summary-peak-calm');
    if (peakCalmEl) peakCalmEl.textContent = summary.peakCalm;
    const timeCalmEl = _getEl('summary-time-calm');
    if (timeCalmEl) timeCalmEl.textContent = _formatTime(summary.timeInHighCalm);
  } else {
    if (calmSection) calmSection.style.display = 'none';
  }

  // HR source badge (only when Muse PPG was used)
  const hrSourceEl = _getEl('summary-hr-source');
  if (hrSourceEl) {
    const source = AppState.hrSourceLabel;
    if (source === 'Muse PPG') {
      hrSourceEl.textContent = 'HR Source: Muse PPG';
      hrSourceEl.style.display = '';
    } else {
      hrSourceEl.style.display = 'none';
    }
  }

  // Draw session trace line graphs
  _drawTraceGraph('summary-hr-graph', summary.hrTrace, '#ef4444', 'HR (bpm)', true);
  _drawTraceGraph('summary-hrv-graph', summary.hrvTrace, '#5eead4', 'HRV — RMSSD (ms)', true);
  if (summary.calmTrace && summary.calmTrace.length > 0) {
    const calmGraphEl = _getEl('summary-calm-graph');
    if (calmGraphEl) calmGraphEl.style.display = '';
    _drawTraceGraph('summary-calm-graph', summary.calmTrace, '#3b82f6', 'Neural Calm', false, 0, 100);
  } else {
    const calmGraphEl = _getEl('summary-calm-graph');
    if (calmGraphEl) calmGraphEl.style.display = 'none';
  }
}

/**
 * Draw a simple line graph on a canvas element showing a trace over time.
 * @param {string} canvasId - DOM id of the canvas element
 * @param {number[]} data - array of values (1 per second)
 * @param {string} color - stroke color (CSS)
 * @param {string} label - graph label text
 * @param {boolean} autoRange - if true, auto-compute Y range from data; if false, use min/max params
 * @param {number} [fixedMin=0] - fixed Y-axis minimum (when autoRange=false)
 * @param {number} [fixedMax=100] - fixed Y-axis maximum (when autoRange=false)
 */
function _smoothTrace(data, window) {
  if (!data || data.length < window) return data;
  const half = Math.floor(window / 2);
  const result = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(data.length - 1, i + half); j++) {
      sum += data[j];
      count++;
    }
    result[i] = sum / count;
  }
  return result;
}

function _drawTraceGraph(canvasId, data, color, label, autoRange = false, fixedMin = 0, fixedMax = 100) {
  const canvas = _getEl(canvasId);
  if (!canvas || !data || data.length < 2) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pad = { top: 20, right: 10, bottom: 20, left: 36 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Y-axis range
  let yMin, yMax;
  if (autoRange) {
    yMin = Math.min(...data);
    yMax = Math.max(...data);
    const margin = (yMax - yMin) * 0.1 || 5;
    yMin = Math.floor(yMin - margin);
    yMax = Math.ceil(yMax + margin);
  } else {
    yMin = fixedMin;
    yMax = fixedMax;
  }

  // Smooth the data with a moving average to remove artifact spikes
  data = _smoothTrace(data, 7);

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(pad.left, pad.top, plotW, plotH);

  // Resolve CSS variable colors
  const resolvedColor = color.startsWith('var(')
    ? getComputedStyle(document.documentElement).getPropertyValue(color.match(/var\(([^,)]+)/)[1]).trim() || '#5eead4'
    : color;

  // Draw line
  ctx.strokeStyle = resolvedColor;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  for (let i = 0; i < data.length; i++) {
    const x = pad.left + (i / (data.length - 1)) * plotW;
    const y = pad.top + plotH - ((data[i] - yMin) / (yMax - yMin)) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Fill under line
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = resolvedColor.replace(')', ', 0.1)').replace('rgb(', 'rgba(');
  if (!ctx.fillStyle.includes('rgba')) {
    // Hex color — use global alpha
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = resolvedColor;
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.fill();
  }

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, pad.left + 4, pad.top + 2);

  // Y-axis labels
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(yMax, pad.left - 4, pad.top);
  ctx.textBaseline = 'bottom';
  ctx.fillText(yMin, pad.left - 4, pad.top + plotH);

  // Time axis
  const totalSec = data.length;
  const mins = Math.floor(totalSec / 60);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('0:00', pad.left, pad.top + plotH + 4);
  ctx.fillText(_formatTime(totalSec), pad.left + plotW, pad.top + plotH + 4);
  if (mins > 2) {
    const mid = Math.floor(totalSec / 2);
    ctx.fillText(_formatTime(mid), pad.left + plotW / 2, pad.top + plotH + 4);
  }
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
      hrSource: AppState.hrSourceLabel || 'unknown',
      // Tuning data (Phase 10)
      ...(AppState.tuningSelectedFreqBPM > 0 ? {
        tuningFreqHz: AppState.tuningSelectedFreqBPM / 60,
        tuningRsaAmplitude: AppState.tuningSelectedRSA > 0 ? AppState.tuningSelectedRSA : undefined,
      } : {}),
      ...(summary.meanCalm !== null ? {
        meanNeuralCalm: summary.meanCalm,
        peakNeuralCalm: summary.peakCalm,
        timeInHighCalmSeconds: summary.timeInHighCalm,
        neuralCalmTrace: summary.calmTrace,
      } : {}),
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

  // Reset Neural Calm section and HR source visibility
  const calmSection = _getEl('summary-neural-calm-section');
  if (calmSection) calmSection.style.display = 'none';
  const hrSourceEl = _getEl('summary-hr-source');
  if (hrSourceEl) hrSourceEl.style.display = 'none';
}
