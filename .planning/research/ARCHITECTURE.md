# Architecture Research

**Domain:** Vanilla JS real-time biofeedback app — new session modes + audio features
**Researched:** 2026-04-06
**Confidence:** HIGH (direct codebase analysis, no guesswork)

---

## Existing Architecture Summary

Before describing what changes, this is how the app is actually structured today.

```
┌─────────────────────────────────────────────────────────────────┐
│                        index.html (3 tabs)                       │
│         Discovery | Practice | Dashboard                         │
├─────────────────────────────────────────────────────────────────┤
│                          main.js                                 │
│  Bootstrap, BLE connect handlers, nav tab switching,            │
│  AppState subscriptions for UI-level concerns                    │
├────────────┬───────────────┬────────────┬────────────────────────┤
│ discovery  │  practice.js  │ dashboard  │  oura.js               │
│   .js      │  Session flow │   .js      │  OAuth + cache         │
│  (mode     │  Tuning →     │  (data     │                        │
│  controller│  session      │   viz)     │                        │
├────────────┴───────────────┴────────────┴────────────────────────┤
│                      Shared Services Layer                        │
│  audio.js       dsp.js          renderer.js     storage.js       │
│  AudioContext   FFT/RSA/        Canvas RAF       IndexedDB        │
│  Bowl pacer     Coherence       Waveform/Gauge   sessions/        │
│  scheduler      PhaseLock       Pacer anim       settings/        │
│                 tick/sec                         oura cache       │
│                                                                   │
│  phaseLock.js   paceController.js   tuning.js                    │
│  Covariance     Adaptive pace       RF candidate                  │
│  score          drift controller   scanning                       │
├─────────────────────────────────────────────────────────────────┤
│                      Device Layer                                 │
│  DeviceManager.js  HRMAdapter.js    MuseAdapter.js               │
│  Capability        Garmin BLE       Muse BLE EEG+PPG             │
│  routing           RR intervals     Signal processing            │
├─────────────────────────────────────────────────────────────────┤
│                      Reactive State Bus                           │
│  state.js — Proxy-based AppState + pub/sub subscribe()           │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Facts

- **AppState is the single data bus.** Every module writes to AppState properties; every module that cares subscribes. No direct inter-module calls for data sharing.
- **Session controllers are mode-specific monoliths.** `practice.js` owns everything for a practice session: tuning phase, DSP tick loop, pacer start/stop, rendering, summary, and IndexedDB save. `discovery.js` is the same for discovery mode.
- **audio.js owns a single AudioContext.** `initAudio()` is idempotent — safe to call every session start. The context is never closed, only suspended. All audio nodes connect to `_masterGain → destination`.
- **renderer.js runs a single rAF loop.** `startRendering()` begins one `requestAnimationFrame` loop reading from AppState; `stopRendering()` cancels it. All canvas elements (waveform, gauge, pacer, neural calm, EEG, coherence) are passed in at start.
- **No build tools, no bundling, no framework.** ES modules loaded directly by the browser. CDN imports (idb, DSP FFT) are pinned URLs.
- **IndexedDB schema is versioned at DB_VERSION = 1.** Any new session fields can be added to `saveSession()` without a schema migration — the object store uses schemaless put. A DB_VERSION bump is only needed for new indexes or object stores.

---

## Feature Integration Analysis

### Feature 1: Pre-Sleep Mode (Extended Exhale RFB, Adjustable I:E Ratio)

**What it needs:**
- Asymmetric inhale/exhale durations (current pacer uses 50/50 split: `halfPeriod = 1 / (freq * 2)`)
- UI: I:E ratio selector (e.g., 1:2, 1:3) and a mode selector to reach this session type
- Session saved with `mode: 'pre-sleep'` and I:E ratio metadata

**Where the current pacer fails:**
In `audio.js`, `_schedulerTick()` computes `halfPeriod` as equal halves and `_scheduleCue()` alternates inhale/exhale with the same duration. The pacer circle animation in `renderer.js` also assumes symmetric half-periods via `pacerEpoch` + `pacingFreq`.

**Integration approach — MODIFY existing files:**

`audio.js`: Add `_inhaleRatio` / `_exhaleRatio` to module state (default 0.5/0.5). Expose `setIERatio(inhale, exhale)`. Change `_schedulerTick` to compute asymmetric phase durations:
```
const period = 1 / AppState.pacingFreq;
const inhaleDur = period * _inhaleRatio;
const exhaleDur = period * _exhaleRatio;
```
The cue scheduler alternates: if `_nextPhase === 'inhale'` advance by `inhaleDur`, else by `exhaleDur`. Write `AppState.currentPhaseDuration` on each cue so the renderer can normalize circle animation to the actual phase length.

`renderer.js`: The pacer circle expansion/contraction timing must read `AppState.currentPhaseDuration` instead of computing a symmetric half-period from `pacingFreq`. This is the only renderer change needed for pre-sleep.

`state.js`: Add `sessionMode: 'standard' | 'pre-sleep' | 'meditation'`, `ieRatio: { inhale: 1, exhale: 2 }`, and `currentPhaseDuration: 0`.

**New file needed:** `js/preSleep.js` (preferred over adding branches to `practice.js`). The pre-sleep controller is functionally ~80% identical to `practice.js` — same tuning phase, same DSP tick, same save structure — with the meaningful differences being I:E ratio wiring and no adaptive pace controller.

---

### Feature 2: Meditation Mode (Guided Audio Playback + Passive HRV/EEG Monitoring)

**What it needs:**
- Audio file playback (built-in scripts + user-uploaded files)
- Passive HRV and Neural Calm monitoring during playback (no active breathing pacer)
- Post-session physiological report
- User file management (upload, select, delete)

**The fundamental constraint with the current architecture:**

`audio.js` owns the single `AudioContext`. The bowl pacer uses `OscillatorNode` chains. Audio file playback uses `AudioBufferSourceNode` or `MediaElementAudioSourceNode`. These are compatible — they can coexist in the same context connecting to separate `GainNode` outputs. But: **do not create a second AudioContext**. Chrome enforces per-page limits, and mixing audio from two separate contexts is impossible at the platform level.

**Integration approach:**

`audio.js`: Export `getAudioContext()` returning `_ctx`. This is the only change to `audio.js` required for meditation playback support — the shared context is exposed, nothing else about audio.js changes.

**New file: `js/meditationAudio.js`**

Responsibilities:
- Calls `initAudio()` to ensure context is running, then `getAudioContext()` to get the shared context
- For built-in scripts: fetch the file, `ctx.decodeAudioData()`, play via `AudioBufferSourceNode` (fully loaded in RAM, best for seeking and looping)
- For user uploads: connect via `MediaElementAudioSourceNode` wrapping an HTML5 `<audio>` element (handles large files without full decode-to-buffer; allows streaming playback)
- Owns its own `GainNode` → `ctx.destination` (independent volume from bowl pacer)
- Exposes: `load(source)`, `play()`, `pause()`, `stop()`, `seek(seconds)`, `setVolume(0-1)`
- Writes to AppState: `meditationPlaying`, `meditationDuration`, `meditationPosition`

**Built-in scripts:** Served as audio files in `/audio/` directory. Indexed in a static `js/meditationLibrary.js` config (array of `{id, title, duration, file}`). No external fetch.

**User uploads:** Use the File API + IndexedDB. Store audio blobs in a new `'audioFiles'` object store (requires storage.js DB_VERSION bump to 2). Store metadata (filename, duration, date added) separately in `'settings'` under key `'userAudioFiles'` as a JSON array. Do not use localStorage — binary blobs exceed the 5-10MB quota immediately.

`storage.js` changes:
- Bump `DB_VERSION` to 2
- Add `'audioFiles'` object store in the `upgrade()` callback
- Export `saveAudioFile(blob, metadata)`, `getAudioFile(id)`, `deleteAudioFile(id)`, `listAudioFiles()`

**New file: `js/meditation.js`** (session controller, mirrors `practice.js` structure)

Responsibilities:
- Mode selector and audio source selection UI wiring
- Session start: `initAudio()` → load audio → `startRendering(...)` in passive mode (no pacer canvas passed) → DSP tick interval for HRV + Neural Calm trace collection
- No `startPacer()` call — meditation mode is breath-permissive
- No `initPaceController()` call
- Session end: `stopRendering()` → compute summary → `showMeditationReport()` → `saveSession({mode: 'meditation', ...})`
- Post-session report overlays average phase lock, neural calm, and HRV trend during the session

**State additions to `state.js`:**
```
meditationPlaying: false,
meditationDuration: 0,       // total seconds of loaded audio
meditationPosition: 0,       // current playback position in seconds
meditationAudioId: null,     // id of selected audio (null = passive monitoring only)
```

---

### Feature 3: Phase Lock Audio Sonification

**What it needs:**
- A continuous audio tone whose pitch tracks `AppState.phaseLockScore` in real time
- Must not interfere with the bowl breathing pacer
- Works across all modes (standard practice, pre-sleep, meditation)
- Eyes-closed use — smooth pitch transitions, not sudden jumps

**Integration approach — MODIFY `audio.js`:**

Add a persistent `_sonificationOsc` + `_sonificationGain` within the existing AudioContext. Unlike bowl strikes (short-lived nodes created per strike), sonification uses one long-lived oscillator with continuously scheduled frequency automation.

The pitch update is called from the 1-second DSP tick interval in each session controller. Map `phaseLockScore` (0-100) to a frequency range (e.g., 180 Hz at score=0, 440 Hz at score=100). Use `setTargetAtTime` with a 500ms time constant for smooth glide — no audible clicks.

New exports in `audio.js`:
- `startSonification()` — creates `_sonificationOsc` (sine, starts at 180 Hz), connects to `_sonificationGain` at near-zero initial volume, starts oscillator
- `stopSonification()` — ramps `_sonificationGain` to 0 over 200ms, then disconnects and nulls refs
- `updateSonification(phaseLockScore)` — maps score to Hz, calls `setTargetAtTime`
- `setSonificationVolume(value)` — separate from master bowl volume

Sonification `_sonificationGain` connects to `_ctx.destination` directly, parallel to `_masterGain`. This gives fully independent volume control.

**Session controller integration:**

Each mode controller (`practice.js`, `preSleep.js`, `meditation.js`) opts in:
- Call `startSonification()` after `initAudio()` if `AppState.sonificationEnabled`
- Call `updateSonification(AppState.phaseLockScore)` inside the DSP tick interval
- Call `stopSonification()` in the stop/teardown function
- Add sonification volume slider to mode UI

**State additions:**
```
sonificationEnabled: true,    // user toggle (persisted via setSetting)
sonificationVolume: 0.15,     // 0-1 (persisted via setSetting)
```

---

## Component Responsibility Map

| Component | Status | Change |
|-----------|--------|--------|
| `state.js` | MODIFY | Add `sessionMode`, `ieRatio`, `currentPhaseDuration`, `meditationPlaying`, `meditationDuration`, `meditationPosition`, `meditationAudioId`, `sonificationEnabled`, `sonificationVolume` |
| `audio.js` | MODIFY | Add `setIERatio()`, asymmetric phase scheduling, `AppState.currentPhaseDuration` writes, `startSonification()`, `stopSonification()`, `updateSonification()`, `setSonificationVolume()`, `getAudioContext()` |
| `renderer.js` | MODIFY | Pacer circle reads `AppState.currentPhaseDuration` instead of computing symmetric half-period; pass `null` for pacer canvas in meditation mode |
| `storage.js` | MODIFY | Bump `DB_VERSION` to 2; add `audioFiles` object store; add `saveAudioFile`, `getAudioFile`, `deleteAudioFile`, `listAudioFiles` |
| `main.js` | MODIFY | Wire mode selector UI; call `initPreSleepUI()` and `initMeditationUI()` in `init()` |
| `index.html` | MODIFY | Mode selector; pre-sleep UI sections (I:E ratio picker); meditation UI sections (audio player, library) |
| `styles.css` | MODIFY | Mode selector, audio player, I:E ratio picker styles |
| `practice.js` | NO CHANGE | Standard mode unchanged |
| `discovery.js` | NO CHANGE | Unaffected |
| `dsp.js` | NO CHANGE | Session-mode-agnostic; reads RR buffer regardless of mode |
| `phaseLock.js` | NO CHANGE | Score computed from RR data regardless of mode |
| `paceController.js` | NO CHANGE | Not called by pre-sleep or meditation controllers |
| `tuning.js` | NO CHANGE | Pre-sleep may optionally run tuning; meditation skips it; either way `tuning.js` itself is unchanged |
| Device adapters | NO CHANGE | Mode-agnostic |

**New files:**

| File | Purpose |
|------|---------|
| `js/preSleep.js` | Pre-sleep session controller — I:E ratio wiring, no pace controller, saves with `mode:'pre-sleep'` |
| `js/meditation.js` | Meditation session controller — no pacer, passive monitoring, post-session report |
| `js/meditationAudio.js` | Guided audio playback engine using shared AudioContext |
| `js/meditationLibrary.js` | Static index of built-in meditation scripts with `{id, title, duration, file}` metadata |
| `audio/` | Directory of built-in guided audio files served locally |

---

## Data Flow Changes

### Pre-Sleep Session Flow

```
User selects pre-sleep mode + I:E ratio (e.g., 1:2)
    ↓
