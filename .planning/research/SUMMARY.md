# Project Research Summary

**Project:** ResonanceHRV v1.3 — Session Modes and Eyes-Closed Training
**Domain:** Real-time HRV biofeedback web app (Vanilla JS, Desktop Chrome, Garmin + Muse-S BLE)
**Researched:** 2026-04-06
**Confidence:** HIGH for stack and architecture (direct codebase analysis + MDN verified); MEDIUM for features (competitor analysis + peer-reviewed literature); MEDIUM for some pitfall edge cases

## Executive Summary

ResonanceHRV v1.3 adds three new capability areas to an already-working biofeedback app: a pre-sleep mode with adjustable I:E ratio breathing, a meditation mode with guided audio playback and passive HRV/EEG monitoring, and phase lock audio sonification for eyes-closed biofeedback across all modes. The existing stack (Vanilla JS, Web Audio API, Canvas, Web Bluetooth, IndexedDB, fft.js, idb) covers 90% of what v1.3 needs — no new libraries, no build tooling changes. All new capabilities are purely additive extensions of the existing architecture.

The recommended approach is to build v1.3 in strict dependency order: establish the session mode selector with a global session lock first, then refactor the audio routing layer to add independent GainNodes for pacer, meditation, and sonification, then implement pre-sleep mode, then meditation mode file management, then meditation mode itself, then sonification. This order matters because every new audio feature depends on the routing refactor, and every mode depends on the session mode selector's global lock. Skipping the upfront groundwork and building features in parallel will produce audio routing conflicts and session state corruption that are expensive to unwind.

The primary risks are architectural, not algorithmic. The existing audio system has a single `_masterGain` that must be refactored to support independent volume control before any new audio feature ships. The IndexedDB schema must be migrated to version 2 to add the `audioFiles` store, and this migration must preserve existing session data. The meditation mode DSP tick must branch away from phase lock computation and pace controller calls — running them during unguided breathing produces meaningless data that corrupts the session history. All three are solved problems with known approaches; the risk is execution discipline, not technical uncertainty.

## Key Findings

### Recommended Stack

The v1.3 additions require zero new libraries. The existing Web Audio API covers everything: `AudioBufferSourceNode` + `decodeAudioData` for meditation audio playback, `FileReader.readAsArrayBuffer` for user file uploads, and a persistent `OscillatorNode` with `exponentialRampToValueAtTime` for phase lock sonification. The `idb` library already in the stack handles audio blob persistence in IndexedDB. The only structural addition is exposing `getAudioContext()` from `audio.js` so `meditationAudio.js` can share the single AudioContext — a one-line change.

**Core technologies:**
- Web Audio API (existing, extend): Three independent `GainNode` instances (bowl pacer, meditation, sonification); `AudioBufferSourceNode` for meditation playback; persistent `OscillatorNode` for sonification; `exponentialRampToValueAtTime` for click-free pitch transitions
- File API / FileReader (browser built-in): `readAsArrayBuffer()` → `decodeAudioData()` — canonical browser pattern for user audio upload; no library needed
- IndexedDB / idb v8.0.3 (existing, extend): Bump `DB_VERSION` to 2; add `audioFiles` object store for user-uploaded audio blobs; existing `sessions` store untouched
- Canvas 2D API (existing, modify): Pacer circle animation must read `AppState.currentPhaseDuration` (asymmetric phases) instead of computing a symmetric half-period

**Critical API constraints:**
- `AudioBufferSourceNode` is single-use — cache the decoded `AudioBuffer`, create a new source node per play
- `decodeAudioData()` detaches its `ArrayBuffer` argument — store a copy in IndexedDB before decoding
- `exponentialRampToValueAtTime` is mandatory for pitch transitions — linear ramps sound unnatural because hearing is logarithmic
- `navigator.storage.persist()` must be called on first audio upload to prevent LRU eviction of the entire IndexedDB origin
- One `AudioContext` per page is a hard browser constraint — never create a second context for meditation audio

### Expected Features

