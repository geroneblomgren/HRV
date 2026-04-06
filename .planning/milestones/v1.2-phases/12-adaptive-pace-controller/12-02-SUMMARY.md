---
phase: 12-adaptive-pace-controller
plan: "02"
subsystem: pace-controller + practice-session + renderer
tags: [adaptive-pace, closed-loop, phase-lock, dsp, bpm-badge, session-persistence]
dependency_graph:
  requires: [js/dsp.js (binToHz/hzToBin/SAMPLE_RATE_HZ/FFT_SIZE), js/state.js (AppState), js/audio.js (dynamic-freq-scheduler from 12-01)]
  provides: [js/paceController.js, pace-trace-persistence, bpm-badge-in-pacer-circle]
  affects: [js/practice.js, js/renderer.js, index.html]
tech_stack:
  added: [js/paceController.js]
  patterns: [closed-loop-dsp-feedback, median-smoothing, psd-power-guard, calibration-gate]
key_files:
  created:
    - js/paceController.js
  modified:
    - js/practice.js
    - js/renderer.js
    - index.html
decisions:
  - binToHz/hzToBin imported from dsp.js (already exported) rather than inlined — avoids duplication
  - findPeakBin logic inlined as _findPSDPeak in paceController.js per research recommendation (keeps dsp.js public API minimal)
  - summary-pace element reuses summary-hr-source CSS class — consistent styling with zero new CSS
  - BPM badge placed at cy + dim*0.13 — below timer (cy + dim*0.04), well within circle boundary
  - paceTrace collected every second regardless of controller state — full frequency history preserved for analysis
metrics:
  duration_minutes: 2
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_modified: 4
---

# Phase 12 Plan 02: Pace Controller Module + Practice Wiring + BPM Badge Summary

**One-liner:** Closed-loop paceController.js module drifts pacingFreq toward user's detected breathing rate when phase lock stays below 50 for 10+ seconds, bounded ±0.5 BPM from tuned RF, with a live BPM badge in the pacer circle.

## What Was Built

### Task 1: js/paceController.js (new module)

The core adaptive behavior: `paceControllerTick` is called every 1 second from the DSP loop and adjusts `AppState.pacingFreq` to bring breathing pace closer to the user's natural rhythm when phase lock is persistently low.

Key behaviors:
- **Calibration gate:** No action before 120s (spectralBuffer is null until then)
- **Uptrend pause:** Controller pauses when phase lock score is rising — user is catching up, don't interfere
- **Trigger delay:** 10 consecutive seconds below threshold (score < 50) before any adjustment
- **PSD power guard:** Rejects noisy frequency estimates where detected peak represents < 5% of total LF band power — prevents poisoning the median buffer with noise
- **Median smoothing:** 5-reading median before applying drift — further smooths out transient PSD artifacts
- **Hard bound:** ±0.5 BPM from `_tunedFreqHz` — hard clamps ensure the app never drifts far from the user's resonance frequency
- **Step rate:** Max 0.01/30 Hz per tick (~0.333 mHz/s) — imperceptible on each tick, produces gentle drift over 30+ seconds
- **Amber badge flag:** `AppState.pacerAtBound` set when clamped AND user's target is further than one step away

Uses exported `binToHz`/`hzToBin`/`SAMPLE_RATE_HZ`/`FFT_SIZE` from dsp.js — both were already exported so no API widening needed. `findPeakBin` logic inlined as private `_findPSDPeak` per the research recommendation to keep dsp.js public API minimal.

### Task 2: practice.js + renderer.js + index.html

**practice.js wiring:**
- Import `initPaceController`/`paceControllerTick` from `./paceController.js`
- `_paceTrace = []` reset at session start alongside other traces
- `initPaceController(result.freqHz)` called after tuning result, before DSP loop
- `paceControllerTick(elapsed)` called every second in DSP interval (after `tick(elapsed)`)
- `_paceTrace.push(AppState.pacingFreq)` captures frequency each second
- `_computeSummary()` extended with `tunedBPM`, `settledBPM`, `paceTrace`
- `_showSummary()` shows "Pace: X.X → X.X BPM" when drift ≥ 0.05 BPM
- `_saveSession()` persists `tunedBPM`, `settledBPM`, `paceTrace` to IndexedDB

**renderer.js BPM badge:**
- Added after timer text in `drawBreathingCircle()`
- Only visible when `AppState.sessionPhase === 'practice'`
- Shows `(AppState.pacingFreq * 60).toFixed(1)` BPM
- Teal (#14b8a6) normally — matches ring color
- Amber (#f59e0b) when `AppState.pacerAtBound` — signals clamped at boundary

**index.html:**
- Added `<p id="summary-pace" class="summary-hr-source" style="display:none;"></p>` before the neural-calm section — reuses existing CSS class for zero new styling

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create pace controller module | 34e983c | js/paceController.js |
| 2 | Wire controller + BPM badge + pace persistence | 1a97ed0 | js/practice.js, js/renderer.js, index.html |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `js/paceController.js` exists with both exports verified
- `js/practice.js` contains all 8 verification grep patterns
- `js/renderer.js` contains BPM badge with badgeColor and pacerAtBound
- `index.html` contains `summary-pace` element
- Both commits exist: 34e983c, 1a97ed0
