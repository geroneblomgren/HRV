// js/dsp.js — DSPEngine: spectral analysis, coherence scoring, RSA amplitude
// Tick-driven (called once per second by session controller), NOT event-driven.
// Reads from AppState.rrBuffer/rrHead/rrCount, writes to
// AppState.coherenceScore/lfPower/spectralBuffer/calibrating.

import { AppState } from './state.js';
import { initPhaseLock, computePhaseLockScore } from './phaseLock.js';

// ---- Constants ----
export const SAMPLE_RATE_HZ = 4;           // standard HRV resampling rate
const MIN_WINDOW_SECONDS = 120;            // calibration duration
export const FFT_SIZE = 512;               // next power of 2 >= 4Hz * 120s = 480
const COHERENCE_WINDOW_SECONDS = 64;       // HeartMath standard
const LF_LOW_HZ = 0.04;
const LF_HIGH_HZ = 0.15;
const TOTAL_HIGH_HZ = 0.26;
const PEAK_WINDOW_HZ = 0.030;             // HeartMath: integrate +/-0.015 Hz around peak

// ---- Module state ----
let _fft = null;

// ---- Frequency/bin helpers ----

/**
 * Convert FFT bin index to frequency in Hz.
 */
export function binToHz(bin) {
  return bin * SAMPLE_RATE_HZ / FFT_SIZE;
}

/**
 * Convert frequency in Hz to nearest FFT bin index.
 */
export function hzToBin(hz) {
  return Math.round(hz * FFT_SIZE / SAMPLE_RATE_HZ);
}

// ---- Cubic Spline Interpolation ----

/**
 * Natural cubic spline interpolation.
 * Given sorted arrays xs and ys, returns interpolated y at query point x.
 * Uses tridiagonal system solve for spline coefficients.
 *
 * @param {Float32Array|number[]} xs - sorted x coordinates
 * @param {Float32Array|number[]} ys - corresponding y values
 * @param {number} x - query point
 * @returns {number} interpolated y value
 */
export function cubicSplineInterpolate(xs, ys, x) {
  const n = xs.length - 1;
  if (n < 1) return ys[0] || 0;

  // Clamp x to data range
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n]) return ys[n];

  // Compute intervals h and differences
  const h = new Float64Array(n);
  const alpha = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    h[i] = xs[i + 1] - xs[i];
  }
  for (let i = 1; i < n; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
  }

  // Tridiagonal solve for c coefficients (natural spline: c[0] = c[n] = 0)
  const c = new Float64Array(n + 1);
  const l = new Float64Array(n + 1);
  const mu = new Float64Array(n + 1);
  const z = new Float64Array(n + 1);

  l[0] = 1;
  for (let i = 1; i < n; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  l[n] = 1;

  // Back-substitution
  for (let j = n - 1; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
  }

  // Compute b and d for each interval
  const b = new Float64Array(n);
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    b[i] = (ys[i + 1] - ys[i]) / h[i] - h[i] * (c[i + 1] + 2 * c[i]) / 3;
    d[i] = (c[i + 1] - c[i]) / (3 * h[i]);
  }

  // Find the right interval and evaluate
  let i = 0;
  for (let j = n - 1; j >= 0; j--) {
    if (x >= xs[j]) { i = j; break; }
  }

  const dx = x - xs[i];
  return ys[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
}

// ---- Tachogram Builder ----

/**
 * Build an evenly-sampled tachogram (HR in BPM) from the RR circular buffer.
 * Reads rrBuffer in chronological order, builds cumulative time axis,
 * resamples to SAMPLE_RATE_HZ using cubic spline, returns zero-padded Float32Array.
 *
 * @param {Float32Array} rrBuffer - circular buffer of RR intervals in ms
 * @param {number} rrHead - write pointer
 * @param {number} rrCount - total clean RR intervals received
 * @returns {Float32Array|null} zero-padded tachogram of length FFT_SIZE, or null if insufficient data
 */
