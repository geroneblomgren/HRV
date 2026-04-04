// js/phaseLock.js — Phase Lock Score computation
// Extracts instantaneous phase alignment between breathing pacer and HR oscillation
// via FFT complex coefficient at the pacing frequency bin.
//
// Algorithm (Pattern 2 from RESEARCH.md — FFT bin extraction):
//   1. Build evenly-sampled tachogram from last windowSeconds of RR data
//   2. Subtract mean + apply Hann window
//   3. FFT → extract complex coefficient at pacing frequency bin
//   4. Compute pacer phase analytically (relative to window center)
//   5. Phase error = circular distance between HR phase and pacer phase
//   6. Score = (1 - |err| / PI) * 100, clamped 0-100
//
// Writes: AppState.phaseLockScore, AppState.phaseLockCalibrating
// Called from: dsp.js tick() every second

import { AppState } from './state.js';
import { buildEvenlySpacedTachogram, FFT_SIZE, SAMPLE_RATE_HZ } from './dsp.js';

// ---- Shared FFT instance (set by initPhaseLock) ----
let _fft = null;

// ---- Constants ----
const MIN_WINDOW_MS = 25000;   // 25 seconds minimum accumulated RR data before scoring
const RSA_HALF_BAND = 0.02;    // Hz — band around pacing freq for amplitude gate
const MIN_POWER_THRESHOLD = 0; // Disabled — tune empirically after first real session

/**
 * Initialize the phase lock module with a shared FFT instance.
 * Must be called from initDSP() after the FFT instance is created.
 *
 * @param {FFT} fftInstance - the same FFT instance used by dsp.js
 */
export function initPhaseLock(fftInstance) {
  _fft = fftInstance;
}

/**
 * Apply Hann window in-place to a Float32Array.
 * @param {Float32Array} signal
 * @param {number} nSamples - number of real (non-zero-padded) samples
 */
function applyHannWindowPartial(signal, nSamples) {
  for (let i = 0; i < nSamples; i++) {
    signal[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / nSamples));
  }
}

/**
 * Compute phase lock score between breathing pacer and HR oscillation.
 *
 * Steps:
 *  1. Walk back through RR circular buffer to collect up to windowSeconds of data
 *  2. Gate: if accumulated time < MIN_WINDOW_MS, return null (calibrating)
 *  3. Build evenly-spaced tachogram (reuses dsp.js buildEvenlySpacedTachogram)
 *  4. Subtract mean, apply Hann window
 *  5. FFT → extract complex coefficient at pacingFreqHz bin
 *  6. Compute expected pacer phase at window center (relative to window start)
 *  7. Phase error via circular distance
 *  8. Score = (1 - |err| / PI) * 100, amplitude-gated, written to AppState
 *
 * @param {number} [windowSeconds=30] - seconds of RR history to analyze
 * @param {number} [pacingFreqHz=0.0833] - current pacer frequency in Hz
 * @returns {number|null} phase lock score 0-100, or null if calibrating
 */
