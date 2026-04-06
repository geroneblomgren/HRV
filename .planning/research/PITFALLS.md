# Pitfalls Research

**Domain:** HRV biofeedback web app — v1.3 session modes, meditation audio, user file management, phase lock sonification
**Researched:** 2026-04-06
**Confidence:** HIGH for Web Audio API behavior (MDN + W3C confirmed); HIGH for IndexedDB schema migration (MDN + spec confirmed); MEDIUM for I:E ratio audio cue timing (research literature, not directly tested in this codebase); LOW for EEG/audio cross-contamination specifics in Muse-S context (general literature only)

> **Note:** This file supersedes the 2026-03-21 PITFALLS.md (v1.0–v1.2 concerns). Those pitfalls are resolved and shipped. This file covers pitfalls specific to adding v1.3 features to the existing system. The old file is archived in git history.

---

## Critical Pitfalls

### Pitfall 1: Old Session Not Stopped Before New Mode Starts — State Accumulation

**What goes wrong:**
`practice.js` uses a module-level `_active` flag and several trace arrays (`_phaseLockTrace`, `_coherenceTrace`, etc.) that persist across calls. The existing guard `if (_active) return` in `startPractice()` prevents double-starts within one mode. When session modes are added — pre-sleep, meditation — each likely becomes its own module or a branch within practice.js. If any code path starts a new mode without first calling `stopPractice()` (or the equivalent stop for the active mode), the old DSP interval, pacer scheduler, and trace arrays continue running silently. The new session's trace gets mixed with the tail of the previous one. The saved session record spans both.

**Why it happens:**
The mode selector UI fires a "switch to meditation" action without checking whether a session is already active. Or the user navigates away from the practice tab mid-session without ending it, then starts a meditation session from the new tab.

**How to avoid:**
Add a single global session lock to `AppState` (e.g., `activeSessionModule: null | 'practice' | 'pre-sleep' | 'meditation'`). Every mode's start function checks this field first and either refuses to start or calls the active module's stop function. Tab switching in `main.js` should also check and warn ("A session is in progress. End it before switching modes?"). Do not rely on individual module `_active` flags to coordinate between modules — they are module-private.

**Warning signs:**
Session traces are longer than the selected duration. Summary metrics appear averaged across two distinct physiological states. The DSP interval fires during a "stopped" session (check via console log).

**Phase to address:**
Session mode selector phase — before any new mode is implemented. This is a cross-cutting concern that must be established first.

---

### Pitfall 2: Asymmetric I:E Ratio Breaks the Existing Audio Scheduler and Pacer Circle

**What goes wrong:**
The current audio scheduler in `audio.js` assumes equal inhale and exhale durations: `halfPeriod = 1 / (pacingFreq * 2)`. Pre-sleep mode requires a 1:2 I:E ratio (or adjustable), meaning inhale = 1/3 of the breath cycle and exhale = 2/3. The existing scheduler fires identical half-period intervals for both phases and the renderer's circle animation (`renderer.js`) uses the same `halfPeriod` for both expansion and contraction arcs. Adding a ratio flag and changing only one half's duration without updating the echo subdivision timing, the pacer circle arc, and the visual sync will produce audio cues and visuals that are misaligned and desynchronized.

Specifically: the echo subdivisions in `_scheduleCue` divide `halfPeriod / (ECHO_COUNT + 1)` equally. With a 1:2 I:E ratio, the exhale half-period is twice the inhale half-period. The three echoes that worked at equal durations now either crowd the shorter inhale phase or spread too thin in the longer exhale phase.

**Why it happens:**
The ratio=1:1 assumption is baked into constants, not into a parameter. It is easy to add a `pacingFreq` change without auditing everything downstream of `halfPeriod`.

**How to avoid:**
Parameterize the scheduler with separate `inhaleSeconds` and `exhaleSeconds` rather than a single `halfPeriod`. Pass these to `_scheduleCue`, which schedules the echo interval as `phaseDuration / (ECHO_COUNT + 1)` per phase. Update the renderer's circle animation to accept asymmetric arc durations. Update `AppState` with `inhaleRatio` and `exhaleRatio` fields. Default both to 0.5 (existing 1:1 behavior) so pre-existing practice mode is unaffected.

