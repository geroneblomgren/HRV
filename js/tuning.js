// js/tuning.js — Resonance Frequency Tuning Engine (Phase 10)
// Cycles through 5 candidate breathing frequencies, measures spectral RSA
// amplitude at each via the existing DSP pipeline, and selects the optimal
// frequency. Each candidate runs for 2 full breath cycles at its frequency,
// so total duration varies (~90-130s depending on candidate frequencies).
//
// Usage:
//   const result = await startTuning(AppState.savedResonanceFreq);
//   // result = { freqHz, freqBPM, rsaAmplitude }
//   startPractice(result.freqHz);

import { AppState } from './state.js';
import { initAudio, startPacer, stopPacer } from './audio.js';
import { initDSP, tick, computeSpectralRSA } from './dsp.js';

// ---- Module state ----

let _candidates = [];          // Array of candidate frequencies in Hz
let _dspInterval = null;       // setInterval handle for 1-second DSP tick
let _candidateTimer = null;    // setTimeout handle for end-of-candidate-block
let _tuningStart = 0;          // Date.now() when tuning started (for DSP elapsed time)
let _resolve = null;           // Promise resolver from startTuning()
let _active = false;           // true while tuning is running
let _result = null;            // final result object after tuning completes

// ---- Constants ----

const BREATHS_PER_CANDIDATE = 2;     // full breath cycles per candidate (ensures clean RSA measurement)
const CANDIDATE_COUNT = 5;           // number of candidates

// Discovery range: used when no prior resonance frequency is saved
const DISCOVERY_CANDIDATES_BPM = [4.5, 5.0, 5.5, 6.0, 6.5];

// ---- Public API ----

/**
 * Start the resonance frequency tuning process.
 * Generates 5 candidate frequencies around the user's stored resonance
 * frequency (or uses Discovery range if no frequency is saved), then
 * cycles through each for 12 seconds, measuring spectral RSA amplitude.
 *
 * @param {number|null} savedFreqHz - The user's stored resonance frequency in Hz
 *   (e.g., 0.0833 for 5.0 BPM), or null if no frequency has been saved yet.
 * @returns {Promise<{freqHz: number, freqBPM: number, rsaAmplitude: number}>}
 *   Resolves with the winning frequency when all candidates have been tested.
 */
export function startTuning(savedFreqHz) {
  if (_active) {
    stopTuning();
  }

  // Generate candidate frequencies
  if (savedFreqHz == null) {
    // First session: use extended Discovery range
    _candidates = DISCOVERY_CANDIDATES_BPM.map(bpm => bpm / 60);
  } else {
    // Normal: stored freq ± 0.5 BPM in 0.25 BPM steps
    const storedBPM = savedFreqHz * 60;
    const candidateBPMs = [
      storedBPM - 0.5,
      storedBPM - 0.25,
      storedBPM,
      storedBPM + 0.25,
      storedBPM + 0.5,
    ];
    _candidates = candidateBPMs.map(bpm => bpm / 60);
  }

  // Initialize AppState
  AppState.tuningPhase = 'scanning';
  AppState.tuningProgress = 0;
  AppState.tuningCandidateIndex = -1;
  AppState.tuningCandidateCount = CANDIDATE_COUNT;
  AppState.tuningCurrentFreqBPM = 0;
  AppState.tuningResults = [];
  AppState.tuningSelectedFreqBPM = 0;
  AppState.tuningSelectedRSA = 0;
  AppState.tuningStoredFreqBPM = savedFreqHz != null ? savedFreqHz * 60 : 0;

  _active = true;
  _result = null;
  _tuningStart = Date.now();

  // Initialize audio and DSP (must be called inside a user gesture chain)
  initAudio();
  initDSP();

  // Start DSP tick (keeps spectralBuffer current for any renderers)
  _dspInterval = setInterval(() => {
    const elapsed = (Date.now() - _tuningStart) / 1000;
    tick(elapsed);
  }, 1000);

  // Start cycling through candidates
  _startCandidate(0);

  // Return a Promise that resolves when _selectWinner() calls _resolve()
  return new Promise((resolve) => {
    _resolve = resolve;
  });
}

/**
 * Force-stop tuning. Cleans up timers and pacer.
 * Call this if the user cancels before tuning completes.
 */