The three new modes are well-differentiated from all known competitors. No consumer or clinical app currently combines adaptive pace control with extended I:E ratios (pre-sleep), HRV + EEG passive monitoring during guided meditation in a single browser tool (meditation mode), or trend-based audio biofeedback for eyes-closed training (sonification). These are genuine market gaps.

**Must have (table stakes — v1.3 launch):**
- Session mode selector (standard / pre-sleep / meditation) with global session lock — prerequisite for all other features
- Pre-sleep mode: adjustable I:E ratio (default 1:2), asymmetric pacer audio with correctly scaled echo subdivisions, elapsed timer only (no countdown), mode label in session record
- Pre-sleep mode: adaptive pace controller preserves I:E ratio during period adjustments
- Meditation mode: built-in audio playback (minimum one script — body scan), passive HRV + neural calm monitoring, post-session physiological report, bowl pacer suppressed during audio
- Meditation mode: user-uploaded audio via File API (load from file, no caching required for MVP)
- Phase lock sonification: trend-based tone (pitch direction encodes improving vs. degrading phase lock, updated every 5–10s), on/off toggle per session

**Should have (competitive differentiators):**
- Pre-sleep adaptive controller combined with 1:2 I:E — no competitor offers this combination
- Yoga nidra / body scan scripts purpose-built for injury recovery and sleep difficulty — unique content angle vs. generic mindfulness
- Trend-based sonification (pitch encodes direction of change, not raw score) — per Audio Mostly 2024 research, more effective than direct mapping; no consumer app implements this

**Defer to v1.3.x / v2+:**
- Additional built-in meditation scripts (yoga nidra, loving-kindness) — trigger: body scan validated
- Dashboard mode-filtered trend view — trigger: enough pre-sleep sessions accumulated
- Persistent user audio via IndexedDB ArrayBuffer caching — trigger: user re-uploads the same file repeatedly
- Multiple I:E ratio presets (4:7:8 with pause, cyclic sigh) — trigger: clinical protocol requires it
- Sonification volume control slider — trigger: default level found intrusive

**Anti-features to reject regardless of user requests:**
- Continuous raw phase lock sonification (raw score is too noisy; produces anxiety-inducing rapid pitch changes — confirmed by Audio Mostly 2024)
- Bowl pacer active during guided meditation audio (audio collision; both streams become unusable)
- Loading meditation audio from external URLs (CORS blocks cross-origin audio fetch; contradicts local-only architecture)
- Second `AudioContext` for meditation audio (cannot mix audio across contexts — hard browser constraint)
- Storing audio blobs in localStorage (5–10MB quota; a 20-minute MP3 is ~18MB)

### Architecture Approach

The app follows a session-controller-as-mode-monolith pattern: each session mode is a self-contained module owning its full lifecycle (start, DSP tick, audio, rendering, summary, save). Shared services (`audio.js`, `dsp.js`, `renderer.js`, `storage.js`) are called via public APIs. v1.3 adds two new controller files (`preSleep.js`, `meditation.js`), one new audio engine (`meditationAudio.js`), and one config file (`meditationLibrary.js`). The existing `practice.js`, `discovery.js`, `dsp.js`, `phaseLock.js`, `paceController.js`, and device adapters are entirely untouched.

**Component changes:**
1. `state.js` (MODIFY) — Add `sessionMode`, `ieRatio`, `currentPhaseDuration`, `meditationPlaying/Duration/Position/AudioId`, `sonificationEnabled/Volume`, `activeSessionModule`
2. `audio.js` (MODIFY) — Add `setIERatio()`, asymmetric scheduler, `getAudioContext()`, `startSonification()`, `updateSonification()`, `stopSonification()`, `setSonificationVolume()`, separate `_meditationGain` and `_sonificationGain` nodes
3. `storage.js` (MODIFY) — Bump `DB_VERSION` to 2; add `audioFiles` object store; export `saveAudioFile`, `getAudioFile`, `deleteAudioFile`, `listAudioFiles`
4. `renderer.js` (MODIFY) — Pacer circle reads `AppState.currentPhaseDuration` for asymmetric phase timing
5. `js/preSleep.js` (NEW) — Pre-sleep session controller; I:E ratio wiring; no pace controller; saves `mode:'pre-sleep'`
6. `js/meditation.js` (NEW) — Meditation session controller; no pacer; passive DSP tick; post-session report
7. `js/meditationAudio.js` (NEW) — Guided audio playback engine using shared AudioContext
8. `js/meditationLibrary.js` (NEW) — Static index of built-in audio scripts `{id, title, duration, file}`
9. `audio/` (NEW) — Directory of built-in guided audio files served locally as MP3

