// js/museSignalProcessing.js — Muse-S signal processing pipelines
// This module handles both EEG and PPG signal processing for the Muse-S headband.
//
// PPG pipeline (Plan 02): 4th-order Butterworth bandpass filter (0.5–3 Hz), derivative
// + adaptive threshold peak detection with 2-second warmup, two-tier artifact rejection,
// signal quality indicator, and RR buffer writes compatible with existing DSP engine.
//
// EEG pipeline (Plan 03): Sliding-window FFT on TP9/TP10 channels, alpha/beta band
// power extraction, artifact rejection, per-session baseline normalization, and
// Neural Calm score (0-100) updated every 0.5 seconds.

import { AppState } from './state.js';
import { setPPGCallback, setEEGCallback } from './devices/MuseAdapter.js';

// ============================================================================
// EEG PIPELINE (Plan 03)
// ============================================================================

// ---- EEG Constants ----

const EEG_FFT_SIZE = 512;           // 2 seconds at 256 Hz
const EEG_UPDATE_INTERVAL = 128;    // new samples between FFT runs (0.5 sec)
const ALPHA_LOW = 8, ALPHA_HIGH = 12;
const BETA_LOW = 13, BETA_HIGH = 30;
const EEG_FS = 256;
const ARTIFACT_THRESHOLD_UV = 100;  // peak-to-peak µV for epoch rejection
const BASELINE_EPOCHS_NEEDED = 10;  // 10 x 2-sec = 20 sec baseline window
const ALPHA_DROP_THRESHOLD = 0.40;  // 40% drop triggers eyes-open indicator

// ---- EEG State Variables ----

let _eegFft = null;                 // new FFT(512) — separate from dsp.js instance
let _newSampleCount = 0;            // samples since last FFT
let _baselineRatios = [];           // alpha/(alpha+beta) during baseline collection
let _recentRatios = [];             // last 10 ratios for eyes-open detection
let _lastValidNeuralCalm = 0;       // carried forward during artifact rejection
let _eyesOpenTimer = null;

// ---- EEG Public API ----

/**
 * Initialize the EEG FFT pipeline.
 * Creates a separate FFT instance, resets all EEG state, registers the EEG callback
 * via MuseAdapter, and sets AppState.eegCalibrating = true.
 *
 * Must be called after MuseAdapter has connected and started streaming.
 */
export function initEEGPipeline() {
  // Create separate FFT instance (not shared with dsp.js HRV FFT)
  _eegFft = new FFT(EEG_FFT_SIZE);

  // Reset all state
  _newSampleCount = 0;
  _baselineRatios = [];
  _recentRatios = [];
  _lastValidNeuralCalm = 0;
  if (_eyesOpenTimer) {
    clearTimeout(_eyesOpenTimer);
    _eyesOpenTimer = null;
  }

  // Register EEG callback
  setEEGCallback(handleEEGSamples);

  // Set calibrating flag
  AppState.eegCalibrating = true;
  AppState.neuralCalm = 0;
  AppState.rawNeuralCalmRatio = 0;
  AppState.eyesOpenWarning = false;
}

/**
 * Stop the EEG pipeline.
 * Deregisters the EEG callback, clears timers, resets AppState EEG fields.
 */
export function stopEEGPipeline() {
  setEEGCallback(null);

  if (_eyesOpenTimer) {
    clearTimeout(_eyesOpenTimer);
    _eyesOpenTimer = null;
  }

  AppState.neuralCalm = 0;
  AppState.eegCalibrating = true;
  AppState.eyesOpenWarning = false;

  // Reset state
  _eegFft = null;
  _newSampleCount = 0;
  _baselineRatios = [];
  _recentRatios = [];
  _lastValidNeuralCalm = 0;
}

// ---- EEG Internal Functions ----

/**
 * Handle EEG samples from MuseAdapter.
 * Called per EEG channel notification (12 samples at a time).
 * Only processes TP9 (index 0) and TP10 (index 3).
 * Sample count is tracked from TP9 only (single time reference).
 *
 * @param {number} channelIndex - 0=TP9, 1=AF7, 2=AF8, 3=TP10
 * @param {number[]} samples - 12 microvolt samples
 */
