# Phase 3: Breathing Pacer - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Visual breathing circle animation, three audio breathing styles via Web Audio API with a drift-free lookahead scheduler, session countdown timer, and mid-session controls. This phase delivers the pacer components that Discovery and Practice modes (Phase 4) will integrate. No session logic — just the pacer engine and its UI.

</domain>

<decisions>
## Implementation Decisions

### Circle Animation
- Large and central — dominates the view, primary focus during breathing
- Glowing teal ring (outlined, not filled) with soft glow/shadow — matches the teal accent throughout the app
- Ease in/out motion — gentle acceleration at start of inhale, deceleration at top, same for exhale. More deliberate than pure sine.
- "Inhale" / "Exhale" text labels shown inside the circle during the respective phase
- Countdown timer also shown inside the circle (time remaining in mm:ss format, counting down to 0:00)

### Audio Tone Character
- Default volume: gentle but clear — audible but calm, you could talk over it
- Style 1 (Pitch): Sine wave in low/warm range (~200-350 Hz), pitch rises on inhale, falls on exhale, smooth gain envelopes
- Style 2 (Swell): Constant low pitch, volume swells on inhale, fades on exhale
- Style 3 (Bowl): Singing bowl character — single warm tone with long decay at inhale start, different tone at exhale start. Sustained, resonant.
- No silence/mute option — three styles is sufficient, user can mute the tab if desired

### Session Timer
- Displayed inside the breathing circle, below the Inhale/Exhale label
- Countdown format: "18:42" counting down to "0:00"
- Timer is part of the circle's focal point — everything important is in one place

### Controls During Session
- Three small labeled buttons below the circle: "Pitch" / "Swell" / "Bowl" — always visible for audio style switching
- Simple horizontal volume slider near the audio style buttons
- Single "End Session" button — no pause. Stopping is the only option.
- Waveform renders behind/around the circle as background context; coherence gauge overlays in a corner
- Layout: circle is the hero element, data wraps around it

### Claude's Discretion
- Exact circle dimensions (min/max radius as percentage of container)
- Glow intensity and shadow properties
- Singing bowl tone frequencies and decay envelope
- Exact ease-in/out curve parameters
- Volume slider range mapping
- How to compose circle + waveform background + gauge corner overlay
- Button styling for audio style switcher

</decisions>

<specifics>
## Specific Ideas

- The breathing circle should feel like the "center of gravity" of the session — everything radiates from it
- Waveform as background behind the circle: think of it like ambient data — you see it moving but your eyes stay on the circle
- Singing bowl tones should feel like a real bowl strike — initial attack, then long warm decay. Not a synthesizer blip.
- The Inhale/Exhale text transition should be gentle, not a hard cut — fade or opacity shift

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AppState.pacingFreq` (js/state.js): Already reserved, default 0.0833 Hz (5 BPM). AudioEngine writes to this.
- `AppState.nextCueTime` / `AppState.nextCuePhase` (js/state.js): Reserved for pacer state, subscribers can read current phase.
- `subscribe()` (js/state.js): Renderers and the circle animation can subscribe to pacer state changes.
- Canvas rendering pattern from renderer.js: shared rAF loop, setupCanvas with DPR scaling, parent.clientWidth/Height sizing.

### Established Patterns
- Web Audio API requires user gesture before AudioContext.resume() — session start button is the correct gate
- ES modules, no build tools, CDN for external libs
- Dark theme CSS custom properties (--accent-teal: #14b8a6, --bg-panel, etc.)

### Integration Points
- AudioEngine will be a new js/audio.js module imported by main.js
- Circle animation could be a new Canvas renderer or CSS-based — added to the session view
- Session start/stop (currently in main.js startSession/stopSession) will need to init/stop the pacer
- The lookahead scheduler runs independently of rAF — uses setTimeout + AudioContext.currentTime

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-breathing-pacer*
*Context gathered: 2026-03-22*
