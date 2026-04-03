---
phase: 07-muse-s-connection-signal-processing
plan: "03"
subsystem: eeg-signal-processing
tags: [eeg, fft, neural-calm, artifact-rejection, biofeedback, muse-s, ppg, ble]
dependency_graph:
  requires: ["07-01", "07-02"]
  provides: ["EEG FFT pipeline", "Neural Calm score", "eyes-open detection", "IR PPG channel default", "hardware-verified BLE UUIDs"]
  affects: ["js/museSignalProcessing.js", "js/devices/MuseAdapter.js", "js/main.js", "index.html"]
tech_stack:
  added: ["fft.js (global FFT, separate 512-sample instance for EEG)"]
  patterns: ["Sliding-window FFT", "Hann windowing", "Band power integration", "Per-session baseline normalization", "Circular buffer epoch extraction", "Forehead PPG polarity inversion handling"]
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
  - "IR channel (Ch0) confirmed empirically as best PPG channel for Muse-S forehead placement — set as default"
  - "BLE characteristic UUIDs corrected post hardware verification — initial UUIDs were wrong"
  - "AppState exposed on window for live console debugging during hardware sessions"
metrics:
  duration: "~90 minutes (including hardware verification and post-verify fixes)"
  completed: "2026-04-03"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 4
requirements:
  - EEG-01
  - EEG-02
---

# Phase 7 Plan 03: EEG FFT Pipeline and Neural Calm Scoring Summary

**EEG FFT pipeline on TP9/TP10 with 100 µV artifact rejection and 0-100 Neural Calm score, verified live on Muse-S hardware — HR accurate (~85 bpm), eyes-open indicator confirmed, blink rejection stable**

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

### Task 3: Human Verification — APPROVED

Physical Muse-S headband verified with the following results:

- Muse-S connects and streams EEG + PPG data simultaneously
- IR channel (Ch0) confirmed as best PPG channel empirically
- HR tracking accurate (~85 bpm resting)
- PPG signal quality: fair (normal and expected for forehead placement)
- Neural Calm score rises visibly when eyes close and relaxes for 10 seconds
- Eyes-open indicator fires correctly when eyes open
- Blink artifact rejection keeps Neural Calm stable during deliberate blinks

**Post-verification fix commits required (see Deviations section):**
- `a5b43c7` — fix(07): correct Muse BLE characteristic UUIDs and set IR as default PPG channel
- `762005c` — fix(07): tune PPG peak detection for Muse-S forehead sensor
- `db4556c` — fix(07): expose AppState on window for console debugging

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected Muse BLE characteristic UUIDs and set IR default PPG channel**
- **Found during:** Task 3 human-verify (BLE connection testing)
- **Issue:** MuseAdapter used incorrect base UUID for Muse-S GATT characteristics — device appeared to connect but characteristic subscriptions failed, producing no data
- **Fix:** Corrected all EEG and PPG characteristic UUIDs to match actual Muse-S firmware. Empirically confirmed IR channel (Ch0) as best PPG channel for forehead; updated default from Green (Ch1) to IR (Ch0)
- **Files modified:** `js/devices/MuseAdapter.js`
- **Verification:** Muse-S streams live EEG + PPG data after fix
- **Committed in:** `a5b43c7`

**2. [Rule 1 - Bug] Tuned PPG peak detection for Muse-S forehead sensor**
- **Found during:** Task 3 human-verify (HR accuracy testing)
- **Issue:** Forehead PPG signal is polarity-inverted vs wrist PPG and requires a longer warmup period before adaptive thresholds settle. Wrist-tuned parameters caused missed beats and noisy HR output.
- **Fix:** Flipped detection polarity, extended warmup threshold, tuned adaptive decay constants for forehead sensor characteristics
- **Files modified:** `js/museSignalProcessing.js`
- **Verification:** HR tracking ~85 bpm resting; PPG quality shows "fair" (physically correct for forehead)
- **Committed in:** `762005c`

**3. [Rule 2 - Missing Critical] Exposed AppState on window for console debugging**
- **Found during:** Task 3 human-verify (hardware debugging)
- **Issue:** No way to inspect live AppState values (neuralCalm, ppgSignalQuality, eegCalibrating) from browser console during hardware testing — made BLE/signal debugging very slow
- **Fix:** Added `window.AppState = AppState` so live values are readable from console
- **Files modified:** `js/state.js` or entry module
- **Verification:** `window.AppState.neuralCalm` readable in console during active streaming
- **Committed in:** `db4556c`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing debug affordance)
**Impact on plan:** All three fixes were required for the hardware verification to succeed. UUID fix was a hard blocker; PPG tuning was needed for accurate HR; debug exposure prevented hours of blind debugging. No scope creep.

## Self-Check

### Files created/modified:
- js/museSignalProcessing.js — FOUND
- js/devices/MuseAdapter.js — FOUND (modified)
- js/main.js — FOUND (modified)
- index.html — FOUND (modified)
- styles.css — FOUND (modified)

### Commits:
- 27401a5 — feat(07-03): implement EEG FFT pipeline with Neural Calm scoring
- 7172ace — feat(07-03): wire EEG pipeline into MuseAdapter and add EEG UI indicators
- a5b43c7 — fix(07): correct Muse BLE characteristic UUIDs and set IR as default PPG channel
- 762005c — fix(07): tune PPG peak detection for Muse-S forehead sensor
- db4556c — fix(07): expose AppState on window for console debugging

## Self-Check: PASSED
