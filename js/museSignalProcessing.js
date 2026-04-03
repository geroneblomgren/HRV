// js/museSignalProcessing.js — Muse-S signal processing pipelines
// This module handles both EEG and PPG signal processing for the Muse-S headband.
//
// EEG pipeline (Plan 03): Sliding-window FFT on TP9/TP10 channels, alpha/beta band
// power extraction, artifact rejection, per-session baseline normalization, and
// Neural Calm score (0-100) updated every 0.5 seconds.
//
// PPG pipeline (Plan 02): Peak detection on PPG channels for heart rate and HRV.
//
// Note: This file is created by Plan 03. Plan 02 appends the PPG pipeline section.

import { AppState } from './state.js';
import { setEEGCallback } from './devices/MuseAdapter.js';

// ============================================================================
// EEG PIPELINE (Plan 03)
// ============================================================================

// ---- EEG Constants ----

const EEG_FFT_SIZE = 512;           // 2 seconds at 256 Hz
const EEG_UPDATE_INTERVAL = 128;    // new samples between FFT runs (0.5 sec)
const ALPHA_LOW = 8, ALPHA_HIGH = 12;
const BETA_LOW = 13, BETA_HIGH = 30;
const EEG_FS = 256;
const ARTIFACT_THRESHOLD_UV = 100;  // peak-to-peak µV for epoch rejection
const BASELINE_EPOCHS_NEEDED = 10;  // 10 x 2-sec = 20 sec baseline window
const ALPHA_DROP_THRESHOLD = 0.40;  // 40% drop triggers eyes-open indicator

// ---- EEG State Variables ----

let _eegFft = null;                 // new FFT(512) — separate from dsp.js instance
let _newSampleCount = 0;            // samples since last FFT
let _baselineRatios = [];           // alpha/(alpha+beta) during baseline collection
let _recentRatios = [];             // last 10 ratios for eyes-open detection
let _lastValidNeuralCalm = 0;       // carried forward during artifact rejection
let _eyesOpenTimer = null;

// ---- EEG Public API ----

/**
 * Initialize the EEG FFT pipeline.
 * Creates a separate FFT instance, resets all EEG state, registers the EEG callback
 * via MuseAdapter, and sets AppState.eegCalibrating = true.
 *
 * Must be called after MuseAdapter has connected and started streaming.
 */
export function initEEGPipeline() {
  // Create separate FFT instance (not shared with dsp.js HRV FFT)
  _eegFft = new FFT(EEG_FFT_SIZE);

  // Reset all state
  _newSampleCount = 0;
  _baselineRatios = [];
  _recentRatios = [];
  _lastValidNeuralCalm = 0;
  if (_eyesOpenTimer) {
    clearTimeout(_eyesOpenTimer);
    _eyesOpenTimer = null;
  }

  // Register EEG callback
  setEEGCallback(handleEEGSamples);

  // Set calibrating flag
  AppState.eegCalibrating = true;
  AppState.neuralCalm = 0;
  AppState.rawNeuralCalmRatio = 0;
  AppState.eyesOpenWarning = false;
}

/**
 * Stop the EEG pipeline.
 * Deregisters the EEG callback, clears timers, resets AppState EEG fields.
 */
export function stopEEGPipeline() {
  setEEGCallback(null);

  if (_eyesOpenTimer) {
    clearTimeout(_eyesOpenTimer);
    _eyesOpenTimer = null;
  }

  AppState.neuralCalm = 0;
  AppState.eegCalibrating = true;
  AppState.eyesOpenWarning = false;

  // Reset state
  _eegFft = null;
  _newSampleCount = 0;
  _baselineRatios = [];
  _recentRatios = [];
  _lastValidNeuralCalm = 0;
}

// ---- EEG Internal Functions ----

/**
 * Handle EEG samples from MuseAdapter.
 * Called per EEG channel notification (12 samples at a time).
 * Only processes TP9 (index 0) and TP10 (index 3).
 * Sample count is tracked from TP9 only (single time reference).
 *
 * @param {number} channelIndex - 0=TP9, 1=AF7, 2=AF8, 3=TP10
 * @param {number[]} samples - 12 microvolt samples
 */
function handleEEGSamples(channelIndex, samples) {
  // Only track sample count from TP9 (channel 0) — single time reference
  if (channelIndex === 0) {
    _newSampleCount += samples.length;

    // Trigger FFT computation every 128 new samples (0.5 seconds)
    if (_newSampleCount >= EEG_UPDATE_INTERVAL) {
      _newSampleCount = 0;
      _computeNeuralCalm();
    }
  }
  // Channels 1 (AF7) and 2 (AF8) are ignored for Neural Calm (TP9/TP10 used per research)
  // TP10 (channel 3) data is already written to eegBuffers by MuseAdapter
}

/**
 * Compute Neural Calm score from current TP9 and TP10 buffers.
 * Runs FFT, extracts alpha/beta band power, applies artifact rejection,
 * normalizes against per-session baseline, updates AppState.
 */
