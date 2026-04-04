// js/phaseLock.js — Phase Lock Score computation
// Measures how consistently the HR oscillation is phase-aligned with the
// breathing pacer using a sliding-window Phase Locking Value (PLV) approach.
//
// Algorithm:
//   1. Collect last windowSeconds of RR data from circular buffer
//   2. Build evenly-spaced tachogram from ONLY that window (not full buffer)
//   3. Subtract mean, apply Hann window, FFT
//   4. Extract instantaneous HR phase at pacing frequency bin
//   5. Compute pacer phase using session elapsed time (real reference)
//   6. Store phase difference in circular history buffer
//   7. PLV = mean resultant length of recent phase differences
//   8. Score = PLV * 100 (0 = random phase, 100 = perfectly locked)
//
// Writes: AppState.phaseLockScore, AppState.phaseLockCalibrating
// Called from: dsp.js tick() every second

import { AppState } from './state.js';
import { cubicSplineInterpolate, FFT_SIZE, SAMPLE_RATE_HZ } from './dsp.js';

// ---- Shared FFT instance (set by initPhaseLock) ----
let _fft = null;

// ---- Constants ----
const MIN_WINDOW_MS = 25000;   // 25 seconds minimum accumulated RR data before scoring
const PLV_HISTORY = 10;        // number of phase-difference samples for PLV averaging

// ---- Phase difference history (circular buffer for PLV) ----
const _phaseDiffHistory = new Float64Array(PLV_HISTORY);
let _phaseDiffHead = 0;
let _phaseDiffCount = 0;

/**
 * Initialize the phase lock module with a shared FFT instance.
 * @param {FFT} fftInstance - the same FFT instance used by dsp.js
 */
export function initPhaseLock(fftInstance) {
  _fft = fftInstance;
  _phaseDiffHead = 0;
  _phaseDiffCount = 0;
}

/**
 * Build a windowed tachogram from the LAST windowSeconds of RR data only.
 * Unlike dsp.js buildEvenlySpacedTachogram which uses the entire buffer,
 * this extracts only the requested time window for phase analysis.
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
 * Uses Phase Locking Value (PLV): measures consistency of the phase
 * relationship over time. A stable phase difference (even if non-zero)
 * produces a high score. Random phase produces a low score.
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

  // FFT → extract complex coefficient at pacing frequency bin
  const fftOut = new Float32Array(_fft.size * 2);
  _fft.realTransform(fftOut, tachogram);

  const bin = Math.round(pacingFreqHz * FFT_SIZE / SAMPLE_RATE_HZ);
  const safeBin = Math.max(1, Math.min(bin, FFT_SIZE / 2 - 1));
  const re = fftOut[2 * safeBin];
  const im = fftOut[2 * safeBin + 1];

  // HR phase at pacing frequency (angle of complex coefficient)
  const hrPhase = Math.atan2(im, re);

  // Pacer phase: use session elapsed time as the real reference.
  // The pacer runs continuously from session start at pacingFreqHz.
  // We need the pacer's phase at the START of the data window, since
  // the FFT phase is referenced to t=0 of the input signal.
  // Window start time = sessionElapsed - windowDuration
  const windowDurationSec = realSamples / SAMPLE_RATE_HZ;
  const windowStartSec = Math.max(0, sessionElapsedSec - windowDurationSec);
  const pacerPhase = (2 * Math.PI * pacingFreqHz * windowStartSec) % (2 * Math.PI);

  // Phase difference (wrapped to [-PI, PI])
  let phaseDiff = hrPhase - pacerPhase;
  if (phaseDiff > Math.PI)  phaseDiff -= 2 * Math.PI;
  if (phaseDiff < -Math.PI) phaseDiff += 2 * Math.PI;

  // Store in circular history buffer
  _phaseDiffHistory[_phaseDiffHead] = phaseDiff;
  _phaseDiffHead = (_phaseDiffHead + 1) % PLV_HISTORY;
  if (_phaseDiffCount < PLV_HISTORY) _phaseDiffCount++;

  // Phase Locking Value = mean resultant length of unit vectors at phase differences
  // PLV = |mean(e^{i*phaseDiff})|  = sqrt(meanCos^2 + meanSin^2)
  // PLV = 1 when all phase differences are identical (locked)
  // PLV ≈ 0 when phase differences are uniformly random (unlocked)
  let sumCos = 0, sumSin = 0;
  for (let i = 0; i < _phaseDiffCount; i++) {
    sumCos += Math.cos(_phaseDiffHistory[i]);
    sumSin += Math.sin(_phaseDiffHistory[i]);
  }
  const plv = Math.sqrt(
    (sumCos / _phaseDiffCount) ** 2 + (sumSin / _phaseDiffCount) ** 2
  );

  // Score: PLV 0-1 → 0-100
  const score = Math.max(0, Math.min(100, Math.round(plv * 100)));

  AppState.phaseLockScore = score;
  return score;
}