export function buildEvenlySpacedTachogram(rrBuffer, rrHead, rrCount) {
  const count = Math.min(rrCount, 512);
  if (count < 10) return null;

  // Read buffer in chronological order (oldest first)
  const rr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    rr[i] = rrBuffer[(rrHead - count + i + 512) % 512];
  }

  // Build cumulative time axis (seconds)
  const times = new Float32Array(count);
  let t = 0;
  for (let i = 0; i < count; i++) {
    times[i] = t;
    t += rr[i] / 1000;
  }

  // Convert RR to instantaneous HR (BPM) for interpolation
  const hr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    hr[i] = 60000 / rr[i];
  }

  // Resample to SAMPLE_RATE_HZ using cubic spline
  // Use the MOST RECENT data when duration exceeds FFT window (128s).
  // Before this fix, resampling started from t=0 (oldest), which meant
  // old tuning data polluted the spectrum and newest practice data was lost.
  const duration = times[count - 1];
  const maxWindowSec = FFT_SIZE / SAMPLE_RATE_HZ; // 128s
  const startTime = Math.max(0, duration - maxWindowSec);
  const windowDuration = duration - startTime;
  const nSamples = Math.min(FFT_SIZE, Math.floor(windowDuration * SAMPLE_RATE_HZ));
  const output = new Float32Array(FFT_SIZE); // zero-padded

  for (let i = 0; i < nSamples; i++) {
    const queryTime = startTime + i / SAMPLE_RATE_HZ;
    output[i] = cubicSplineInterpolate(times, hr, queryTime);
  }

  return output;
}

// ---- Hann Window ----

/**
 * Apply Hann window in-place.
 * @param {Float32Array} signal
 */
function applyHannWindow(signal) {
  const N = signal.length;
  for (let i = 0; i < N; i++) {
    signal[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / N));
  }
}

// ---- PSD Computation ----

/**
 * Compute power spectral density from a tachogram using FFT.
 * @param {Float32Array} tachogram - windowed, zero-padded time series
 * @returns {Float32Array} PSD array (half-spectrum, length FFT_SIZE/2)
 */
function computePSD(tachogram) {
  const output = new Float32Array(_fft.size * 2);
  _fft.realTransform(output, tachogram);

  // Convert complex output to power: psd[i] = re^2 + im^2
  const halfSize = FFT_SIZE / 2;
  const psd = new Float32Array(halfSize);
  for (let i = 0; i < halfSize; i++) {
    const re = output[2 * i];
    const im = output[2 * i + 1];
    psd[i] = re * re + im * im;
  }

  return psd;
}

// ---- Band Integration ----

/**
 * Sum PSD values in a frequency band.
 * @param {Float32Array} psd
 * @param {number} lowHz
 * @param {number} highHz
 * @returns {number}
 */
export function integrateBand(psd, lowHz, highHz) {
  const lowBin = Math.max(0, hzToBin(lowHz));
  const highBin = Math.min(psd.length - 1, hzToBin(highHz));
  let sum = 0;
  for (let i = lowBin; i <= highBin; i++) {
    sum += psd[i];
  }
  return sum;
}

// ---- Peak Finding ----

/**
 * Find the bin with maximum PSD in a frequency range.
 * @param {Float32Array} psd
 * @param {number} lowHz
 * @param {number} highHz
 * @returns {number} bin index
 */
function findPeakBin(psd, lowHz, highHz) {
  const lowBin = Math.max(0, hzToBin(lowHz));
  const highBin = Math.min(psd.length - 1, hzToBin(highHz));
  let maxVal = -1;
  let maxBin = lowBin;
  for (let i = lowBin; i <= highBin; i++) {
    if (psd[i] > maxVal) {
      maxVal = psd[i];
      maxBin = i;
    }
  }
  return maxBin;
}

// ---- Coherence Score ----

/**
 * Compute HeartMath-derived coherence score from PSD.
 * 1. Find dominant peak in 0.04-0.26 Hz
 * 2. Integrate +/-0.015 Hz around peak
 * 3. Compute power below and above peak window
 * 4. Coherence Ratio: CR = (peakPower/below) * (peakPower/above)
 * 5. CS = ln(CR + 1)
 * 6. Map to 0-100: min(100, round((CS / 3.0) * 100))
 *
 * @param {Float32Array} psd - power spectral density array
 * @returns {number} coherence score 0-100
 */