**Warning signs:**
Echoes cluster at the start of a long exhale. The visual circle does not expand and contract at the correct ratio. The phase lock score drops in pre-sleep mode because the pacer signal generated in `phaseLock.js` still uses a symmetric sine but the actual breath cycle is asymmetric — the phase lock synthetic pacer must also be updated to use the asymmetric waveform if the score is to remain meaningful.

**Phase to address:**
Pre-sleep mode implementation phase — audio scheduler must be audited before any UI is built on top of it.

---

### Pitfall 3: IndexedDB DB_VERSION Must Be Bumped to Add the Audio Files Store — Existing Sessions Are at Risk

**What goes wrong:**
`storage.js` currently opens the database at `DB_VERSION = 1`. Adding a new `audioFiles` object store to persist user-uploaded meditation audio requires bumping `DB_VERSION` to 2 and handling the upgrade in `onupgradeneeded`. The `idb` library's `upgrade()` callback receives the old database version and the new version, allowing conditional migration. If the version is not bumped, the new store never gets created — `_db.transaction('audioFiles', ...)` throws a DOMException ("The operation failed because the requested database object could not be found").

A more dangerous mistake: deleting and recreating the `sessions` object store during the upgrade (e.g., to add an index or change the schema) drops all existing session history. The user's phase lock trends, RSA amplitude history, and neural calm traces from v1.0–v1.2 are permanently gone.

**Why it happens:**
The upgrade path is only tested on a fresh browser — existing data is never present in CI or dev testing because the developer just cleared their browser before testing. The destructive pattern (delete old store, create new) appears in IndexedDB tutorials as the way to change an object store schema.

**How to avoid:**
Only add new stores in the upgrade callback — never delete or recreate `sessions`. The `sessions` store schema is append-compatible: new fields on session records are simply absent in old records, and queries that expect them must handle `undefined`. To add the `audioFiles` store: bump to `DB_VERSION = 2`, add `if (!db.objectStoreNames.contains('audioFiles'))` guard, create the store. The existing `sessions`, `settings`, and `oura` stores are untouched. Test the upgrade by: (1) loading the app at v1 to seed data, (2) deploying the v2 code, (3) reloading and verifying existing sessions are intact.

**Warning signs:**
Console: "The database connection is closing" or "NotFoundError: The operation failed because the requested database object could not be found." Dashboard shows zero sessions after a code update that touched `storage.js`. `DB_VERSION` was changed without an `onupgradeneeded` handler that preserves existing stores.

**Phase to address:**
User file management phase — specifically the first commit that touches `DB_VERSION`.

---

### Pitfall 4: User-Uploaded Audio Files Stored as Blobs in IndexedDB Are Not Cleaned Up

**What goes wrong:**
Storing audio file blobs in IndexedDB (the correct approach for persistent user uploads in a local app) accumulates storage over time. A 30-minute yoga nidra MP3 at 128 kbps is ~28 MB. Five uploaded files occupy 140 MB of the browser's storage quota. Chrome's IndexedDB quota is typically 60% of available disk space, but Chrome uses an LRU eviction policy under low-disk conditions — it can delete the entire origin's database (sessions + settings + audio files) without warning, not just the largest objects. The user loses both their uploaded audio and their session history simultaneously.

A secondary issue: when displaying a user's uploaded audio file in an `<audio>` element for preview, creating a blob URL via `URL.createObjectURL(blob)` and never calling `URL.revokeObjectURL()` leaks memory. Over a long session with repeated audio preview interactions, this accumulates.

**Why it happens:**
IndexedDB feels like a database — developers don't think of it as a cache subject to eviction. Blob URLs are a transient browser concept that is easy to forget to clean up.

