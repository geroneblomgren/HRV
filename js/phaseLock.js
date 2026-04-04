// js/phaseLock.js — Phase Lock Score computation
// Measures how strongly the user's heart rate oscillates at the pacer's
// breathing frequency, using spectral RSA amplitude in BPM.
//
// Algorithm:
//   1. Collect last 20s of RR data from circular buffer
//   2. Build evenly-spaced tachogram, subtract mean, apply Hann window
//   3. FFT → PSD → integrate power in ±0.02 Hz band around pacing freq
//   4. Convert power to BPM peak-to-peak amplitude
//   5. Map amplitude to 0-100 via exponential saturation curve
//
// Why amplitude, not ratio or PLV:
//   - PLV with overlapping windows ≈ 1.0 always (97% data overlap)
//   - Power ratio can't distinguish strong sync from tiny residual oscillation
//     (breath holding: very low total power, but residual baroreceptor
//     activity near pacing freq gives a misleadingly high ratio)
//   - Absolute amplitude directly answers: "How much does HR oscillate
//     at the breathing frequency?" Strong sync = 8-15 BPM, none = 1-2 BPM.
//
// Writes: AppState.phaseLockScore, AppState.phaseLockCalibrating
// Called from: dsp.js tick() every second

import { AppState } from './state.js';
import { cubicSplineInterpolate, FFT_SIZE, SAMPLE_RATE_HZ, hzToBin } from './dsp.js';

// ---- Shared FFT instance (set by initPhaseLock) ----
let _fft = null;

// ---- Constants ----
const MIN_WINDOW_MS = 20000;    // 20s minimum data before scoring
const WINDOW_SECONDS = 20;      // 20s analysis window (faster response than 30s)
const PEAK_HALF_BAND = 0.02;    // Hz — ±0.02 Hz around pacing freq
const TAU_BPM = 5.0;            // exponential saturation constant
                                // 1 BPM → score 18, 3 → 45, 5 → 63
                                // 8 → 80, 10 → 86, 15 → 95

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
 * Compute phase lock score between breathing pacer and HR oscillation.
 *
 * Measures RSA amplitude at the pacing frequency, then maps to 0-100
 * via exponential saturation. Strong sync breathing produces 8-15 BPM
 * amplitude; breath holding or erratic breathing produces 1-2 BPM.
 *
 * @param {number} [windowSeconds=20] - seconds of RR history to analyze
 * @param {number} [pacingFreqHz=0.0833] - current pacer frequency in Hz
 * @param {number} [sessionElapsedSec=0] - seconds since session started
 * @returns {number|null} phase lock score 0-100, or null if calibrating
 */
export function computePhaseLockScore(windowSeconds = WINDOW_SECONDS, pacingFreqHz = 0.0833, sessionElapsedSec = 0) {
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

  // FFT → PSD
  const fftOut = new Float32Array(_fft.size * 2);
  _fft.realTransform(fftOut, tachogram);

  // Integrate power in ±0.02 Hz band around pacing frequency
  const lowBin = Math.max(0, hzToBin(pacingFreqHz - PEAK_HALF_BAND));
  const highBin = Math.min(FFT_SIZE / 2 - 1, hzToBin(pacingFreqHz + PEAK_HALF_BAND));
  let power = 0;
  for (let i = lowBin; i <= highBin; i++) {
    const re = fftOut[2 * i];
    const im = fftOut[2 * i + 1];
    power += re * re + im * im;
  }

  // Convert power to BPM peak-to-peak amplitude
  // For a Hann-windowed sinusoid of amplitude A:
  //   PSD power ≈ (A × N × 0.5)² / 2  where 0.5 is Hann coherent gain
  //   A ≈ 2×sqrt(2×power) / (N × 0.5)
  //   Peak-to-peak = 2A
  const rmsAmplitude = Math.sqrt(2 * power) / (realSamples * 0.5);
  const peakToPeakBPM = 2 * rmsAmplitude;

  // Map amplitude to score via exponential saturation
  // score = 100 × (1 - e^(-amplitude / TAU))
  // TAU=5: 1 BPM→18, 3→45, 5→63, 8→80, 10→86, 15→95
  const score = Math.max(0, Math.min(100,
    Math.round(100 * (1 - Math.exp(-peakToPeakBPM / TAU_BPM)))
  ));

  AppState.phaseLockScore = score;
  return score;
}