export function computeCoherenceScore(psd) {
  const totalPower = integrateBand(psd, LF_LOW_HZ, TOTAL_HIGH_HZ);
  if (totalPower === 0) return 0;

  // 1. Find dominant peak in full analysis range
  const peakBin = findPeakBin(psd, LF_LOW_HZ, TOTAL_HIGH_HZ);
  const peakFreq = binToHz(peakBin);

  // 2. Integrate +/-0.015 Hz window around peak
  const peakPower = integrateBand(psd, peakFreq - 0.015, peakFreq + 0.015);

  // 3. Power below and above peak window
  const powerBelow = integrateBand(psd, LF_LOW_HZ, peakFreq - 0.015);
  const powerAbove = integrateBand(psd, peakFreq + 0.015, TOTAL_HIGH_HZ);

  // 4. Coherence Ratio
  const cr = (peakPower / Math.max(powerBelow, 0.001)) *
             (peakPower / Math.max(powerAbove, 0.001));

  // 5. Natural log transform
  const cs = Math.log(cr + 1);

  // 6. Map to 0-100
  return Math.min(100, Math.round((cs / 3.0) * 100));
}

// ---- HR Array ----

/**
 * Read the last windowSeconds worth of RR intervals from the circular buffer,
 * convert each to BPM (60000/rr), return as Array.
 * Used by WaveformRenderer each frame.
 *
 * @param {number} [windowSeconds=60] - how many seconds of data to return
 * @returns {number[]} array of BPM values
 */
export function getHRArray(windowSeconds = 60) {
  const count = Math.min(AppState.rrCount, 512);
  if (count === 0) return [];

  // Determine how many RR values fit in windowSeconds
  // Walk backwards from newest, accumulate time
  const rrBuf = AppState.rrBuffer;
  const head = AppState.rrHead;
  const hrs = [];
  let accumulatedMs = 0;

  for (let i = 0; i < count; i++) {
    const idx = (head - 1 - i + 512) % 512;
    const rr = rrBuf[idx];
    accumulatedMs += rr;
    if (accumulatedMs > windowSeconds * 1000) break;
    hrs.unshift(Math.round(60000 / rr));
  }

  return hrs;
}

// ---- RSA Amplitude ----

/**
 * Legacy peak-to-trough RSA (kept for backward compat, not used by discovery).
 * @param {number[]} hrSamples - array of HR values in BPM
 * @returns {number} RSA amplitude (rounded to 1 decimal)
 */
export function computeRSAAmplitude(hrSamples) {
  if (!hrSamples || hrSamples.length === 0) return 0;
  const max = Math.max(...hrSamples);
  const min = Math.min(...hrSamples);
  return Math.round((max - min) * 10) / 10;
}

/**
 * Compute spectral RSA amplitude at a specific breathing frequency.
 * Measures how much HR oscillates at the pacing rate, ignoring noise at
 * other frequencies. Much more reliable than peak-to-trough for comparing
 * between breathing rates.
 *
 * Steps:
 *  1. Extract last windowSeconds of RR data from circular buffer
 *  2. Build evenly-sampled tachogram via cubic spline
 *  3. Remove linear trend (prevents slow drift from inflating LF power)
 *  4. Apply Hann window
 *  5. FFT → PSD
 *  6. Integrate power in ±0.02 Hz band around pacingFreqHz
 *  7. Convert to amplitude (BPM peak-to-peak equivalent)
 *
 * @param {number} windowSeconds - how many seconds of recent data to analyze
 * @param {number} pacingFreqHz - breathing frequency in Hz (e.g. 5.0/60)
 * @returns {number} spectral RSA amplitude in BPM (rounded to 1 decimal), or 0 on failure
 */
