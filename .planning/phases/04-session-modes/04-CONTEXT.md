# Phase 4: Session Modes - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Two complete session workflows — Discovery (5-block resonance frequency protocol) and Practice (guided breathing at saved frequency) — that orchestrate the BLE pipeline, DSP engine, audio pacer, and visual renderers from Phases 1-3. This phase delivers the session state machines, UI flows, frequency comparison/selection, session summary, and data persistence. No new rendering or audio capabilities — only session orchestration of existing components.

</domain>

<decisions>
## Implementation Decisions

### Discovery Flow
- All 5 blocks auto-start with a 3-2-1 countdown between them — no manual start per block
- Brief 3-5 second pause between blocks showing: block just completed, next breathing rate coming up, "relax" moment
- Current breathing rate shown prominently near the circle during each block (e.g., "6.0 breaths/min")
- Progress indicator is Claude's discretion (dots, steps, or bar)
- Block order: 6.5, 6.0, 5.5, 5.0, 4.5 breaths/min — 2 minutes each

### Frequency Selection (Post-Discovery)
- Bar chart showing RSA amplitude for all 5 frequencies — tallest bar is the winner
- App auto-selects the best frequency and highlights it with "Recommended" label
- User clicks "Confirm" to save, or taps a different bar to override the recommendation
- No individual block redo — if unhappy, restart the full Discovery protocol
- Discovery tab always available — running it again overwrites the saved frequency

### Practice Session UX
- Adjustable duration before starting: 10/15/20/30 minute options
- Practice tab shows saved frequency and duration picker, then "Start Session" button
- During session: circle + waveform background + coherence gauge very subtle (small, low opacity)
- No spectrum chart during practice — keep it focused on breathing
- Session end: gentle chime when timer reaches 0:00, session continues until user clicks "End Session" — option to keep going
- End-of-session summary: four key metrics — duration, mean coherence, peak coherence, time in "Locked In" zone

### Session Persistence
- Save per practice session: date, duration, frequency, mean coherence, peak coherence, time in high zone, AND full coherence-over-time trace array
- Discovery results saved: per-block RSA amplitude and LF peak power, selected frequency
- BLE disconnect mid-session: pause audio/circle, show reconnecting banner. Resume if reconnects. Save partial session if reconnect fails.

### Claude's Discretion
- Progress indicator style for discovery blocks
- Exact countdown animation between blocks
- Duration picker UI style (buttons vs dropdown vs slider)
- Summary screen layout
- Chime sound at session end (can reuse bowl tone)
- Coherence gauge opacity/size in practice mode

</decisions>

<specifics>
## Specific Ideas

- The Discovery protocol should feel like a structured test — clinical but not stressful. The countdown between blocks gives a natural rhythm.
- Practice mode should feel like meditation — minimal UI, maximum calm. The coherence gauge is there if you glance at it, but it shouldn't demand attention.
- The "keep going" option after timer ends is important — sometimes you're in the zone and don't want to stop at an arbitrary cutoff.
- Bar chart for frequency comparison should make the winner visually obvious at a glance.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `startPacer(freq)` / `stopPacer()` (js/audio.js): Takes a frequency in Hz, can be called with different values per discovery block
- `startRendering(waveform, spectrum, gauge, pacer, startTime, duration)` (js/renderer.js): Already supports duration parameter for countdown timer
- `initDSP()` / `tick(elapsed)` (js/dsp.js): DSP engine with coherence scoring and `computeRSAAmplitude(hrSamples)`
- `getHRArray(windowSeconds)` (js/dsp.js): Returns HR array for a time window — used for RSA computation per block
- `saveSession(data)` / `getSetting()` / `setSetting()` (js/storage.js): IndexedDB persistence already built
- `AppState.pacingFreq` (js/state.js): Controls the breathing rate — change this to switch frequency per discovery block
- `AppState.sessionPhase` (js/state.js): Reserved field ('idle' | 'discovery' | 'practice')

### Established Patterns
- Session start/stop managed in main.js (startSession/stopSession)
- Canvas renderers share a single rAF loop
- Audio uses lookahead scheduler driven by AudioContext.currentTime
- DOM event listeners wired in main.js

### Integration Points
- Discovery mode needs a state machine: block 1 → pause → block 2 → ... → comparison → selection
- Practice mode extends current startSession/stopSession with duration and saved frequency
- Session summary is a new DOM section that appears when session ends
- Bar chart for frequency comparison can be a new Canvas or simple DOM element

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-session-modes*
*Context gathered: 2026-03-22*