**How to avoid:**
Store audio file metadata (name, size, duration, upload date) as a separate lightweight record alongside the blob. Display file sizes in the library UI so the user is aware of what they have uploaded. Add a "Remove" button per file that deletes both the blob and the metadata record. For blob URLs: always revoke immediately after the `<audio>` element has loaded the source (listen for the `loadeddata` event before revoking). Add a quota check via `navigator.storage.estimate()` on app startup; warn the user if less than 200 MB is available. Do not use `URL.createObjectURL` for long-lived audio playback — instead, read the blob and pass it to `decodeAudioData()` to decode into an `AudioBuffer` that the Web Audio API manages.

**Warning signs:**
Chrome shows "Storage quota exceeded" error in console. User reports uploaded audio disappeared after an OS update or disk cleanup. Memory profile in DevTools shows a growing number of `Blob` objects that are never collected.

**Phase to address:**
User file management phase — file storage and cleanup strategy must be designed before any upload UI is built.

---

### Pitfall 5: Meditation Audio Playback and the Existing AudioContext Conflict Over Gain and Routing

**What goes wrong:**
The existing `audio.js` module creates a single `AudioContext` with a `_masterGain` node. All bowl strikes and echo subdivisions route through this gain node. The master volume slider controls `_masterGain.gain`. When meditation audio is added, the instinct is to route the guided audio playback through the same `_masterGain`. This means the master volume slider (designed for the breathing pacer) now also controls the meditation audio level, and the bowl echo chimes (if present) compete with the voice-over at the same gain level.

A deeper problem: in pre-sleep mode, the bowl pacer is still running at the user's RF pace while meditation audio plays. If both connect to `_masterGain` at the same gain value (0.4), the guided audio competes with the chimes. The user's ability to hear the meditation script clearly depends on the chimes being significantly quieter. There is no separate gain bus.

**Why it happens:**
The existing module has one gain bus. Adding audio always routes to what is already there, rather than rethinking the routing graph.

**How to avoid:**
Add a separate `AudioContext` gain node for guided audio playback: a `_meditationGain` node that connects to `_masterGain` (or directly to destination). This allows independent volume control for (a) breathing pacer chimes and (b) meditation voice-over. Expose `setMeditationVolume()` alongside the existing `setVolume()`. In the session UI, show two sliders: "Pacer Volume" and "Guidance Volume." The default pacer volume during meditation should be low (0.1–0.2) and the guidance volume high (0.7–0.8). This routing change must be implemented before either meditation mode or pre-sleep mode is built on top of `audio.js`.

**Warning signs:**
The master volume slider affects both chimes and voice-over simultaneously. Guided audio is barely audible when the bowl chimes are at their default level. "Guidance Volume" and "Pacer Volume" are effectively the same control.

**Phase to address:**
Audio routing refactor — this is a prerequisite for both meditation mode and phase lock sonification. It must come first.

---

### Pitfall 6: Phase Lock Sonification Oscillator Runs in the Same Gain Path as the Breathing Pacer

**What goes wrong:**
Phase lock sonification requires a continuously running oscillator whose frequency or amplitude varies with `AppState.phaseLockScore`. The existing audio system uses fire-and-forget `OscillatorNode` instances — each bowl strike creates a new oscillator, plays it, and lets it self-terminate. A continuously running sonification oscillator is architecturally different: it must be started once at session start, updated via `AudioParam` scheduling (`frequencyParam.linearRampToValueAtTime()`), and stopped at session end.

The pitfall: routing this continuous oscillator through `_masterGain` alongside the bowl strikes means it is always audible at the same level as the pacer, regardless of what the user intends. During bowl strike transients, the oscillator will be masked by the bowl; during the inter-cue silence, it will be clearly audible. This creates an irregular sonification texture — present some of the time and masked at others — rather than a consistent biofeedback signal.

A second pitfall: scheduling rapid `AudioParam` changes on the continuous oscillator (e.g., updating frequency every second as `phaseLockScore` changes) without using `linearRampToValueAtTime()` or `setTargetAtTime()` produces audible clicks and zipper noise at each update.

**Why it happens:**
Connecting the sonification oscillator to `_masterGain` is the path of least resistance. Immediate `setValueAtTime()` calls for audio params at audio-rate intervals produce click artifacts — this is a known Web Audio pitfall but easy to miss because the clicks are brief.

