# Stack Research

**Domain:** Real-time HRV biofeedback breathing web app (Vanilla JS, Desktop Chrome)
**Researched:** 2026-03-21 (original); 2026-04-06 (v1.3 additions)
**Confidence:** HIGH for Web APIs (verified via MDN + Chrome docs); MEDIUM for FFT library (actively maintained but last updated 2017); MEDIUM for Oura Auth (PAT deprecation in progress)

---

## v1.3 Stack Additions (Session Modes & Eyes-Closed Training)

**What changed:** v1.3 adds three new capabilities to an already-working app. The existing stack (Web Audio API, Canvas, IndexedDB, Web Bluetooth) covers 90% of what's needed. The additions below are purely additive — no replacements, no new libraries.

### New Capability 1: Asymmetric I:E Ratio Pacer (Pre-Sleep Mode)

**What's needed:** The existing lookahead scheduler in `audio.js` hardcodes equal inhale/exhale halves (`halfPeriod = 1 / (pacingFreq * 2)`). Pre-sleep mode needs asymmetric timing — e.g., 1:2 ratio means inhale is 1/3 of the breath period and exhale is 2/3.

**Stack addition:** None. This is a scheduler logic change, not a new API or library.

The existing Web Audio API lookahead scheduler pattern already supports arbitrary timing. The scheduler tick needs to track separate inhale/exhale durations instead of a uniform half-period. `AudioContext.currentTime` scheduling remains unchanged. Echo subdivisions should adapt to the actual phase duration, not the half-period.

**Integration point:** `audio.js` — change `_schedulerTick()` to accept `{ inhaleDuration, exhaleDuration }` rather than deriving from `pacingFreq * 2`. Add `AppState.breathRatio` (default `{ inhale: 1, exhale: 1 }`) to carry the setting. The pacer canvas in `renderer.js` will also need to know the ratio for the visual circle animation (expand for inhale duration, hold briefly if hold is added, contract for exhale duration).

**Confidence:** HIGH — lookahead scheduler pattern is well-established, no new API surface required.

---

### New Capability 2: Meditation Audio Playback

Two sub-cases: built-in scripts (bundled audio files) and user-uploaded audio files.

#### 2a. Built-In Audio Files

**What's needed:** Fetch a bundled `.mp3` or `.wav` file, decode it, play it through the existing AudioContext, mix with the existing bowl pacer at independent volume levels.

**API:** `AudioContext.decodeAudioData()` + `AudioBufferSourceNode` — both part of the existing Web Audio API. No new library needed.

**Pattern:**
```javascript
// Inside user gesture (already satisfied by existing session start flow)
const response = await fetch('./audio/body-scan.mp3');
const arrayBuffer = await response.arrayBuffer();
const audioBuffer = await _ctx.decodeAudioData(arrayBuffer);

const source = _ctx.createBufferSource();
source.buffer = audioBuffer;
source.connect(_meditationGain);  // separate GainNode from _masterGain
source.start();
source.onended = () => { /* meditation complete */ };
```

**Key constraints (HIGH confidence, MDN verified):**
- `AudioBufferSourceNode` is single-use. After `start()`, create a new node if replay is needed. This is fine — meditation audio plays once per session.
- `decodeAudioData()` consumes (detaches) the passed `ArrayBuffer`. If you need the raw bytes later, slice a copy first.
- Mix with bowl pacer by routing both through separate `GainNode` instances that feed the same `AudioContext.destination`. The AudioContext is already initialized in `audio.js` via `initAudio()`.
- The existing `_masterGain` controls bowl volume. Meditation audio needs its own `_meditationGain` node to allow independent volume control (user may want guided voice at full volume and bowl at 20%).

**Suggested audio format:** MP3 at 128 kbps. Chrome supports MP3, WAV, OGG, AAC — MP3 is the smallest at acceptable quality for voice content. Body scan / yoga nidra scripts at 20–45 minutes will be 20–45 MB at 128 kbps, well within Chrome's IndexedDB quota.

**Confidence:** HIGH — decodeAudioData / AudioBufferSourceNode are the canonical approach, verified on MDN.

#### 2b. User-Uploaded Audio Files

