# Phase 8: Session Integration - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire Muse-S data into the existing session flow. Practice and discovery sessions work with PPG-only HR (no chest strap required). Neural Calm displays as a live gauge alongside coherence. EEG waveform scrolls on Canvas during sessions. Session summaries include Neural Calm metrics when Muse was used. This phase is UI integration — the signal processing pipelines (Phase 7) are complete.

</domain>

<decisions>
## Implementation Decisions

### Neural Calm Display
- Mirror the coherence gauge: Neural Calm gets its own gauge arc + number, same size as coherence, placed side by side — two equal biofeedback signals
- Blue color scheme for Neural Calm gauge (calm/serene association, contrasts with coherence teal)
- When Muse-S is not connected: show grayed-out placeholder with "Connect Muse-S" hint (not hidden — reminds user the feature exists)

### EEG Waveform Placement
- Below the HR waveform in the session viz area, both scroll together
- 2 channels (TP9/TP10) — Claude decides whether overlaid or stacked based on readability
- EEG canvas area always visible (shows flat line or placeholder when no Muse) — consistent layout regardless of device

### PPG Confidence Marking
- When coherence is derived from Muse PPG: show "PPG" badge on coherence gauge + shift gauge color (lighter teal or dashed border)
- PPG source marking appears in both live sessions AND session summary
- Summary shows which HR source was used for the session's coherence data

### Session Summary
- Claude decides layout (expanded grid vs two-section body/brain grouping)
- Neural Calm metrics: Mean Neural Calm, Peak Neural Calm, Time in High Calm
- High calm threshold: 75+ (higher bar than coherence's 66 for "Locked In")
- Neural Calm summary cards only appear when Muse was used for the session

### Claude's Discretion
- Exact gauge arc rendering (reuse existing coherence gauge Canvas code or new)
- EEG waveform trace layout (overlaid vs stacked TP9/TP10)
- Summary layout choice (7-card grid vs two-section body/brain)
- How the "PPG" badge and color shift look on the coherence gauge
- How to persist Muse provenance flag in IndexedDB session records
- Practice.js and discovery.js changes needed to collect Neural Calm trace alongside coherence trace

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/practice.js`: `_coherenceTrace[]` collects per-second coherence — same pattern for Neural Calm trace
- `js/practice.js`: `_computeSummary()` returns {durationSeconds, mean, peak, timeInHigh} — extend for Neural Calm
- `js/practice.js`: `_showSummary()` populates 4 metric card elements — add Neural Calm cards
- `js/renderer.js`: Existing Canvas waveform renderer (HR scrolling) — extend or duplicate for EEG
- `js/renderer.js`: Coherence gauge arc renderer — duplicate for Neural Calm gauge with blue color
- `js/storage.js`: `saveSession()` persists to IndexedDB — add Neural Calm fields + source provenance

### Established Patterns
- Session controllers (practice.js, discovery.js) own their DOM, timers, rendering, DSP
- DSP tick runs 1/second via setInterval — Neural Calm is already in AppState, just need to sample it
- Renderer uses shared rAF loop for all Canvas elements — add EEG canvas to the same loop
- AppState.hrSourceLabel already tracks 'Chest Strap' vs 'Muse PPG' — use for confidence marking

### Integration Points
- `practice.js` `startPractice()`: Initialize Neural Calm trace array
- `practice.js` DSP interval (1s tick): Push AppState.neuralCalm to trace alongside coherence
- `practice.js` `stopPractice()`: Compute Neural Calm summary metrics
- `practice.js` `_showSummary()`: Populate Neural Calm metric cards
- `practice.js` `_saveSession()`: Include Neural Calm metrics + hrSourceLabel in session record
- `renderer.js`: Add EEG waveform Canvas and Neural Calm gauge Canvas to rAF loop
- `index.html`: Add Neural Calm gauge element, EEG canvas element, Neural Calm summary cards
- `discovery.js`: Same Neural Calm trace collection pattern as practice.js

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for gauge rendering and waveform display.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-session-integration*
*Context gathered: 2026-04-03*