**How to avoid:**
Route the sonification oscillator through its own `_sonificationGain` node (separate from `_masterGain` and `_meditationGain`). Start the oscillator once at session start; never stop and recreate it during a session. Map `phaseLockScore` to frequency using a musically meaningful range (e.g., 80–200 Hz — low drone at low lock, higher tone at high lock, or alternatively: amplitude modulation where score 0 = silence, score 100 = full volume). Use `linearRampToValueAtTime()` with a 1–2 second ramp duration so changes are smooth and perceptually continuous. Update on the 1-second DSP tick, scheduling the ramp to complete 1 second in the future. Keep the sonification volume low by default (0.05–0.1) so it acts as a background texture rather than a dominant sound.

**Warning signs:**
Audible clicks when `phaseLockScore` changes. The sonification tone is masked by bowl strikes every 6–7 seconds, creating perceptible pulsing unrelated to breathing. Master volume slider silences the sonification oscillator rather than having a dedicated control.

**Phase to address:**
Phase lock sonification phase — requires audio routing refactor (Pitfall 5) to be complete first.

---

### Pitfall 7: Guided Audio Playback Requires decodeAudioData — Large Files Block the Main Thread

**What goes wrong:**
The correct way to play user-uploaded meditation audio through the Web Audio API is: read the blob from IndexedDB → convert to `ArrayBuffer` → call `audioContext.decodeAudioData(arrayBuffer)` → store the resulting `AudioBuffer` → create a new `AudioBufferSourceNode` per playback and call `.start()`. The `decodeAudioData()` call decodes the entire audio file in one synchronous-feeling step. For a 30-minute file at 128 kbps, decoding to 44.1 kHz PCM produces approximately 156 MB of raw audio data in memory (`30 * 60 * 44100 * 2 channels * 4 bytes = ~317 MB`). This decode operation can take 2–5 seconds on a moderate CPU and blocks the main thread (in practice, browsers run it on a worker thread, but the result Promise resolution still competes with main-thread work).

An additional pitfall: `AudioBufferSourceNode` instances cannot be restarted. If the user stops a meditation session and restarts it, a new `AudioBufferSourceNode` must be created and the previously decoded `AudioBuffer` reused (not decoded again). Developers often decode on every playback, which re-decodes the entire file each time — adding a multi-second delay on every meditation start.

**Why it happens:**
`decodeAudioData` is easy to call. The "decode once, play many times with new source nodes" pattern is documented but easy to miss. The memory cost of keeping a large decoded buffer in memory is not obvious until tested.

**How to avoid:**
Cache the decoded `AudioBuffer` in a module-level Map keyed by the IndexedDB record ID. On first play: decode once, store in the cache. On subsequent plays: skip decode, reuse from cache. On session end, keep the cache (the user may restart). On page unload or explicit "clear library" action, let the cache be GC'd. For very long files (>30 min), consider only using `decodeAudioData` for shorter files (< 15 min) and using a `MediaElementSourceNode` wrapping an `<audio>` element for longer ones — this streams the file rather than loading it all into memory.

**Warning signs:**
App freezes for 2–5 seconds at meditation session start. Starting a second meditation session takes as long as the first (cache miss). DevTools memory profiler shows a large `AudioBuffer` object allocated on every session start.

**Phase to address:**
Meditation mode implementation — audio loading strategy must be decided before any playback UI is built.

---

### Pitfall 8: Passive HRV Monitoring During Meditation Shares DSP State With Active RFB Modes

**What goes wrong:**
The existing DSP tick in `practice.js` calls `tick(elapsed)` and `paceControllerTick(elapsed)` every second. `tick()` in `dsp.js` updates `AppState.coherenceScore` and `AppState.phaseLockScore`. The pace controller updates `AppState.pacingFreq`. During meditation mode, the user is not breathing at a prescribed RF pace — they are breathing freely while a guide audio plays. If the same DSP tick runs without modification, the phase lock score will report low-lock values (because there is no forced RF alignment) and the pace controller will attempt to shift the pacer frequency based on coherence — a meaningless action when no pacing is happening.