**Key patterns that must be followed:**
- One AudioContext, multiple GainNodes (bowl, meditation, sonification) — never create a second AudioContext
- AppState is the only inter-module data channel — modules never import siblings to read data
- Call `updateSonification()` in the 1-second DSP tick, never in the 60fps rAF loop
- Session controllers are mode monoliths — do not add `if (mode === 'x')` branches inside `practice.js`
- Decode `AudioBuffer` once per file and cache in a module-level Map keyed by file ID

### Critical Pitfalls

1. **No global session lock before building any mode** — Without `AppState.activeSessionModule`, switching modes with an active session runs two DSP intervals simultaneously, mixing trace data from two physiological states into one session record. Add the lock to AppState and check it in every mode start function before building any mode-specific UI.

2. **Asymmetric I:E breaks the audio scheduler and pacer circle in non-obvious ways** — Echo subdivisions use `halfPeriod / (ECHO_COUNT + 1)`, assuming 50/50 split. At 1:2, echoes cluster in the short inhale and spread too thin on the exhale. The pacer circle animation has the same hardcoded assumption. The phase lock synthetic pacer sine must also update to asymmetric timing or phase lock scores become meaningless in pre-sleep mode. Parameterize scheduler with `inhaleSeconds`/`exhaleSeconds`, not `halfPeriod`; update renderer and phase lock pacer signal together.

3. **IndexedDB migration can silently delete all session history** — The tutorial pattern of "delete and recreate object stores" during `onupgradeneeded` drops all user data. Only add new stores, never delete existing ones; guard with `if (!db.objectStoreNames.contains('audioFiles'))`; test by seeding data at v1 then loading v2 code.

4. **Meditation DSP tick must branch — running phase lock during unguided breathing corrupts session data** — `phaseLock.js` generates a synthetic pacer sine at `AppState.pacingFreq`; during free breathing this produces meaninglessly low/random scores that get saved in the session summary. The pace controller also fires mutations on `pacingFreq`. Meditation DSP tick must skip `computePhaseLockScore()` and `paceControllerTick()` entirely and set `phaseLockScore: null`.

5. **Audio routing refactor must happen before any new audio feature ships** — Routing meditation audio or sonification through the existing `_masterGain` means the pacer volume slider controls all three streams simultaneously. Add `_meditationGain` and `_sonificationGain` nodes connecting directly to `ctx.destination`; expose independent volume setters. This is a prerequisite for both meditation mode and sonification.

6. **Large audio file decode blocks session start** — `decodeAudioData` on a 30-minute MP3 can take 2–5 seconds. Decoding on every session start causes a multi-second freeze. Cache the decoded `AudioBuffer` in a module-level Map keyed by file ID; decode once per file, reuse on subsequent plays.

## Implications for Roadmap

Research reveals a clear dependency chain that dictates phase order. The session mode selector and audio routing refactor are infrastructure, not features — every v1.3 feature depends on them. Building them last is the most common mistake in feature-extension projects.

### Phase 1: Session Mode Selector + Global Session Lock
**Rationale:** Every subsequent phase depends on this. The mode selector is the entry point for pre-sleep and meditation. The global session lock (`AppState.activeSessionModule`) prevents the most critical pitfall (state accumulation from overlapping sessions) and must exist before any mode is coded. The full UI state machine (`{mode} × {view}` = 9 combinations) should be defined here with a single `_updatePracticeView(mode, view)` function — not discovered incrementally as each mode ships.
**Delivers:** Mode selector UI (standard / pre-sleep / meditation tabs); global session guard in AppState; tab-switching confirmation dialog when session is active; skeletal placeholder states for each new mode
**Addresses:** Session mode selector (P1 prerequisite)
**Avoids:** Pitfall 1 (session accumulation), Pitfall 10 (UI state machine chaos with 9 combinations)

