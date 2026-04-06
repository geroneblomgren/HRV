# Phase 13: Dashboard Integration - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a coherence ring gauge back to the live session UI (alongside phase lock and neural calm), and update the recovery dashboard to display phase lock as a new trend series, preserve coherence as a separate series, add clickable legend toggles, and label old coherence-only sessions as legacy. RF trend line already exists on the dashboard from Phase 10.

</domain>

<decisions>
## Implementation Decisions

### Live Session Gauges
- Three ring gauges displayed during practice: Coherence, Phase Lock, Neural Calm
- All three gauges are the same size, arranged side by side — equal visual weight
- Neural Calm gauge remains hidden when Muse-S is not connected (existing behavior)
- Coherence gauge uses the existing `AppState.coherenceScore` which is already computed every DSP tick

### Phase Lock Trend Line (Dashboard)
- Color: green (#22c55e) — distinct from all existing series
- Style: connected line with small circle markers at each data point (like HRV line)
- Shares the right Y-axis (0-100) with coherence and neural calm — no new axis needed

### Legacy Coherence Labeling
- Old coherence-only sessions (no `meanPhaseLock` field) rendered with dimmed ~50% opacity and hollow marker style
- Legacy dots appear naturally when the date range includes them — no special fade logic, they just disappear from view as shorter ranges are selected and all sessions are v1.2
- Tooltip wording for legacy sessions: Claude's discretion
- When a session has both coherence and phase lock data: Claude decides which takes visual priority

### Chart Density / Legend
- Clickable legend items — click a label to show/hide that series
- All series visible by default
- 5 series total: HRV (teal), Coherence (orange), Phase Lock (green), Neural Calm (blue), RF (purple dashed)
- Whether legacy coherence has a separate toggle from current coherence: Claude's discretion

### Metric Cards
- Add a 6th metric card: "Avg Phase Lock 7d"
- Existing cards remain: Tonight HRV, Streak, Avg Coherence 7d, HRV Trend, Avg Neural Calm 7d
- Phase Lock card shows '--' when no phase lock data exists (consistent with Neural Calm behavior)
- No RF metric card — RF is chart-only

### Claude's Discretion
- Coherence gauge ring color for live session (likely orange to match dashboard, but Claude decides)
- Right Y-axis label text (currently "Score (0-100)")
- Legacy tooltip wording (e.g., "Coherence (legacy): 62" vs "Session Score (v1.0): 62")
- Overlap handling when a session has both coherence and phase lock
- Whether legacy coherence gets a separate legend toggle

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `drawPhaseLockGauge()` in renderer.js — existing ring gauge pattern to clone for coherence gauge
- `drawNeuralCalmGauge()` in renderer.js — second ring gauge, same pattern
- `computeCoherenceScore()` in dsp.js — coherence is still computed every tick, just not displayed on a gauge
- `AppState.coherenceScore` in state.js — already populated live, ready to render
- `_hitTargets` array in dashboard.js — tooltip hit detection system, extensible for new series
- `_getSessionsByDay()` in dashboard.js — already aggregates RF and Neural Calm, needs phase lock added

### Established Patterns
- Canvas 2D for all rendering (no charting library) — gauges and dashboard chart are hand-drawn
- Ring gauge pattern: background arc + filled sweep arc + score text + zone label + optional badge
- Dashboard chart: PAD constants, xPx/yPx scale functions, quadratic curve smoothing, broken lines for gaps
- Legend: inline at top of chart, measured for centering

### Integration Points
- `startRendering()` in renderer.js accepts canvas elements — needs a new canvas param for coherence gauge
- `index.html` needs a third gauge canvas element in the practice layout
- `_saveSession()` in practice.js already saves `meanPhaseLock` — dashboard needs to read it
- `_getSessionsByDay()` needs to aggregate `meanPhaseLock` like it does for `meanNeuralCalm` and RF
- `_drawChart()` needs phase lock line rendering + legend click handlers

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants coherence back as a visible metric — it measures spectral purity (different from phase lock which measures pacer alignment)
- Three gauges = three different biofeedback dimensions: brain state (calm), HRV quality (coherence), breathing alignment (phase lock)
- Dashboard palette locked: teal=HRV, orange=coherence, green=phase lock, blue=neural calm, purple=RF

</specifics>

<deferred>
## Deferred Ideas

- Expanded Muse-S dashboard presence beyond Neural Calm (e.g., EEG band breakdown, alpha trend) — user noted feeling like Muse work "stopped"

</deferred>

---

*Phase: 13-dashboard-integration*
*Context gathered: 2026-04-04*