function handleEEGSamples(channelIndex, samples) {
  // Only track sample count from TP9 (channel 0) — single time reference
  if (channelIndex === 0) {
    _newSampleCount += samples.length;

    // Trigger FFT computation every 128 new samples (0.5 seconds)
    if (_newSampleCount >= EEG_UPDATE_INTERVAL) {
      _newSampleCount = 0;
      _computeNeuralCalm();
    }
  }
  // Channels 1 (AF7) and 2 (AF8) are ignored for Neural Calm (TP9/TP10 used per research)
  // TP10 (channel 3) data is already written to eegBuffers by MuseAdapter
}

/**
 * Compute Neural Calm score from current TP9 and TP10 buffers.
 * Runs FFT, extracts alpha/beta band power, applies artifact rejection,
 * normalizes against per-session baseline, updates AppState.
 */
function _computeNeuralCalm() {
  if (!_eegFft) return;

  const complexOut = new Float32Array(EEG_FFT_SIZE * 2);
  const windowed = new Float32Array(EEG_FFT_SIZE);

  let alphaTP9 = 0, betaTP9 = 0;
  let alphaTP10 = 0, betaTP10 = 0;

  // Process TP9 (index 0) and TP10 (index 3)
  for (const channelIndex of [0, 3]) {
    // a. Extract epoch from circular buffer in chronological order
    const buf = AppState.eegBuffers[channelIndex];
    const head = AppState.eegHead;
    const epoch = new Float32Array(EEG_FFT_SIZE);
    for (let i = 0; i < EEG_FFT_SIZE; i++) {
      epoch[i] = buf[(head - EEG_FFT_SIZE + i + EEG_FFT_SIZE * 100) % EEG_FFT_SIZE];
    }

    // b. Artifact check — reject if peak-to-peak amplitude exceeds threshold
    let min = epoch[0], max = epoch[0];
    for (let i = 1; i < EEG_FFT_SIZE; i++) {
      if (epoch[i] < min) min = epoch[i];
      if (epoch[i] > max) max = epoch[i];
    }
    if ((max - min) > ARTIFACT_THRESHOLD_UV) {
      // Either channel failing rejects the entire computation
      AppState.neuralCalm = _lastValidNeuralCalm;
      return;
    }

    // c. Apply Hann window
    for (let i = 0; i < EEG_FFT_SIZE; i++) {
      windowed[i] = epoch[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / EEG_FFT_SIZE));
    }

    // d. FFT — output is interleaved [re0, im0, re1, im1, ...]
    _eegFft.realTransform(complexOut, windowed);

    // e. Band power integration
    const alpha = _integrateBand(complexOut, ALPHA_LOW, ALPHA_HIGH);
    const beta = _integrateBand(complexOut, BETA_LOW, BETA_HIGH);

    if (channelIndex === 0) {
      alphaTP9 = alpha;
      betaTP9 = beta;
    } else {
      alphaTP10 = alpha;
      betaTP10 = beta;
    }
  }

  // f. Average across TP9 and TP10
  const alphaPower = (alphaTP9 + alphaTP10) / 2;
  const betaPower = (betaTP9 + betaTP10) / 2;

  // g. Compute ratio
  const ratio = alphaPower / (alphaPower + betaPower + 1e-10);

  // h. Baseline normalization (per-session relative)
  AppState.rawNeuralCalmRatio = ratio;

  if (_baselineRatios.length < BASELINE_EPOCHS_NEEDED) {
    _baselineRatios.push(ratio);
    AppState.neuralCalm = 0;

    // Mark calibration complete when we hit exactly the needed count
    if (_baselineRatios.length === BASELINE_EPOCHS_NEEDED) {
      AppState.eegCalibrating = false;
    }
    return;
  }

  // Compute baseline mean
  const baselineMean = _baselineRatios.reduce((a, b) => a + b, 0) / _baselineRatios.length;

  // Normalize relative to baseline: 0 = at 50% of baseline, 1 = at or above baseline
  const normalized = Math.max(0, Math.min(1, (ratio - baselineMean * 0.5) / baselineMean));
  AppState.neuralCalm = Math.round(normalized * 100);

  // i. Eyes-open detection
  _checkEyesOpen(ratio);

  // j. Store last valid score for artifact rejection carry-forward
  _lastValidNeuralCalm = AppState.neuralCalm;
}

