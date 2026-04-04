// js/phaseLock.js — Phase Lock Score computation
// Measures how strongly the user's HR oscillation is concentrated at the
// pacer's breathing frequency versus spread across other frequencies.
//
// Algorithm (power concentration ratio):
//   1. Collect last windowSeconds of RR data from circular buffer
//   2. Build evenly-spaced tachogram from ONLY that window
//   3. Subtract mean, apply Hann window, FFT → PSD
//   4. Integrate power in narrow band around pacing frequency (±0.015 Hz)
//   5. Integrate total power in analysis range (0.04–0.26 Hz)
//   6. Ratio = pacing_power / total_power
//   7. Score = ratio mapped to 0-100 via scaling factor
//
// Why not PLV: With 30s windows sliding 1s apart (97% overlap), phase
// differences between consecutive windows are always nearly identical,
// making PLV ≈ 1.0 regardless of actual breathing behavior.
//
// Writes: AppState.phaseLockScore, AppState.phaseLockCalibrating
// Called from: dsp.js tick() every second

import { AppState } from './state.js';
import { cubicSplineInterpolate, FFT_SIZE, SAMPLE_RATE_HZ, hzToBin } from './dsp.js';

// ---- Shared FFT instance (set by initPhaseLock) ----
let _fft = null;

// ---- Constants ----
const MIN_WINDOW_MS = 25000;    // 25 seconds minimum accumulated RR data
const PEAK_HALF_BAND = 0.015;   // Hz — ±0.015 Hz around pacing freq (HeartMath standard)
const ANALYSIS_LOW_HZ = 0.04;   // LF band low edge
const ANALYSIS_HIGH_HZ = 0.26;  // extends into HF to catch off-frequency breathing
const SCORE_SCALE = 150;        // scale factor: ratio × 150, clamped to 100
                                // perfect sync typically gives ratio ~0.6-0.8 → score 90-100
                                // partial sync ~0.3-0.5 → score 45-75
                                // no sync ~0.05-0.15 → score 8-22

/**
 * Initialize the phase lock module with a shared FFT instance.
 * @param {FFT} fftInstance - the same FFT instance used by dsp.js
 */
export function initPhaseLock(fftInstance) {
  _fft = fftInstance;
}

/**
 * Build a windowed tachogram from the LAST windowSeconds of RR data only.
 *
 * @param {number} windowSeconds - seconds of RR history to use
 * @returns {{ tachogram: Float32Array, realSamples: number }|null}
 */
function buildWindowedTachogram(windowSeconds) {
  const count = Math.min(AppState.rrCount, 512);
  if (count < 10) return null;

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

  if (accMs < MIN_WINDOW_MS || rrValues.length < 10) return null;

  // Build time axis and instantaneous HR from this window only
  const n = rrValues.length;
  const times = new Float64Array(n);
  const hr = new Float64Array(n);
  let t = 0;
  for (let i = 0; i < n; i++) {
    times[i] = t;
    hr[i] = 60000 / rrValues[i];
    t += rrValues[i] / 1000;
  }

  // Resample to even spacing via cubic spline
  const duration = times[n - 1];
  const realSamples = Math.min(FFT_SIZE, Math.floor(duration * SAMPLE_RATE_HZ));
  if (realSamples < 40) return null;

  const tachogram = new Float32Array(FFT_SIZE); // zero-padded
  for (let i = 0; i < realSamples; i++) {
    tachogram[i] = cubicSplineInterpolate(times, hr, i / SAMPLE_RATE_HZ);
  }

  return { tachogram, realSamples };
}

/**
 * Apply Hann window in-place over the first nSamples of a signal.
 * @param {Float32Array} signal
 * @param {number} nSamples
 */
function applyHannWindowPartial(signal, nSamples) {
  for (let i = 0; i < nSamples; i++) {
    signal[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / nSamples));
  }
}

/**
 * Integrate PSD power in a frequency band (local version using bin indices).
 * @param {Float32Array} psd
 * @param {number} lowHz
 * @param {number} highHz
 * @returns {number}
 */
function integrateBandLocal(psd, lowHz, highHz) {
  const lowBin = Math.max(0, hzToBin(lowHz));
  const highBin = Math.min(psd.length - 1, hzToBin(highHz));
  let sum = 0;
  for (let i = lowBin; i <= highBin; i++) {
    sum += psd[i];
  }
  return sum;
}

/**
 * Compute phase lock score between breathing pacer and HR oscillation.
 *
 * Uses power concentration ratio: what fraction of HR oscillation power
 * is at the pacing frequency? High ratio = user breathing in sync.
 * Low ratio = HR variability spread across other frequencies.
 *
 * @param {number} [windowSeconds=30] - seconds of RR history to analyze
 * @param {number} [pacingFreqHz=0.0833] - current pacer frequency in Hz
 * @param {number} [sessionElapsedSec=0] - seconds since session started
 * @returns {number|null} phase lock score 0-100, or null if calibrating
 */
export function computePhaseLockScore(windowSeconds = 30, pacingFreqHz = 0.0833, sessionElapsedSec = 0) {
  if (!_fft) return null;

  // Build tachogram from ONLY the requested time window
  const result = buildWindowedTachogram(windowSeconds);
  if (!result) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  AppState.phaseLockCalibrating = false;

  const { tachogram, realSamples } = result;

  // Subtract mean (detrend)
  let mean = 0;
  for (let i = 0; i < realSamples; i++) mean += tachogram[i];
  mean /= realSamples;
  for (let i = 0; i < realSamples; i++) tachogram[i] -= mean;

  // Apply Hann window over real samples only
  applyHannWindowPartial(tachogram, realSamples);

  // FFT → PSD (power spectral density)
  const fftOut = new Float32Array(_fft.size * 2);
  _fft.realTransform(fftOut, tachogram);

  const halfSize = FFT_SIZE / 2;
  const psd = new Float32Array(halfSize);
  for (let i = 0; i < halfSize; i++) {
    const re = fftOut[2 * i];
    const im = fftOut[2 * i + 1];
    psd[i] = re * re + im * im;
  }

  // Power at pacing frequency (narrow band ±0.015 Hz)
  const pacingPower = integrateBandLocal(psd,
    pacingFreqHz - PEAK_HALF_BAND,
    pacingFreqHz + PEAK_HALF_BAND
  );

  // Total power in analysis range (0.04–0.26 Hz)
  const totalPower = integrateBandLocal(psd, ANALYSIS_LOW_HZ, ANALYSIS_HIGH_HZ);

  // Guard against division by zero (no HRV at all)
  if (totalPower < 1e-10) {
    AppState.phaseLockScore = 0;
    return 0;
  }

  // Power concentration ratio → score
  const ratio = pacingPower / totalPower;
  const score = Math.max(0, Math.min(100, Math.round(ratio * SCORE_SCALE)));

  AppState.phaseLockScore = score;
  return score;
}