**What's needed:** Accept user audio file (`.mp3`, `.wav`, `.ogg`), decode it, play it through the AudioContext. Optionally persist it so it survives page reload without re-upload.

**Upload API:** `FileReader.readAsArrayBuffer()` — browser built-in, no library. The File API has been stable since Chrome 13.

**Pattern:**
```javascript
// File input change handler
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const arrayBuffer = evt.target.result;
    // Store raw bytes in IndexedDB BEFORE decoding (decodeAudioData detaches the buffer)
    const bufferCopy = arrayBuffer.slice(0);
    await saveUserAudio(file.name, bufferCopy);
    // Decode for immediate playback
    const audioBuffer = await _ctx.decodeAudioData(arrayBuffer);
    AppState.userMeditationBuffer = audioBuffer;
  };
  reader.readAsArrayBuffer(file);
});
```

**Persistence:** Store the raw `ArrayBuffer` in IndexedDB (not the decoded `AudioBuffer` — decoded buffers are not structured-cloneable). On next page load, retrieve the `ArrayBuffer` and decode again via `decodeAudioData()`. The existing `idb` library (already in the stack) handles this with a single `put()` call.

**IndexedDB storage for audio (MEDIUM confidence, Chrome docs + RxDB):** Chrome allows up to 80% of disk space. A typical 40-minute guided meditation at 128 kbps MP3 is ~38 MB — easily within quota. Call `navigator.storage.persist()` to prevent eviction (one call on first audio store).

**File format support:** MP3, WAV, OGG, AAC — all decoded by `decodeAudioData()` without any codec library. This is the browser's native decode; no third-party audio codec needed.

**Confidence:** HIGH — FileReader + decodeAudioData is the standard browser pattern, no ambiguity.

#### 2c. Passive Physiological Monitoring During Meditation

**What's needed:** Continue running the existing DSP tick and phase lock/coherence/neural calm scoring during meditation playback without the breathing pacer audio active.

**Stack addition:** None. Meditation mode simply continues the existing 1-second `setInterval` DSP tick from `practice.js` while running `AudioBufferSourceNode` playback instead of `startPacer()`. The only difference from practice mode is that the bowl pacer is muted or absent, and the session is flagged as `mode: 'meditation'` in the IndexedDB record.

**Confidence:** HIGH — the existing architecture already separates DSP ticking from pacer audio.

---

### New Capability 3: Phase Lock Audio Sonification

**What's needed:** Continuous audio feedback that maps the real-time phase lock score (0–100) to an audible parameter — pitch, volume, or timbre — updating smoothly as the score changes every second. Provides eyes-closed feedback across all session modes.

**API:** `OscillatorNode` (persistent, started once per session) with `AudioParam` scheduling methods. Already part of the existing Web Audio API stack. No new library.

**Sonification design (opinionated):**

Map phase lock score to **pitch** (not volume). Pitch is more precise and less fatiguing than volume. Research on HRV sonification (Audio Mostly 2025) confirms pitch-mapped sonification provides more actionable feedback than volume-only. Volume can still be used as a secondary envelope for "warmth" but pitch carries the primary signal.

Suggested mapping:
- Score 0 → 80 Hz (low drone, almost subwoofer — indicates poor alignment)
- Score 100 → 320 Hz (clear, warm drone — indicates full phase lock)
- Mapping: `freq = 80 * Math.pow(4, score / 100)` (exponential — matches perceptual pitch linearity)

Use `exponentialRampToValueAtTime()` for frequency transitions — smoother than linear for pitch because human hearing is logarithmic. Ramp over 2 seconds (longer than the 1-second update interval) to avoid abrupt jumps.