/**
 * Integrate FFT power in a frequency band.
 * @param {Float32Array} complexOut - interleaved [re, im, re, im, ...] FFT output
 * @param {number} lowHz - lower band frequency
 * @param {number} highHz - upper band frequency
 * @returns {number} sum of squared magnitudes in band
 */
function _integrateBand(complexOut, lowHz, highHz) {
  const binLow = Math.round(lowHz * EEG_FFT_SIZE / EEG_FS);
  const binHigh = Math.round(highHz * EEG_FFT_SIZE / EEG_FS);
  let sum = 0;
  for (let i = binLow; i <= binHigh; i++) {
    const re = complexOut[2 * i], im = complexOut[2 * i + 1];
    sum += re * re + im * im;
  }
  return sum;
}

/**
 * Check for eyes-open condition based on sudden alpha power drop.
 * Maintains a rolling buffer of 10 recent ratios.
 * Triggers eyesOpenWarning if alpha drops >40% below rolling mean.
 *
 * @param {number} ratio - current alpha/(alpha+beta) ratio
 */
function _checkEyesOpen(ratio) {
  // Maintain FIFO buffer of last 10 ratios
  _recentRatios.push(ratio);
  if (_recentRatios.length > 10) {
    _recentRatios.shift();
  }

  // Need at least 5 values before detecting drops
  if (_recentRatios.length < 5) return;

  // Mean of all but the most recent value
  const prevRatios = _recentRatios.slice(0, -1);
  const mean = prevRatios.reduce((a, b) => a + b, 0) / prevRatios.length;

  // Check for >40% alpha drop
  const drop = (mean - ratio) / (mean + 1e-10);
  if (drop > ALPHA_DROP_THRESHOLD) {
    AppState.eyesOpenWarning = true;

    // Clear existing timer before setting new one
    if (_eyesOpenTimer) {
      clearTimeout(_eyesOpenTimer);
    }
    // Auto-reset after 3 seconds
    _eyesOpenTimer = setTimeout(() => {
      AppState.eyesOpenWarning = false;
      _eyesOpenTimer = null;
    }, 3000);
  }
}

// ============================================================================
// PPG PIPELINE (Plan 02)
// ============================================================================
//
// Transforms raw 24-bit PPG samples from the Muse-S into clean inter-beat intervals (IBI).
// Pipeline stages:
//   1. 4th-order Butterworth bandpass filter (0.5–3 Hz at 64 Hz Fs)
//   2. Derivative-based peak detection with adaptive threshold + 2-second warmup
//   3. Two-tier artifact rejection (absolute bounds 300–2000 ms + 35% median deviation)
//   4. Rolling signal quality computation (good/fair/poor updated every 5 seconds)
//   5. RR buffer write (same AppState.rrBuffer/rrHead used by HRMAdapter)

// ---- PPG Constants ----

const PPG_FS = 64;                          // Muse-S PPG sample rate (Hz)
const SAMPLE_INTERVAL_MS = 1000 / PPG_FS;  // 15.625 ms per sample

// Refractory period: minimum time between detected peaks (300 ms = max 200 BPM)
const REFRACTORY = 300;
const REFRACTORY_SAMPLES = Math.ceil(REFRACTORY / SAMPLE_INTERVAL_MS); // 20 samples

// Artifact rejection thresholds — relaxed vs HRMAdapter (0.20) because:
// PPG at 64 Hz has ~15ms quantization jitter per IBI, and forehead PPG
// has more natural timing variability than chest strap ECG.
const RR_MIN_MS = 300;
const RR_MAX_MS = 2000;
const MAX_DEVIATION = 0.35;
const MEDIAN_WINDOW = 5;

