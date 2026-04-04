# Phase 9: Neural Calm Dashboard - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Neural Calm session averages to the existing recovery dashboard. Persist meanNeuralCalm from sessions to IndexedDB (already being saved in Phase 8), query it alongside coherence data, and render a blue trend line on the existing Canvas chart. Handle gaps for sessions without Muse. This is the final phase of v1.1.

</domain>

<decisions>
## Implementation Decisions

### Trend Line Visual
- Blue solid line connecting session Neural Calm averages (matches the blue Neural Calm gauge color from sessions)
- Three distinct data series on chart: HRV (teal line), coherence (orange dots), Neural Calm (blue line)
- Add inline legend at top of chart: color-coded labels for all three series

### Y-axis Handling
- Claude decides whether Neural Calm shares coherence's right 0-100 axis or gets its own treatment — pick the cleanest approach for 3 data series

### Gap Behavior
- Claude decides how gaps appear (broken line vs skip) — pick what's most honest and readable
- Tooltip on hover shows all available metrics for that day: HRV, coherence, and Neural Calm (when present for that session)

### Claude's Discretion
- Whether Neural Calm shares the 0-100 right axis or gets a separate visual treatment
- Gap rendering approach (broken line vs connected across gaps)
- Line weight and opacity relative to HRV and coherence to avoid visual clutter
- Whether to add a Neural Calm metric card alongside the existing HRV/coherence summary cards at the top of the dashboard
- IndexedDB query approach (meanNeuralCalm is already saved per session in Phase 8)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/dashboard.js`: Full Canvas chart with dual Y-axes, grid, date labels, tooltip hit detection, time range selector — Neural Calm line plugs into this existing renderer
- `js/dashboard.js` `_drawChart()`: Already has `xPx()`, `cohYPx()` (0-100 scale), and `hrvYPx()` functions — Neural Calm can reuse `cohYPx()` if sharing the axis
- `js/dashboard.js` `_hitTargets[]`: Array of {x, y, type, data} for tooltip hit detection — add 'calm' type entries
- `js/storage.js` `querySessions()`: Returns session records — Phase 8 already saves `meanNeuralCalm` field per session
- `js/storage.js` `saveSession()`: Already persists `meanNeuralCalm`, `peakNeuralCalm`, `timeInHighCalmSeconds`, `hrSource`

### Established Patterns
- `_sessionData[]` is built from `querySessions()` in `_loadData()` — extend to include `meanNeuralCalm`
- Chart renders on Canvas in `_drawChart()` — add Neural Calm line drawing after coherence dots
- Tooltip reads from `_hitTargets[]` via mouse position — add calm hit targets
- Range selector buttons (7d, 14d, 30d, 90d) re-trigger `_loadData()` + `_drawChart()` — Neural Calm follows automatically

### Integration Points
- `dashboard.js` `_loadData()`: Include `meanNeuralCalm` when building `_sessionData` from `querySessions()`
- `dashboard.js` `_drawChart()`: After coherence dots loop, draw Neural Calm line
- `dashboard.js` tooltip handler: Add Neural Calm value to tooltip when available
- `index.html` dashboard section: Possibly add a Neural Calm metric card if Claude decides to

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the chart integration.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-neural-calm-dashboard*
*Context gathered: 2026-04-04*