### Phase 2: Audio Routing Refactor
**Rationale:** Infrastructure that meditation mode, pre-sleep mode, and sonification all require. Doing it after any of those features are built means rewiring live audio paths under a dependent feature. The refactor is low-complexity (add two GainNodes, expose two volume setters) but high-leverage — getting it wrong means every subsequent audio feature inherits the wrong architecture.
**Delivers:** Three independent audio buses (bowl pacer, meditation, sonification) with independent GainNode volume control; `getAudioContext()` export from `audio.js`; two independent volume sliders scaffolded in session UI
**Uses:** Web Audio API GainNode routing (existing API, configuration change only)
**Implements:** "One AudioContext, multiple GainNodes" architectural pattern from ARCHITECTURE.md
**Avoids:** Pitfall 5 (gain routing collision), Pitfall 6 (sonification oscillator in wrong gain path)

### Phase 3: Pre-Sleep Mode
**Rationale:** Simpler of the two new modes — reuses the existing pacer, DSP tick, and pace controller with one key change (asymmetric I:E scheduling). Does not require audio file loading, new IndexedDB stores, or passive monitoring branching. Building before meditation mode validates the mode selector and audio routing refactor against a real feature before adding file management complexity.
**Delivers:** Pre-sleep session controller (`preSleep.js`); asymmetric I:E pacer scheduler in `audio.js`; updated pacer circle animation in `renderer.js`; bowl echo subdivisions scaled to asymmetric phases; I:E ratio picker UI; elapsed-only timer; session records with `mode:'pre-sleep'` and `ieRatio` metadata; adaptive controller updated to preserve I:E ratio during period changes
**Addresses:** Pre-sleep I:E ratio control, pacer refactor, adaptive controller I:E preservation, elapsed timer, mode label (all P1)
**Avoids:** Pitfall 2 (asymmetric scheduler breakage) — requires auditing all three downstream consumers of `halfPeriod` together (audio scheduler, renderer, phase lock pacer sine)

### Phase 4: User File Management + IndexedDB Migration
**Rationale:** Meditation mode requires audio file storage before it can be built. The IndexedDB migration (`DB_VERSION` 2, `audioFiles` store) is the riskiest data operation in v1.3 — it must be done in its own phase, explicitly tested against existing session data, before any file upload UI is layered on top.
**Delivers:** `DB_VERSION` bump to 2; `audioFiles` IndexedDB object store; `saveAudioFile`, `getAudioFile`, `deleteAudioFile`, `listAudioFiles` in `storage.js`; File API upload handler; basic file library UI (list, delete, size display); `navigator.storage.persist()` on first upload; `navigator.storage.estimate()` quota check on startup
**Uses:** idb v8.0.3 `put(storeName, arrayBuffer, key)` for binary blob storage; File API `FileReader.readAsArrayBuffer`
**Avoids:** Pitfall 3 (DB migration deletes session history), Pitfall 4 (blob accumulation and quota exhaustion without user-visible size tracking and delete capability)

### Phase 5: Meditation Mode
**Rationale:** By Phase 5, all prerequisites are complete: mode selector, audio routing, and file storage. Meditation mode can now be built cleanly — passive DSP tick branching, `AudioBufferSourceNode` playback, decoded `AudioBuffer` caching, post-session report — without foundational infrastructure concerns.
**Delivers:** Meditation session controller (`meditation.js`); `meditationAudio.js` playback engine; `meditationLibrary.js` with at least one built-in body scan script; audio file in `/audio/`; passive HRV + neural calm monitoring (phase lock and pace controller skipped); post-session physiological report; EEG headphone artifact disclosure note in setup UI; decoded `AudioBuffer` cache (module-level Map keyed by file ID)
**Addresses:** Meditation mode built-in audio, passive monitoring, post-session report, user-uploaded audio, no pacer during meditation (all P1)
**Avoids:** Pitfall 7 (large file decode freeze — cache required before any 20+ minute file), Pitfall 8 (DSP contamination — branch tick before first session save), Pitfall 9 (EEG headphone disclosure — add to setup UI copy)

