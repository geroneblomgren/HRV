---
phase: 13-dashboard-integration
plan: 02
subsystem: ui
tags: [canvas, dashboard, phase-lock, coherence, trend-line, legend]

# Dependency graph
requires:
  - phase: 11-phase-lock-engine
    provides: meanPhaseLock field in IndexedDB session records
  - phase: 13-dashboard-integration
    plan: 01
    provides: meanCoherence saved to IndexedDB, dashboard chart infrastructure

provides:
  - Phase lock green trend line on recovery dashboard chart
  - Legacy coherence split (hollow dimmed markers for pre-v1.2 sessions)
  - Clickable legend toggles for all 5 series (HRV, Coherence, Phase Lock, Neural Calm, RF)
  - "Avg Phase Lock 7d" 6th metric card on dashboard
  - Null-guarded coherence aggregation in _getSessionsByDay()

affects:
  - 13-03 (RF trend display already working — wrapped in visibility gate)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-pass coherence split: filter on meanPhaseLock === null for legacy (hollow, dimmed) vs !== null for v1.2 (solid)"
    - "Phase lock trend line clones Neural Calm pattern: broken line with quadratic curves, circle markers, hit targets"
    - "_legendBounds array stores bounding boxes for click and cursor-change hit detection"
    - "_seriesVisible object pattern: all series rendering blocks gated by a boolean keyed by series name"

key-files:
  created: []
  modified:
    - js/dashboard.js
    - index.html

key-decisions:
  - "_seriesVisible const object at module level — persists across redraws, toggled by legend clicks"
  - "Legacy detection: session.meanPhaseLock === null (not undefined) — returned as null from _getSessionsByDay when no v1.2 data"
  - "Phase lock uses cohYPx() for Y-axis (shared 0-100 right axis) — same scale as coherence"
  - "durationSeconds still uses ?? 0 fallback (correct — duration defaults to 0, not null)"

requirements-completed:
  - DASH-07
  - DASH-08

# Metrics
duration: 20min
completed: 2026-04-05
---

# Phase 13 Plan 02: Phase Lock Dashboard Series Summary

**Phase lock green trend line, legacy coherence split, clickable legend toggles, and Avg Phase Lock 7d metric card added to recovery dashboard with null-guarded aggregation**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-05T15:10:00Z
- **Completed:** 2026-04-05T15:31:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `_getSessionsByDay()` extended with `plTotal`/`plCount` accumulators and guarded coherence (`cohTotal`/`cohCount`) — meanCoherence now returns null (not 0) for days with no data
- Phase lock green trend line (#22c55e) renders as a broken connected line with circle markers, gated by `_seriesVisible.phaseLock`
- Coherence dots split into two passes: legacy sessions (meanPhaseLock === null) render as hollow dimmed circles at 45% opacity; v1.2 sessions render as solid filled circles
- All 5 series wrapped in `_seriesVisible` visibility gates (hrv, coherence, phaseLock, calm, rf)
- `_wireLegend()` adds canvas click handler to toggle series visibility and redraw
- Legend updated to 5 items with keys; dimmed to 35% alpha when series is hidden
- Cursor changes to pointer when hovering over legend items
- "Avg Phase Lock 7d" 6th metric card added to dashboard grid (index.html + _computeMetrics())
- Tooltip system extended with phaseLock, coherence-legacy types; v1.2 coherence tooltip also shows Phase Lock value

## Task Commits

Each task was committed atomically:

1. **Task 1: Phase lock aggregation, coherence null-guarding, metric card, and tooltip extensions** - `e54d59e` (feat)
2. **Task 2: Phase lock trend line, legacy coherence split, and clickable legend toggles** - `e085a49` (feat)

## Files Created/Modified

- `js/dashboard.js` - Extended `_getSessionsByDay()` with plTotal/plCount/cohTotal/cohCount; added `_seriesVisible` and `_legendBounds` module state; updated legend to 5 items with keys and dimming; wrapped all 5 series in visibility gates; replaced coherence dots block with two-pass legacy/v1.2 split; added phase lock trend line; added `_computeMetrics()` Phase Lock 7d computation; added `_wireLegend()` function; updated `_wireTooltip()` with cursor change on legend hover; extended `_tooltipHtml()` with phaseLock and coherence-legacy cases
- `index.html` - Added 6th metric card `dash-pl-7d` "Avg Phase Lock 7d" to dashboard metrics grid

## Decisions Made

- `_seriesVisible` declared as `const` object at module level — state persists across chart redraws without re-initialization
- Legacy session detection uses `meanPhaseLock === null` (returned from `_getSessionsByDay` when no phase lock data) — not `undefined` check, since the aggregation layer normalizes to null
- Phase lock Y-axis reuses `cohYPx()` (shared 0-100 right axis) — same scale as coherence, visually comparable
- `durationSeconds` accumulation retains `?? 0` fallback (intentional — duration should default to 0, not null)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — both verification scripts passed on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dashboard now shows all 5 series with clickable legend: HRV (teal), Coherence (orange, legacy/v1.2 split), Phase Lock (green), Neural Calm (blue), RF (purple dashed)
- Legacy sessions from v1.0/v1.1 display as hollow dimmed orange dots labeled "Coherence (legacy)" in tooltip
- 6 metric cards now active including Avg Phase Lock 7d
- Ready to execute 13-03 if planned, or v1.2 is feature-complete for dashboard integration

---
*Phase: 13-dashboard-integration*
*Completed: 2026-04-05*
