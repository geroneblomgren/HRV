// js/phaseLock.js — Phase Lock Score computation
// Combines two signals to determine if the user is breathing in sync
// with the pacer:
//
// 1. Coherence (proven HeartMath formula from dsp.js) — measures whether
//    the HR spectrum has a dominant peak. High when breathing is organized.
//    Problem: also high during breath holding (Mayer wave dominates an
//    otherwise empty spectrum).
//
// 2. Amplitude factor — absolute RSA amplitude at the pacing frequency.
//    Strong sync breathing = 10-20+ BPM. Natural HRV = 3-8 BPM.
//    Breath holding = 1-3 BPM. This is the differentiator.
//
// 3. Frequency check — is the dominant peak AT the pacing frequency?
//    Penalizes breathing at a different rate than the pacer.
//
// Score = coherence × amplitudeFactor × frequencyFactor
//
// This guarantees:
//   Sync breathing: high coherence × high amplitude × peak at pacing = HIGH
//   Breath holding: high coherence × LOW amplitude × peak near pacing = LOW
//   Hyperventilating: low coherence × low amplitude × peak elsewhere = LOW
//   Ignoring pacer: moderate coherence × moderate amplitude × peak elsewhere = LOW-MODERATE
//
// Writes: AppState.phaseLockScore, AppState.phaseLockCalibrating
// Called from: dsp.js tick() every second, AFTER spectralBuffer and coherenceScore

import { AppState } from './state.js';
import { integrateBand, binToHz, hzToBin, FFT_SIZE, SAMPLE_RATE_HZ } from './dsp.js';

// ---- Constants ----
const PEAK_HALF_BAND = 0.015;    // Hz — ±0.015 Hz around pacing freq
const ANALYSIS_LOW_HZ = 0.04;
const ANALYSIS_HIGH_HZ = 0.26;
const FREQ_TOLERANCE_HZ = 0.015; // peak must be within ±0.015 Hz of pacing freq
const AMP_THRESHOLD_BPM = 8.0;   // BPM peak-to-peak required for full amplitude factor
                                  // Below this: factor < 1, penalizing low-amplitude states
                                  // Natural HRV ~3-5 BPM → factor 0.38-0.63
                                  // Sync breathing ~12-20 BPM → factor 1.0
                                  // Breath holding ~1-3 BPM → factor 0.13-0.38

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

  // --- Component 1: Coherence (proven HeartMath formula, already computed) ---
  const coherence = AppState.coherenceScore;

  // --- Component 2: Amplitude factor at pacing frequency ---
  // Compute RSA amplitude (BPM peak-to-peak) from the PSD at the pacing freq.
  // This is the same math as computeSpectralRSA but using the full-res PSD.
  const pacingPower = integrateBand(psd, pacingFreqHz - PEAK_HALF_BAND, pacingFreqHz + PEAK_HALF_BAND);
  const effectiveSamples = Math.min(FFT_SIZE, Math.floor(Math.min(sessionElapsedSec, 128) * SAMPLE_RATE_HZ));
  const hannGain = 0.5;
  const rmsAmplitude = Math.sqrt(2 * pacingPower) / (effectiveSamples * hannGain);
  const peakToPeakBPM = 2 * rmsAmplitude;

  // Amplitude factor: linear ramp from 0 at 0 BPM to 1 at AMP_THRESHOLD_BPM
  const amplitudeFactor = Math.min(1, peakToPeakBPM / AMP_THRESHOLD_BPM);

  // --- Component 3: Frequency proximity check ---
  // Is the dominant spectral peak at the pacing frequency?
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
  const freqError = Math.abs(peakFreq - pacingFreqHz);

  let frequencyFactor;
  if (freqError <= FREQ_TOLERANCE_HZ) {
    frequencyFactor = 1.0;
  } else {
    // Linear penalty: at 0.03 Hz error → 0.55, at 0.06 Hz → 0.1, at 0.07+ Hz → 0
    frequencyFactor = Math.max(0, 1 - (freqError - FREQ_TOLERANCE_HZ) * 18);
  }

  // --- Combined score ---
  const rawScore = coherence * amplitudeFactor * frequencyFactor;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  AppState.phaseLockScore = score;
  return score;
}