### Phase 6: Phase Lock Audio Sonification
**Rationale:** Sonification depends on the audio routing refactor (Phase 2) and benefits from having all three modes complete so it can be tested across every context. The trend-based design (update every 5–10s, encode direction not raw value) is a deliberate departure from the simpler raw-mapping approach and requires empirical tuning — it should be the last feature added, not the first tested.
**Delivers:** Persistent `OscillatorNode` sonification in `audio.js` (`startSonification`, `updateSonification`, `stopSonification`); trend-based pitch mapping (5–10s update interval, pitch direction encodes delta over 10s window, not raw score); `AppState.sonificationEnabled` toggle per session; sonification called from each session controller's DSP tick; smooth `exponentialRampToValueAtTime` pitch transitions (2-second ramp, no audible clicks)
**Addresses:** Phase lock sonification with trend-based design and on/off toggle (P1)
**Avoids:** Pitfall 6 (sonification in wrong gain path — requires Phase 2 complete); anti-feature "continuous raw score sonification" explicitly rejected per Audio Mostly 2024 findings

### Phase Ordering Rationale

- Phases 1–2 are infrastructure with no user-facing deliverable on their own, but every subsequent phase fails without them. This is the standard prerequisite pattern for feature-extension projects.
- Phase 3 (pre-sleep) before Phase 5 (meditation) because pre-sleep validates the audio scheduler refactor with a simpler test case before the more complex audio file loading is introduced.
- Phase 4 (file management) is isolated before Phase 5 because the IndexedDB migration carries data-loss risk and needs its own test window without the pressure of a half-built meditation mode depending on it.
- Phase 6 (sonification) last because it integrates across all three modes — testing it last ensures all mode contexts exist for cross-mode validation.

### Research Flags

Phases needing careful verification during implementation (patterns are known; execution discipline is the risk):

- **Phase 2 (Audio Routing):** Verify the GainNode refactor does not change existing bowl pacer behavior. All existing audio paths must be regression-tested before any new mode depends on the new routing structure.
- **Phase 3 (Pre-Sleep):** The asymmetric scheduler change has three downstream consumers that must be updated atomically: `_schedulerTick` in `audio.js`, the pacer circle animation in `renderer.js`, and the synthetic pacer sine in `phaseLock.js`. Updating any one without the others produces a silent failure where the session looks correct but phase lock scores are systematically wrong at 1:2 ratio.
- **Phase 4 (File Management):** The IndexedDB v1→v2 migration must be tested with real seeded data (not a fresh browser) before this phase is considered done.
- **Phase 5 (Meditation):** The DSP tick branching must be verified by watching `AppState.pacingFreq` during a live meditation session — it should never change. This is the type of bug that does not appear in code review, only in a running session.

Phases with standard patterns (implementation is straightforward, lower verification burden):
- **Phase 1 (Mode Selector):** Standard UI state machine; show/hide pattern. The 9-combination matrix is larger than usual but not architecturally novel.
- **Phase 6 (Sonification):** `OscillatorNode` + `exponentialRampToValueAtTime` is a documented Web Audio API pattern. Trend-based update logic (compare current to 10s-prior score) is simple arithmetic. Main risk is perceptual tuning of frequency range and update interval, not implementation correctness.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All API choices verified against MDN + Chrome docs; no new libraries introduced; codebase already uses the relevant APIs in adjacent ways |
| Features | MEDIUM | Competitor analysis from product pages only (not internal implementations); sonification design backed by two peer-reviewed papers; I:E ratio clinical evidence is mixed per 2024 PMC study |
| Architecture | HIGH | Based on direct codebase analysis of all relevant source files; integration points are explicit and verified against actual module structure |
| Pitfalls | HIGH for Web Audio API and IndexedDB behaviors (MDN + W3C confirmed); MEDIUM for I:E ratio audio cue alignment specifics (not yet tested in this codebase); LOW for EEG headphone artifact quantification |