Additionally, `phaseLock.js` generates a synthetic pacer sine wave at `AppState.pacingFreq`. During free breathing in meditation mode, this frequency is still set to the last tuned RF. The phase lock score will fluctuate randomly rather than being meaningfully absent. This corrupts the session trace data and produces a misleading session report.

**Why it happens:**
The DSP tick is defined at the session level and shared across all modes. "Passive monitoring" feels like just running the existing DSP at lower intensity, but the algorithms have assumptions baked in (a known pacing frequency, an active pacer).

**How to avoid:**
In meditation mode, run a reduced DSP tick that: (1) still computes `AppState.coherenceScore` and `AppState.neuralCalm` (these are pacing-agnostic), (2) does NOT call `paceControllerTick()` (no adaptive pacing), (3) does NOT compute `phaseLockScore` (or explicitly sets it to `null` / marks it as invalid), (4) stores HR and HRV traces but labels them as `mode: 'meditation'` in the session record. The session report for meditation should show HRV trend, neural calm trend, and a qualitative relaxation score — not phase lock or coherence scores, which require prescribed breathing.

**Warning signs:**
Phase lock score appears in meditation session summaries. The pace controller shifts `AppState.pacingFreq` during a meditation session (visible in the debug console). Session records saved from meditation mode have `meanPhaseLock` fields instead of blank/null.

**Phase to address:**
Meditation mode implementation — DSP tick branching must be implemented before any session data is saved.

---

### Pitfall 9: EEG Alpha Score Contamination From Guided Audio Headphone Use

**What goes wrong:**
The Muse-S neural calm metric (`neuralCalm`) uses the TP9/TP10 temporal electrodes' alpha/beta ratio. When the user wears headphones or earbuds for meditation audio, the physical pressure of the earbud against the temporal bone can distort the alpha signal at TP9 (left temporal) and TP10 (right temporal). Additionally, the motor act of adjusting headphones or reacting to volume transitions in the audio can introduce muscle (EMG) artifacts at the temporal sites. These artifacts elevate apparent "neural calm" scores (EMG artifacts look like broadband power increases; alpha band can temporarily spike during audio-evoked relaxation response).

This is not a software bug — it is a data interpretation issue. But if the session report presents neural calm scores during meditation without noting that headphone use affects the signal, the user may over-interpret improvements in neural calm as genuine alpha increases rather than equipment-induced artifacts.

**Why it happens:**
The app has no awareness of whether the user is wearing headphones. The EEG signal processing has no headphone-artifact detection.

**How to avoid:**
In the meditation mode setup UI, show a brief note: "For accurate neural calm tracking, use open-back headphones or speakers rather than in-ear earbuds." Consider showing a badge on the post-meditation neural calm metric: "EEG accuracy lower with in-ear headphones." This is a documentation/UX concern rather than an algorithm fix. Do not attempt to automatically detect or correct for this — it is outside the app's sensor access.

**Warning signs:**
Neural calm scores consistently higher in meditation mode than in practice mode, even when the user reports feeling equally calm. High baseline variance in `neuralCalm` readings at the start of meditation sessions coinciding with headphone adjustment.

**Phase to address:**
Meditation mode implementation — add to the setup UI copy before launch.

---

### Pitfall 10: Session Mode Selector Creates a New Category of "Looks Complete But Isn't" UI State

