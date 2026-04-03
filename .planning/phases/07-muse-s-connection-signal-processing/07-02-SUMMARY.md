---
phase: 07-muse-s-connection-signal-processing
plan: 02
subsystem: ppg-signal-processing
tags: [ppg, dsp, butterworth, peak-detection, artifact-rejection, hrv, muse-s]
depends_on:
  requires: [07-01]
  provides: [07-03]
  affects: [js/museSignalProcessing.js, js/devices/MuseAdapter.js, js/state.js]
tech-stack:
  added: []
  patterns:
    - Transposed Direct Form II biquad filter (stateful, per-sample)
    - Cascaded HP+LP Butterworth = 4th-order bandpass (same as scipy butter(2, [0.5/32, 3/32], 'band'))
    - Derivative zero-crossing peak detection with adaptive threshold + refractory period
    - Rolling quality window (30s) with 5s update cadence (matches HRMAdapter artifact rejection pattern)
key-files:
  created:
    - js/museSignalProcessing.js (PPG pipeline section appended — ~250 lines)
  modified:
    - js/devices/MuseAdapter.js (import + lifecycle wiring: initPPGPipeline/stopPPGPipeline)
    - index.html (PPG debug panel: 3 canvases + stats row)
    - styles.css (debug panel overlay styles)
    - js/main.js (window.togglePPGDebug console command + triple-click on Muse chip)
decisions:
  - "Cascaded HP+LP Butterworth (not bandpass design): identical frequency response to scipy butter(2, [0.5/32, 3/32], 'band') — -3 dB exactly at 0.5 Hz and 3.0 Hz"
  - "Green channel (index 1) is default active PPG channel — setPPGChannel() exposes runtime switching for empirical calibration (Plan 04)"
  - "bpm/beats written to AppState.bpm and AppState.beats (same fields as HRMAdapter) — DSP engine fully source-agnostic"
  - "Debug panel toggle: console (window.togglePPGDebug()) plus triple-click on Muse chip — no permanent visible UI element"
metrics:
  duration: 9 min
  completed: 2026-04-03
  tasks: 2
  files: 5
---

# Phase 7 Plan 02: PPG Signal Processing Pipeline Summary

**One-liner:** 4th-order Butterworth bandpass PPG pipeline (0.5–3 Hz, 64 Hz Fs) with adaptive peak detection, two-tier artifact rejection, and source-agnostic RR buffer writes.

## What Was Built

The PPG signal processing pipeline transforms raw 24-bit Muse-S PPG samples into clean inter-beat intervals and writes them to the same `AppState.rrBuffer`/`rrHead` slots used by HRMAdapter — making PPG-derived HRV fully compatible with the existing DSP coherence engine without any DSP changes.

### Pipeline stages (in order):

1. **Butterworth bandpass filter** — two cascaded 2nd-order biquad sections (Transposed Direct Form II). Section 0: Butterworth highpass at 0.5 Hz (removes baseline wander). Section 1: Butterworth lowpass at 3.0 Hz (removes motion/high-freq noise). Combined response: -3 dB at 0.5 Hz and 3.0 Hz, flat passband 0.75–2.5 Hz, -108 dB at DC.

2. **2-second warmup** — filter runs for 128 samples before any peak detection. Initial adaptive threshold set to 75th percentile of `|filtered|` values seen during warmup. This prevents false peaks from the threshold starting at zero.

3. **Derivative + adaptive threshold peak detection** — tracks zero-crossing of derivative (positive→negative) where filtered value exceeds threshold. On peak: threshold updated by blending 60% new peak amplitude + 40% current threshold. Threshold decays at 0.995/sample (~32%/sec) between peaks. Refractory period: 20 samples (300 ms minimum) prevents double-counting.

4. **Two-tier artifact rejection** — exactly matches HRMAdapter:
   - Tier 1: absolute bounds 300–2000 ms (physiological limits)
   - Tier 2: 20% deviation from 5-beat rolling median

5. **Signal quality indicator** — rolling 30-second window of peak attempts vs rejections. Updates `AppState.ppgSignalQuality` every 5 seconds: `good` (<10%), `fair` (10–30%), `poor` (>30%).

6. **RR buffer write** — valid IBI written as: `AppState.rrBuffer[AppState.rrHead % 512] = ibi; AppState.rrHead++; AppState.bpm = ...; AppState.beats++`.

### MuseAdapter wiring:

`_connectGATT()` calls `initPPGPipeline()` after `museStatus = 'streaming'`. Both `disconnect()` and `_onDisconnected()` call `stopPPGPipeline()`.

### Debug panel:

Hidden overlay (`#ppg-debug-panel`) with 3 canvases (Ch0=IR red, Ch1=Green, Ch2=blue), signal quality, HR, and active channel stats. Toggle via `window.togglePPGDebug()` in browser console or triple-click on the Muse chip in the UI. rAF renderer checks panel visibility before drawing (no CPU cost when hidden).

## Filter Coefficient Derivation

Coefficients computed numerically via bilinear transform:

| Section | b0 | b1 | b2 | a1 | a2 |
|---------|----|----|----|----|-----|
| HP 0.5 Hz | 0.9658852897 | -1.9317705795 | 0.9658852897 | -1.9306064272 | 0.9329347318 |
| LP 3.0 Hz | 0.0178631928 | 0.0357263855 | 0.0178631928 | -1.5879371063 | 0.6593898773 |

Verified frequency response: 0.5 Hz = -3.01 dB, 1.0 Hz = -0.31 dB, 3.0 Hz = -3.01 dB, DC = -108 dB.

## Deviations from Plan

None — plan executed exactly as written.

The plan said to implement `museSignalProcessing.js` as a new file; the file already existed as a stub from Plan 03 (which was written as a forward stub). The PPG pipeline was appended to the existing file preserving all EEG pipeline content. The import was updated from `setEEGCallback` only to include `setPPGCallback` as well.

## Self-Check

**Files created/modified:**
- `js/museSignalProcessing.js` — FOUND (PPG pipeline appended)
- `js/devices/MuseAdapter.js` — FOUND (initPPGPipeline/stopPPGPipeline wired)
- `index.html` — FOUND (debug panel added)
- `styles.css` — FOUND (debug panel styles added)
- `js/main.js` — FOUND (togglePPGDebug + triple-click added)

**Commits:**
- `f9a58f1` — feat(07-02): implement PPG signal processing pipeline in museSignalProcessing.js
- `9fec0bd` — feat(07-02): wire PPG pipeline into MuseAdapter lifecycle and add hidden debug panel

## Self-Check: PASSED
