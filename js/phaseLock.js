// js/phaseLock.js — Phase Lock Score computation
// Uses time-domain covariance between a synthetic pacer signal and the
// actual HR tachogram over a 30-second sliding window.
//
// Why covariance (not correlation or spectral methods):
//   - Correlation normalizes away amplitude → 3 BPM Mayer wave scores
//     the same as 12 BPM sync breathing if the shape matches
//   - Spectral methods need long windows (128s) for frequency resolution
//     → too slow to respond to behavior changes
//   - Covariance preserves amplitude AND responds in 30 seconds
//
// Algorithm:
//   1. Build 30s windowed tachogram from recent RR data
//   2. Mean-subtract the tachogram
//   3. Generate synthetic pacer sine wave at pacing frequency
//   4. Compute covariance at lags 0-6s (baroreflex delay range)
//   5. Best covariance estimates RSA amplitude at pacing frequency
//   6. Score = min(100, amplitude / threshold × 100)
//
// Writes: AppState.phaseLockScore, AppState.phaseLockCalibrating
// Called from: dsp.js tick() every second

import { AppState } from './state.js';
import { cubicSplineInterpolate, SAMPLE_RATE_HZ } from './dsp.js';

// ---- Constants ----
const MIN_WINDOW_MS = 25000;    // 25s minimum data before scoring
const WINDOW_SECONDS = 30;      // 30s analysis window
const MAX_LAG_SEC = 6;          // check lags 0-6s for baroreflex delay
const AMP_THRESHOLD_BPM = 8.0;  // BPM amplitude for score=100
                                // Sync breathing: 10-20 BPM → score 100
                                // Weak sync: 5 BPM → score 63
                                // Mayer wave (breath hold): 1.5-3.5 BPM → score 19-44
                                // Hyperventilating: ~0 BPM → score 0-2

/**
 * Initialize the phase lock module.
 * @param {FFT} fftInstance - unused, kept for call signature compat
 */
export function initPhaseLock(fftInstance) {
  // No FFT needed for covariance approach
}

/**
 * Build a windowed tachogram from the LAST windowSeconds of RR data.
 * Returns evenly-sampled HR values (BPM) at SAMPLE_RATE_HZ.
 *
 * @param {number} windowSeconds
 * @returns {{ samples: Float32Array, count: number }|null}
 */
function buildWindowedHR(windowSeconds) {
  const rrCount = Math.min(AppState.rrCount, 512);
  if (rrCount < 10) return null;

  const rrBuf = AppState.rrBuffer;
  const head = AppState.rrHead;

  const rrValues = [];
  let accMs = 0;
  for (let i = 0; i < rrCount; i++) {
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
  const sampleCount = Math.floor(duration * SAMPLE_RATE_HZ);
  if (sampleCount < 40) return null;

  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = cubicSplineInterpolate(times, hr, i / SAMPLE_RATE_HZ);
  }

  return { samples, count: sampleCount };
}

/**
 * Compute phase lock score via covariance with synthetic pacer.
 *
 * @param {number} [windowSeconds=30]
 * @param {number} [pacingFreqHz=0.0833]
 * @param {number} [sessionElapsedSec=0]
 * @returns {number|null} 0-100, or null if calibrating
 */
export function computePhaseLockScore(windowSeconds = WINDOW_SECONDS, pacingFreqHz = 0.0833, sessionElapsedSec = 0) {
  const result = buildWindowedHR(windowSeconds);
  if (!result) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  AppState.phaseLockCalibrating = false;

  const { samples, count } = result;

  // Mean-subtract the HR signal
  let mean = 0;
  for (let i = 0; i < count; i++) mean += samples[i];
  mean /= count;
  for (let i = 0; i < count; i++) samples[i] -= mean;

  // Generate synthetic pacer signal
  const pacer = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pacer[i] = Math.sin(2 * Math.PI * pacingFreqHz * i / SAMPLE_RATE_HZ);
  }

  // Compute covariance at lags 0 to MAX_LAG_SEC
  // Covariance preserves amplitude (unlike correlation which normalizes it away)
  const maxLagSamples = Math.ceil(MAX_LAG_SEC * SAMPLE_RATE_HZ);
  const usableLength = count - maxLagSamples;
  if (usableLength < 40) {
    AppState.phaseLockScore = 0;
    return 0;
  }

  let bestCov = 0;
  let bestLag = 0;

  for (let lag = 0; lag <= maxLagSamples; lag++) {
    let cov = 0;
    for (let i = 0; i < usableLength; i++) {
      cov += pacer[i] * samples[i + lag];
    }
    cov /= usableLength;

    if (Math.abs(cov) > bestCov) {
      bestCov = Math.abs(cov);
      bestLag = lag;
    }
  }

  // bestCov ≈ amplitude/2 for matched frequency (from sinusoidal identity)
  // So estimated RSA amplitude at pacing frequency = 2 × bestCov
  const ampEstimate = 2 * bestCov;

  // Map amplitude to score: linear ramp to 100 at threshold
  const score = Math.max(0, Math.min(100, Math.round(ampEstimate / AMP_THRESHOLD_BPM * 100)));

  // Diagnostic log every 10 seconds
  if (Math.round(sessionElapsedSec) % 10 === 0) {
    console.log(`[PhaseLock] amp=${ampEstimate.toFixed(1)}BPM lag=${(bestLag/SAMPLE_RATE_HZ).toFixed(1)}s → ${score}`);
  }

  AppState.phaseLockScore = score;
  return score;
}
