# Phase 11: Phase Lock Engine - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace coherence with phase lock as the primary biofeedback metric. Implement Hilbert transform to compute instantaneous phase alignment between breathing pacer and HR oscillation. Swap the coherence gauge for a phase lock gauge, update session summary and persistence. Adaptive pace control is Phase 12 — this phase only computes and displays the score.

</domain>

<decisions>
## Implementation Decisions

### Gauge Look & Feel
- Same teal arc/ring visual style as coherence, relabeled to "Phase Lock"
- Tighter zone thresholds than coherence: Low (<40), Aligning (40-70), Locked (70+)
- Zone labels: "Low" / "Aligning" / "Locked"

### Transition from Coherence
- Clean swap — coherence gauge becomes phase lock gauge in the same DOM element, different data source and label
- No trace of "coherence" in the session UI for new sessions
- Old sessions in IndexedDB keep their coherence data untouched
- Session summary: same 4 metric cards relabeled — Duration, Mean Phase Lock, Peak Phase Lock, Time Locked In

### Phase Lock Responsiveness
- More direct/responsive than Neural Calm — phase lock is the primary biofeedback signal, rewards effort faster
- Claude picks the exact update interval and smoothing (lighter than Neural Calm's 12s rolling average)
- Should feel responsive enough that syncing up is rewarded within ~2 breath cycles, but not so jumpy it's distracting

### Claude's Discretion
- Hilbert transform window size and update rate (balance responsiveness vs stability)
- Visual interpolation factor for the gauge (lighter than Neural Calm's 0.015)
- How to handle the first ~30 seconds of a session before Hilbert has enough data (calibrating state?)
- Whether to keep computing coherence in the background for IndexedDB backward compatibility or stop computing it entirely
- Phase lock 0-100 scaling formula (raw phase angle → normalized score)
- How `_phaseLockTrace[]` replaces `_coherenceTrace[]` in practice.js

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/dsp.js`: FFT + cubic spline resampling at 4 Hz — Hilbert transform operates on the same resampled RR series
- `js/renderer.js`: `drawCoherenceGauge()` — rename/remap to phase lock, same arc geometry
- `js/practice.js`: `_coherenceTrace[]`, `_computeSummary()`, `_showSummary()` — swap coherence for phase lock
- `js/state.js`: `AppState.coherenceScore` — replace with `AppState.phaseLockScore` (or repurpose)

### Established Patterns
- DSP tick runs 1/second — phase lock computation plugs into the same tick
- Coherence score read by renderer every rAF frame via `AppState.coherenceScore`
- Session summary computes mean/peak/timeInHigh from trace array
- `saveSession()` already flexible — add phaseLock fields, stop writing coherence fields for new sessions

### Integration Points
- `js/dsp.js` `tick()`: Currently computes coherence — add phase lock computation alongside (or replace)
- `js/renderer.js` `drawCoherenceGauge()`: Rename to `drawPhaseLockGauge()`, update label/zones
- `js/practice.js` DSP interval: Push `AppState.phaseLockScore` instead of `AppState.coherenceScore`
- `js/practice.js` `_computeSummary()`: Use phase lock trace for mean/peak/timeInHigh
- `js/practice.js` `_showSummary()`: Update metric card labels
- `js/storage.js` `saveSession()`: Add meanPhaseLock, peakPhaseLock, timeLockedIn fields
- `index.html`: Update summary card labels from "Coherence" to "Phase Lock"

</code_context>

<specifics>
## Specific Ideas

- Design spec reference: `docs/superpowers/specs/2026-04-04-adaptive-biofeedback-design.md`
- Research reference: `.planning/research/ADVANCED-BIOFEEDBACK.md` — Hilbert transform details
- The pacer signal is known (AppState.pacingFreq + pacerEpoch) — can compute expected HR phase analytically rather than needing a second Hilbert on the pacer

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-phase-lock-engine*
*Context gathered: 2026-04-04*
