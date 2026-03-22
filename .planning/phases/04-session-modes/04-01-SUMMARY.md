---
phase: 04-session-modes
plan: 01
subsystem: ui
tags: [discovery, resonance-frequency, canvas, web-audio, indexeddb, state-machine]

requires:
  - phase: 03-breathing-pacer
    provides: startRendering/stopRendering, startPacer/stopPacer, audio styles, session-viz layout

provides:
  - Discovery mode state machine (5 blocks, 6.5→4.5 BPM, 2 min each)
  - Per-block RSA amplitude capture and comparison bar chart
  - playChime() export from audio.js for session transitions
  - Explicit session start (no more BLE-connect auto-start)
  - Resonance frequency saved to IndexedDB after user confirmation

affects: [05-dashboard, 04-02-practice]

tech-stack:
  added: []
  patterns:
    - Discovery controller module (js/discovery.js) owns all protocol state and DOM manipulation for its tab
    - Named function references for all subscribe() calls to enable clean unsubscribe on teardown
    - DSP started before countdown so calibration window accumulates from session open
    - Canvas 2D bar chart with DPR-aware sizing and click-to-select override

key-files:
  created:
    - js/discovery.js
  modified:
    - js/audio.js
    - js/main.js
    - index.html
    - styles.css

key-decisions:
  - "Discovery controller owns its tab's DOM — main.js only wires the start button click"
  - "DSP tick keeps running across ALL blocks (not restarted per block) so 120s calibration window accumulates; RSA snapshot scoped to block elapsed only"
  - "On BLE reconnect mid-block, restart the full block (not resume) — cleaner data capture"
  - "playChime wraps _scheduleBowlCue at ctx.currentTime+0.05 for immediate one-shot bowl strike"
  - "Start button disabled until AppState.connected via reactive subscribe listener"

patterns-established:
  - "Session controller pattern: each mode (discovery, practice) is a self-contained module that manages its own timers, rendering, DSP, and DOM visibility"

requirements-completed: [DISC-01, DISC-02, DISC-03, DISC-04, DISC-05]

duration: 3min
completed: 2026-03-22
---

# Phase 4 Plan 1: Discovery Mode Summary

**5-block resonance frequency protocol with RSA amplitude capture, canvas bar chart comparison, and IndexedDB save — replacing temporary BLE-connect auto-start with explicit user-initiated sessions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T11:58:10Z
- **Completed:** 2026-03-22T12:01:40Z
- **Tasks:** 1
- **Files modified:** 5 (4 modified + 1 created)

## Accomplishments
- Full 5-block Discovery protocol: 6.5, 6.0, 5.5, 5.0, 4.5 BPM at 2 minutes each with auto-transitions
- 3-2-1 countdown overlay before first block, 4-second inter-block pause overlay with next rate preview
- Rate label and 5-dot progress indicator on pacer area during each block
- Canvas bar chart comparing RSA amplitude across all 5 frequencies; best bar auto-selected with "Recommended" label; click to override
- Confirm saves resonanceFreq to IndexedDB and full discovery session record
- playChime() added to audio.js for inter-block bowl strike signals
- main.js removes auto-start; BLE connect only starts uptime timer now

## Task Commits

Each task was committed atomically:

1. **Task 1: Discovery state machine, UI elements, and main.js rewiring** - `dff5d07` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `js/discovery.js` - Complete Discovery mode controller: state machine, countdown, block lifecycle, inter-block pause, RSA capture, bar chart, confirm/save
- `js/audio.js` - Added playChime() export wrapping _scheduleBowlCue for immediate bowl strike
- `js/main.js` - Removed startSession/stopSession auto-start; import and wire discovery controller; wire end-session-btn for discovery phase
- `index.html` - Added discovery-start-btn, rate label, progress dots, countdown overlay, inter-block pause overlay, comparison section with chart canvas
- `styles.css` - Added all discovery UI styles: overlays, dots, comparison chart, start/confirm buttons

## Decisions Made
- DSP tick runs continuously across all blocks (not restarted per block) so the 120s calibration window accumulates. RSA snapshot uses `getHRArray(blockElapsed)` to scope to current block only.
- On BLE reconnect mid-block, the full block restarts (not resumed from pause point) — ensures clean 2-minute data capture per block.
- Discovery controller module (js/discovery.js) owns all its DOM manipulation. main.js only wires the start button click and delegates disconnect to `onDisconnect()`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Discovery mode complete. Practice mode (04-02) can now import savedResonanceFreq from AppState and build on the same session controller pattern.
- The "session controller per mode" pattern is established — Practice follows the same structure.

---
*Phase: 04-session-modes*
*Completed: 2026-03-22*