function _computeNeuralCalm() {
  if (!_eegFft) return;

  const complexOut = new Float32Array(EEG_FFT_SIZE * 2);
  const windowed = new Float32Array(EEG_FFT_SIZE);

  let alphaTP9 = 0, betaTP9 = 0;
  let alphaTP10 = 0, betaTP10 = 0;

  // Process TP9 (index 0) and TP10 (index 3)
  for (const channelIndex of [0, 3]) {
    // a. Extract epoch from circular buffer in chronological order
    const buf = AppState.eegBuffers[channelIndex];
    const head = AppState.eegHead;
    const epoch = new Float32Array(EEG_FFT_SIZE);
    for (let i = 0; i < EEG_FFT_SIZE; i++) {
      epoch[i] = buf[(head - EEG_FFT_SIZE + i + EEG_FFT_SIZE * 100) % EEG_FFT_SIZE];
    }

    // b. Artifact check — reject if peak-to-peak amplitude exceeds threshold
    let min = epoch[0], max = epoch[0];
    for (let i = 1; i < EEG_FFT_SIZE; i++) {
      if (epoch[i] < min) min = epoch[i];
      if (epoch[i] > max) max = epoch[i];
    }
    if ((max - min) > ARTIFACT_THRESHOLD_UV) {
      // Either channel failing rejects the entire computation
      AppState.neuralCalm = _lastValidNeuralCalm;
      return;
    }

    // c. Apply Hann window
    for (let i = 0; i < EEG_FFT_SIZE; i++) {
      windowed[i] = epoch[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / EEG_FFT_SIZE));
    }

    // d. FFT — output is interleaved [re0, im0, re1, im1, ...]
    _eegFft.realTransform(complexOut, windowed);

    // e. Band power integration
    const alpha = _integrateBand(complexOut, ALPHA_LOW, ALPHA_HIGH);
    const beta = _integrateBand(complexOut, BETA_LOW, BETA_HIGH);

    if (channelIndex === 0) {
      alphaTP9 = alpha;
      betaTP9 = beta;
    } else {
      alphaTP10 = alpha;
      betaTP10 = beta;
    }
  }

  // f. Average across TP9 and TP10
  const alphaPower = (alphaTP9 + alphaTP10) / 2;
  const betaPower = (betaTP9 + betaTP10) / 2;

  // g. Compute ratio
  const ratio = alphaPower / (alphaPower + betaPower + 1e-10);

  // h. Baseline normalization (per-session relative)
  AppState.rawNeuralCalmRatio = ratio;

  if (_baselineRatios.length < BASELINE_EPOCHS_NEEDED) {
    _baselineRatios.push(ratio);
    AppState.neuralCalm = 0;

    // Mark calibration complete when we hit exactly the needed count
    if (_baselineRatios.length === BASELINE_EPOCHS_NEEDED) {
      AppState.eegCalibrating = false;
    }
    return;
  }

  // Compute baseline mean
  const baselineMean = _baselineRatios.reduce((a, b) => a + b, 0) / _baselineRatios.length;

  // Normalize relative to baseline: 0 = at 50% of baseline, 1 = at or above baseline
  const normalized = Math.max(0, Math.min(1, (ratio - baselineMean * 0.5) / baselineMean));
  AppState.neuralCalm = Math.round(normalized * 100);

  // i. Eyes-open detection
  _checkEyesOpen(ratio);

  // j. Store last valid score for artifact rejection carry-forward
  _lastValidNeuralCalm = AppState.neuralCalm;
}

/**
 * Integrate FFT power in a frequency band.
 * @param {Float32Array} complexOut - interleaved [re, im, re, im, ...] FFT output
 * @param {number} lowHz - lower band frequency
 * @param {number} highHz - upper band frequency
 * @returns {number} sum of squared magnitudes in band
 */
function _integrateBand(complexOut, lowHz, highHz) {
  const binLow = Math.round(lowHz * EEG_FFT_SIZE / EEG_FS);
  const binHigh = Math.round(highHz * EEG_FFT_SIZE / EEG_FS);
  let sum = 0;
  for (let i = binLow; i <= binHigh; i++) {
    const re = complexOut[2 * i], im = complexOut[2 * i + 1];
    sum += re * re + im * im;
  }
  return sum;
}

/**
 * Check for eyes-open condition based on sudden alpha power drop.
 * Maintains a rolling buffer of 10 recent ratios.
 * Triggers eyesOpenWarning if alpha drops >40% below rolling mean.
 *
 * @param {number} ratio - current alpha/(alpha+beta) ratio
 */
function _checkEyesOpen(ratio) {
  // Maintain FIFO buffer of last 10 ratios
  _recentRatios.push(ratio);
  if (_recentRatios.length > 10) {
    _recentRatios.shift();
  }

  // Need at least 5 values before detecting drops
  if (_recentRatios.length < 5) return;

  // Mean of all but the most recent value
  const prevRatios = _recentRatios.slice(0, -1);
  const mean = prevRatios.reduce((a, b) => a + b, 0) / prevRatios.length;

  // Check for >40% alpha drop
  const drop = (mean - ratio) / (mean + 1e-10);
  if (drop > ALPHA_DROP_THRESHOLD) {
    AppState.eyesOpenWarning = true;

    // Clear existing timer before setting new one
    if (_eyesOpenTimer) {
      clearTimeout(_eyesOpenTimer);
    }
    // Auto-reset after 3 seconds
    _eyesOpenTimer = setTimeout(() => {
      AppState.eyesOpenWarning = false;
      _eyesOpenTimer = null;
    }, 3000);
  }
}

// ============================================================================
// PPG PIPELINE — See Plan 02
// (Plan 02 will append setPPGCallback import and PPG pipeline functions here)
// ============================================================================