// Adaptive threshold decay per sample (at 64 Hz: 0.997^64 ≈ 0.825 → ~18%/sec decay)
// Balanced: fast enough to track amplitude changes, slow enough to bridge between beats
const THRESHOLD_DECAY = 0.997;
// On peak: blend new amplitude (50%) with current threshold (50%)
const THRESHOLD_BLEND_PEAK = 0.50;
const THRESHOLD_BLEND_OLD  = 0.50;
// Minimum threshold floor — never drop below 15% of initial warmup threshold
// Prevents noise-triggered false peaks when signal amplitude drops
let _thresholdFloor = 0;

// Initial threshold set to 75th percentile of absolute amplitude during warmup
const WARMUP_PERCENTILE = 0.75;

// Warmup: 2 seconds = 128 samples — filter runs but no peak detection
const WARMUP_SAMPLES = 4 * PPG_FS; // 256 (4 seconds — ensures bandpass filter transient fully decays)

// Signal quality: rolling 30-second window, updated every 5 seconds
const QUALITY_WINDOW_MS = 30000;
const QUALITY_UPDATE_INTERVAL_MS = 5000;

// ---- Butterworth Bandpass Filter Coefficients (0.5–3 Hz, Fs=64 Hz) ----
//
// Implemented as two cascaded 2nd-order biquad sections (4th-order total).
// Derived via bilinear transform:
//   Section 0 = 2nd-order Butterworth Highpass at 0.5 Hz (-3 dB at 0.5 Hz)
//   Section 1 = 2nd-order Butterworth Lowpass at 3.0 Hz (-3 dB at 3.0 Hz)
//
// Frequency response verification:
//   DC  (0.001 Hz): -108 dB (baseline wander fully rejected)
//   0.5 Hz cutoff:  -3.01 dB (correct -3 dB point)
//   1.0 Hz:          -0.31 dB (flat passband)
//   1.5 Hz:          -0.31 dB (flat passband)
//   2.0 Hz:          -0.79 dB (flat passband)
//   3.0 Hz cutoff:   -3.01 dB (correct -3 dB point)
//   8.0 Hz:         -17.91 dB (good HF rejection)
//
// [b0, b1, b2, a1, a2] — a0 is normalized to 1.0

const PPG_SOS = [
  // Section 0: 2nd-order Butterworth Highpass at 0.5 Hz
  [ 0.9658852897, -1.9317705795,  0.9658852897, -1.9306064272,  0.9329347318],
  // Section 1: 2nd-order Butterworth Lowpass at 3.0 Hz
  [ 0.0178631928,  0.0357263855,  0.0178631928, -1.5879371063,  0.6593898773],
];

// ---- Biquad factory (Transposed Direct Form II) ----

/**
 * Create a stateful biquad filter that processes one sample at a time.
 * Preserves state (z1, z2) between calls.
 *
 * @param {number} b0
 * @param {number} b1
 * @param {number} b2
 * @param {number} a1
 * @param {number} a2
 * @returns {(x: number) => number}
 */
function makeBiquad(b0, b1, b2, a1, a2) {
  let z1 = 0, z2 = 0;
  return function process(x) {
    const y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  };
}

/**
 * Create a bandpass filter by chaining two biquad sections.
 * Each call processes one sample through both sections in series.
 *
 * @returns {(x: number) => number}
 */
function makeBandpass() {
  const bq0 = makeBiquad(...PPG_SOS[0]);
  const bq1 = makeBiquad(...PPG_SOS[1]);
  return function filter(x) {
    return bq1(bq0(x));
  };
}

// ---- PPG Module state ----

let _ppgFilter = null;          // bandpass filter instance (recreated on init)
let _activeChannel = 0;         // default: channel 0 = IR (clearest cardiac signal per empirical test)

// Peak detector state
let _ppgSampleCount = 0;        // total samples processed since init
let _prevFiltered = 0;          // filtered value at previous sample
let _prevDeriv = 0;             // derivative at previous sample
let _ppgThreshold = 0;          // adaptive peak threshold
let _refractoryRemaining = 0;   // samples remaining in refractory period
let _warmupBuffer = [];         // accumulates |filtered| during warmup for percentile