preSleep.js: initAudio() → setIERatio(1, 2) → [optional tuning phase]
    ↓
startPacer(resonanceFreqHz)
  audio.js: period = 1/freq; inhaleDur = period * 1/3; exhaleDur = period * 2/3
  AppState.currentPhaseDuration updated each cue
    ↓
startRendering(...) — renderer reads currentPhaseDuration for circle timing
    ↓
DSP tick every 1s:
  tick() → phaseLockScore
  updateSonification(score)
  push traces (no paceControllerTick)
    ↓
stopPreSleep() → saveSession({mode:'pre-sleep', ieRatio:{inhale:1,exhale:2}, ...})
```

### Meditation Session Flow

```
User selects meditation mode → picks audio source (built-in or uploaded)
    ↓
meditation.js: initAudio() → meditationAudio.load(source) → startSonification()
    ↓
meditationAudio.play() — AudioBufferSourceNode or MediaElementAudioSourceNode
    ↓
startRendering(waveform, null, gauge, null, start, 0, neuralCalm, eeg, coherence)
  (sessionDuration=0 means no countdown timer — open-ended session)
    ↓
DSP tick every 1s:
  tick() → phaseLockScore, neuralCalm (passive)
  updateSonification(score)
  meditationAudio updates AppState.meditationPosition
    ↓
