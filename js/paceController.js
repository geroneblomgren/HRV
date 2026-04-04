// js/paceController.js — Adaptive Pace Controller
// Closed-loop pace adjustment: drifts AppState.pacingFreq toward user's
// detected breathing rhythm when phase lock is low, bounded within ±0.5 BPM
// of the tuned resonance frequency.
//
// Called every 1 second from the DSP tick interval in practice.js.

import { AppState } from './state.js';
import { binToHz, hzToBin, SAMPLE_RATE_HZ, FFT_SIZE } from './dsp.js';

// ---- Constants ----

const TRIGGER_THRESHOLD = 50;          // phase lock below this triggers adjustment
const TRIGGER_SECONDS = 10;            // consecutive seconds below threshold before activating
const MAX_RATE_HZ = 0.01 / 30;         // max Hz change per second (~0.000333 Hz/tick)
const MAX_OFFSET_BPM = 0.5;            // hard bound: ±0.5 BPM from tuned frequency
const SMOOTHING_WINDOW = 5;            // seconds of PSD peak readings for median smoothing
const MIN_RELATIVE_POWER = 0.05;       // skip PSD peak if < 5% of total LF band power

// LF band limits for breathing rate detection
const LF_LOW_HZ = 0.04;
const LF_HIGH_HZ = 0.15;

// ---- Module state ----

let _tunedFreqHz = 0;
let _belowThresholdSec = 0;
let _prevPhaseLockScore = 0;
let _userFreqHistory = [];             // circular buffer for PSD peak smoothing
let _active = false;

// ---- Private helpers ----

/**
 * Find the bin with maximum PSD in the LF breathing band (0.04-0.15 Hz).
 * Inlined from dsp.js findPeakBin — keeps dsp.js public API minimal.
 * @param {Float32Array} psd
 * @returns {number} bin index of peak
 */
function _findPSDPeak(psd) {
  const lowBin = Math.max(0, hzToBin(LF_LOW_HZ));
  const highBin = Math.min(psd.length - 1, hzToBin(LF_HIGH_HZ));
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

/**
 * Compute median of a small numeric array.
 * @param {number[]} arr
 * @returns {number}
 */
function _median(arr) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Integrate PSD power between two frequency bounds.
 * @param {Float32Array} psd
 * @param {number} lowHz
 * @param {number} highHz
 * @returns {number}
 */
function _integrateBand(psd, lowHz, highHz) {
  const lowBin = Math.max(0, hzToBin(lowHz));
  const highBin = Math.min(psd.length - 1, hzToBin(highHz));
  let sum = 0;
  for (let i = lowBin; i <= highBin; i++) {
    sum += psd[i];
  }
  return sum;
}

// ---- Public API ----

/**
 * Initialize the pace controller at session start.
 * Must be called once after tuning completes, before the DSP tick loop starts.
 *
 * @param {number} tunedFreqHz - the tuned resonance frequency in Hz (anchor for ±0.5 BPM bound)
 */
export function initPaceController(tunedFreqHz) {
  _tunedFreqHz = tunedFreqHz;
  _belowThresholdSec = 0;
  _prevPhaseLockScore = AppState.phaseLockScore;
  _userFreqHistory = [];
  _active = false;

  AppState.paceControllerActive = false;
  AppState.pacerAtBound = false;
  AppState.pacingFreqTuned = tunedFreqHz;
}

/**
 * Pace controller tick — called every 1 second from the DSP tick interval.
 * Reads phase lock score and spectral buffer, drifts AppState.pacingFreq
 * toward user's detected breathing rate when phase lock is persistently low.
 *
 * @param {number} sessionElapsedSec - seconds since session started
 */
export function paceControllerTick(sessionElapsedSec) {
  // 1. Calibration gate — spectralBuffer is null before 120s
  if (sessionElapsedSec < 120) return;

  // 2. Read current phase lock score
  const currentScore = AppState.phaseLockScore;

  // 3. Detect uptrend (user is catching up — pause adjustment)
  const isRising = currentScore > _prevPhaseLockScore;
  _prevPhaseLockScore = currentScore;

  // 4. If lock recovered, reset and exit
  if (currentScore >= TRIGGER_THRESHOLD) {
    _belowThresholdSec = 0;
    _active = false;
    AppState.paceControllerActive = false;
    return;
  }

  // 5. If score is rising, pause (don't increment counter)
  if (isRising) return;

  // 6. Increment below-threshold counter
  _belowThresholdSec++;

  // 7. Not yet triggered
  if (_belowThresholdSec < TRIGGER_SECONDS) return;

  // 8. Need spectral buffer
  const psd = AppState.spectralBuffer;
  if (!psd) return;

  // 9. Detect user's breathing rate from PSD peak in LF band
  const peakBin = _findPSDPeak(psd);
  const detectedHz = binToHz(peakBin);

  // Power guard (Pitfall 4): reject noisy estimates with low relative power
  const peakPower = _integrateBand(psd, detectedHz - 0.01, detectedHz + 0.01);
  const totalLFPower = _integrateBand(psd, LF_LOW_HZ, LF_HIGH_HZ);
  if (totalLFPower <= 0 || peakPower / totalLFPower < MIN_RELATIVE_POWER) return;

  // 10. Push detected Hz to history, trim to SMOOTHING_WINDOW
  _userFreqHistory.push(detectedHz);
  if (_userFreqHistory.length > SMOOTHING_WINDOW) {
    _userFreqHistory.shift();
  }

  // 11. Median smoothing — need at least 1 reading (conservative)
  const smoothedUserHz = _median(_userFreqHistory);

  // 12. Hard bounds: ±0.5 BPM from tuned frequency
  const maxHz = _tunedFreqHz + MAX_OFFSET_BPM / 60;
  const minHz = _tunedFreqHz - MAX_OFFSET_BPM / 60;

  // 13. Clamp target to bounds
  let targetHz = smoothedUserHz;
  let clamped = false;
  if (smoothedUserHz > maxHz) {
    targetHz = maxHz;
    clamped = true;
  } else if (smoothedUserHz < minHz) {
    targetHz = minHz;
    clamped = true;
  }

  // 14. Step toward target by at most MAX_RATE_HZ per tick
  const currentHz = AppState.pacingFreq;
  const delta = targetHz - currentHz;
  const step = Math.sign(delta) * Math.min(Math.abs(delta), MAX_RATE_HZ);
  const newHz = currentHz + step;

  // 15. Write new frequency to AppState (audio scheduler picks it up within 25ms)
  AppState.pacingFreq = newHz;

  // 16. Mark controller as active
  _active = true;
  AppState.paceControllerActive = true;

  // 17. Amber badge when clamped AND user's target is further away than one step
  AppState.pacerAtBound = clamped && Math.abs(smoothedUserHz - newHz) > MAX_RATE_HZ;
}
