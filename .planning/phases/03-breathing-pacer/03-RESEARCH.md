# Phase 3: Breathing Pacer - Research

**Researched:** 2026-03-21
**Domain:** Web Audio API scheduling, Canvas 2D circle animation, audio synthesis
**Confidence:** HIGH (Web Audio API patterns verified against MDN official docs and the canonical "A Tale of Two Clocks" article; Canvas patterns verified against MDN; synthesis patterns verified against MDN AudioParam docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Circle Animation**
- Large and central — dominates the view, primary focus during breathing
- Glowing teal ring (outlined, not filled) with soft glow/shadow — matches the teal accent throughout the app
- Ease in/out motion — gentle acceleration at start of inhale, deceleration at top, same for exhale. More deliberate than pure sine.
- "Inhale" / "Exhale" text labels shown inside the circle during the respective phase
- Countdown timer also shown inside the circle (time remaining in mm:ss format, counting down to 0:00)

**Audio Tone Character**
- Default volume: gentle but clear — audible but calm, you could talk over it
- Style 1 (Pitch): Sine wave in low/warm range (~200-350 Hz), pitch rises on inhale, falls on exhale, smooth gain envelopes
- Style 2 (Swell): Constant low pitch, volume swells on inhale, fades on exhale
- Style 3 (Bowl): Singing bowl character — single warm tone with long decay at inhale start, different tone at exhale start. Sustained, resonant.
- No silence/mute option — three styles is sufficient, user can mute the tab if desired

**Session Timer**
- Displayed inside the breathing circle, below the Inhale/Exhale label
- Countdown format: "18:42" counting down to "0:00"
- Timer is part of the circle's focal point — everything important is in one place

**Controls During Session**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PAC-01 | Visual pacer displays expanding/contracting circle animation timed to inhale/exhale at configurable breathing rate | Canvas 2D arc drawing with easing functions driven by AudioContext.currentTime phase offset; rAF loop reads AppState.nextCueTime + nextCuePhase |
| PAC-02 | Audio pacer style 1: sine wave (~200-350 Hz) with pitch rising on inhale, falling on exhale, smooth gain envelopes | OscillatorNode sine type, frequency.setValueAtTime + exponentialRampToValueAtTime for pitch sweep; GainNode linearRampToValueAtTime for attack/release |
| PAC-03 | Audio pacer style 2: constant pitch with volume swelling on inhale, fading on exhale | OscillatorNode constant frequency + GainNode gain ramp 0→peak over inhale duration, peak→0.01 over exhale duration |
| PAC-04 | Audio pacer style 3: soft chime tones at inhale/exhale transition points | Two OscillatorNode bursts (one per phase start) with GainNode setTargetAtTime exponential decay; timeConstant ~0.8s for 2-3s resonant tail |
| PAC-05 | User can switch between audio styles without restarting the session | Module-level `currentStyle` variable read by scheduler on each cue; no need to stop/restart AudioContext |
| PAC-06 | Audio uses Web Audio API lookahead scheduler pattern (25ms setTimeout + 100ms pre-scheduling) for drift-free timing over 20-min sessions | Verified pattern from web.dev/audio-scheduling: while (nextCueTime < ctx.currentTime + 0.1) loop inside 25ms setTimeout |
| PAC-07 | Session timer displays time remaining (countdown) for practice sessions and per-block countdown for discovery sessions | Computed in rAF loop from (sessionDuration - (Date.now() - sessionStartTime)); formatted mm:ss; drawn inside circle |
</phase_requirements>

---

## Summary

Phase 3 has two independent deliverables: an `AudioEngine` module (`js/audio.js`) and a `VisualPacer` that extends the existing Canvas rAF loop in `js/renderer.js`. The technical foundations for both are well-established Web API patterns with HIGH confidence across all key decisions.

The AudioEngine is the structurally critical piece. The lookahead scheduler pattern ("A Tale of Two Clocks", Chris Wilson) uses a 25ms `setTimeout` tick that peeks 100ms ahead using `AudioContext.currentTime` and pre-schedules `OscillatorNode` instances at precise future times on the audio hardware clock. This is the only correct approach for drift-free timing over 20-minute sessions. All three audio styles are implemented inside this same scheduler — the style switch is just a variable read at scheduling time, requiring no restart.

The VisualPacer circle animation is purely driven by time math. Each rAF frame computes what fraction of the current inhale or exhale half-cycle has elapsed using `(AudioContext.currentTime - lastCueTime) / halfPeriod`, applies an ease-in/out curve, and maps the result to a canvas arc radius. The circle stays in sync with audio because both read from the same `AudioContext.currentTime` source — not a separate wall clock.

**Primary recommendation:** Build `js/audio.js` as a standalone module first (03-01), then extend `js/renderer.js` with the circle drawing functions (03-02). The AudioEngine's scheduled `nextCueTime` values written to `AppState` are the only coupling the visual side needs.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API | Living standard (Chrome 130+) | Audio scheduling + synthesis | Native browser API; zero dependencies; OscillatorNode + GainNode cover all three styles; AudioContext.currentTime is hardware-backed and drift-free |
| Canvas 2D API | Living standard (Chrome 130+) | Breathing circle animation + session timer | Already in use (renderer.js); rAF loop already established; arc() + shadowBlur for glow |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | — | — | No external libraries needed for this phase; all patterns use native Web APIs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Web Audio API native | Tone.js | Tone.js adds 200kB for abstractions designed for music composition; WAA native is 3 functions for breathing tones |
| Canvas 2D circle | CSS animation + DOM element | CSS `scale()` + `box-shadow` on a `<div>` is simpler to write but harder to sync precisely to AudioContext.currentTime; Canvas gives pixel control for the text-inside-circle layout |
| Math easing function | CSS `cubic-bezier` | CSS easing only works for CSS transitions; since we're computing position each rAF frame from AudioContext.currentTime, the easing must be a JS function |

**Installation:** No installation required. Both Web Audio API and Canvas 2D are native Chrome APIs.

---

## Architecture Patterns

### Recommended File Structure

```
js/
├── audio.js        # NEW: AudioEngine — lookahead scheduler + 3 tone synthesizers
├── renderer.js     # EXTENDED: add drawBreathingCircle() to existing rAF loop
├── main.js         # MODIFIED: import AudioEngine, wire to startSession/stopSession
├── state.js        # UNCHANGED: AppState.nextCueTime / nextCuePhase already reserved
└── (all other existing files unchanged)
```

### Pattern 1: Lookahead Audio Scheduler

**What:** A `setTimeout` fires every 25ms, reads `AudioContext.currentTime`, and pre-schedules all audio cues that fall within the next 100ms window. All OscillatorNodes start at precise future times on the audio hardware thread — no drift possible.

**When to use:** Always, for any repeating audio event where timing precision matters over minutes-long sessions.

**Source:** https://web.dev/audio-scheduling/ (web.dev "A Tale of Two Clocks", Chris Wilson — HIGH confidence)

```javascript
// js/audio.js
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

let _ctx = null;          // AudioContext (created on first user gesture)
let _nextCueTime = 0;     // AudioContext.currentTime of next scheduled cue
let _nextPhase = 'inhale'; // 'inhale' | 'exhale'
let _timerID = null;
let _masterGain = null;   // Master GainNode for volume control
let _currentStyle = 'pitch'; // 'pitch' | 'swell' | 'bowl'

export function initAudio() {
  if (_ctx) return; // Already created
  _ctx = new AudioContext();
  _masterGain = _ctx.createGain();
  _masterGain.gain.value = 0.5; // default volume
  _masterGain.connect(_ctx.destination);
}

export function startPacer(pacingFreqHz) {
  if (!_ctx) return;
  if (_ctx.state === 'suspended') _ctx.resume();
  const halfPeriod = 1 / (pacingFreqHz * 2); // seconds per inhale or exhale
  _nextCueTime = _ctx.currentTime + 0.1;
  _nextPhase = 'inhale';
  _schedulerTick(halfPeriod);
}

function _schedulerTick(halfPeriod) {
  while (_nextCueTime < _ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    _scheduleCue(_nextCueTime, _nextPhase, halfPeriod);
    // Update AppState for visual sync
    AppState.nextCueTime = _nextCueTime;
    AppState.nextCuePhase = _nextPhase;
    _nextCueTime += halfPeriod;
    _nextPhase = _nextPhase === 'inhale' ? 'exhale' : 'inhale';
  }
  _timerID = setTimeout(() => _schedulerTick(halfPeriod), LOOKAHEAD_MS);
}

export function stopPacer() {
  clearTimeout(_timerID);
  _timerID = null;
}

export function setStyle(style) {
  _currentStyle = style; // Takes effect on next scheduled cue — no restart needed
}

export function setVolume(value) { // 0.0 to 1.0
  if (_masterGain) _masterGain.gain.setTargetAtTime(value, _ctx.currentTime, 0.05);
}
```

### Pattern 2: Three Tone Synthesizers — Scheduled at Precise Times

**What:** Each cue creates a fresh `OscillatorNode` + `GainNode` subgraph scheduled to start at the pre-determined future time. OscillatorNodes are one-shot (cannot be restarted); create a new one for every cue.

**Source:** MDN Web Audio API Advanced Techniques — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques (HIGH confidence)

```javascript
function _scheduleCue(time, phase, halfPeriod) {
  switch (_currentStyle) {
    case 'pitch':   return _schedulePitchCue(time, phase, halfPeriod);
    case 'swell':   return _scheduleSwellCue(time, phase, halfPeriod);
    case 'bowl':    return _scheduleBowlCue(time, phase);
  }
}

// Style 1: Pitch — sine wave, frequency rises on inhale, falls on exhale
function _schedulePitchCue(time, phase, halfPeriod) {
  const osc = _ctx.createOscillator();
  const gain = _ctx.createGain();
  osc.type = 'sine';

  const freqStart = phase === 'inhale' ? 220 : 350;
  const freqEnd   = phase === 'inhale' ? 350 : 220;

  osc.frequency.setValueAtTime(freqStart, time);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, time + halfPeriod);

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.6, time + 0.2);      // 200ms attack
  gain.gain.linearRampToValueAtTime(0, time + halfPeriod); // fade to 0 at end
  // NOTE: linearRamp to 0 is valid; exponentialRamp to 0 is NOT (must use 0.01 min)

  osc.connect(gain);
  gain.connect(_masterGain);
  osc.start(time);
  osc.stop(time + halfPeriod + 0.05); // small buffer after nominal end
}

// Style 2: Swell — constant pitch, volume swells and fades
function _scheduleSwellCue(time, phase, halfPeriod) {
  const osc = _ctx.createOscillator();
  const gain = _ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 180; // constant warm low tone

  const peakGain = phase === 'inhale' ? 0.7 : 0.4; // inhale louder than exhale

  gain.gain.setValueAtTime(0.01, time);
  gain.gain.linearRampToValueAtTime(peakGain, time + halfPeriod * 0.5); // swell to peak
  gain.gain.linearRampToValueAtTime(0.01, time + halfPeriod);           // fade back

  osc.connect(gain);
  gain.connect(_masterGain);
  osc.start(time);
  osc.stop(time + halfPeriod + 0.05);
}

// Style 3: Bowl — single warm tone at phase start, long exponential decay
function _scheduleBowlCue(time, phase) {
  const freq = phase === 'inhale' ? 220 : 174; // two different bowl frequencies
  const osc = _ctx.createOscillator();
  const gain = _ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;

  // Short attack (bowl strike), then exponential decay tail
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.8, time + 0.03);   // fast 30ms attack
  gain.gain.setTargetAtTime(0.001, time + 0.03, 0.8);    // timeConstant=0.8s → ~3s decay

  osc.connect(gain);
  gain.connect(_masterGain);
  osc.start(time);
  osc.stop(time + 5); // let decay run 5 seconds max
}
```

**Key constraint (HIGH confidence — MDN):** `exponentialRampToValueAtTime` cannot ramp TO zero. Use 0.001 or linearRamp for final fade to silence. `setTargetAtTime` CAN approach zero asymptotically — valid for bowl decay.

### Pattern 3: Visual Circle Sync via AudioContext.currentTime

**What:** The rAF loop in renderer.js computes the breathing phase position each frame by reading `AudioContext.currentTime` and comparing to `AppState.nextCueTime` and `AppState.nextCuePhase`. No separate timer. Both audio and visual share the same clock.

**Why this works:** The rAF loop renders ~60fps (16.67ms precision). The scheduler pre-schedules cues 100ms ahead. The visual can predict what the audio will do next — both read from the same `AudioContext.currentTime`.

```javascript
// In renderer.js drawBreathingCircle():

function drawBreathingCircle(ctx, w, h, audioCtx, halfPeriod) {
  // Compute elapsed time since last cue
  const now = audioCtx.currentTime; // same clock as scheduler
  const timeSinceCue = now - AppState.nextCueTime + halfPeriod;
  // nextCueTime is the NEXT cue; (timeSinceCue) is elapsed in CURRENT half-cycle
  const t = Math.max(0, Math.min(1, timeSinceCue / halfPeriod)); // 0..1

  // Ease in-out: cubic bezier approximation (more deliberate than sine)
  const eased = easeInOut(t);

  // Map to radius: inhale = expanding, exhale = contracting
  const isInhale = AppState.nextCuePhase === 'exhale'; // next=exhale means we're in inhale
  const minR = w * 0.15;
  const maxR = w * 0.35;
  const radius = isInhale
    ? minR + (maxR - minR) * eased
    : maxR - (maxR - minR) * eased;

  // Draw glowing teal ring
  const cx = w / 2, cy = h / 2;
  ctx.save();
  ctx.shadowColor = '#14b8a6';
  ctx.shadowBlur = 20 + eased * 15; // glow pulses with expansion
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#14b8a6';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Phase label (Inhale / Exhale) — opacity transition on phase change
  // Session countdown timer inside circle
  // ...
}

function easeInOut(t) {
  // Smooth step: 3t² - 2t³ — more deliberate than sine at endpoints
  return t * t * (3 - 2 * t);
}
```

**AppState.nextCueTime note:** The scheduler writes the NEXT cue's time. The visual therefore computes elapsed time in the CURRENT half-cycle as `(audioCtx.currentTime - (nextCueTime - halfPeriod))`. See pitfall #2 below for off-by-one details.

### Pattern 4: AudioContext Lifecycle Management

**What:** `AudioContext` must be created or resumed inside a user gesture handler. The session "Start" button (or the BLE connect action that triggers `startSession()`) is the correct gate. The existing `main.js` `startSession()` function is the integration point.

**Source:** MDN Web Audio API Best Practices — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices (HIGH confidence)

```javascript
// In main.js — extend startSession():
import { initAudio, startPacer, stopPacer } from './audio.js';

function startSession() {
  // ... existing DSP/renderer startup ...
  initAudio();                              // creates AudioContext inside user gesture context
  startPacer(AppState.pacingFreq);
}

function stopSession() {
  // ... existing teardown ...
  stopPacer();
}
```

### Pattern 5: Mid-Session Style Switching

**What:** A `currentStyle` variable in the audio module is read by the scheduler on each cue scheduling call. Switching style only updates the variable — the scheduler continues without interruption. The next scheduled cue will use the new style.

**Trade-off:** There will be at most one half-cycle of latency (2.5–7 seconds at 4-6 bpm) between the user clicking a style button and hearing the change. This is acceptable — no jarring cutoff, no restart.

### Anti-Patterns to Avoid

- **Using `setInterval` for breathing cue timing:** JavaScript timers can drift 150-300ms under GC pressure. Over 20 minutes this accumulates to perceptible timing errors. Use the lookahead scheduler exclusively.
- **Creating AudioContext outside a user gesture:** The context starts `suspended`, produces no audio, and throws no error. The user hears nothing. Always create or resume inside the `startSession` click chain.
- **Reusing OscillatorNode:** OscillatorNodes are single-use. After `.stop()`, they cannot be restarted. Create a new one for every cue.
- **Ramping gain to exactly 0 with `exponentialRampToValueAtTime`:** This throws a DOM exception. Use `linearRampToValueAtTime(0, t)` or `setTargetAtTime(0.001, t, τ)` for fade-to-silence.
- **Driving visual circle animation from `Date.now()` instead of `audioCtx.currentTime`:** The two clocks can drift relative to each other. Both audio schedule and visual computation must use `audioCtx.currentTime` as the reference.
- **Stopping the OscillatorNode too early for bowl style:** Bowl Style 3 cues have a ~3-5 second decay tail. The `osc.stop()` call must be scheduled far enough in the future (5 seconds) to let the tail ring out, even though the next cue may start before the previous one finishes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Precise audio scheduling | Custom setInterval-based scheduler | Web Audio API lookahead scheduler + `AudioContext.currentTime` | JS timers have 150-300ms jitter; audio clock is sample-accurate hardware-backed clock |
| Easing curve math | Bespoke interpolation | Smoothstep `t*t*(3-2*t)` or sine easing | Well-understood, single-function, no dependencies needed |
| Gain/pitch automation | Manual setTimeout gain steps | `linearRampToValueAtTime` / `exponentialRampToValueAtTime` / `setTargetAtTime` | All automation scheduled ahead of time on audio thread; zero timing errors |
| DPR-aware canvas setup | Custom pixel density handling | Existing `setupCanvas()` from renderer.js | Already implemented and tested in Phase 2 |

**Key insight:** The Web Audio API's `AudioParam` automation methods (`linearRampToValueAtTime`, `exponentialRampToValueAtTime`, `setTargetAtTime`) schedule smooth value changes on the audio thread at sample accuracy. Hand-rolled stepped approximations produce clicks and artifacts.

---

## Common Pitfalls

### Pitfall 1: AudioContext Autoplay Policy — Silent No-Op

**What goes wrong:** `AudioContext` created outside a user gesture starts in `state: 'suspended'`. All `.start()` calls succeed without throwing, but produce no audio. The app appears to work but plays nothing.

**Why it happens:** Module-level initialization code (`const ctx = new AudioContext()`) runs before any user interaction.

**How to avoid:** Call `new AudioContext()` (or `ctx.resume()`) inside the `startSession()` handler, which is already wired to the BLE connect gesture. Call `ctx.state === 'suspended'` check before scheduling anything.

**Warning signs:** Console shows "AudioContext was not allowed to start" (only visible if DevTools is open). No audio on fresh load. Audio works after clicking any button.

### Pitfall 2: Off-by-Half-Period in Visual Phase Calculation

**What goes wrong:** `AppState.nextCueTime` holds the time of the NEXT upcoming cue. If the visual reads this directly as "when the current phase started," it is off by exactly one `halfPeriod`. The circle will appear half a cycle ahead or behind the audio.

**Why it happens:** The scheduler writes `AppState.nextCueTime = _nextCueTime` just before advancing to the next cue. The value is the future start of the phase after the current one.

**How to avoid:** Compute current phase elapsed time as:
```javascript
const currentPhaseStart = AppState.nextCueTime - halfPeriod;
const elapsed = audioCtx.currentTime - currentPhaseStart;
const t = Math.max(0, Math.min(1, elapsed / halfPeriod));
```
Track the previous cue time separately, OR derive it from `nextCueTime - halfPeriod`.

**Warning signs:** Circle appears to expand on exhale and contract on inhale. Circle is always at its maximum or minimum size when the audio cue fires.

### Pitfall 3: Bowl Style Cue Overlap

**What goes wrong:** Bowl style cues have 3-5 second decay tails. If the breathing rate is 6 bpm (5-second half-cycles), consecutive bowl cues overlap. If each cue creates its own OscillatorNode connecting to the same `_masterGain`, the overlapping nodes cause volume doubling.

**Why it happens:** Each bowl strike creates a new osc→gain subgraph. There is no automatic cancellation of prior playing nodes.

**How to avoid:** This is acceptable behavior for a bowl — real bowls ring together. The master gain keeps total volume bounded. However, if the overlap is excessive (breathing rate > 8 bpm), add a flag to skip the new strike if the previous one is still in early decay. For the target 4.5-6.5 bpm range this is not a problem.

**Warning signs:** Volume gets louder over time during bowl style. Test at 8+ bpm discovery block pace.

### Pitfall 4: OscillatorNode Not Stopped — Memory Leak

**What goes wrong:** `OscillatorNode` instances that are started but never stopped remain alive in the audio graph, consuming memory. Over a 20-minute session at 6 bpm, this creates ~144 lingering nodes if `stop()` is not called.

**Why it happens:** Developers test short sessions and don't notice the accumulation. Chrome's GC does eventually clean them up, but not reliably.

**How to avoid:** Always call `osc.stop(time + duration + smallBuffer)` when creating a one-shot oscillator. For bowl style, `osc.stop(time + 5)` is sufficient. Nodes auto-disconnect and are GC'd after their scheduled stop time.

**Warning signs:** Chrome Task Manager shows audio process memory growing linearly with session time.

### Pitfall 5: Canvas Glow Effect Performance

**What goes wrong:** `ctx.shadowBlur` on Canvas 2D is GPU-accelerated on most browsers but can cause performance issues if the shadow is applied to complex paths or changed every frame.

**Why it happens:** Applying `shadowBlur` to the full circle arc path each rAF frame is fine at 60fps for a single circle. But if the glow is applied inside a `save()/restore()` block that also contains other draws, it affects all subsequent draws in that block.

**How to avoid:** Apply `shadowColor` + `shadowBlur` only to the circle arc draw call, inside its own `save()/restore()` block. Reset shadow after the arc: `ctx.shadowBlur = 0`. Keep text drawing (Inhale/Exhale label, timer) outside the shadow-enabled block.

**Warning signs:** Waveform background text appears blurry or glowing when it shouldn't.

---

## Code Examples

Verified patterns from official sources:

### Lookahead Scheduler Core Loop
```javascript
// Source: https://web.dev/audio-scheduling/ — A Tale of Two Clocks (HIGH confidence)
function scheduler() {
  while (_nextCueTime < _ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    _scheduleCue(_nextCueTime, _nextPhase, _halfPeriod);
    AppState.nextCueTime = _nextCueTime;
    AppState.nextCuePhase = _nextPhase;
    _nextCueTime += _halfPeriod;
    _nextPhase = _nextPhase === 'inhale' ? 'exhale' : 'inhale';
  }
  _timerID = setTimeout(scheduler, LOOKAHEAD_MS);
}
```

### Gain Envelope with Attack and Release
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques (HIGH confidence)
const gain = _ctx.createGain();
gain.gain.cancelScheduledValues(time);        // clear any prior automations
gain.gain.setValueAtTime(0, time);            // start at silence
gain.gain.linearRampToValueAtTime(0.7, time + 0.2);    // 200ms attack
gain.gain.linearRampToValueAtTime(0, time + halfPeriod); // ramp to silence at end
```

### Singing Bowl Decay Envelope
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime (HIGH confidence)
// timeConstant = decay_seconds / 3 for 95% decay
const gain = _ctx.createGain();
gain.gain.setValueAtTime(0, time);
gain.gain.linearRampToValueAtTime(0.8, time + 0.03);   // 30ms strike attack
gain.gain.setTargetAtTime(0.001, time + 0.03, 0.8);    // ~3s decay tail (timeConstant=0.8)
```

### Easing Function (Smoothstep)
```javascript
// Source: Mathematical standard — no library needed (HIGH confidence)
// More deliberate than sine at endpoints, natural deceleration feel
function easeInOut(t) {
  return t * t * (3 - 2 * t); // smoothstep
}

// Slightly stronger ease (smoother zero-derivative at endpoints):
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
```

### Canvas Circle with Glow
```javascript
// Source: MDN Canvas 2D — arc() + shadowBlur (HIGH confidence)
ctx.save();
ctx.shadowColor = '#14b8a6';
ctx.shadowBlur = 24;
ctx.beginPath();
ctx.arc(cx, cy, radius, 0, Math.PI * 2);
ctx.strokeStyle = '#14b8a6';
ctx.lineWidth = 3;
ctx.stroke();
ctx.shadowBlur = 0; // reset before any subsequent draws
ctx.restore();
```

### AudioContext Lifecycle
```javascript
// Source: MDN Web Audio API Best Practices (HIGH confidence)
// Create INSIDE user gesture handler
export function initAudio() {
  if (_ctx) {
    if (_ctx.state === 'suspended') _ctx.resume();
    return;
  }
  _ctx = new AudioContext();
  _masterGain = _ctx.createGain();
  _masterGain.gain.value = 0.4; // gentle but audible default
  _masterGain.connect(_ctx.destination);
}
```

---

## Integration Details (Existing Codebase)

### AppState Fields Already Reserved (js/state.js)

```javascript
// Phase 3 fields — already present in AppState:
pacingFreq: 0.0833,      // Hz = 5 bpm default. AudioEngine reads this.
nextCueTime: 0,          // AudioEngine writes; VisualPacer reads.
nextCuePhase: 'inhale',  // AudioEngine writes; VisualPacer reads.
```

No new AppState fields are required for this phase. The scheduler writes `nextCueTime` and `nextCuePhase` before each half-cycle; the visual pacer reads them each rAF frame.

### main.js Integration Points

Current `startSession()` / `stopSession()` in `main.js` are the correct hooks. The pacer starts when the session starts (currently on BLE connect; Phase 4 will gate this properly). Extend both functions:

```javascript
// main.js additions:
import { initAudio, startPacer, stopPacer, setStyle, setVolume } from './audio.js';

function startSession() {
  // ... existing code unchanged ...
  initAudio();
  startPacer(AppState.pacingFreq);
}

function stopSession() {
  // ... existing code unchanged ...
  stopPacer();
}
```

### renderer.js Extension Pattern

The existing `renderLoop()` in `renderer.js` calls `drawWaveform()`, `drawSpectrum()`, and `drawCoherenceGauge()` each frame. Add `drawBreathingCircle()` to this loop. The `_audioCtx` reference should be passed from `audio.js` or exported so the renderer can read `audioCtx.currentTime` directly.

Option A (cleaner): Export a `getAudioTime()` function from `audio.js` that returns `_ctx ? _ctx.currentTime : 0`.

Option B: Store `nextCueTime` and the session start time in AppState; visual derives relative time from `Date.now()` comparing to session wall clock. This is slightly less precise but avoids cross-module dependency.

**Recommendation:** Option A. The visual MUST use `audioCtx.currentTime` for precise sync, not `Date.now()`.

### HTML Additions Required

The current HTML has no breathing circle element. Phase 3 requires:

1. A new Canvas element (or using the existing waveform canvas as background layer) for the breathing circle
2. Three style-select buttons below the circle
3. A volume slider
4. An "End Session" button

The session view layout needs to be restructured: circle hero element center-stage, waveform canvas behind it (z-index layering), coherence gauge in a corner overlay.

**Layout approach:** Position waveform canvas as `position: absolute` background; breathing circle canvas on top at `position: relative` with higher z-index; coherence gauge as `position: absolute` corner inset.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `setInterval` for audio timing | Web Audio lookahead scheduler + `AudioContext.currentTime` | Eliminates drift over long sessions; only correct approach |
| Direct DOM manipulation for breathing circle | Canvas 2D with rAF | Consistent with existing renderer pattern; avoids layout thrash |
| CSS animation for pulsing effects | Canvas-driven radius animation | Allows precise AudioContext.currentTime synchronization |
| Single AudioContext per page | AudioContext created on first gesture, reused for session lifetime | Required by Chrome autoplay policy; `resume()` on subsequent starts |

**Deprecated/outdated:**
- `AudioContext.createOscillator()` (old factory method syntax): Still valid but the constructor form `new OscillatorNode(ctx, options)` is preferred in current MDN docs. Both work in Chrome 130+.
- `webkitAudioContext`: Not needed; Chrome has unprefixed `AudioContext` since Chrome 35.

---

## Open Questions

1. **How to pass AudioContext reference to renderer.js for time sync**
   - What we know: renderer.js already imports from state.js and dsp.js
   - What's unclear: Whether to export `getAudioTime()` from audio.js and have renderer.js import it (creating a new inter-module dependency), or store a time offset in AppState
   - Recommendation: Export `getAudioTime()` from audio.js. The dependency is acceptable since renderer.js already imports from dsp.js. Alternatively, the rAF timestamp parameter in the draw function provides `performance.now()` time which can be correlated to `AudioContext.currentTime` at session start.

2. **Layout: waveform canvas behind the breathing circle**
   - What we know: The existing `.session-viz` layout is a flex column with two rows (main row + spectrum row)
   - What's unclear: Whether to refactor the existing session-viz structure significantly or layer the circle canvas on top of the waveform canvas
   - Recommendation: Add a new `session-pacer` container that holds both canvases with absolute positioning for layering. Defer layout finalization to plan 03-02 implementation.

3. **Volume slider default and range mapping**
   - What we know: User wants "audible but calm, you could talk over it"
   - What's unclear: Exact dB mapping for the slider; whether linear or logarithmic gain mapping feels right
   - Recommendation: Map slider 0-100 to gain 0.0-0.7 with a square root curve (`gain = (sliderValue/100)^2 * 0.7`). The square root curve perceptually linearizes loudness. Default position at 50 → gain 0.175, which is roughly -15dB — gentle but clear.

---

## Sources

### Primary (HIGH confidence)
- https://web.dev/audio-scheduling/ — "A Tale of Two Clocks" (Chris Wilson) — lookahead scheduler canonical pattern
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques — OscillatorNode one-shot pattern, gain envelope ramps
- https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/exponentialRampToValueAtTime — cannot ramp to zero constraint verified
- https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime — timeConstant formula for bowl decay
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices — AudioContext autoplay policy, user gesture requirement
- https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_animations — arc() + shadowBlur canvas patterns

### Secondary (MEDIUM confidence)
- https://alemangui.github.io/ramp-to-value — AudioParam ramp-to-value click prevention techniques; verified against MDN
- https://ircam-ismm.github.io/webaudio-tutorials/scheduling/timing-and-scheduling.html — IRCAM's Web Audio scheduling tutorial; consistent with web.dev canonical article

### Tertiary (LOW confidence)
- WebSearch results on Canvas easing functions and breathing animation patterns — consistent with mathematical smoothstep definition but not from a single authoritative source

---

## Metadata

**Confidence breakdown:**
- Audio scheduling: HIGH — Verified against web.dev canonical article + MDN
- OscillatorNode/GainNode synthesis patterns: HIGH — Verified against MDN Advanced Techniques
- AudioParam automation constraints (cannot ramp to 0): HIGH — Verified against MDN exponentialRampToValueAtTime
- Canvas circle animation + easing: HIGH — rAF pattern verified against MDN; smoothstep math is mathematical standard
- Layout approach (circle + waveform layering): MEDIUM — Based on existing HTML structure analysis; finalized in plan 03-02

**Research date:** 2026-03-21
**Valid until:** 2026-09-21 (Web Audio API is stable; patterns from "A Tale of Two Clocks" have been valid since 2013 and remain current)
