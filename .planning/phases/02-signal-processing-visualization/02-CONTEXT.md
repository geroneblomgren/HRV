# Phase 2: Signal Processing + Visualization - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Artifact rejection pipeline, spectral analysis engine (Lomb-Scargle or FFT+resample), coherence scoring, RSA amplitude computation, and Canvas 2D rendering for scrolling HR waveform, power spectrum chart, and coherence gauge. This phase delivers the DSP engine and visualization components that Discovery and Practice modes (Phase 4) will integrate.

</domain>

<decisions>
## Implementation Decisions

### Waveform Appearance
- Filled area plot: smooth curve with translucent teal/cyan fill below the line
- Dark background (established in Phase 1), teal/cyan line + fill for high contrast
- Fixed Y-axis range (40-120 BPM) — RSA amplitude changes are honest, not auto-scaled
- Time window length is Claude's discretion (pick based on typical resonance breathing rates)
- Waveform renders immediately from session start (even during calibration)

### Coherence Display
- Number centered inside a progress ring that fills as coherence rises (0-100)
- Ring and number color shifts through zones: red (low) → yellow (medium) → green (high)
- Text label below the ring: "Low" / "Building" / "Locked In"
- Subtle pulse animation on the ring when in high coherence zone — positive reinforcement
- Animated smooth transitions between values (number and ring both animate)
- Zone thresholds are Claude's discretion — pick based on LF power ratio distribution in literature

### Spectrum Chart Style
- Filled area plot (consistent with waveform style)
- LF band (0.04-0.15 Hz) highlighted with background shading — vertical shaded region always visible
- Dominant LF peak marked with a small dot and frequency label (e.g., "0.10 Hz")
- Axis labeling density is Claude's discretion

### Calibrating State UX
- During first 90-120s: progress countdown with bar ("Calibrating... 45s remaining")
- HR waveform is visible from the start (it has data immediately)
- Coherence ring and spectrum chart show "Calibrating..." placeholder during countdown
- When calibration completes: coherence ring and spectrum fade in smoothly
- Ready cue is Claude's discretion

### Claude's Discretion
- Time window length for waveform
- Coherence zone thresholds (low/medium/high)
- Spectrum axis labeling
- Calibration ready cue style
- Spectral analysis method decision (Lomb-Scargle vs FFT + cubic spline resampling)
- Exact teal/cyan shade and fill opacity

</decisions>

<specifics>
## Specific Ideas

- Visual consistency: both waveform and spectrum use filled area plots — cohesive feel across charts
- The coherence display should feel like a "lock-on" indicator — when you hit resonance, it should feel rewarding but not gamified
- The waveform should look like medical instrumentation — clean, precise, trustworthy
- "Locked In" label for high coherence is the vibe — confident, not celebratory

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AppState` (js/state.js): Already has reserved fields for Phase 2 — `coherenceScore`, `lfPower`, `spectralBuffer`, `calibrating`. DSPEngine writes to these, renderers subscribe.
- `subscribe()` / `unsubscribe()` (js/state.js): Pub/sub system for wiring DSP outputs to Canvas renderers.
- `AppState.rrBuffer` (Float32Array(512)): Circular buffer of clean RR intervals, written by BLEService. DSPEngine reads from here.
- `AppState.rrHead` / `AppState.rrCount`: Write pointer and total count — DSPEngine uses these to know where to read from.

### Established Patterns
- ES module imports from CDN (idb loaded this way in Phase 1) — fft.js or similar can follow the same pattern
- Proxy-based reactive state — all inter-module communication goes through AppState subscriptions
- Dark theme CSS custom properties defined in styles.css (--bg-primary, --text-primary, --accent-teal, etc.)

### Integration Points
- DSPEngine reads from `AppState.rrBuffer` / `rrHead` / `rrCount` (written by BLEService)
- DSPEngine writes to `AppState.coherenceScore`, `AppState.lfPower`, `AppState.spectralBuffer`, `AppState.calibrating`
- Canvas renderers subscribe to AppState fields and redraw on updates
- Waveform canvas will live in the session view area of index.html (currently placeholder)
- Spectrum canvas will live alongside waveform during Discovery mode

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-signal-processing-visualization*
*Context gathered: 2026-03-22*
