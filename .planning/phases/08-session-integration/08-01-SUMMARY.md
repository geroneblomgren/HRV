---
phase: 08-session-integration
plan: "01"
subsystem: ui
tags: [canvas, biofeedback, muse-s, ppg, neural-calm, eeg, hrv, renderer]

# Dependency graph
requires:
  - phase: 07-muse-s-connection-signal-processing
    provides: AppState.neuralCalm, AppState.museConnected, AppState.eegCalibrating, AppState.hrSourceLabel written by museSignalProcessing.js and PPG adapter
provides:
  - Neural Calm live gauge rendering (blue arc + zone labels) in Practice and Discovery layouts
  - PPG confidence badge on coherence gauge arc when hrSourceLabel is 'Muse PPG'
  - Neural Calm trace collection and persistence to IndexedDB alongside session metrics
  - hrSource provenance field on all saved sessions
affects:
  - 08-02-session-integration (next plan in phase)
  - 09-neural-calm-dashboard (reads neuralCalmTrace and meanNeuralCalm from IndexedDB)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Neural Calm gauge mirrors coherence gauge draw pattern (arc cx/cy/radius, zone thresholds, pulse animation)
    - Placeholder state rendering (grayed ring + centered text) when hardware not connected
    - EEG calibration overlay with progress bar during 20s baseline window
    - Optional 7th canvas arg on startRendering() for parallel gauge without breaking existing callers

key-files:
  created: []
  modified:
    - js/renderer.js
    - js/practice.js
    - js/discovery.js
    - index.html
    - styles.css

key-decisions:
  - "Neural Calm gauge uses bottom-left corner of session-pacer (coherence gauge is bottom-right) — symmetric layout"
  - "PPG arc uses lighter teal #5eead4 instead of zone color — arc shift indicates lower confidence, score number stays zone color"
  - "neuralCalmCanvas is optional 7th arg on startRendering() — null guard preserves backward compat for existing callers"
  - "EEG calibrating state uses 20s window (not 120s HRV calibration) — Neural Calm baseline is much shorter"

patterns-established:
  - "Placeholder-state-first rendering: drawNeuralCalmGauge() checks museConnected first, eegCalibrating second, then live data"
  - "Trace-only-when-connected: _neuralCalmTrace.push() guarded by AppState.museConnected in DSP tick"
  - "Conditional spread for optional fields: ...(summary.meanCalm !== null ? { meanNeuralCalm: ... } : {})"

requirements-completed: [PPG-03, PPG-04, EEG-03, SESS-01]

# Metrics
duration: 3min
completed: 2026-04-04
---

# Phase 8 Plan 01: Session Integration Summary

**Neural Calm live gauge (blue arc, zone labels, EEG calibrating overlay) wired into Practice and Discovery sessions alongside PPG confidence badge on coherence gauge**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-04T00:10:08Z
- **Completed:** 2026-04-04T00:13:09Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Neural Calm gauge renders live with blue arc, score number, and zone labels (Restless/Settling/Deep Calm) in both Practice and Discovery layouts
- Grayed-out "Connect Muse-S" placeholder shown when museConnected is false; EEG calibrating overlay with progress bar during 20s baseline
- PPG badge drawn below zone label on coherence gauge and arc shifts to lighter teal (#5eead4) when hrSourceLabel is 'Muse PPG'
- Practice and Discovery DSP tick now collects _neuralCalmTrace per second when Muse-S connected
- Session records in IndexedDB include hrSource provenance field and optional Neural Calm metrics (meanNeuralCalm, peakNeuralCalm, timeInHighCalmSeconds, neuralCalmTrace)

## Task Commits

Each task was committed atomically:

1. **Task 1: Neural Calm gauge renderer + PPG confidence badge** - `9242e80` (feat)
2. **Task 2: Wire PPG-sourced sessions + Neural Calm trace collection** - `57da641` (feat)

## Files Created/Modified
- `js/renderer.js` - Added NEURAL_CALM constants, _neuralCalmCanvas/_neuralCalmCtx/_displayedCalm state, drawNeuralCalmGauge(), PPG badge in drawCoherenceGauge(), lighter teal arc for PPG source, updated startRendering() signature, _setupAllCanvases(), renderLoop(), stopRendering()
- `js/practice.js` - Added _neuralCalmTrace, initialized in startPractice(), per-second collection in DSP tick, Neural Calm summary in _computeSummary(), hrSource + Neural Calm fields in _saveSession()
- `js/discovery.js` - Added _neuralCalmTrace, initialized in startDiscovery(), per-second collection in DSP tick, neuralCalmCanvas passed to startRendering() in startBlock(), hrSource + meanNeuralCalm in _onConfirm()
- `index.html` - Added neural-calm-gauge-canvas to Discovery session-pacer; practice-neural-calm-gauge-canvas to Practice session-pacer
- `styles.css` - Added .neural-calm-gauge (position absolute, bottom-left, 120x120, z-index 3) and .neural-calm-gauge canvas styles

## Decisions Made
- Neural Calm gauge occupies bottom-left corner of session-pacer (coherence is bottom-right) for symmetric paired layout
- PPG arc shifts to lighter teal #5eead4 (arc color change only — score number stays zone color to keep readability)
- neuralCalmCanvas passed as optional 7th arg to startRendering() with null guard in _setupAllCanvases() — existing callers with 6 args still work
- EEG calibrating window uses 20s (AppState.eegCalibrating baseline period), not the 120s HRV calibration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both Practice and Discovery sessions now work with Muse-S PPG as standalone HR source
- Neural Calm gauge infrastructure is in place; dashboard integration (Phase 9) can read neuralCalmTrace from IndexedDB sessions
- hrSource provenance available on all sessions for filtering in the dashboard

---
*Phase: 08-session-integration*
*Completed: 2026-04-04*