// IBI / artifact rejection state
let _ppgRrHistory = [];         // last MEDIAN_WINDOW clean IBI values (ms)
let _lastPeakTimeMs = null;     // performance.now() timestamp of last peak

// Signal quality state
let _qualityWindow = [];        // [{t: epochMs, artifact: bool}] rolling 30-second window
let _lastQualityUpdate = 0;     // performance.now() of last quality update

// rAF debug rendering
let _ppgRafHandle = null;

// ---- PPG Public API ----

/**
 * Reset all PPG state, create fresh filter, register PPG callback via MuseAdapter.
 * Must be called when Muse-S connects and starts streaming.
 */
export function initPPGPipeline() {
  _ppgFilter = makeBandpass();

  _ppgSampleCount = 0;
  _prevFiltered = 0;
  _prevDeriv = 0;
  _ppgThreshold = 0;
  _thresholdFloor = 0;
  _refractoryRemaining = 0;
  _warmupBuffer = [];

  _ppgRrHistory = [];
  _lastPeakTimeMs = null;

  _qualityWindow = [];
  _lastQualityUpdate = performance.now();

  setPPGCallback(_handlePPGSamples);

  _startPPGDebugRenderer();

  console.log('[PPG] Pipeline initialized — channel', _activeChannel,
    _activeChannel === 0 ? '(IR)' : _activeChannel === 1 ? '(Green)' : '(Unknown)');
}

/**
 * Deregister callback, stop debug renderer, reset signal quality.
 * Must be called when Muse-S disconnects.
 */
export function stopPPGPipeline() {
  setPPGCallback(null);
  _stopPPGDebugRenderer();
  AppState.ppgSignalQuality = 'good';
  console.log('[PPG] Pipeline stopped');
}

/**
 * Change which PPG channel feeds the processing pipeline.
 * 0 = Infrared, 1 = Green (default), 2 = Unknown.
 * Used by the calibration task (Plan 04) to switch channels empirically.
 *
 * @param {number} index - 0, 1, or 2
 */
export function setPPGChannel(index) {
  if (index < 0 || index > 2) return;
  _activeChannel = index;
  console.log('[PPG] Active channel changed to', index);
}

// ---- PPG Internal: callback ----

/**
 * Called by MuseAdapter for each PPG characteristicvaluechanged notification.
 * Receives channelIndex and 6 raw 24-bit samples.
 * Only processes the active channel; interpolates sample timestamps within the batch.
 *
 * @param {number} channelIndex - 0=IR, 1=Green, 2=Unknown
 * @param {number[]} samples    - 6 raw 24-bit PPG values
 */
function _handlePPGSamples(channelIndex, samples) {
  if (channelIndex !== _activeChannel) return;

  // Interpolate timestamps: performance.now() at notification end, subtract back 5 sample intervals
  const batchEndMs = performance.now();
  const batchStartMs = batchEndMs - (samples.length - 1) * SAMPLE_INTERVAL_MS;

  for (let i = 0; i < samples.length; i++) {
    const sampleTimeMs = batchStartMs + i * SAMPLE_INTERVAL_MS;
    _processPPGSample(samples[i], sampleTimeMs);
  }
}

// ---- PPG Internal: sample-by-sample processing ----

/**
 * Run one raw PPG sample through the full pipeline.
 *
 * @param {number} rawSample - raw 24-bit PPG value from Muse-S
 * @param {number} timeMs    - interpolated sample timestamp (performance.now)
 */
