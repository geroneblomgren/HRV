// js/phaseLock.js — Phase Lock Score computation
// Measures how dominantly the user's HR oscillation peaks at the pacer's
// breathing frequency, using a pacing-targeted coherence ratio.
//
// Algorithm:
//   1. Collect last 20s of RR data, build windowed tachogram
//   2. Subtract mean, apply Hann window, FFT → PSD
//   3. Integrate power at pacing frequency (±0.015 Hz)
//   4. Integrate power BELOW and ABOVE pacing window in analysis band
//   5. Coherence Ratio = (pacingPower/below) × (pacingPower/above)
//   6. Score = min(100, ln(CR+1) / 3 × 100)  [HeartMath-style transform]
//
// Why coherence ratio instead of amplitude:
//   Natural HRV has substantial LF power (~3-10 BPM) at/near the pacing
//   frequency from baroreflex activity. Absolute amplitude can't distinguish
//   this from breathing-driven oscillation. But breathing creates a SHARP
//   peak that dominates surrounding frequencies. The coherence ratio
//   measures this sharpness: high when power is concentrated at pacing freq,
//   low when power is broadly distributed (natural HRV, erratic breathing).
//
// Why not standard coherence (computeCoherenceScore):
//   Standard coherence finds the peak WHEREVER it is. This targets the
//   PACING frequency specifically. Breathing consistently at the wrong
//   rate scores low here but high in standard coherence.
//
// Writes: AppState.phaseLockScore, AppState.phaseLockCalibrating
// Called from: dsp.js tick() every second

import { AppState } from './state.js';
import { cubicSplineInterpolate, FFT_SIZE, SAMPLE_RATE_HZ, hzToBin } from './dsp.js';

// ---- Shared FFT instance (set by initPhaseLock) ----
let _fft = null;

// ---- Constants ----
const MIN_WINDOW_MS = 20000;    // 20s minimum data before scoring
const WINDOW_SECONDS = 20;      // 20s analysis window
const PEAK_HALF_BAND = 0.015;   // Hz — ±0.015 Hz around pacing freq (HeartMath standard)
const ANALYSIS_LOW_HZ = 0.04;   // analysis band low edge
const ANALYSIS_HIGH_HZ = 0.26;  // analysis band high edge
const CS_DIVISOR = 3.0;         // HeartMath scaling: CS = ln(CR+1), score = CS/3 × 100
const FLOOR_POWER = 0.001;      // prevent division by zero in CR calculation

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

  const n = rrValues.length;
  const times = new Float64Array(n);
  const hr = new Float64Array(n);
  let t = 0;
  for (let i = 0; i < n; i++) {
    times[i] = t;
    hr[i] = 60000 / rrValues[i];
    t += rrValues[i] / 1000;
  }

  const duration = times[n - 1];
  const realSamples = Math.min(FFT_SIZE, Math.floor(duration * SAMPLE_RATE_HZ));
  if (realSamples < 40) return null;

  const tachogram = new Float32Array(FFT_SIZE);
  for (let i = 0; i < realSamples; i++) {
    tachogram[i] = cubicSplineInterpolate(times, hr, i / SAMPLE_RATE_HZ);
  }

  return { tachogram, realSamples };
}

/**
 * Apply Hann window in-place over the first nSamples of a signal.
 */
function applyHannWindowPartial(signal, nSamples) {
  for (let i = 0; i < nSamples; i++) {
    signal[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / nSamples));
  }
}

/**
 * Integrate PSD power between two frequency bounds.
 */
function integratePSD(psd, lowHz, highHz) {
  const lowBin = Math.max(0, hzToBin(lowHz));
  const highBin = Math.min(psd.length - 1, hzToBin(highHz));
  let sum = 0;
  for (let i = lowBin; i <= highBin; i++) sum += psd[i];
  return sum;
}

/**
 * Compute phase lock score between breathing pacer and HR oscillation.
 *
 * Uses a pacing-targeted coherence ratio: measures how dominant the
 * spectral peak at the pacing frequency is compared to surrounding
 * frequencies. Natural broad LF activity scores low; a sharp breathing-
 * driven peak at the pacing frequency scores high.
 *
 * @param {number} [windowSeconds=20] - seconds of RR history to analyze
 * @param {number} [pacingFreqHz=0.0833] - current pacer frequency in Hz
 * @param {number} [sessionElapsedSec=0] - seconds since session started
 * @returns {number|null} phase lock score 0-100, or null if calibrating
 */
export function computePhaseLockScore(windowSeconds = WINDOW_SECONDS, pacingFreqHz = 0.0833, sessionElapsedSec = 0) {
  if (!_fft) return null;

  const result = buildWindowedTachogram(windowSeconds);
  if (!result) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  AppState.phaseLockCalibrating = false;

  const { tachogram, realSamples } = result;

  // Subtract mean
  let mean = 0;
  for (let i = 0; i < realSamples; i++) mean += tachogram[i];
  mean /= realSamples;
  for (let i = 0; i < realSamples; i++) tachogram[i] -= mean;

  // Apply Hann window
  applyHannWindowPartial(tachogram, realSamples);

  // FFT → PSD
  const fftOut = new Float32Array(_fft.size * 2);
  _fft.realTransform(fftOut, tachogram);

  const halfSize = FFT_SIZE / 2;
  const psd = new Float32Array(halfSize);
  for (let i = 0; i < halfSize; i++) {
    const re = fftOut[2 * i];
    const im = fftOut[2 * i + 1];
    psd[i] = re * re + im * im;
  }

  // Power at pacing frequency (narrow ±0.015 Hz window)
  const pacingLow = pacingFreqHz - PEAK_HALF_BAND;
  const pacingHigh = pacingFreqHz + PEAK_HALF_BAND;
  const pacingPower = integratePSD(psd, pacingLow, pacingHigh);

  // Power BELOW pacing window (in analysis band)
  const powerBelow = integratePSD(psd, ANALYSIS_LOW_HZ, pacingLow);

  // Power ABOVE pacing window (in analysis band)
  const powerAbove = integratePSD(psd, pacingHigh, ANALYSIS_HIGH_HZ);

  // Coherence Ratio: how dominant is the pacing frequency peak?
  // High CR = sharp peak at pacing freq (breathing in sync)
  // Low CR = broad/flat spectrum (natural HRV, erratic breathing, breath hold)
  const cr = (pacingPower / Math.max(powerBelow, FLOOR_POWER)) *
             (pacingPower / Math.max(powerAbove, FLOOR_POWER));

  // Natural log transform + scale to 0-100 (HeartMath formula)
  const cs = Math.log(cr + 1);
  const score = Math.max(0, Math.min(100, Math.round((cs / CS_DIVISOR) * 100)));

  AppState.phaseLockScore = score;
  return score;
}