**Pattern:**
```javascript
// Start sonification (once per session, after initAudio())
function startSonification() {
  _sonOsc = _ctx.createOscillator();
  _sonGain = _ctx.createGain();
  _sonOsc.type = 'sine';
  _sonOsc.frequency.setValueAtTime(80, _ctx.currentTime);
  _sonGain.gain.setValueAtTime(0.15, _ctx.currentTime);  // quiet, ambient
  _sonOsc.connect(_sonGain);
  _sonGain.connect(_masterGain);
  _sonOsc.start();
}

// Called every second from DSP tick
function updateSonification(phaseLockScore) {
  const targetFreq = 80 * Math.pow(4, phaseLockScore / 100);
  _sonOsc.frequency.exponentialRampToValueAtTime(
    targetFreq,
    _ctx.currentTime + 2.0  // 2-second smooth ramp
  );
}

// Stop sonification
function stopSonification() {
  if (!_sonOsc) return;
  _sonGain.gain.setTargetAtTime(0, _ctx.currentTime, 0.3);
  _sonOsc.stop(_ctx.currentTime + 1);
  _sonOsc = null;
}
```

**Key constraint:** Unlike `AudioBufferSourceNode`, a persistent `OscillatorNode` CAN run continuously — it is not single-use as long as `stop()` is never called. Start once per session, update frequency params each second.

**Mixing with bowl and meditation audio:** Route through a third dedicated `GainNode` (`_sonGain`) with low gain (~0.15) so it sits beneath the bowl strikes and meditation voice. User-controllable via a separate "Sonification volume" slider.

**AudioWorklet not needed (MEDIUM confidence):** Sonification here is parameter automation on a persistent oscillator, not custom sample processing. `AudioWorkletNode` is the modern replacement for `ScriptProcessorNode` for custom DSP algorithms. This app does not need custom DSP in the audio thread — phase lock is computed in JavaScript on the main thread every second and fed to `AudioParam` scheduling. `AudioWorklet` would add complexity with no benefit for this use case.

**Confidence:** HIGH for OscillatorNode continuous operation and AudioParam scheduling — verified MDN. MEDIUM for the specific frequency mapping formula — reasonable but perceptual tuning will need empirical adjustment.

---

## Full Recommended Stack (Original + v1.3 Additions)

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vanilla HTML/CSS/JS (ES2022+) | ES2022 | Application shell and all logic | No build toolchain needed; personal tool; zero framework overhead |
| Web Bluetooth API | Living standard (Chrome 130+) | Garmin HRM 600 + Muse-S BLE connections | Only viable browser API for BLE desktop Chrome; HTTPS/localhost required |
| Web Audio API | Living standard (Chrome 130+) | Bowl pacer, meditation audio playback, phase lock sonification | Single AudioContext; AudioBufferSourceNode for file playback; persistent OscillatorNode for sonification; GainNode for mixing |
| File API (FileReader) | Living standard (Chrome 13+) | User-uploaded meditation audio files | Built-in; `readAsArrayBuffer()` → `decodeAudioData()` is the canonical browser file audio pattern |
| Canvas 2D API | Living standard (Chrome 130+) | Real-time waveforms, ring gauges, breathing pacer animation | Canvas outperforms SVG at continuous 60fps redraws; no DOM churn |
| IndexedDB | Living standard (Chrome 130+) | Session storage + user-uploaded audio persistence | 80% disk quota; stores raw ArrayBuffers; `navigator.storage.persist()` prevents eviction |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fft.js (indutny) | 4.0.4 | Radix-4 FFT for LF/HF spectral power | Use for all spectral analysis; ~35K ops/sec at 2048 samples; fastest pure-JS FFT |
| idb (jakearchibald) | 8.0.3 | Promise-based IndexedDB wrapper | Use for all IDB operations including user audio storage; `put(storeName, arrayBuffer, key)` covers audio persistence |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Python `http.server` or `npx serve` | Local dev server | `localhost` treated as secure by Chrome; Web Bluetooth requires secure origin |
| Chrome DevTools Application tab | Inspect IndexedDB stores | Inspect stored audio ArrayBuffers directly |
| Chrome DevTools Audio tab | Debug AudioContext graph | Shows live node connections; verify GainNode routing for bowl/meditation/sonification mix |

---

## Installation

This is a no-build-tool project. No new packages required for v1.3.