function _processPPGSample(rawSample, timeMs) {
  // Stage 1: Bandpass filter (removes baseline wander + high-freq noise)
  // Negate the signal — Muse IR PPG shows troughs at heartbeats (inverted vs
  // typical PPG where systolic peaks are positive). Negation makes peaks positive
  // so the derivative-based peak detector works correctly.
  const filtered = -_ppgFilter(rawSample);
  _ppgSampleCount++;

  // Stage 2: Warmup — run filter for first 4 seconds (256 samples) to fully stabilize.
  // Collect amplitude stats only from the last quarter (samples 193-256) when filter is settled.
  if (_ppgSampleCount <= WARMUP_SAMPLES) {
    // Only collect from the last quarter — filter transient is fully gone by then
    if (_ppgSampleCount > WARMUP_SAMPLES * 0.75) {
      _warmupBuffer.push(Math.abs(filtered));
    }

    if (_ppgSampleCount === WARMUP_SAMPLES) {
      if (_warmupBuffer.length > 0) {
        const sorted = [..._warmupBuffer].sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * WARMUP_PERCENTILE);
        _ppgThreshold = sorted[idx] || 100;
      } else {
        _ppgThreshold = 100;
      }
      _thresholdFloor = _ppgThreshold * 0.15;
      console.log('[PPG] Warmup complete — initial threshold:', _ppgThreshold.toFixed(2),
        'floor:', _thresholdFloor.toFixed(2), 'samples collected:', _warmupBuffer.length);
    }
    _prevFiltered = filtered;
    _prevDeriv = 0;
    return;
  }

  // Decay adaptive threshold each sample (with floor to prevent noise-triggered peaks)
  _ppgThreshold = Math.max(_ppgThreshold * THRESHOLD_DECAY, _thresholdFloor);

  // Decrement refractory counter
  if (_refractoryRemaining > 0) {
    _refractoryRemaining--;
  }

  // Stage 3: Derivative-based peak detection
  // A systolic peak is a zero-crossing of the derivative (positive -> negative)
  // where the signal exceeds the adaptive threshold and we're not in refractory
  const deriv = filtered - _prevFiltered;

  if (_prevDeriv > 0 && deriv <= 0 &&
      _prevFiltered > _ppgThreshold &&
      _refractoryRemaining === 0) {

    // Peak is at the previous sample (where derivative crossed zero)
    const peakTimeMs = timeMs - SAMPLE_INTERVAL_MS;
    const peakAmplitude = _prevFiltered;

    // Update adaptive threshold: blend peak amplitude into current threshold
    _ppgThreshold = THRESHOLD_BLEND_PEAK * peakAmplitude + THRESHOLD_BLEND_OLD * _ppgThreshold;

    // Enforce refractory period (prevents double-counting same peak)
    _refractoryRemaining = REFRACTORY_SAMPLES;

    // Compute IBI from last peak
    if (_lastPeakTimeMs !== null) {
      const ibi = peakTimeMs - _lastPeakTimeMs;
      _ingestIBI(ibi, peakTimeMs);
    }

    _lastPeakTimeMs = peakTimeMs;
  }

  _prevFiltered = filtered;
  _prevDeriv = deriv;
}

// ---- PPG Internal: artifact rejection + RR write ----

/**
 * Apply two-tier artifact rejection, update signal quality window,
 * and write valid IBI to AppState.rrBuffer/rrHead.
 *
 * @param {number} ibi    - inter-beat interval in milliseconds
 * @param {number} timeMs - peak timestamp for quality window
 */
function _ingestIBI(ibi, timeMs) {
  const isArtifact = _rejectArtifact(ibi);

  // Track in rolling quality window
  _qualityWindow.push({ t: timeMs, artifact: isArtifact });

  // Trim entries older than 30 seconds
  const cutoff = timeMs - QUALITY_WINDOW_MS;
  while (_qualityWindow.length > 0 && _qualityWindow[0].t < cutoff) {
    _qualityWindow.shift();
  }

  // Update signal quality every 5 seconds
  if (timeMs - _lastQualityUpdate >= QUALITY_UPDATE_INTERVAL_MS) {
    _updateSignalQuality(timeMs);
  }

  // Rejected IBI: do not write to buffer
  if (isArtifact) return;

  // Update rolling median history
  _ppgRrHistory.push(ibi);
  if (_ppgRrHistory.length > MEDIAN_WINDOW) _ppgRrHistory.shift();

  // Write to AppState — identical to HRMAdapter pattern (DSP engine is source-agnostic)
  AppState.rrBuffer[AppState.rrHead % 512] = ibi;
  AppState.rrHead++;
  AppState.currentHR = Math.round(60000 / ibi);
  AppState.rrCount++;
}