Audio ends OR user stops →
  saveSession({mode:'meditation', audioId, meanPhaseLock, meanNeuralCalm, ...})
  showMeditationReport()
```

### Sonification Update Flow

```
DSP tick interval (1s, inside session controller)
    ↓
tick() updates AppState.phaseLockScore
    ↓
updateSonification(AppState.phaseLockScore) — called in same tick callback
    ↓
audio.js: targetHz = 180 + (score / 100) * 260  // 180-440 Hz range
  _sonificationOsc.frequency.setTargetAtTime(targetHz, _ctx.currentTime, 0.5)
  (500ms time constant = gradual, musically smooth pitch glide)
```

### Asymmetric Pacer Scheduling

```
_schedulerTick() — same 25ms loop interval, unchanged
    ↓
period = 1 / AppState.pacingFreq
currentDur = (_nextPhase === 'inhale') ? period * _inhaleRatio : period * _exhaleRatio
    ↓
AppState.currentPhaseDuration = currentDur   [NEW write]
AppState.nextCueTime = _nextCueTime          [unchanged]
AppState.nextCuePhase = _nextPhase           [unchanged]
    ↓
_scheduleCue(_nextCueTime, _nextPhase, currentDur)
_nextCueTime += currentDur
    ↓
renderer.js rAF loop:
  phaseFraction = elapsed within current phase / AppState.currentPhaseDuration
  circle radius = f(phaseFraction, currentPhase)  [normalized correctly]
