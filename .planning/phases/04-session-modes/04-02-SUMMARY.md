---
phase: 04-session-modes
plan: 02
subsystem: ui
tags: [practice, coherence-trace, web-audio, indexeddb, canvas, session-controller]

requires:
  - phase: 04-session-modes
    plan: 01
    provides: playChime() from audio.js, session controller pattern, discovery mode

provides:
  - Practice mode session controller (js/practice.js)
  - Per-second coherence trace collection during session
  - Bowl chime at timer zero with session continues until explicit end
  - 4-metric session summary (duration, mean coherence, peak coherence, time locked in)
  - Full session save to IndexedDB with coherenceTrace array
  - Null-safe renderer for sessions without spectrum canvas

affects: [05-dashboard]

tech-stack:
  added: []
  patterns:
    - Practice controller (js/practice.js) owns all tab DOM — same pattern as discovery.js
    - Named function references for subscribe() calls to enable clean unsubscribe
    - Null-safe renderer: _setupAllCanvases() guards spectrum and gauge with ternary
    - CSS opacity on container element (not globalAlpha) for subtle gauge effect

key-files:
  created:
    - js/practice.js
  modified:
    - index.html
    - js/main.js
    - js/renderer.js
    - styles.css

key-decisions:
  - "Practice mode has no spectrum chart (per prior user decision: keep it focused on breathing)"
  - "Gauge opacity 0.45 set via CSS on #practice-pacer-gauge container, not Canvas globalAlpha"
  - "Chime plays once at timer zero but session continues — user ends explicitly via End Session"
  - "Renderer null guard added for both spectrumCanvas and gaugeCanvas in _setupAllCanvases()"
  - "Coherence trace collected via 1s DSP tick interval matching same pattern as discovery DSP"

requirements-completed: [PRAC-01, PRAC-02, PRAC-03, PRAC-04, PRAC-05]

duration: 7min
completed: 2026-03-22
---

# Phase 4 Plan 2: Practice Mode Summary

**Practice session controller with per-second coherence trace, bowl chime at timer zero, 4-metric summary display, and full IndexedDB persistence including coherenceTrace array**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-22T12:00:00Z
- **Completed:** 2026-03-22T12:07:05Z
- **Tasks:** 1
- **Files modified:** 5 (4 modified + 1 created)

## Accomplishments

- Full Practice mode controller (345 lines): `startPractice()`, `stopPractice()`, `onDisconnect()`, `setDuration()`, `initPracticeUI()`
- Duration picker: 10/15/20/30 min buttons (default 20), reactive to clicks
- Start button disabled until `AppState.connected && AppState.savedResonanceFreq` both truthy
- Frequency display shows "Your frequency: X.X breaths/min" from `AppState.savedResonanceFreq`, subscribes reactively
- Session viz: layered pacer (waveform at 0.3 opacity bg, breathing circle, coherence gauge at 0.45 opacity), no spectrum
- Coherence trace: 1 score pushed per DSP tick second into `_coherenceTrace[]`
- Chime detection: `elapsed >= _selectedDuration * 60` triggers `playChime()` once, adds `chime-pulse` CSS animation to End Session button
- Summary: duration (mm:ss), mean coherence, peak coherence, time locked in (mm:ss from seconds with score >= 66)
- IndexedDB save with full coherenceTrace array on session end
- BLE disconnect: `onDisconnect()` stops pacer and subscribes to `connected` for resume
- Renderer null guard: `_spectrumCanvas ? setupCanvas() : null` and same for gaugeCanvas

## Task Commits

Each task was committed atomically:

1. **Task 1: Practice controller, UI elements, and main.js wiring** - `d616b1d` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `js/practice.js` - Complete Practice mode controller: session start/stop, coherence trace, chime, summary computation, IndexedDB save, disconnect handling
- `index.html` - Replaced stub practice tab with full UI: pacer viz, duration picker, freq display, start/end/done buttons, summary section with 4-metric grid
- `js/main.js` - Imports `initPracticeUI` and `practiceDisconnect`; calls `initPracticeUI()` on init; calls `practiceDisconnect()` on BLE disconnect
- `js/renderer.js` - Added null guard for spectrumCanvas and gaugeCanvas in `_setupAllCanvases()` so practice sessions (no spectrum) don't error
- `styles.css` - Added all Practice Mode CSS: freq display, duration picker pills, start/done buttons, `#practice-pacer-gauge` opacity, `chime-pulse` keyframe animation, summary grid and metric cards

## Decisions Made

- Practice mode passes `null` for `spectrumCanvas` to `startRendering()`. Added null guard in renderer to handle this cleanly without errors.
- Gauge opacity 0.45 applied via CSS `opacity` on `#practice-pacer-gauge` container element — simplest approach, matches prior user decision to use CSS not globalAlpha.
- Session continues running after chime; user must explicitly click "End Session". Summary shows actual elapsed duration, not selected duration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Extended null guard to gaugeCanvas in addition to spectrumCanvas**
- **Found during:** Task 1 (plan specified spectrum only, but same pattern applies to gauge for robustness)
- **Issue:** Plan mentioned only adding null guard to spectrumCanvas, but the `_setupAllCanvases()` function calls `setupCanvas(_gaugeCanvas)` without null guard too
- **Fix:** Added `_gaugeCanvas ? setupCanvas(_gaugeCanvas) : null` alongside the spectrum guard
- **Files modified:** js/renderer.js
- **Commit:** d616b1d (included in main commit)

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 4 complete. Both Discovery and Practice modes are fully built.
- Phase 5 (Dashboard) can read sessions from IndexedDB using `querySessions()` — each practice session includes `mode:'practice'`, `meanCoherence`, `peakCoherence`, `timeInHighSeconds`, and full `coherenceTrace` array for trend analysis.

---
*Phase: 04-session-modes*
*Completed: 2026-03-22*

## Self-Check: PASSED

- js/practice.js: FOUND (345 lines, above 120 minimum)
- index.html: FOUND (practice-start-btn, practice-pacer-canvas, practice-summary, duration-btn all present)
- js/main.js: FOUND (initPracticeUI imported and called)
- js/renderer.js: FOUND (null guards for spectrum and gauge canvases)
- styles.css: FOUND (practice styles, summary grid, chime-pulse animation)
- Commit d616b1d: FOUND