/**
 * Two-tier artifact rejection (relaxed vs HRMAdapter 20% for forehead PPG jitter):
 * Tier 1: absolute physiological bounds (300–2000 ms)
 * Tier 2: relative — reject if IBI deviates >35% from 5-beat rolling median
 *
 * @param {number} ms - IBI in milliseconds
 * @returns {boolean} true if IBI should be rejected
 */
function _rejectArtifact(ms) {
  // Tier 1: absolute bounds
  if (ms < RR_MIN_MS || ms > RR_MAX_MS) return true;

  // Tier 2: relative deviation from median (need at least MEDIAN_WINDOW values)
  if (_ppgRrHistory.length >= MEDIAN_WINDOW) {
    const sorted = [..._ppgRrHistory].sort((a, b) => a - b);
    const median = sorted[Math.floor(MEDIAN_WINDOW / 2)];
    if (Math.abs(ms - median) / median > MAX_DEVIATION) return true;
  }

  return false;
}

/**
 * Compute and update AppState.ppgSignalQuality from the rolling 30-second window.
 * Thresholds calibrated for forehead PPG (inherently noisier than chest strap):
 * good < 20%, fair 20–45%, poor > 45% artifact rate.
 *
 * @param {number} nowMs - current performance.now() timestamp
 */
function _updateSignalQuality(nowMs) {
  if (_qualityWindow.length === 0) return;

  const total = _qualityWindow.length;
  const artifacts = _qualityWindow.filter(e => e.artifact).length;
  const rate = artifacts / total;

  AppState.ppgSignalQuality = rate < 0.20 ? 'good' : rate <= 0.45 ? 'fair' : 'poor';
  _lastQualityUpdate = nowMs;
}

// ---- PPG Debug renderer ----

/**
 * Start a rAF loop that renders all 3 PPG channel waveforms into the debug panel.
 * Only executes drawing when the debug panel is visible (performance-safe).
 */
function _startPPGDebugRenderer() {
  _stopPPGDebugRenderer();

  function render() {
    _ppgRafHandle = requestAnimationFrame(render);

    const panel = document.getElementById('ppg-debug-panel');
    if (!panel || panel.classList.contains('hidden')) return;

    for (let ch = 0; ch < 3; ch++) {
      const canvas = document.getElementById('ppg-debug-ch' + ch);
      if (!canvas) continue;

      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, w, h);

      const buf = AppState.ppgDebugBuffers[ch];
      const head = AppState.ppgDebugHead;
      const len = buf.length; // 256 samples

      // Auto-scale: find min/max of buffer
      let minVal = Infinity, maxVal = -Infinity;
      for (let i = 0; i < len; i++) {
        if (buf[i] < minVal) minVal = buf[i];
        if (buf[i] > maxVal) maxVal = buf[i];
      }
      const range = maxVal - minVal || 1;

      ctx.strokeStyle = ch === 0 ? '#ff4444' : ch === 1 ? '#44ff44' : '#4488ff';
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let i = 0; i < len; i++) {
        const idx = (head - len + i + len * 8) % len;
        const v = buf[idx];
        const x = (i / (len - 1)) * w;
        const y = h - ((v - minVal) / range) * h * 0.88 - h * 0.06;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Update stats text
    const qualityEl = document.getElementById('ppg-debug-quality');
    const hrEl = document.getElementById('ppg-debug-hr');
    const chEl = document.getElementById('ppg-debug-channel');
    if (qualityEl) qualityEl.textContent = 'Quality: ' + (AppState.ppgSignalQuality || '--');
    if (hrEl) hrEl.textContent = 'HR: ' + (AppState.currentHR || '--') + ' bpm';
    if (chEl) chEl.textContent = 'Ch: ' + ['IR', 'Green', 'Unknown'][_activeChannel];
  }

  _ppgRafHandle = requestAnimationFrame(render);
}

/**
 * Cancel the debug rAF loop.
 */
function _stopPPGDebugRenderer() {
  if (_ppgRafHandle !== null) {
    cancelAnimationFrame(_ppgRafHandle);
    _ppgRafHandle = null;
  }
}