```

---

## Architectural Patterns

### Pattern 1: Session Controller as Mode Monolith

**What:** Each session mode is a self-contained controller owning its full lifecycle — start, DSP tick loop, audio, rendering, summary, save. Shared services are called via their public APIs, not subclassed or wrapped.

**When to use:** Every new session mode. Do not add `if (mode === 'x')` branches inside `practice.js`.

**Trade-offs:** Duplication of boilerplate (DSP tick setup, RMSSD helper, trace collection). Acceptable — the alternative (a generic session runner with plugin modes) is overengineered for a 4-mode personal app. If duplication becomes painful, extract shared utilities to `dsp.js` exports.

### Pattern 2: AppState as the Only Inter-Module Data Channel

**What:** Modules never import from each other to read data. They write to AppState; subscribers read. Direct imports between modules are only for function calls (start/stop/init), never for data exchange.

**When to use:** All new features. `meditationAudio.js` writes `meditationPosition` to AppState; `meditation.js` subscribes for UI updates. Never reach into `meditationAudio.js` to read position directly.

**Trade-offs:** AppState grows. Mitigate by grouping fields with section comments (already the pattern in `state.js`).

### Pattern 3: One AudioContext, Multiple Gain Nodes

**What:** One `AudioContext` in `audio.js`, exposed via `getAudioContext()`. Each audio concern (bowl pacer, sonification, meditation playback) creates its own `GainNode` connected to `ctx.destination`. Volume control is per-concern, not per-context.

**When to use:** Every audio addition. Always call `initAudio()` first inside a user gesture handler.

**Trade-offs:** All audio must coordinate on the single context. No cross-context mixing is possible — this is a hard browser constraint, not a design choice.

---

## Anti-Patterns

### Anti-Pattern 1: Adding Mode Branching to practice.js

**What people do:** Add `if (sessionMode === 'pre-sleep') { ... }` throughout `practice.js`.

**Why it's wrong:** `practice.js` is 683 lines and already at the monolith size limit. Mode-specific branches buried in an existing controller become hard to reason about and test. Pre-sleep has genuinely different behavior: no pace controller, different audio scheduling, potentially no tuning.

**Do this instead:** Create `preSleep.js` as a peer controller alongside `practice.js`.

### Anti-Pattern 2: Creating a Second AudioContext for Meditation Audio

**What people do:** `const ctx = new AudioContext()` inside `meditationAudio.js` to avoid coupling to `audio.js`.

**Why it's wrong:** Chrome enforces an AudioContext limit per page (typically 6, but the practical constraint is that mixing audio from two separate contexts is architecturally impossible — you cannot connect nodes across contexts). Pre-existing bowl pacer audio would become unmixable with meditation audio.

**Do this instead:** Export `getAudioContext()` from `audio.js`. Call `initAudio()` to ensure the context exists and is running, then `getAudioContext()` to get the reference.

### Anti-Pattern 3: Storing Audio Blobs in localStorage

**What people do:** `localStorage.setItem('audioFile', btoa(arrayBuffer))`.

**Why it's wrong:** localStorage quota is 5-10MB. A single 20-minute guided meditation at 128kbps MP3 is ~18MB. The write will silently fail or throw a quota error.

**Do this instead:** IndexedDB handles binary blobs natively without serialization and supports hundreds of MB. The new `audioFiles` object store in storage.js is the right place.

### Anti-Pattern 4: Calling updateSonification from the rAF Loop

**What people do:** Update sonification pitch inside `renderer.js`'s 60fps animation loop.

**Why it's wrong:** `phaseLockScore` updates at 1Hz. Calling `setTargetAtTime` at 60fps creates 60 redundant scheduled automation events per second with no effect. It adds unnecessary work on the audio scheduler thread.

**Do this instead:** Call `updateSonification()` inside the 1-second DSP tick interval in each session controller, exactly where `phaseLockTrace.push()` already lives.

---

## Integration Points

### External Services

| Service | Integration | Notes |
|---------|-------------|-------|
| Web Audio API | Single AudioContext in `audio.js`, shared via `getAudioContext()` | All audio nodes must be created from this context |
| IndexedDB (idb v8) | `storage.js` abstraction, DB_VERSION bump to 2 for audioFiles store | Upgrade callback must handle both v1 and v2 migrations |
| File API | `meditationAudio.js` reads `File` objects from `<input type="file">` | No server involvement — purely client-side |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `preSleep.js` ↔ `audio.js` | Direct calls: `setIERatio()`, `startPacer()`, `stopPacer()`, sonification functions | Call `setIERatio` before `startPacer` |
| `meditation.js` ↔ `meditationAudio.js` | Direct calls: `load()`, `play()`, `stop()`, `pause()` | `meditationAudio` writes AppState for position/duration/playing |
| `meditationAudio.js` ↔ `audio.js` | Direct calls: `initAudio()`, `getAudioContext()` | Must be in user gesture chain |
| `meditation.js` ↔ `storage.js` | `listAudioFiles()`, `getAudioFile(id)` | Async — await before playback |
| All session controllers ↔ `audio.js` | `startSonification()`, `updateSonification(score)`, `stopSonification()` | `updateSonification` in 1s tick, not rAF |
| `main.js` ↔ new controllers | `initPreSleepUI()`, `initMeditationUI()` in `init()` | Same pattern as `initPracticeUI()` |
| `dashboard.js` ↔ new session data | `querySessions()` already returns all modes | Dashboard needs `mode` field filtering to render pre-sleep and meditation entries meaningfully |

---

## Sources

- Direct codebase analysis: `js/audio.js`, `js/practice.js`, `js/state.js`, `js/main.js`, `js/renderer.js`, `js/phaseLock.js`, `js/paceController.js`, `js/storage.js`, `js/dsp.js`, `index.html`
- Web Audio API single-context constraint: HIGH confidence — MDN Web Audio API spec, confirmed by browser behavior
- IndexedDB blob storage capacity vs localStorage limits: HIGH confidence — well-established browser storage constraints
- `setTargetAtTime` for smooth audio parameter automation: HIGH confidence — Web Audio API spec, standard practice

---

*Architecture research for: ResonanceHRV v1.3 session modes and audio features*
*Researched: 2026-04-06*
