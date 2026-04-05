# Phase 13: Dashboard Integration - Research

**Researched:** 2026-04-04
**Domain:** Canvas 2D rendering — live gauge layout + dashboard trend chart extension
**Confidence:** HIGH

## Summary

Phase 13 is a pure UI wiring and rendering extension of existing, proven patterns. The codebase already contains every primitive needed: two working ring gauges in `renderer.js`, a 5-series canvas chart in `dashboard.js` with tooltip hit detection, and session data that already stores `meanPhaseLock` via `_saveSession()`. No new algorithms, no new modules, no new IndexedDB schema changes are required.

The work divides cleanly into two independent surfaces: (1) the live practice session, which needs a third canvas element for a coherence ring gauge added symmetrically opposite the neural calm gauge; and (2) the recovery dashboard, which needs phase lock aggregated into `_getSessionsByDay()`, rendered as a connected green line, and old sessions (missing `meanPhaseLock`) displayed with dimmed hollow markers alongside a new "Avg Phase Lock 7d" metric card.

The single most important architectural decision already made for this phase is that coherence data is NOT being replaced — it is displayed alongside phase lock. Both series live on the same 0-100 right Y-axis that already exists. The legacy distinction is achieved entirely by reading whether `meanPhaseLock` is present on a session record, with no schema migration required.

**Primary recommendation:** Clone existing patterns exactly. The coherence gauge clones `drawNeuralCalmGauge()`, the phase lock dashboard line clones the neural calm line renderer, and the legend gains click-toggle behavior on top of the existing inline draw pattern.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Live Session Gauges**
- Three ring gauges displayed during practice: Coherence, Phase Lock, Neural Calm
- All three gauges are the same size, arranged side by side — equal visual weight
- Neural Calm gauge remains hidden when Muse-S is not connected (existing behavior)
- Coherence gauge uses the existing `AppState.coherenceScore` which is already computed every DSP tick