export function computeSpectralRSA(windowSeconds, pacingFreqHz) {
  const count = Math.min(AppState.rrCount, 512);
  if (count < 30) return 0;

  const rrBuf = AppState.rrBuffer;
  const head = AppState.rrHead;

  // Walk backward from buffer head to collect RR intervals within windowSeconds
  const rrValues = [];
  let accMs = 0;
  for (let i = 0; i < count; i++) {
    const idx = (head - 1 - i + 512) % 512;
    const rr = rrBuf[idx];
    accMs += rr;
    if (accMs > windowSeconds * 1000) break;
    rrValues.unshift(rr);
  }

  if (rrValues.length < 30) return 0;

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

  // Resample to even spacing via cubic spline
  const duration = times[n - 1];
  const nSamples = Math.min(FFT_SIZE, Math.floor(duration * SAMPLE_RATE_HZ));
  if (nSamples < 64) return 0;

  const tachogram = new Float32Array(FFT_SIZE); // zero-padded
  for (let i = 0; i < nSamples; i++) {
    tachogram[i] = cubicSplineInterpolate(times, hr, i / SAMPLE_RATE_HZ);
  }

  // Remove linear trend (least-squares fit y = a + b*x over real samples)
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < nSamples; i++) {
    sumX += i;
    sumY += tachogram[i];
    sumXY += i * tachogram[i];
    sumXX += i * i;
  }
  const b = (nSamples * sumXY - sumX * sumY) / (nSamples * sumXX - sumX * sumX);
  const a = (sumY - b * sumX) / nSamples;
  for (let i = 0; i < nSamples; i++) {
    tachogram[i] -= (a + b * i);
  }

  // Apply Hann window
  for (let i = 0; i < FFT_SIZE; i++) {
    tachogram[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / FFT_SIZE));
  }

  // FFT → PSD
  const psd = computePSD(tachogram);

  // Integrate power in ±0.02 Hz band around pacing frequency
  const RSA_HALF_BAND = 0.02;
  const power = integrateBand(psd, pacingFreqHz - RSA_HALF_BAND, pacingFreqHz + RSA_HALF_BAND);

  // Convert to peak-to-peak BPM amplitude:
  //   For a sinusoid of amplitude A, Hann-windowed PSD power ≈ (A * N * 0.5)^2 / 2
  //   where 0.5 is Hann coherent gain. So A ≈ 2*sqrt(2*power) / (N * 0.5)
  //   Peak-to-peak = 2A
  const rmsAmplitude = Math.sqrt(2 * power) / (nSamples * 0.5);
  const peakToPeak = 2 * rmsAmplitude;

  return Math.round(peakToPeak * 10) / 10;
}

// ---- Initialization ----

/**
 * Initialize the FFT instance. Must be called after fft.js CDN script has loaded.
 * Called once from main.js.
 */
export function initDSP() {
  if (typeof FFT === 'undefined') {
    throw new Error('FFT library not loaded. Check that fft.js CDN script loaded before main.js.');
  }
  _fft = new FFT(FFT_SIZE);
  initPhaseLock(_fft);
}

// ---- Tick (main entry point) ----

/**
 * Main DSP entry point, called once per second by session controller.
 * Reads RR buffer, computes spectral analysis and coherence if calibration complete.
 *
 * @param {number} sessionElapsedSeconds - seconds since session started
 */
export function tick(sessionElapsedSeconds) {
  // Calibration gate: must accumulate MIN_WINDOW_SECONDS of data
  if (sessionElapsedSeconds < MIN_WINDOW_SECONDS) {
    AppState.calibrating = true;
    AppState.phaseLockCalibrating = true;
    return;
  }

  AppState.calibrating = false;

  // Build evenly-sampled tachogram from circular buffer
  const tachogram = buildEvenlySpacedTachogram(
    AppState.rrBuffer, AppState.rrHead, AppState.rrCount
  );
  if (!tachogram) return;

  // Find actual number of real (non-zero-padded) samples for detrending
  let realSamples = FFT_SIZE;
  for (let i = FFT_SIZE - 1; i >= 0; i--) {
    if (tachogram[i] !== 0) { realSamples = i + 1; break; }
  }

  // Remove linear trend — prevents slow HR drift from creating a dominant
  // VLF peak that overshadows the respiratory peak at the pacing frequency.
  // Without this, the spectrum is dominated by a ~2-3 BPM artifact from
  // gradual HR changes, making coherence always ~100 at the wrong frequency.
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < realSamples; i++) {
    sumX += i;
    sumY += tachogram[i];
    sumXY += i * tachogram[i];
    sumXX += i * i;
  }
  const slope = (realSamples * sumXY - sumX * sumY) / (realSamples * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / realSamples;
  for (let i = 0; i < realSamples; i++) {
    tachogram[i] -= (intercept + slope * i);
  }

  // Apply Hann window (prevents spectral leakage at window edges)
  applyHannWindow(tachogram);

  // Compute PSD via FFT
  const psd = computePSD(tachogram);

  // Write results to AppState
  AppState.spectralBuffer = psd;
  AppState.lfPower = integrateBand(psd, LF_LOW_HZ, LF_HIGH_HZ);
  AppState.coherenceScore = computeCoherenceScore(psd);

  // Phase lock score — MUST run after spectralBuffer and coherenceScore are written
  computePhaseLockScore(20, AppState.pacingFreq, sessionElapsedSeconds);
}