**What goes wrong:**
Adding a mode selector (standard, pre-sleep, meditation) to the practice tab requires new UI state that the existing show/hide logic was not designed for. The current practice tab has three states: `placeholder → session-viz → summary`. Adding modes multiplies this: each mode may have its own placeholder, its own session-viz layout, and its own summary. The risk is a partial implementation where, for example: selecting "pre-sleep" mode shows the standard practice placeholder (because the pre-sleep placeholder wasn't wired), or ending a meditation session shows the practice summary (because `_showSummary()` is called without mode awareness). The UI "looks done" in the happy path but breaks in mode-switching edge cases.

A secondary problem: the duration picker behavior differs by mode. Pre-sleep sessions should default to 20–30 min; meditation sessions might be fixed to the audio file duration. If the duration picker is not hidden or disabled in meditation mode, the user can set a duration that conflicts with the audio file length.

**Why it happens:**
The happy-path test always starts with the right mode and ends normally. Cross-mode state is only visible when switching modes or abandoning a session.

**How to avoid:**
Define the complete state machine for the practice tab before building any new mode UI. States: `{mode: 'standard|pre-sleep|meditation'} × {view: 'placeholder|active|summary'}` = 9 combinations, each with defined show/hide rules. Build a single `_updatePracticeView(mode, view)` function in practice.js that applies the correct visibility for all combinations. Write transition tests: start standard → switch to meditation → verify standard placeholder hidden. End meditation → verify meditation summary shown (not practice summary).

**Warning signs:**
Pre-sleep session ends and shows "Phase Lock" as the primary summary metric (it should show HRV trend and sleep-readiness indicators). Duration picker is visible during a meditation session that has a fixed audio length. Switching mode tabs mid-session does not ask the user to confirm ending the current session.

**Phase to address:**
Session mode selector phase — the state machine definition must precede any mode-specific UI work.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Route meditation audio through existing `_masterGain` | Zero new code in audio.js | Master volume slider controls both pacer and voice — user cannot independently balance them; guidance is masked by chimes | Never — gain routing must be separate from the start |
| Skip DB_VERSION bump, create audioFiles store inline | Avoids migration complexity | Store is never created; first file upload silently fails | Never — version bump is mandatory for new stores |
| Use `setInterval` timer for sonification oscillator frequency updates | Simple implementation | Audible zipper noise / clicks on every update; non-musical experience | Never — always use AudioParam scheduling methods |
| Reuse existing `_phaseLockTrace` for meditation session traces | No new data structures | Meditation sessions appear in dashboard with phase lock metric that is meaningless for unguided breathing | Never — meditation sessions need their own trace structure |
| Skip decoded AudioBuffer cache | Simpler state management | Every meditation restart triggers 2–5 second decode delay | Acceptable only for MVP with files < 5 minutes; never for full-length guides |
| Keep single `sessionPhase` field for all modes | No AppState change | No way to distinguish which module is active; stop logic cannot route correctly | Never — add `activeSessionModule` before building any mode |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Web Audio API + user file | Calling `decodeAudioData` on every play | Decode once, cache the `AudioBuffer` by file ID; create new `AudioBufferSourceNode` per play using cached buffer |
| IndexedDB blob storage | Storing blobs without size tracking | Store metadata record alongside blob; display sizes in UI; provide delete |
| IndexedDB schema upgrade | Not testing upgrade path against existing data | Seed DB at v1, load v2 code, verify sessions survive; never delete existing stores |
| Web Audio + asymmetric I:E ratio | Passing single `halfPeriod` to scheduler | Parameterize with `inhaleSeconds` and `exhaleSeconds`; update renderer and sonification to match |
| Phase lock score + meditation mode | Computing phase lock without active pacing | Branch DSP tick: skip `computePhaseLockScore()` and `paceControllerTick()` in meditation mode |
| Blob URL + audio preview | Never calling `URL.revokeObjectURL()` | Revoke after `loadeddata` fires, or decode to AudioBuffer and skip blob URLs entirely |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Decoding a 30-minute audio file on every session start | 2–5 second freeze at session start; user perceives app as broken | Cache decoded AudioBuffer in module Map; decode once per file | On first non-trivial file size (> ~10 MB) |
| Running full DSP tick (phase lock + pace controller) during passive meditation monitoring | Phase lock computation adds ~5ms/tick to a passive-monitoring session; pace controller fires AppState mutations | Branch the DSP tick by session mode in practice.js | Immediately — unnecessary CPU waste and incorrect data |
| Accumulating blob URLs for audio file previews without revocation | Memory grows with each audio preview interaction; Chrome eventually kills the tab | Revoke blob URLs after use; prefer AudioBuffer decoding over long-lived blob URLs | After 20–30 preview interactions in one session |
| Multiple simultaneous AudioBufferSourceNodes from repeated meditation restarts | Old source node continues playing in background because `stop()` was not called on mode switch | Call `stop()` on current source before creating new one; store reference as module-level `_meditationSource` | On first meditation restart within a session |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Mode selector visible while a session is active | User switches mode mid-session, creating ambiguous state | Disable mode selector during active session; show "End session to change mode" tooltip |
| Pre-sleep mode defaults to the same 20-min timer as practice mode | User expects a pre-sleep session to end when they fall asleep, not after 20 minutes | Add "No timer" option for pre-sleep mode; default to open-ended with optional auto-stop |
| Meditation mode shows phase lock gauge during session | Phase lock during unguided breathing is not meaningful; user interprets low scores as failure | Hide phase lock gauge entirely in meditation mode; show HRV trend and neural calm only |
| Guided audio starts instantly when "Start" is pressed without verifying AudioContext state | AudioContext may be suspended if the user has not interacted with the page since loading | `initAudio()` already handles this; verify `_ctx.state === 'suspended'` and call `resume()` before starting playback |
| Duration picker shows during a meditation session with a fixed audio file | User sets 10-min timer but audio is 30 min — session ends while audio plays | Hide duration picker in meditation mode; duration is determined by the selected audio file |

---

## "Looks Done But Isn't" Checklist

- [ ] **Session mode selector:** Switching modes with an active session prompts a confirmation — verify by starting a session and immediately clicking a different mode tab
- [ ] **Pre-sleep audio scheduler:** Echo subdivisions scale with the exhale duration (not fixed to half-period) — verify at 1:2 I:E ratio by listening for evenly spaced echoes during the long exhale
- [ ] **DB_VERSION bump:** Existing sessions survive the upgrade — verify by seeding sessions at v1, loading v2 code, checking dashboard shows all prior sessions
- [ ] **Audio file delete:** Deleting a file from the library removes both the blob and the metadata record from IndexedDB — verify by checking `audioFiles` store in DevTools Application tab
- [ ] **Meditation DSP tick:** `paceControllerTick()` is NOT called during a meditation session — verify by watching `AppState.pacingFreq` during a meditation session (should not change)
- [ ] **Phase lock score absent in meditation summaries:** `meanPhaseLock` is `null` or absent in saved meditation session records — verify by reading the IndexedDB record after a meditation session
- [ ] **Decoded AudioBuffer cache:** Starting a second meditation session with the same file does not show a freeze — verify by stopping and restarting a 20-minute meditation session and measuring start latency
- [ ] **Sonification oscillator smooth:** Changing `phaseLockScore` from 30 to 80 over 10 seconds produces a smooth frequency glide, not clicks — verify by listening during a practice session transition from calibrating to locked
- [ ] **Blob URL revocation:** DevTools Memory profiler shows no accumulating `Blob` objects after 10 audio preview interactions — verify via memory snapshot comparison

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Sessions corrupted by running two modes simultaneously | MEDIUM | Add `activeSessionModule` guard; re-examine any sessions saved during development for anomalous trace lengths; flag and exclude from dashboard averages |
| IndexedDB schema migration deleted sessions store | HIGH | Restore from git-committed IndexedDB export (if user made one); otherwise data is unrecoverable — prevention is the only option |
| Audio routing via single `_masterGain` (wrong gain structure) | MEDIUM | Refactor audio.js to add `_meditationGain` and `_sonificationGain`; update callers; requires retesting all existing audio paths |
| AudioBuffer not cached, causing per-start decode freeze | LOW | Add module-level Map cache; one-time code change; no data migration needed |
| Phase lock score stored for meditation sessions | LOW | Add `mode` filter to dashboard query; exclude `mode: 'meditation'` records from phase lock trend chart |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Session not stopped before new mode starts | Session mode selector (first phase) | Start a session; switch mode tabs; verify guard prevents double-start |
| Asymmetric I:E audio scheduler breakage | Pre-sleep mode audio work | Listen at 1:2 ratio; verify echo timing and circle animation both reflect the asymmetry |
| IndexedDB DB_VERSION migration | User file management — first storage.js commit | Seed v1 data; load v2; verify sessions survive |
| Blob accumulation and quota | User file management — file upload implementation | Upload 5 files; delete 3; verify DevTools storage shows 2 blobs remaining |
| Audio gain routing for meditation and sonification | Audio routing refactor (prerequisite phase) | Verify two independent sliders control pacer and guidance independently |
| Guided audio main-thread block from large file decode | Meditation mode — audio loading | Start meditation with a 30-min file; measure start latency; verify < 500ms on second start (cache hit) |
| Passive DSP contamination during meditation | Meditation mode — DSP branching | Watch AppState during meditation session; verify pacingFreq static and phaseLockScore null |
| EEG headphone artifact disclosure | Meditation mode — setup UI copy | Confirm setup screen includes headphone guidance note |
| Mode selector UI state machine | Session mode selector phase | Run all 9 mode × view combinations; verify correct show/hide for each |
| Sonification click artifacts | Phase lock sonification | Trigger phaseLockScore transitions during active session; verify no audible clicks |

---

## Sources

- [AudioBufferSourceNode — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode) — Single-use source node; cache AudioBuffer, create new source per play (HIGH confidence)
- [BaseAudioContext.decodeAudioData — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) — Decodes complete file; does not support streaming/partial decode (HIGH confidence)
- [Web Audio API Best Practices — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) — Single AudioContext per page; user gesture requirements; suspended state (HIGH confidence)
- [OscillatorNode — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode) — Cannot restart; AudioParam ramp methods for smooth parameter changes (HIGH confidence)
- [AudioNode.disconnect() — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode/disconnect) — GainNodes persist if still connected after source node stops; explicit disconnect needed (HIGH confidence)
- [Storage quotas and eviction criteria — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — Chrome LRU eviction deletes entire origin; quota ~60% of disk (HIGH confidence)
- [URL.createObjectURL() — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static) — Must revokeObjectURL() after use; memory leak if not revoked (HIGH confidence)
- [Using IndexedDB — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) — onupgradeneeded pattern; deleting object stores destroys data (HIGH confidence)
- [IndexedDB schema migration — DEV Community (Ivan Div)](https://dev.to/ivandotv/handling-indexeddb-upgrade-version-conflict-368a) — Multi-tab conflict on version upgrade; blocked event handling (MEDIUM confidence)
- [Autoplay policy — Chrome for Developers](https://developer.chrome.com/blog/autoplay) — AudioContext created before user gesture starts suspended; resume() required (HIGH confidence)
- [Determining optimal I:E ratio for resonance breathing — Medium/Yudemon](https://medium.com/yudemon/determining-the-optimal-inhale-to-exhale-ratio-for-resonance-breathing-and-hrv-biofeedback-training-34a76e4bf6dd) — 1:2 I:E ratio evidence for HRV (MEDIUM confidence — research summary, not primary source)
- [Do Longer Exhalations Increase HRV? — Springer Applied Psychophysiology](https://link.springer.com/article/10.1007/s10484-024-09637-2) — Extended exhale effects on HRV; methodological considerations (MEDIUM confidence)
- [EEG Artifacts — Bitbrain](https://www.bitbrain.com/blog/eeg-artifacts) — Muscle artifacts at temporal sites from physical contact and movement (MEDIUM confidence)
- [RxDB: IndexedDB Max Storage Limit](https://rxdb.info/articles/indexeddb-max-storage-limit.html) — QuotaExceededError; navigator.storage.estimate() best practice (MEDIUM confidence)
- [Web Audio API — Things I Learned the Hard Way (szynalski)](https://blog.szynalski.com/2014/04/web-audio-api/) — AudioParam immediate value changes produce clicks; ramp methods required (MEDIUM confidence — older source, behavior confirmed by MDN AudioParam docs)

---
*Pitfalls research for: ResonanceHRV v1.3 — session modes, meditation audio, user file management, phase lock sonification*
*Researched: 2026-04-06*