```bash
# No new npm install — all v1.3 capabilities use existing Web APIs

# Serve static files as before:
python -m http.server 8080
# or
npx serve .

# Built-in meditation audio files: add to /audio/ directory as .mp3 files
# User-uploaded audio: stored in IndexedDB, no server needed
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Persistent OscillatorNode for sonification | New OscillatorNode each second | Never — creating/destroying oscillators each second creates audible clicks at note boundaries. Persistent oscillator with AudioParam ramping is click-free |
| `exponentialRampToValueAtTime` for pitch transitions | `linearRampToValueAtTime` | Linear ramp if mapping a non-pitch parameter (e.g., filter cutoff). For pitch, exponential is mandatory — linear pitch changes sound unnatural because hearing is logarithmic |
| FileReader + decodeAudioData for user audio | HTMLMediaElement (`<audio>` tag) | `<audio>` tag if you want streaming playback of large files without decoding into RAM. For typical meditation audio (under 100 MB), decodeAudioData is simpler and integrates cleanly with the AudioContext graph. The `<audio>` tag creates a MediaElementSourceNode that cannot be mixed as cleanly |
| IndexedDB for audio persistence | localStorage | Never for binary audio data — localStorage is limited to 10 MB and requires base64 encoding, tripling the stored size |
| Separate GainNode per audio stream | Single master GainNode for everything | Single GainNode if independent volume controls are not needed. v1.3 needs independent volume for: (1) bowl pacer, (2) meditation voice, (3) sonification drone |
| MP3 at 128 kbps for built-in audio | WAV (uncompressed) | WAV only if audio quality is critical (e.g., professional music). For guided voice meditation, 128 kbps MP3 is indistinguishable and 10x smaller |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `HTMLMediaElement` (`<audio>` tag) as primary audio source | Cannot be routed through Web Audio API graph cleanly without `createMediaElementSource()`, which adds complexity and restrictions; volume control and mixing are clumsier | `AudioBufferSourceNode` via `decodeAudioData()` — fully integrated into existing AudioContext graph |
| `ScriptProcessorNode` for sonification | Deprecated since Chrome 64; runs on main thread; causes audio glitches under load | Not needed at all — persistent `OscillatorNode` with `AudioParam` scheduling covers sonification without custom sample processing |
| `AudioWorklet` for sonification | Overkill — AudioWorklet adds worklet thread complexity for custom DSP algorithms. This app's sonification is oscillator frequency automation, not custom sample generation | `OscillatorNode.frequency.exponentialRampToValueAtTime()` |
| Tone.js for meditation audio or sonification | 200kB+ bundle; wraps Web Audio API in music-composition abstractions not needed here | Native Web Audio API — the three nodes needed (OscillatorNode, AudioBufferSourceNode, GainNode) are already in use |
| Separate `AudioContext` for meditation audio | Only one AudioContext should exist per page; second AudioContext cannot share nodes with the first and wastes resources | Reuse the existing AudioContext from `audio.js` — route meditation AudioBufferSourceNode and sonification OscillatorNode through it |
| Web Workers for audio decoding | `decodeAudioData()` is already async/non-blocking; it does not block the main thread | Direct `await audioCtx.decodeAudioData(arrayBuffer)` — no worker needed |

---

## Stack Patterns by Variant

**If pre-sleep mode with 1:2 I:E ratio:**
- Change `audio.js` scheduler to track separate `inhaleDuration` and `exhaleDuration` instead of uniform `halfPeriod`
- `AppState.breathRatio = { inhale: 1, exhale: 2 }` controls the ratio
- Default (standard mode) keeps `{ inhale: 1, exhale: 1 }` — backward compatible
- Visual pacer circle in `renderer.js` must use same durations for animation sync

**If meditation mode with built-in audio:**
- `fetch('./audio/[name].mp3')` → `decodeAudioData()` → `AudioBufferSourceNode` routed through `_meditationGain`
- Bowl pacer optional (can mute via `_masterGain.gain.value = 0`)
- DSP tick continues unchanged — passive monitoring, no pacer required

**If meditation mode with user-uploaded audio:**
- `FileReader.readAsArrayBuffer()` → store raw bytes in IndexedDB → `decodeAudioData()` → same playback path as built-in
- On reload: retrieve ArrayBuffer from IndexedDB → `decodeAudioData()` again
- Call `navigator.storage.persist()` on first upload to prevent eviction

**If phase lock sonification across all modes:**
- Single persistent `OscillatorNode` per session, started in `initAudio()` extension
- Frequency updated via `exponentialRampToValueAtTime()` every second from DSP tick
- Independent `_sonGain` GainNode allows user to zero-out sonification without affecting bowl or meditation audio
- Sonification can run simultaneously with bowl pacer (standard/pre-sleep mode) or alone (meditation mode)

---

## Audio Node Graph (v1.3)

```
AudioContext.destination
    ├── _masterGain (bowl volume slider)
    │       └── OscillatorNode pairs (bowl strikes + echoes, scheduled)
    ├── _meditationGain (meditation volume slider)
    │       └── AudioBufferSourceNode (built-in or user audio, single-use per session)
    └── _sonGain (sonification volume slider)
            └── _sonOsc OscillatorNode (persistent, 80-320 Hz, frequency updated each second)