**Phase Lock Trend Line (Dashboard)**
- Color: green (#22c55e) — distinct from all existing series
- Style: connected line with small circle markers at each data point (like HRV line)
- Shares the right Y-axis (0-100) with coherence and neural calm — no new axis needed

**Legacy Coherence Labeling**
- Old coherence-only sessions (no `meanPhaseLock` field) rendered with dimmed ~50% opacity and hollow marker style
- Legacy dots appear naturally when the date range includes them — no special fade logic, they just disappear from view as shorter ranges are selected and all sessions are v1.2
- Tooltip wording for legacy sessions: Claude's discretion
- When a session has both coherence and phase lock data: Claude decides which takes visual priority

**Chart Density / Legend**
- Clickable legend items — click a label to show/hide that series
- All series visible by default
- 5 series total: HRV (teal), Coherence (orange), Phase Lock (green), Neural Calm (blue), RF (purple dashed)
- Whether legacy coherence has a separate toggle from current coherence: Claude's discretion

**Metric Cards**
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

### Deferred Ideas (OUT OF SCOPE)

- Expanded Muse-S dashboard presence beyond Neural Calm (e.g., EEG band breakdown, alpha trend) — user noted feeling like Muse work "stopped"
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-06 | Phase lock trend replaces coherence trend on recovery dashboard | Clarified by CONTEXT.md: phase lock is ADDED alongside coherence, not replacing it. `_getSessionsByDay()` must aggregate `meanPhaseLock`; `_drawChart()` must render green connected line |
| DASH-07 | Old coherence data points display with legacy labeling | Implemented via null-check on `meanPhaseLock` field — no `meanPhaseLock` = legacy session. Render at 50% opacity with hollow markers, tooltip shows "Coherence (legacy)" |
| DASH-08 | RF trend line appears on dashboard alongside HRV and phase lock | RF line already fully implemented in `_drawChart()` from Phase 10. DASH-08 is satisfied by ensuring phase lock joins it without breaking the existing RF renderer |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Canvas 2D API | Browser native | All rendering — gauges and chart | Already used for every visual in this codebase; no charting library introduced |
| IndexedDB (via storage.js) | Browser native | Session persistence | Already stores all session fields; `meanPhaseLock` already saved |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | No new libraries needed | All patterns are already implemented in-tree |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas 2D hand-drawn | Chart.js / D3 | Introducing a library would conflict with existing Canvas-only architecture and add bundle weight. Do not do this. |

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure

No new files. All changes are confined to:
```
js/
├── renderer.js     — add coherence gauge canvas, drawCoherenceGauge(), update startRendering() signature
├── dashboard.js    — extend _getSessionsByDay(), _computeMetrics(), _drawChart() legend + phase lock line
└── (index.html)    — add third canvas element for coherence gauge in practice layout
styles.css          — position third gauge; adjust dashboard metric grid for 6 cards
```

### Pattern 1: Ring Gauge Clone (Coherence Gauge)

**What:** Copy `drawNeuralCalmGauge()` pattern into a new `drawCoherenceGauge()` function.
**When to use:** The coherence gauge is a standard ring identical in structure to the neural calm gauge — background arc, filled sweep, score text, zone label.

Key differences from Neural Calm:
- Reads `AppState.coherenceScore` (not `AppState.neuralCalm`)
- Color: Claude's discretion — recommend orange `#fb923c` to match dashboard series for visual continuity
- Zone thresholds: reuse `ZONE_THRESHOLDS` (`aligning: 40, locked: 70`) and `ZONE_COLORS` already defined in renderer.js
- No "Connect Muse-S" placeholder — coherence is always computed from RR data when a session is active
- During calibration: mirror the phase lock gauge calibration display (same 80s window)
- Label: "Coherence" below zone label

Module state additions in renderer.js:
```js
let _coherenceCanvas = null, _coherenceCtx = null;
let _displayedCoherence = 0;
```

`startRendering()` gains a new optional param `coherenceCanvas` (position 9 in the signature or a named options pattern — recommend inserting after `eegCanvas` to minimize callsite disruption):
```js
export function startRendering(waveformCanvas, spectrumCanvas, gaugeCanvas, pacerCanvas,
  sessionStartTime, sessionDuration = 0, neuralCalmCanvas, eegCanvas, coherenceCanvas)
```

`renderLoop()` gains: `drawCoherenceGauge();`

`stopRendering()` gains: clear `_coherenceCtx`/`_coherenceCanvas`.

`_setupAllCanvases()` gains: `_coherenceCtx = _coherenceCanvas ? setupCanvas(_coherenceCanvas) : null;`

### Pattern 2: Three-Gauge Layout (HTML + CSS)

**What:** Add a third canvas element positioned symmetrically between phase lock gauge (right) and neural calm gauge (left).

Current layout in practice session:
```
[neural-calm-gauge: bottom-left, 120x120] ... [pacer-gauge: bottom-right, 120x120]
```

Target layout (three equal gauges, bottom row of `.session-pacer`):
```
[neural-calm-gauge: left] [coherence-gauge: center] [phase-lock-gauge: right]
```

Implementation options:
- **Option A (Absolute positioning):** Add a `.coherence-gauge` div with `position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); width: 120px; height: 120px;` — mirrors existing pacer-gauge/neural-calm-gauge pattern exactly.
- **Option B (Flex row):** Refactor gauge containers to a flex row. More robust but requires restructuring `.session-pacer` CSS.

**Recommendation: Option A** — minimal change, consistent with existing pattern. The existing gauges are absolutely positioned; adding a centered absolute third gauge requires zero CSS refactoring.

HTML to add in `#practice-session-viz` inside `.session-pacer`:
```html
<div class="coherence-gauge" id="practice-coherence-gauge">
  <canvas id="practice-coherence-gauge-canvas"></canvas>
</div>
```

CSS additions:
```css
.coherence-gauge {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  width: 120px;
  height: 120px;
}
.coherence-gauge canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

Note: Discovery tab also has gauge canvases — check whether the discovery session also needs the coherence gauge. CONTEXT.md does not mention discovery, so restrict to practice session only.

### Pattern 3: Phase Lock Trend Line (Dashboard)

**What:** Extend `_getSessionsByDay()` to aggregate `meanPhaseLock`, then render a green connected line in `_drawChart()`.

Step 1 — Aggregate in `_getSessionsByDay()`:

Add to the `byDay[day]` accumulator:
```js
byDay[day].plTotal = 0;
byDay[day].plCount = 0;
```

In the loop body, after existing RF aggregation:
```js
if (typeof s.meanPhaseLock === 'number' && !isNaN(s.meanPhaseLock)) {
  byDay[day].plTotal += s.meanPhaseLock;
  byDay[day].plCount += 1;
}
```

In the return map:
```js
meanPhaseLock: v.plCount ? v.plTotal / v.plCount : null,
```

Step 2 — Render in `_drawChart()`: Clone the Neural Calm line rendering block (lines 607-664), change:
- Filter: `sessSlice.filter(s => s.meanPhaseLock !== null)`
- Color: `#22c55e` (green)
- Hit target type: `'phaseLock'`
- Marker: small filled circle r=3 (same as calm)
- Line width: 2 (same as calm)
- Break on gaps > 1 day (same as calm)

`cohYPx()` already handles 0-100 range — phase lock is also 0-100, so use the same function:
```js
const y = cohYPx(s.meanPhaseLock); // reuses existing right-axis scale
```

### Pattern 4: Legacy Coherence Distinction

**What:** Sessions with `meanPhaseLock === null` are v1.0 (legacy). Sessions with both values are v1.2.

**Implementation:** Split the existing coherence rendering into two passes:
- Pass 1 (legacy sessions, `meanPhaseLock === null`): render at `globalAlpha = 0.45`, hollow circle (stroke only, no fill), hit type `'coherence-legacy'`
- Pass 2 (v1.2 sessions, `meanPhaseLock !== null`): render at `globalAlpha = 1.0`, solid filled circle, hit type `'coherence'`

The coherence line connecting dots: only draw through v1.2 sessions (or don't draw a line at all — dots are already the current style). Current coherence is drawn as individual dots, not a connected line, so the split is purely a styling change on those dots. No line-drawing refactor needed.

### Pattern 5: Clickable Legend Toggle

**What:** Click a legend item to show/hide its series. State stored in a module-level visibility map.

Module state addition in dashboard.js:
```js
const _seriesVisible = {
  hrv: true,
  coherence: true,
  phaseLock: true,
  calm: true,
  rf: true,
};
```

Legend rendering changes:
- Legend items become hit-testable by storing their bounding box
- `mousemove` already exists on canvas; add `click` handler
- Click handler toggles `_seriesVisible[key]` and calls `_drawChart()`
- Inactive series: render label at `opacity: 0.4`, draw strikethrough or dim the color square

Wire once via a `_legendWired` flag (same pattern as `_tooltipWired`).

Each series draw block in `_drawChart()` wraps with:
```js
if (_seriesVisible.phaseLock) { /* ... draw block ... */ }
```

### Pattern 6: 6th Metric Card

**What:** Add "Avg Phase Lock 7d" card to `#dashboard-metrics`.

HTML: Add a new `<div class="summary-metric">` with `id="dash-pl-7d"`.

The current 5-card grid is `dashboard-metrics-grid`. Check whether 6 cards need a CSS tweak — existing grid likely uses `repeat(auto-fit, minmax(...))` or similar. If it wraps to 3+3, that's acceptable. If it renders 2+2+2, that may need a `grid-template-columns` override for the 6-card case.

In `_computeMetrics()`, add:
```js
const pl7dEl = el('dash-pl-7d');
if (pl7dEl) {
  const cutoff7 = _daysAgoIso(7);
  const plSessions = _sessionData.filter(s => s.day >= cutoff7 && s.meanPhaseLock !== null);
  if (plSessions.length > 0) {
    const avg = plSessions.reduce((sum, s) => sum + s.meanPhaseLock, 0) / plSessions.length;
    pl7dEl.textContent = avg.toFixed(1);
  } else {
    pl7dEl.textContent = '--';
  }
}
```

### Pattern 7: Tooltip Extensions

**What:** Add phase lock and legacy coherence cases to `_tooltipHtml()`.

Additions:
```js
if (hit.type === 'phaseLock') {
  return `<strong>${dateLabel}</strong><br>Phase Lock: ${hit.data.meanPhaseLock.toFixed(1)}`;
}
if (hit.type === 'coherence-legacy') {
  const mins = hit.data.durationSeconds > 0
    ? ` &bull; ${Math.round(hit.data.durationSeconds / 60)} min`
    : '';
  return `<strong>${dateLabel}</strong><br>Coherence (legacy): ${hit.data.meanCoherence.toFixed(1)}${mins}`;
}
```

The existing `'coherence'` case for v1.2 sessions should append phase lock when available:
```js
// In the existing coherence case — add when hit.data.meanPhaseLock exists:
if (hit.data.meanPhaseLock !== null) {
  html += `<br>Phase Lock: ${hit.data.meanPhaseLock.toFixed(1)}`;
}
```

### Anti-Patterns to Avoid

- **Adding a new Y-axis for phase lock:** Phase lock is 0-100, identical range to coherence. `cohYPx()` handles it. No new axis code, no new PAD changes.
- **Modifying IndexedDB schema or storage.js:** `meanPhaseLock` is already saved by `_saveSession()`. Dashboard simply reads it.
- **Breaking the RF renderer:** The RF draw block at the bottom of `_drawChart()` is self-contained and uses its own local `rfYPx()` function. Phase lock inserts before RF in draw order (so RF renders on top if overlapping).
- **Wrapping startRendering() callsite in practice.js without updating discovery:** Discovery tab also calls `startRendering()`. Adding coherence canvas as the last optional param keeps it backward compatible — discovery can pass `undefined` or omit it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Legend toggle state | Custom event bus | Module-level `_seriesVisible` object + redraw | Already the pattern in this codebase (direct state mutation → _drawChart()) |
| Smooth interpolation for coherence gauge | Animation library | Same `+= (target - current) * alpha` used in `drawPhaseLockGauge()` | Copy the 0.08 alpha from the old coherence pattern |
| Position coherence gauge absolutely | CSS flex refactor | Absolute centering with `left:50%; transform:translateX(-50%)` | Zero refactoring cost, consistent with existing gauge pattern |

---

## Common Pitfalls

### Pitfall 1: Discovery Tab Gauge Canvases

**What goes wrong:** The practice tab and discovery tab are two separate HTML sections that each have their own canvas elements (e.g., `#gauge-canvas` vs `#practice-gauge-canvas`). The coherence gauge only exists in the practice tab per CONTEXT.md decisions. If `startRendering()` is called from discovery code without a coherenceCanvas argument, the optional parameter must default to `null` gracefully.

**Why it happens:** Shared `startRendering()` is called by both practice and discovery flows.

**How to avoid:** Add `coherenceCanvas = null` as default, guard `drawCoherenceGauge()` with `if (!_coherenceCtx) return;` (same pattern as neural calm).

### Pitfall 2: _sessionData Module State Stale After Range Change

**What goes wrong:** `_sessionData` is reloaded when a range button is clicked. `_computeMetrics()` uses `_sessionData` but is called from `_renderDashboard()` at startup. If a user changes range, `_computeMetrics()` must be re-called — this already happens in the `_wireRangeButtons()` click handler (`_computeMetrics(); _drawChart()`). The new phase lock card follows the same path, so no additional wiring is needed.

**How to avoid:** Follow the existing range-change pattern exactly — the new card is computed in `_computeMetrics()` which is already re-called on range change.

### Pitfall 3: Legend Hit Detection Coordinate System

**What goes wrong:** Legend items are drawn during `_drawChart()` but click coordinates come from canvas `getBoundingClientRect()`. The canvas uses logical CSS pixels but `canvas.width` is scaled by `devicePixelRatio`. The existing `_wireTooltip()` already handles this correctly using `e.clientX - rect.left` (CSS pixels). Use the same coordinate math for legend click detection.

**How to avoid:** Store legend item bounds in CSS pixel coordinates (the `lx`/`ly` values from the draw pass are already in CSS pixels because `_ctx.setTransform(dpr, ...)` handles the DPI scaling).

### Pitfall 4: Series Draw Order and Overlap

**What goes wrong:** If phase lock and coherence dots overlap on the same day, one will paint over the other. Since coherence dots are larger (r=5) and phase lock will use r=3 (clone of calm), the phase lock dot will appear inside the coherence dot.

**Recommendation:** Draw coherence first (both legacy and v1.2), then draw phase lock on top. The green phase lock dot is visually distinct at r=3 even inside an orange coherence dot.

### Pitfall 5: Dashboard Module Already Has `_sessionData` With No `meanPhaseLock` Field

**What goes wrong:** After adding `meanPhaseLock` to the return of `_getSessionsByDay()`, any existing reference to `_sessionData` that doesn't check for `null` will silently average `undefined` as 0. 

**How to avoid:** Use `s.meanPhaseLock !== null` guards on every phase lock aggregation, exactly as done for `meanNeuralCalm`.

---

## Code Examples

### Coherence Gauge draw function signature (from existing pattern)

```js
// Source: renderer.js drawNeuralCalmGauge() — exact clone pattern
function drawCoherenceGauge() {
  if (!_coherenceCtx) return;
  // reads AppState.coherenceScore
  // uses ZONE_COLORS, ZONE_THRESHOLDS (already defined in module scope)
  // smooth interpolation: _displayedCoherence += (AppState.coherenceScore - _displayedCoherence) * 0.08
}
```

### _getSessionsByDay() extension (from existing neural calm pattern)

```js
// In byDay accumulation loop — add after existing rfCount/rfTotal:
if (typeof s.meanPhaseLock === 'number' && !isNaN(s.meanPhaseLock)) {
  byDay[day].plTotal += s.meanPhaseLock;
  byDay[day].plCount += 1;
}

// In Object.entries().map() — add to returned object:
meanPhaseLock: v.plCount ? v.plTotal / v.plCount : null,
```

### Phase lock line rendering (from existing calm line pattern)

```js
// In _drawChart(), after neural calm block:
const plSlice = sessSlice.filter(s => s.meanPhaseLock !== null);
if (_seriesVisible.phaseLock && plSlice.length > 0) {
  _ctx.globalAlpha = 0.9;
  _ctx.strokeStyle = '#22c55e';
  _ctx.lineWidth = 2;
  // ... same broken-line quadratic curve logic as calm ...
  // markers at r=3, filled green
  // hit targets: type 'phaseLock'
  _ctx.globalAlpha = 1.0;
}
```

### Legacy coherence split rendering

```js
// Two passes on sessSlice:
const legacySess = sessSlice.filter(s => s.meanPhaseLock === null);
const v12Sess    = sessSlice.filter(s => s.meanPhaseLock !== null);

// Pass 1 — legacy (dimmed, hollow)
_ctx.globalAlpha = 0.45;
for (const s of legacySess) {
  const x = xPx(s.day); const y = cohYPx(s.meanCoherence);
  if (x < chartLeft || x > chartRight) continue;
  _ctx.beginPath();
  _ctx.arc(x, y, 5, 0, Math.PI * 2);
  _ctx.strokeStyle = '#fb923c';
  _ctx.lineWidth = 1.5;
  _ctx.stroke(); // hollow — no fill
  _hitTargets.push({ x, y, type: 'coherence-legacy', data: s });
}
_ctx.globalAlpha = 1.0;

// Pass 2 — v1.2 (solid, existing style)
for (const s of v12Sess) {
  // ... existing solid dot code ...
}
```

### Clickable legend structure

```js
// Module state:
const _seriesVisible = { hrv: true, coherence: true, phaseLock: true, calm: true, rf: true };
let _legendBounds = []; // [{key, x, y, w, h}] — populated during drawLegend()

// In _drawChart(), replace static legend draw with:
_legendBounds = [];
for (const item of legendItems) {
  // ... existing measure/draw ...
  const itemW = squareSize + gapSq + textW;
  _legendBounds.push({ key: item.key, x: lx, y: ly - squareSize, w: itemW, h: squareSize + 4 });
  // Dim if hidden
  _ctx.globalAlpha = _seriesVisible[item.key] ? 1.0 : 0.35;
  // ... draw square and label ...
  _ctx.globalAlpha = 1.0;
  lx += itemW + gapItem;
}

// Wire click handler (once, in _wireTooltip or a separate _wireLegend):
_canvas.addEventListener('click', (e) => {
  const rect = _canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  for (const b of _legendBounds) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      _seriesVisible[b.key] = !_seriesVisible[b.key];
      _drawChart();
      break;
    }
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Coherence as sole biofeedback gauge | Three gauges: Coherence, Phase Lock, Neural Calm | CONTEXT.md locked decision |
| Dashboard coherence line = only session metric | Dashboard: HRV + Coherence + Phase Lock + Neural Calm + RF | 5 series, all on same chart |
| Static legend | Clickable legend toggles | New for Phase 13 |

---

## Open Questions

1. **Discovery tab coherence gauge**
   - What we know: CONTEXT.md says three gauges for practice. Discovery tab has its own gauge canvas (`#gauge-canvas`, currently shows phase lock gauge).
   - What's unclear: Should discovery also show the coherence gauge, or only practice?
   - Recommendation: Scope only to practice tab per CONTEXT.md. If user wants discovery gauges later, it's a separate request.

2. **Legacy coherence separate legend toggle**
   - What we know: User said "Claude's discretion."
   - Recommendation: Do NOT add a separate "Coherence (legacy)" toggle. Use a single "Coherence" toggle that controls both legacy and v1.2 coherence dots. Simplifies the legend (5 items vs 6) and legacy data naturally disappears as the date range moves forward.

3. **Right Y-axis label update**
   - What we know: Currently reads "Score (0-100)" in gray. Phase lock and coherence both live here.
   - Recommendation: Keep "Score (0-100)" — it accurately describes all three right-axis series. No change needed.

4. **Overlap when a session has both coherence and phase lock**
   - Recommendation: Draw coherence dot (r=5, orange) first, then phase lock dot (r=3, green) on top at the same x position. They will be visually distinct — orange ring with green center. This is natural and requires no special handling.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `js/dashboard.js` (full read) — existing patterns for `_getSessionsByDay()`, `_drawChart()`, `_hitTargets`, tooltip system, legend rendering
- Direct codebase inspection: `js/renderer.js` (full read) — `drawPhaseLockGauge()`, `drawNeuralCalmGauge()`, `startRendering()` signature, `renderLoop()`
- Direct codebase inspection: `js/practice.js` — `_saveSession()` confirms `meanPhaseLock` already stored; `meanCoherence` is NOT currently saved in v1.2 sessions
- Direct codebase inspection: `js/state.js` — `AppState.coherenceScore` confirmed populated
- Direct codebase inspection: `index.html` — current gauge canvas positions in practice and discovery layouts
- Direct codebase inspection: `styles.css` — `.pacer-gauge` and `.neural-calm-gauge` absolute positioning pattern

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions — user-locked choices about colors, sizes, legacy behavior
- STATE.md — confirms `v1.2: Phase lock ADDED alongside coherence` architectural decision

---

## Critical Finding: meanCoherence Not Saved in v1.2 Sessions

Reviewing `_saveSession()` in `practice.js` (lines 676-708): the saved session object includes `meanPhaseLock` but **does NOT include `meanCoherence`**. This means v1.2 sessions in IndexedDB have `meanPhaseLock` (not null) but `meanCoherence` is undefined/absent.

The dashboard's `_getSessionsByDay()` currently does:
```js
byDay[day].total += s.meanCoherence ?? 0;
```

For v1.2 sessions, `s.meanCoherence` will be `undefined`, so it falls back to `0`, which will drag down the "Avg Coherence 7d" metric card for v1.2 sessions.

**Resolution options:**
1. Save `meanCoherence` in `_saveSession()` — add `meanCoherence: summary.meanCoherence` (need to verify `_computeSummary()` returns it)
2. Filter coherence aggregation to only sessions where `meanCoherence` is a valid number — change `?? 0` to `if (typeof s.meanCoherence === 'number' && !isNaN(s.meanCoherence))`

**Recommendation: Option 2** (guard in dashboard) plus **Option 1** (also save coherence in practice.js if `_computeSummary()` has it). The legacy/v1.2 split already distinguishes sessions by `meanPhaseLock` presence, so the coherence guard is needed regardless.

**Confirmed from `_computeSummary()` (lines 377-414):** `meanCoherence` is NOT computed. The function tracks `_phaseLockTrace` (sampled each second), `_neuralCalmTrace`, `_hrTrace`, `_hrvTrace`, and `_paceTrace` — but there is NO `_coherenceTrace`. `AppState.coherenceScore` is computed live each DSP tick but never accumulated.

**Required additional task:** Add `_coherenceTrace` accumulation alongside `_phaseLockTrace` in practice.js (same 1-per-second sampling pattern), compute `meanCoherence` in `_computeSummary()`, and add it to `_saveSession()`. This is necessary for the "Avg Coherence 7d" metric card to show correct values for v1.2 sessions and for the dashboard coherence dots to be populated for new sessions.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all Canvas 2D
- Architecture: HIGH — all patterns are clones of verified existing code
- Pitfalls: HIGH — discovered from direct code inspection (meanCoherence not saved is a real bug)
- Critical finding: HIGH — verified directly from _saveSession() source

**Research date:** 2026-04-04
**Valid until:** Stable — browser Canvas 2D API; 90-day validity