export function stopTuning() {
  if (_candidateTimer !== null) {
    clearTimeout(_candidateTimer);
    _candidateTimer = null;
  }
  if (_dspInterval !== null) {
    clearInterval(_dspInterval);
    _dspInterval = null;
  }
  stopPacer();
  _active = false;
  _resolve = null;
  AppState.tuningPhase = 'idle';
}

/**
 * Returns the current tuning result, or null if tuning is not complete.
 * @returns {{freqHz: number, freqBPM: number, rsaAmplitude: number}|null}
 */
export function getTuningResult() {
  return _result;
}

// ---- Internal: Candidate block cycling ----

/**
 * Begin testing a single candidate frequency.
 * Starts the bowl pacer at that rate and schedules _endCandidate after
 * CANDIDATE_DURATION_SEC seconds.
 *
 * @param {number} index - 0-based index into _candidates array
 */
function _startCandidate(index) {
  if (!_active) return;

  const freqHz = _candidates[index];
  const freqBPM = freqHz * 60;

  // Duration = 2 full breath cycles at this candidate's frequency
  // e.g., at 4.5 BPM: 60/4.5 = 13.33s per breath × 2 = 26.67s
  const breathDurationSec = 60 / freqBPM;
  const candidateDurationSec = breathDurationSec * BREATHS_PER_CANDIDATE;

  AppState.tuningCandidateIndex = index;
  AppState.tuningCurrentFreqBPM = freqBPM;

  // Start bowl echo pacer at this candidate frequency
  startPacer(freqHz);

  // Schedule end of this candidate block after full breath cycles complete
  _candidateTimer = setTimeout(() => {
    _endCandidate(index, candidateDurationSec);
  }, candidateDurationSec * 1000);
}

/**
 * End a candidate block: stop pacer, measure RSA, store result, advance.
 *
 * @param {number} index - 0-based index of the candidate that just completed
 */
function _endCandidate(index, candidateDurationSec) {
  if (!_active) return;
  _candidateTimer = null;

  const freqHz = _candidates[index];
  const freqBPM = freqHz * 60;

  // Stop pacer for this candidate
  stopPacer();

  // Measure spectral RSA amplitude over the candidate's full breath cycles
  const rsaAmplitude = computeSpectralRSA(candidateDurationSec, freqHz);

  // Record result
  const results = AppState.tuningResults;
  results.push({ freqBPM, rsaAmplitude });
  AppState.tuningResults = results;  // trigger pub/sub for any subscribers

  // Update progress (0-1)
  AppState.tuningProgress = (index + 1) / CANDIDATE_COUNT;

  const nextIndex = index + 1;
  if (nextIndex < _candidates.length) {
    // Immediate transition to next candidate — bowl pacer provides natural breathing rhythm
    _startCandidate(nextIndex);
  } else {
    // All candidates tested — select winner
    _selectWinner();
  }
}

/**
 * Select the candidate with highest RSA amplitude as the winning frequency.
 * Resolves the Promise returned by startTuning().
 */
function _selectWinner() {
  if (!_active) return;

  // Clean up DSP tick
  if (_dspInterval !== null) {
    clearInterval(_dspInterval);
    _dspInterval = null;
  }
  _active = false;

  // Find candidate with highest rsaAmplitude
  const results = AppState.tuningResults;
  let bestIndex = 0;
  let bestRSA = -Infinity;
  for (let i = 0; i < results.length; i++) {
    if (results[i].rsaAmplitude > bestRSA) {
      bestRSA = results[i].rsaAmplitude;
      bestIndex = i;
    }
  }

  const winner = results[bestIndex];
  const winnerBPM = winner.freqBPM;
  const winnerRSA = winner.rsaAmplitude;
  const winnerHz = winnerBPM / 60;

  // Write winning values to AppState
  AppState.tuningSelectedFreqBPM = winnerBPM;
  AppState.tuningSelectedRSA = winnerRSA;
  AppState.tuningPhase = 'result';

  // Store result for getTuningResult()
  _result = { freqHz: winnerHz, freqBPM: winnerBPM, rsaAmplitude: winnerRSA };

  // Resolve the Promise
  if (_resolve) {
    _resolve(_result);
    _resolve = null;
  }
}