export function computePhaseLockScore(windowSeconds = 30, pacingFreqHz = 0.0833) {
  if (!_fft) return null;

  const count = Math.min(AppState.rrCount, 512);
  if (count < 10) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  const rrBuf = AppState.rrBuffer;
  const head = AppState.rrHead;

  // Walk backward to collect RR intervals within windowSeconds
  const rrValues = [];
  let accMs = 0;
  for (let i = 0; i < count; i++) {
    const idx = (head - 1 - i + 512) % 512;
    const rr = rrBuf[idx];
    accMs += rr;
    if (accMs > windowSeconds * 1000) break;
    rrValues.unshift(rr);
  }

  // Calibration gate — need at least 25s of data
  if (accMs < MIN_WINDOW_MS || rrValues.length < 10) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  AppState.phaseLockCalibrating = false;

  // Build time axis (seconds) and instantaneous HR (BPM)
  const n = rrValues.length;
  const times = new Float64Array(n);
  const hr = new Float64Array(n);
  let t = 0;
  for (let i = 0; i < n; i++) {
    times[i] = t;
    hr[i] = 60000 / rrValues[i];
    t += rrValues[i] / 1000;
  }

  // Resample to even spacing via cubic spline (reuse dsp.js function)
  // buildEvenlySpacedTachogram reads directly from AppState — we replicate
  // the resampling inline using the already-collected rrValues.
  //
  // We need a separate tachogram from the one dsp.js already computed, because
  // we must run our own FFT to get complex output (dsp.js only writes PSD).
  const duration = times[n - 1];
  const nSamples = Math.min(FFT_SIZE, Math.floor(duration * SAMPLE_RATE_HZ));

  if (nSamples < 40) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  // Import cubicSplineInterpolate to resample
  // Instead of re-importing, we use buildEvenlySpacedTachogram with a temp
  // trick: we don't have access to xs/ys directly. Use the exported function.
  //
  // Actually: build the tachogram using the exported function from dsp.js,
  // which already handles the full pipeline (read from AppState buffer,
  // spline interpolate, zero-pad). This is simpler and avoids duplication.
  const tachogram = buildEvenlySpacedTachogram(AppState.rrBuffer, AppState.rrHead, AppState.rrCount);
  if (!tachogram) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  // Determine actual number of non-zero samples in tachogram
  // buildEvenlySpacedTachogram returns zero-padded array; find last non-zero
  let realSamples = FFT_SIZE;
  for (let i = FFT_SIZE - 1; i >= 0; i--) {
    if (tachogram[i] !== 0) { realSamples = i + 1; break; }
  }
  if (realSamples < 40) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  // Subtract mean (detrend — prevents DC offset from inflating phase estimate)
  let mean = 0;
  for (let i = 0; i < realSamples; i++) mean += tachogram[i];
  mean /= realSamples;
  for (let i = 0; i < realSamples; i++) tachogram[i] -= mean;
  // zero-padded region remains 0 after mean subtraction of real samples

  // Apply Hann window over real samples only
  applyHannWindowPartial(tachogram, realSamples);

  // FFT — get complex output (interleaved re/im, length FFT_SIZE * 2)
  const fftOut = new Float32Array(_fft.size * 2);
  _fft.realTransform(fftOut, tachogram);

  // Extract complex coefficient at pacing frequency bin
  const bin = Math.round(pacingFreqHz * FFT_SIZE / SAMPLE_RATE_HZ);
  const safeBin = Math.max(1, Math.min(bin, FFT_SIZE / 2 - 1)); // guard edges
  const re = fftOut[2 * safeBin];
  const im = fftOut[2 * safeBin + 1];

  // Amplitude gate: check power at pacing frequency band
  // Power at this single bin (before amplitude conversion)
  const binPower = re * re + im * im;
  if (MIN_POWER_THRESHOLD > 0 && binPower < MIN_POWER_THRESHOLD) {
    AppState.phaseLockScore = 0;
    return 0;
  }

  // HR phase at pacing frequency (angle of complex coefficient)
  const hrPhase = Math.atan2(im, re);

  // Pacer phase: expected phase at window center, relative to window start.
  // FFT phase is referenced to t=0 of the data window, so we compute
  // how far the pacer has advanced from t=0 to t=windowCenter.
  // windowCenter = (realSamples / 2) / SAMPLE_RATE_HZ seconds
  const windowCenterSec = (realSamples / 2) / SAMPLE_RATE_HZ;
  const pacerPhase = (2 * Math.PI * pacingFreqHz * windowCenterSec) % (2 * Math.PI);

  // Phase error: circular distance between HR phase and pacer phase
  let err = hrPhase - pacerPhase;
  if (err > Math.PI)  err -= 2 * Math.PI;
  if (err < -Math.PI) err += 2 * Math.PI;

  // Score: 100 = perfectly locked (err=0), 0 = anti-phase (err=±PI)
  const score = Math.max(0, Math.min(100, Math.round((1 - Math.abs(err) / Math.PI) * 100)));

  AppState.phaseLockScore = score;
  return score;
}