```

All three GainNodes connect to the same `AudioContext.destination`. The AudioContext instance lives in `audio.js` and is initialized once on first user gesture.

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| fft.js | 4.0.4 | Chrome ES5+ | Unchanged from v1.0 |
| idb | 8.0.3 | Chrome 86+ | `put(storeName, arrayBuffer, key)` works for binary audio storage; no version change needed |
| Web Audio API | Living standard | Chrome 66+ (AudioWorklet); Chrome 130+ recommended | `decodeAudioData()` Promise form available since Chrome 49; `AudioBufferSourceNode.onended` since Chrome 43 |
| File API | Living standard | Chrome 13+ | `FileReader.readAsArrayBuffer()` is universally available; no version concern |

---

## Sources

**Original stack (2026-03-21):**
- MDN Web Docs: Web Bluetooth API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- Chrome Developers: Communicating with Bluetooth devices — https://developer.chrome.com/docs/capabilities/bluetooth
- GitHub: indutny/fft.js — https://github.com/indutny/fft.js
- GitHub: jakearchibald/idb — https://github.com/jakearchibald/idb
- MDN: OscillatorNode, GainNode, AudioContext — https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode

**v1.3 additions (2026-04-06):**
- MDN: AudioBufferSourceNode — https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode (HIGH confidence — verified single-use constraint, onended event, buffer property)
- MDN: BaseAudioContext.decodeAudioData() — https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData (HIGH confidence — verified Promise form, ArrayBuffer detachment behavior)
- MDN: FileReader.readAsArrayBuffer() — https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsArrayBuffer (HIGH confidence — standard pattern for file-to-audio pipeline)
- MDN: AudioParam scheduling methods — https://developer.mozilla.org/en-US/docs/Web/API/AudioParam (HIGH confidence — verified setValueAtTime, exponentialRampToValueAtTime, setTargetAtTime)
- MDN: OscillatorNode.frequency — https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode/frequency (HIGH confidence — a-rate AudioParam, widely available since 2015)
- MDN: Web Audio API overview — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API (HIGH confidence — ScriptProcessorNode deprecated, AudioWorklet recommended for custom DSP)
- Chrome Developers: Audio Worklet available by default — https://developer.chrome.com/blog/audio-worklet (HIGH confidence — confirmed deprecated ScriptProcessorNode since Chrome 64)
- RxDB: IndexedDB storage limits — https://rxdb.info/articles/indexeddb-max-storage-limit.html (MEDIUM confidence — 80% disk quota confirmed, Snappy compression in Chrome noted)
- Audio Mostly 2025: Comparing Trend-Based and Direct HRV Biofeedback sonification — https://dl.acm.org/doi/10.1145/3771594.3771636 (MEDIUM confidence — pitch mapping research supports sonification design)
- Academia.edu: Sonification of Autonomic Rhythms in HRV Frequency Spectrum — https://www.academia.edu/68951529/Sonification_of_Autonomic_Rhythms_in_the_Frequency_Spectrum_of_Heart_Rate_Variability (LOW confidence — describes MIDI-based sonification; Web Audio approach derived from same principles)

---

*Stack research for: ResonanceHRV — real-time HRV biofeedback breathing trainer*
*Original research: 2026-03-21*
*v1.3 additions: 2026-04-06*
