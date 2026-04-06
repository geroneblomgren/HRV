---
phase: 11-phase-lock-engine
plan: 01
subsystem: dsp
tags: [fft, phase-lock, hrv, biofeedback, dsp]

# Dependency graph
requires:
  - phase: 10-resonance-tuning
    provides: AppState.pacingFreq — the live pacer frequency consumed by computePhaseLockScore
  - phase: dsp
    provides: buildEvenlySpacedTachogram, FFT_SIZE, SAMPLE_RATE_HZ, _fft instance
provides:
  - js/phaseLock.js module with initPhaseLock() and computePhaseLockScore()
  - AppState.phaseLockScore (0-100, updated every DSP tick)
  - AppState.phaseLockCalibrating (bool, true until 25s RR data accumulated)
affects: [11-02-ui-swap, 12-adaptive-pace-controller, 13-dashboard-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FFT bin extraction for instantaneous phase alignment (Pattern 2 from RESEARCH.md)"
    - "Shared FFT instance: initPhaseLock(_fft) called from initDSP() to reuse allocation"
    - "Calibration gate: independent 25s gate (phaseLockCalibrating) separate from coherence 120s gate"

key-files:
  created:
    - js/phaseLock.js
  modified:
    - js/state.js
    - js/dsp.js

key-decisions:
  - "Phase lock uses FFT bin extraction (Pattern 2), not Hilbert transform — avoids IFFT, same FFT instance reused"
  - "Pacer phase computed relative to window center (not AudioContext epoch) — portable, no external dependency"
  - "buildEvenlySpacedTachogram imported from dsp.js and reused — avoids code duplication"
  - "MIN_POWER_THRESHOLD = 0 (amplitude gate disabled) — tune empirically after first real session"
  - "Coherence computation kept running in tick() for backward compat during Phase 11 development"

patterns-established:
  - "Phase lock pattern: build tachogram -> subtract mean -> Hann window -> FFT -> extract bin[k] -> circular phase error -> 0-100 score"
  - "Calibration gate pattern: accumulate accMs from rrBuffer walk, gate on MIN_WINDOW_MS before scoring"

requirements-completed: [LOCK-01, LOCK-02]

# Metrics
duration: 15min
completed: 2026-04-04
---

# Phase 11 Plan 01: Phase Lock Engine — Computation Core Summary

**FFT bin extraction phase lock engine: extracts instantaneous HR-pacer phase alignment from complex coefficient at pacing frequency, writes 0-100 score to AppState every DSP tick with independent 25s calibration gate**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-04T12:40:00Z
- **Completed:** 2026-04-04T12:58:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created js/phaseLock.js with initPhaseLock() and computePhaseLockScore() — the core DSP that replaces coherence as the primary biofeedback metric
- Phase lock score computed from FFT complex coefficient at pacing frequency bin; phase error = circular distance between HR phase and analytically-computed pacer phase
- AppState.phaseLockScore (0-100) and AppState.phaseLockCalibrating (bool) written every tick, ready for renderer in Plan 02
- dsp.js tick() now calls both coherence (backward compat) and phase lock computation; initDSP() shares FFT instance via initPhaseLock(_fft)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add phaseLockScore and phaseLockCalibrating to AppState** - `aa17b5c` (feat)
2. **Task 2: Create js/phaseLock.js and wire into dsp.js tick()** - `6209ebb` (feat)

## Files Created/Modified

- `js/phaseLock.js` — Phase lock computation module; exports initPhaseLock() and computePhaseLockScore()
- `js/state.js` — Added phaseLockScore: 0 and phaseLockCalibrating: true fields to AppState
- `js/dsp.js` — Imports from phaseLock.js; initDSP() calls initPhaseLock(_fft); tick() calls computePhaseLockScore(30, AppState.pacingFreq) after coherence

## Decisions Made

- Used FFT bin extraction (Pattern 2 from RESEARCH.md) rather than Hilbert transform — reuses existing _fft instance, no IFFT needed, same computational cost as existing PSD path
- Pacer phase computed relative to window center (windowCenterSec = realSamples/2 / SAMPLE_RATE_HZ) rather than from AudioContext epoch — avoids external timing dependency and works consistently since FFT phase is also referenced to window start
- Imported buildEvenlySpacedTachogram from dsp.js rather than replicating the cubic spline logic — keeps tachogram construction in one place
- Amplitude gate (MIN_POWER_THRESHOLD) set to 0 (disabled) per RESEARCH.md recommendation — tune after first real session to see realistic power levels at pacing frequency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AppState.phaseLockScore and AppState.phaseLockCalibrating are live and updated every DSP tick — ready for Plan 02 (UI swap: replace coherence gauge with phase lock gauge)
- AppState.pacingFreq feeds directly into computePhaseLockScore — no additional wiring needed for adaptive pace controller in Phase 12
- Amplitude gate threshold (MIN_POWER_THRESHOLD = 0 in phaseLock.js) should be calibrated after first real session — Plan 02 or a follow-up tuning task

---
*Phase: 11-phase-lock-engine*
*Completed: 2026-04-04*
