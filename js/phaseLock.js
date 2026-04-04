// js/phaseLock.js — Phase Lock Score computation
// Phase lock = coherence score when breathing AT the pacer rate.
//
// Rather than reimplementing spectral math (which failed 4 times due to
// resolution, windowing, and normalization issues), this piggybacks on
// the proven computeCoherenceScore from dsp.js — same formula that worked
// for 9+ phases — and adds one check: is the dominant spectral peak at
// the pacing frequency?
//
// - Peak at pacing freq → score = coherence (proven to work)
// - Peak elsewhere → score attenuated (breathing at wrong rate)
// - No dominant peak → coherence already low → score low
//
// Writes: AppState.phaseLockScore, AppState.phaseLockCalibrating
// Called from: dsp.js tick() every second

import { AppState } from './state.js';
import { binToHz, hzToBin } from './dsp.js';

// ---- Constants ----
const ANALYSIS_LOW_HZ = 0.04;
const ANALYSIS_HIGH_HZ = 0.26;
const FREQ_TOLERANCE_HZ = 0.02;  // peak must be within ±0.02 Hz of pacing freq

// ---- Shared FFT instance (unused but kept for initPhaseLock signature) ----
let _fft = null;

/**
 * Initialize the phase lock module with a shared FFT instance.
 * @param {FFT} fftInstance - the same FFT instance used by dsp.js
 */
export function initPhaseLock(fftInstance) {
  _fft = fftInstance;
}

/**
 * Compute phase lock score.
 *
 * Reads AppState.coherenceScore (already computed by dsp.js from the
 * full-resolution PSD) and checks whether the dominant spectral peak
 * is at the pacing frequency.
 *
 * @param {number} [windowSeconds] - unused, kept for call signature compat
 * @param {number} [pacingFreqHz=0.0833] - current pacer frequency in Hz
 * @param {number} [sessionElapsedSec=0] - seconds since session started
 * @returns {number|null} phase lock score 0-100, or null if calibrating
 */
export function computePhaseLockScore(windowSeconds = 20, pacingFreqHz = 0.0833, sessionElapsedSec = 0) {
  const psd = AppState.spectralBuffer;
  if (!psd) {
    AppState.phaseLockCalibrating = true;
    AppState.phaseLockScore = 0;
    return null;
  }

  AppState.phaseLockCalibrating = false;

  // Use the already-computed coherence score (proven formula, same PSD)
  const coherence = AppState.coherenceScore;

  // Find the dominant spectral peak in the analysis band
  const lowBin = Math.max(0, hzToBin(ANALYSIS_LOW_HZ));
  const highBin = Math.min(psd.length - 1, hzToBin(ANALYSIS_HIGH_HZ));
  let maxVal = -1;
  let peakBin = lowBin;
  for (let i = lowBin; i <= highBin; i++) {
    if (psd[i] > maxVal) {
      maxVal = psd[i];
      peakBin = i;
    }
  }
  const peakFreq = binToHz(peakBin);

  // How close is the peak to the pacing frequency?
  const freqError = Math.abs(peakFreq - pacingFreqHz);

  let score;
  if (freqError <= FREQ_TOLERANCE_HZ) {
    // Peak IS at the pacing frequency → full coherence score
    score = coherence;
  } else {
    // Peak is elsewhere → attenuate based on distance
    // At 0.04 Hz error: 60% penalty. At 0.08+ Hz: 80% penalty.
    const penalty = Math.min(0.8, freqError * 15);
    score = Math.round(coherence * (1 - penalty));
  }

  AppState.phaseLockScore = score;
  return score;
}