**Overall confidence:** HIGH for technical implementation; MEDIUM for clinical and perceptual outcomes

### Gaps to Address

- **Phase lock scoring validity at 1:2 I:E ratio:** The phase lock score is computed against a synthetic pacer sine at `AppState.pacingFreq`. In pre-sleep mode with asymmetric phases, the synthetic sine must also be asymmetric or phase lock scores will be systematically low during extended exhale. Verify empirically during Phase 3 by comparing phase lock scores at 1:1 vs. 1:2 with controlled breathing.

- **Extended exhale HRV benefit is not guaranteed:** A 2024 PMC study found mixed evidence for whether longer exhalations specifically increase HRV during slow-paced breathing. Pre-sleep mode should be framed as "sleep-preparation breathing practice" without claiming superior HRV benefit vs. standard mode. The post-session report should show HRV trend without implying causation from the I:E ratio.

- **Sonification perceptual calibration requires empirical testing:** The frequency mapping formula and 5–10s update interval are research-informed starting points, not validated parameters for this specific application. The "looks done but sounds wrong" risk is real — the sonification design needs a live user workflow test (breathing through a session eyes-closed, adjusting phase lock score deliberately, verifying pitch changes are perceptible and not anxiety-inducing) before it ships.

- **Yoga nidra content creation is not an engineering task:** The yoga nidra script is listed as a P2 feature but requires 30–40 minutes of recorded audio content creation. This should be explicitly scoped and assigned before the roadmap places it in a phase — it has no implementation dependency on any other phase but does have a production timeline of its own.

## Sources

### Primary (HIGH confidence)
- MDN Web Docs — AudioBufferSourceNode, decodeAudioData, OscillatorNode, AudioParam scheduling methods, FileReader, Web Audio API best practices
- MDN Web Docs — IndexedDB Using IndexedDB, onupgradeneeded pattern, Storage quotas and eviction criteria, URL.createObjectURL and revokeObjectURL
- Chrome Developers — Audio Worklet available by default; Autoplay policy; Web Bluetooth API
- Direct codebase analysis — `js/audio.js`, `js/practice.js`, `js/state.js`, `js/main.js`, `js/renderer.js`, `js/phaseLock.js`, `js/paceController.js`, `js/storage.js`, `js/dsp.js`, `index.html`
- GitHub: jakearchibald/idb v8.0.3 — binary blob storage via `put(storeName, arrayBuffer, key)`

### Secondary (MEDIUM confidence)
- Audio Mostly 2024 — Comparing Trend-Based and Direct HRV Biofeedback in an Adaptive Game Environment (peer-reviewed; trend-based sonification superior to direct mapping)
- Unwind 2018 — A Musical Biofeedback for Relaxation Assistance (peer-reviewed; sonification design principles)
- PMC — The Relaxation Effect of Prolonged Expiratory Breathing (peer-reviewed; extended exhale autonomic effects confirmed)
- PMC — Do Longer Exhalations Increase HRV During Slow-Paced Breathing? (peer-reviewed; mixed findings — extended exhale alone does not consistently increase HRV)
- RxDB — IndexedDB Max Storage Limit (Chrome LRU eviction behavior; navigator.storage.estimate best practice)
- HRV4Biofeedback, Elite HRV, Muse, OptimalHRV — product pages (competitor feature analysis; I:E ratio presets)

### Tertiary (LOW confidence)
- Academia.edu — Sonification of Autonomic Rhythms in the Frequency Spectrum of HRV (MIDI-based reference; Web Audio approach derived from same principles)
- Elephant Journal — Yoga Nidra Script Length and Structure (content planning reference only; not a clinical source)
- Bitbrain — EEG Artifacts (general reference for headphone artifact discussion; not Muse-S specific)

---
*Research completed: 2026-04-06*
*Ready for roadmap: yes*
