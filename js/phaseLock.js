// js/phaseLock.js — Phase Lock Score computation
// Measures how dominantly the user's HR oscillation peaks at the pacer's
// breathing frequency, using a pacing-targeted coherence ratio computed
// from the full-resolution PSD already produced by dsp.js each tick.
//
// This is the HeartMath coherence formula but locked to the PACING
// frequency instead of wherever the spectral peak happens to be.
// Standard coherence: "is there a dominant peak?" (anywhere)
// Phase lock: "is there a dominant peak AT THE PACER RATE?" (specific)
//
// Uses AppState.spectralBuffer (full accumulated PSD from dsp.js tick),
// which provides excellent frequency resolution (~0.008 Hz with 128s of
// data). Previous attempts using short windowed tachograms (20-30s)
// failed because poor resolution (~0.05 Hz) smeared peaks and broke
// the coherence ratio math.
//
// Writes: AppState.phaseLockScore, AppState.phaseLockCalibrating
// Called from: dsp.js tick() every second

import { AppState } from './state.js';
import { integrateBand, binToHz, hzToBin } from './dsp.js';

// ---- Shared FFT instance (set by initPhaseLock) ----
let _fft = null;

// ---- Constants ----
const PEAK_HALF_BAND = 0.015;   // Hz — ±0.015 Hz around pacing freq (HeartMath standard)
const ANALYSIS_LOW_HZ = 0.04;   // LF band low edge
const ANALYSIS_HIGH_HZ = 0.26;  // extends into HF
const CS_DIVISOR = 3.0;         // HeartMath scaling
const FLOOR_POWER = 0.001;      // prevent division by zero

/**
 * Initialize the phase lock module with a shared FFT instance.
 * @param {FFT} fftInstance - the same FFT instance used by dsp.js
 */
export function initPhaseLock(fftInstance) {
  _fft = fftInstance;
}

/**
 * Compute phase lock score between breathing pacer and HR oscillation.
 *
 * Uses the full-resolution PSD from dsp.js (AppState.spectralBuffer)
 * with the HeartMath coherence formula targeted at the pacing frequency.
 *
 * Before dsp.js calibration completes (120s), returns null (calibrating).
 * After calibration, spectralBuffer is updated every tick with excellent
 * frequency resolution from the full accumulated RR buffer.
 *
 * @param {number} [windowSeconds] - unused, kept for call signature compat
 * @param {number} [pacingFreqHz=0.0833] - current pacer frequency in Hz
 * @param {number} [sessionElapsedSec=0] - seconds since session started
 * @returns {number|null} phase lock score 0-100, or null if calibrating
 */
export function computePhaseLockScore(windowSeconds = 20, pacingFreqHz = 0.0833, sessionElapsedSec = 0) {
  // Use the full-resolution PSD from dsp.js — available after 120s calibration
  const psd = AppState.spectralBuffer;
  if (!psd) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  AppState.phaseLockCalibrating = false;

  // Total power in analysis range
  const totalPower = integrateBand(psd, ANALYSIS_LOW_HZ, ANALYSIS_HIGH_HZ);
  if (totalPower === 0) {
    AppState.phaseLockScore = 0;
    return 0;
  }

  // Power at PACING frequency (not at whatever peak exists)
  const pacingLow = pacingFreqHz - PEAK_HALF_BAND;
  const pacingHigh = pacingFreqHz + PEAK_HALF_BAND;
  const pacingPower = integrateBand(psd, pacingLow, pacingHigh);

  // Power below and above pacing window
  const powerBelow = integrateBand(psd, ANALYSIS_LOW_HZ, pacingLow);
  const powerAbove = integrateBand(psd, pacingHigh, ANALYSIS_HIGH_HZ);

  // Coherence Ratio at pacing frequency
  // High CR = sharp dominant peak at pacing freq (breathing in sync)
  // Low CR = no dominant peak at pacing freq (natural HRV, erratic, breath hold)
  const cr = (pacingPower / Math.max(powerBelow, FLOOR_POWER)) *
             (pacingPower / Math.max(powerAbove, FLOOR_POWER));

  // Natural log transform + scale to 0-100 (HeartMath formula)
  const cs = Math.log(cr + 1);
  const score = Math.max(0, Math.min(100, Math.round((cs / CS_DIVISOR) * 100)));

  AppState.phaseLockScore = score;
  return score;
}
