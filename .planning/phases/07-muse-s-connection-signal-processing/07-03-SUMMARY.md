---
phase: 07-muse-s-connection-signal-processing
plan: "03"
subsystem: eeg-signal-processing
tags: [eeg, fft, neural-calm, artifact-rejection, biofeedback, muse-s]
dependency_graph:
  requires: ["07-01"]
  provides: ["EEG FFT pipeline", "Neural Calm score", "eyes-open detection"]
  affects: ["js/museSignalProcessing.js", "js/devices/MuseAdapter.js", "js/main.js", "index.html"]
tech_stack:
  added: ["fft.js (global FFT, separate 512-sample instance for EEG)"]
  patterns: ["Sliding-window FFT", "Hann windowing", "Band power integration", "Per-session baseline normalization", "Circular buffer epoch extraction"]
key_files:
  created: ["js/museSignalProcessing.js"]
  modified: ["js/devices/MuseAdapter.js", "js/main.js", "index.html", "styles.css"]
decisions:
  - "TP9/TP10 used for Neural Calm (not AF7/AF8) — frontal channels too susceptible to blink artifacts"
  - "Separate FFT(512) instance created in initEEGPipeline — isolated from dsp.js HRV FFT(512)"
  - "Artifact rejection: reject entire epoch if EITHER TP9 or TP10 exceeds 100 µV peak-to-peak"
  - "Carry forward last valid Neural Calm during rejected epochs (not zero, not NaN)"
  - "Eyes-open warning auto-resets after 3 seconds via clearTimeout pattern"
  - "PPG quality cell hidden by default; shown only when hrSourceLabel === 'Muse PPG'"
metrics:
  duration: "3 minutes"
  completed: "2026-04-03"
  tasks_completed: 2
  tasks_total: 3
  files_created: 1
  files_modified: 4
requirements:
  - EEG-01
  - EEG-02
---

# Phase 7 Plan 03: EEG FFT Pipeline and Neural Calm Scoring Summary

**One-liner:** EEG FFT pipeline on TP9/TP10 with 100 µV artifact rejection, 20-second per-session baseline, and 0-100 Neural Calm score updating at 2 Hz.

## What Was Built

### Task 1: EEG FFT Pipeline (js/museSignalProcessing.js)

Created the EEG signal processing module with the following components:

**Constants:** EEG_FFT_SIZE=512 (2s at 256 Hz), EEG_UPDATE_INTERVAL=128 (0.5s step), alpha band 8-12 Hz, beta band 13-30 Hz, ARTIFACT_THRESHOLD_UV=100, BASELINE_EPOCHS_NEEDED=10, ALPHA_DROP_THRESHOLD=0.40.

**handleEEGSamples(channelIndex, samples):** Registered as the EEG callback. Counts samples from TP9 only (channel 0 = single time reference). Triggers `_computeNeuralCalm()` every 128 new samples.

**_computeNeuralCalm():** For each of TP9 (index 0) and TP10 (index 3): extracts 512-sample epoch from `AppState.eegBuffers` circular buffer in chronological order, checks peak-to-peak amplitude against 100 µV threshold, applies Hann window, runs `_eegFft.realTransform()`, integrates alpha and beta band power via `_integrateBand()`. Averages across both channels. Computes `ratio = alpha/(alpha+beta+1e-10)`. During first 10 epochs, collects baseline. After baseline: `normalized = clamp(0,1,(ratio - baselineMean*0.5) / baselineMean)`, `AppState.neuralCalm = round(normalized * 100)`.

**_checkEyesOpen(ratio):** Maintains 10-value FIFO. If mean of all-but-last drops >40% relative to current: sets `AppState.eyesOpenWarning = true`, clears and resets 3-second timer to auto-reset.

**Exports:** `initEEGPipeline()`, `stopEEGPipeline()`.

### Task 2: MuseAdapter Wiring and UI Indicators

**MuseAdapter.js:** Imports `initEEGPipeline` and `stopEEGPipeline` from museSignalProcessing.js. Calls `initEEGPipeline()` after `museStatus = 'streaming'`. Calls `stopEEGPipeline()` in both `disconnect()` (explicit) and `_onDisconnected()` (unexpected GATT disconnect).

**main.js subscriptions added:**
- `eegCalibrating`: updates Muse chip status text to "EEG calibrating..." while true
- `eyesOpenWarning`: toggles `.hidden` class on `#eyes-open-warning` overlay
- `ppgSignalQuality`: updates colored dot and text in live panel PPG quality cell
- `hrSourceLabel`: also gates PPG quality cell visibility (only shown when Muse PPG is active)

**index.html:** Added `#eyes-open-warning` overlay div (fixed position, above live panel). Added `#ppg-quality-cell` in the live data panel.

**styles.css:** `.eyes-open-warning` (fixed position, amber border, blur backdrop), `.ppg-quality-dot` (green/amber/red colors for good/fair/poor), `.muse-eeg-status` for calibration label styling.

### Task 3: Human Verification (PENDING)

Awaiting physical Muse-S headband verification of connection, PPG peak detection, Neural Calm responsiveness, artifact rejection, and eyes-open indicator behavior.

## Deviations from Plan

None — plan executed exactly as written.

The plan note said "AF7/AF8 for Neural Calm" in the STATE.md decisions section, but the plan itself correctly specifies TP9/TP10. Implementation uses TP9/TP10 as specified in the PLAN.md task action (the AF7/AF8 reference in STATE.md is an older decision that was superseded).

## Self-Check

### Files created/modified:
- js/museSignalProcessing.js — FOUND (273 lines)
- js/devices/MuseAdapter.js — FOUND (modified)
- js/main.js — FOUND (modified)
- index.html — FOUND (modified)
- styles.css — FOUND (modified)

### Commits:
- 27401a5 — feat(07-03): implement EEG FFT pipeline with Neural Calm scoring
- 7172ace — feat(07-03): wire EEG pipeline into MuseAdapter and add EEG UI indicators

## Self-Check: PASSED
