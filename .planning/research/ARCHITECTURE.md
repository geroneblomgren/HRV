# Architecture Research

**Domain:** Real-time HRV biofeedback web app (vanilla JS, Web Bluetooth, Web Audio API)
**Researched:** 2026-03-21
**Confidence:** HIGH (core patterns verified against MDN official docs and Web Audio API spec)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          UI / View Layer                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────┐ │
│  │  BLE Panel  │  │  Session     │  │  Waveform     │  │Dashboard│ │
│  │  (connect)  │  │  Controls    │  │  Canvas       │  │ (Oura)  │ │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  └────┬────┘ │
├─────────┼────────────────┼──────────────────┼───────────────┼──────┤
│         │        Event Bus / AppState        │               │      │
│         │    (Pub/Sub + JS Proxy object)     │               │      │
├─────────┼────────────────┼──────────────────┼───────────────┼──────┤
│         ↓                ↓                  ↓               ↓      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────┐ │
│  │  BLEService │  │  DSP Engine  │  │  AudioEngine  │  │  Oura   │ │
│  │  (GATT/RR)  │  │  (FFT/RSA)   │  │  (scheduler)  │  │  Client │ │
│  └──────┬──────┘  └──────┬───────┘  └───────────────┘  └────┬────┘ │
├─────────┼────────────────┼────────────────────────────────────┼──────┤
│         ↓                ↓                                   ↓      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                       StorageService                            ││
│  │              (IndexedDB — sessions, RR arrays, scores)          ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| BLEService | Device discovery, GATT connection, characteristic notifications, DataView parsing, disconnect/reconnect | Emits events → AppState |
| DSPEngine | RR artifact rejection, circular buffer, Lomb-Scargle PSD, RSA amplitude, coherence score | Reads from BLEService via AppState; writes metrics → AppState |
| AudioEngine | Lookahead scheduler, breathing cue synthesis (tone/chime/swell), AudioContext lifecycle | Reads pace from AppState; no output — pure scheduling |
| WaveformRenderer | requestAnimationFrame loop, Canvas 2D draw, circular buffer display, scrolling HR line | Reads RR/HR buffer from AppState |
| OuraClient | OAuth2 PKCE flow, token storage in localStorage, fetch overnight HRV/readiness | Reads/writes AppState.ouraData |
| StorageService | IndexedDB wrapper — append session records, query by date range | Called by AppState on session end |
| AppState | Single source of truth, Proxy-reactive state, Pub/Sub event bus | All components read/write through this |
| UI Panels | DOM manipulation, user input, mode transitions (discovery/practice/dashboard) | Read AppState; dispatch actions |

---

## Recommended Project Structure

```
/
├── index.html               # Single HTML entry point, import map, module script tag
├── styles.css               # Global styles (no preprocessor needed)
├── js/
│   ├── main.js              # Bootstrap: init AppState, wire modules, start BLE scan UI
│   ├── state.js             # AppState: Proxy-based reactive store + Pub/Sub bus
│   ├── ble.js               # BLEService: Web Bluetooth connect/notify/parse/reconnect
│   ├── dsp.js               # DSPEngine: artifact rejection, RR buffer, Lomb-Scargle, RSA
│   ├── audio.js             # AudioEngine: AudioContext, lookahead scheduler, tone synthesis
│   ├── renderer.js          # WaveformRenderer: Canvas rAF loop, circular buffer display
│   ├── oura.js              # OuraClient: OAuth2, token mgmt, API fetch, data transform
│   └── storage.js           # StorageService: IndexedDB open/add/query helpers
└── .planning/               # Research and roadmap (not served)
```

### Structure Rationale

- **Flat js/ directory:** App is ~800-1000 lines total; subdirectory nesting adds navigation cost with no benefit at this scale.
- **One module per concern:** Each file exports a single object or set of functions. Cross-concern communication happens only through AppState, not direct imports between siblings.
- **main.js as the wiring layer:** Imports all modules and subscribes them to AppState events. Nothing else imports from main.js. This makes the dependency graph acyclic and readable.
- **No import maps required but optionally useful:** Since there are no external npm dependencies, relative imports in `<script type="module">` are sufficient.

---

## Architectural Patterns

### Pattern 1: Proxy-Based AppState as Single Source of Truth

**What:** A plain JavaScript object wrapped in `Proxy` intercepts all property assignments and fires named events to subscribed listeners. No framework needed.

**When to use:** When multiple independent modules (BLE, audio, canvas) need to react to the same state changes (new RR interval, session start/end, coherence update) without being directly coupled to each other.

**Trade-offs:** Simple to implement and debug. Cannot batch updates; very high-frequency writes (each RR notification) should write to a circular buffer in state rather than triggering a re-render on every write.

**Example:**
```javascript
// state.js
const listeners = {};
export const AppState = new Proxy({
  connected: false,
  rrBuffer: new Float32Array(512),  // circular buffer of recent RR intervals
  rrHead: 0,
  currentHR: 0,
  coherenceScore: 0,
  sessionPhase: 'idle',             // 'idle' | 'discovery' | 'practice' | 'dashboard'
  pacingFreq: 0.1,                  // Hz (breaths/sec)
  ouraData: null,
}, {
  set(target, key, value) {
    target[key] = value;
    (listeners[key] || []).forEach(fn => fn(value));
    return true;
  }
});

export function subscribe(key, fn) {
  listeners[key] = listeners[key] || [];
  listeners[key].push(fn);
}
```

### Pattern 2: BLE Data Pipeline — Notification to RR Integer Array

**What:** A deterministic byte-parsing pipeline that converts raw `characteristicvaluechanged` DataView payloads from GATT characteristic 0x2A37 into cleaned millisecond RR values appended to AppState's circular buffer.

**When to use:** Always. This is the only correct interpretation of the Heart Rate Measurement characteristic per the Bluetooth GATT spec. The HRM 600 uses the standard BLE Heart Rate Service.

**Trade-offs:** The characteristic can carry 0, 1, or multiple RR values per notification (depending on HR). Parse all of them. RR values from Garmin are in units of 1/1024 second; convert to milliseconds on ingestion.

**Example:**
```javascript
// ble.js — parse characteristicvaluechanged
function parseHRMNotification(event) {
  const view = event.target.value;
  const flags = view.getUint8(0);
  const hrFormat16bit = flags & 0x01;
  const rrPresent = flags & 0x10;

  let offset = hrFormat16bit ? 3 : 2;  // skip flags + HR value

  const rrValues = [];
  if (rrPresent) {
    while (offset + 1 < view.byteLength) {
      const rawRR = view.getUint16(offset, /*littleEndian=*/true);
      const ms = (rawRR / 1024) * 1000;  // Garmin: 1/1024 sec resolution
      offset += 2;
      rrValues.push(ms);
    }
  }
  return rrValues;  // array of ms values, may be empty
}
```

### Pattern 3: Lookahead Audio Scheduler for Breathing Pace

**What:** A `setTimeout`-driven scheduler fires every 25ms, looks 100ms ahead using `AudioContext.currentTime`, and queues Web Audio API oscillator/gain nodes to start at precisely scheduled future times. This is "A Tale of Two Clocks" (Chris Wilson, web.dev).

**When to use:** Any periodic audio cue where drift would be perceptible. Direct `setTimeout`/`setInterval` causes audible timing errors at HRV-relevant frequencies (4-6 breaths/min = 5-7.5 second cycles with potentially noticeable drift over 20 minutes).

**Trade-offs:** The scheduler loop must be started after a user gesture (AudioContext.resume() requirement). Visual UI updates (circle animation) must be decoupled from this loop — they run in requestAnimationFrame, synchronizing to the same `nextCueTime` value stored in AppState.

**Example:**
```javascript
// audio.js — lookahead scheduler
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

function scheduleBreathCue(time, phase) {
  // 'phase' = 'inhale' | 'exhale'
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  // ... configure tone based on selected audio style
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.3);
  // Store scheduled time for visual sync
  AppState.nextCueTime = time;
  AppState.nextCuePhase = phase;
}

function scheduler() {
  const breathPeriod = 1 / AppState.pacingFreq;
  while (nextCueTime < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    scheduleBreathCue(nextCueTime, currentPhase);
    nextCueTime += breathPeriod / 2;  // alternate inhale/exhale
    currentPhase = currentPhase === 'inhale' ? 'exhale' : 'inhale';
  }
  timerID = setTimeout(scheduler, LOOKAHEAD_MS);
}
```

### Pattern 4: Circular Buffer + requestAnimationFrame Waveform Renderer

**What:** AppState holds a fixed-size `Float32Array` (circular buffer) of recent HR values. The canvas renderer runs a `requestAnimationFrame` loop that reads the buffer and redraws the waveform each frame.

**When to use:** Real-time scrolling waveforms where data arrives asynchronously (from BLE) and rendering runs independently (at display frame rate). This decouples data arrival from rendering — BLE pushes every ~800ms, canvas redraws at 60fps.

**Trade-offs:** The renderer must handle the circular buffer wrap-around to draw values in correct time order. Cap deltaTime to 100ms on tab refocus to prevent waveform jump after tab was hidden. Use `ctx.clearRect` + full redraw each frame (not canvas scrolling tricks) for simplicity at this scale.

**Example:**
```javascript
// renderer.js
let rafId = null;

export function startRenderer(canvas, appState) {
  const ctx = canvas.getContext('2d');
  let lastTime = 0;

  function draw(timestamp) {
    const delta = Math.min(timestamp - lastTime, 100);
    lastTime = timestamp;
    // shift existing content left by (delta * pixelsPerMs)
    // append new HR samples from appState.rrBuffer in correct order
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawWaveform(ctx, appState.rrBuffer, appState.rrHead, canvas.width, canvas.height);
    rafId = requestAnimationFrame(draw);
  }
  rafId = requestAnimationFrame(draw);
}
```

---

## Data Flow

### BLE Notification to Coherence Score

```
Garmin HRM 600 (BLE)
    ↓  characteristicvaluechanged event
BLEService.parseHRMNotification()
    ↓  array of raw RR ms values (0-3 per notification)
DSPEngine.ingest(rrValues)
    ├→  Artifact rejection (< 300ms, > 2000ms, > 20% delta from rolling median)
    ├→  Append clean values to AppState.rrBuffer (circular, 512 samples = ~7 min)
    ├→  Every 30s: Lomb-Scargle PSD on buffer → extract LF/HF power
    └→  Coherence score = LF peak power normalized / total power
          AppState.coherenceScore = score
              ↓
         WaveformRenderer reads AppState.rrBuffer each rAF frame
         UI panels subscribe to AppState.coherenceScore
```

### Audio Scheduling

```
AppState.pacingFreq (Hz) + AppState.sessionPhase
    ↓
AudioEngine.scheduler() — runs every 25ms via setTimeout
    ↓  looks 100ms ahead via AudioContext.currentTime
    ↓  schedules OscillatorNode.start(futureTime)
Web Audio hardware clock — zero-drift playback
    ↓  futureTime stored in AppState.nextCueTime
WaveformRenderer reads AppState.nextCueTime to sync circle animation
```

### Session Persistence

```
User ends session
    ↓
AppState.sessionPhase = 'idle'
    ↓
StorageService.saveSession({
  timestamp, durationMs,
  rrIntervals: AppState.rrBuffer snapshot,
  coherenceScores: [...],
  pacingFreq: AppState.pacingFreq
})
    ↓  IndexedDB transaction (async, non-blocking)
    ↓
Dashboard queries StorageService.querySessions({ limit: 30 })
    ↓  renders trend chart (Canvas 2D)
```

### Oura Integration

```
User clicks "Connect Oura"
    ↓
OuraClient.startOAuth2()
    ↓  redirect to cloud.ouraring.com/oauth/authorize?response_type=token&...
    ↓  (implicit/client-side flow — no backend needed)
    ↓  callback URL fragment contains access_token
OuraClient.handleCallback()
    ↓  store token in localStorage (30-day expiry)
    ↓
Dashboard.load()
    ↓
OuraClient.fetchDailyReadiness(last30Days)
OuraClient.fetchHeartRate(last30Days)   // overnight HRV proxy
    ↓  fetch('https://api.ouraring.com/v2/usercollection/daily_readiness', ...)
AppState.ouraData = transformedTrends
    ↓
Dashboard renderer draws combined session + Oura trend
```

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Garmin HRM 600 | Web Bluetooth GATT, service 0x180D, characteristic 0x2A37, notifications | Disconnect: listen `gattserverdisconnected` on device object; attempt auto-reconnect via `device.gatt.connect()` |
| Oura API v2 | OAuth2 implicit flow (client-side only, no backend); Bearer token in Authorization header | Personal Access Tokens **deprecated** — removal targeted end-of-2025 (LOW confidence on exact date). Use OAuth2 implicit flow with `response_type=token`. Token expires 30 days; re-auth required. CORS is supported for direct browser fetch. |
| Browser IndexedDB | Async IDB transactions via thin wrapper; object store keyed by sessionId (timestamp) | No third-party library needed; raw IDB API is verbose but manageable for 2-3 object stores |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| BLEService ↔ DSPEngine | AppState.rrBuffer (circular array write/read) | DSPEngine does not import BLEService directly. BLEService writes to AppState; DSPEngine subscribes |
| DSPEngine ↔ WaveformRenderer | AppState.rrBuffer + AppState.coherenceScore | Renderer only reads; no writes back |
| AudioEngine ↔ WaveformRenderer | AppState.nextCueTime + AppState.nextCuePhase | Visual pacer circle reads these to sync animation phase to scheduled audio |
| OuraClient ↔ StorageService | No direct dependency | Dashboard reads both independently and merges in UI layer |
| All modules ↔ AppState | Import `{ AppState, subscribe }` from state.js | Only AppState is a shared dependency; modules do not import each other |

---

## Suggested Build Order

Dependencies determine the order. Each phase can only be built once its inputs exist.

```
Phase 1: AppState + StorageService
    No dependencies. Everything else depends on these.
    AppState must exist before any module can communicate.
    StorageService must exist before sessions can be saved.

Phase 2: BLEService
    Depends on: AppState (to write RR values)
    Delivers: verified RR data stream for DSP work

Phase 3: DSPEngine
    Depends on: AppState (reads rrBuffer), BLEService (provides data)
    Delivers: coherenceScore and processed metrics
    NOTE: Can stub BLEService with synthetic RR data during development

Phase 4: WaveformRenderer + Visual Pacer
    Depends on: AppState (reads rrBuffer, nextCueTime), Canvas API
    Can be developed with AppState stubs — no BLE required

Phase 5: AudioEngine
    Depends on: AppState (reads pacingFreq, sessionPhase)
    Entirely standalone — no dependency on BLE or DSP
    Must be wired to user gesture for AudioContext.resume()

Phase 6: Session UI + Session Logic
    Depends on: BLEService, DSPEngine, AudioEngine, WaveformRenderer, StorageService
    Integrates all Phase 1-5 components into discovery and practice flows

Phase 7: OuraClient + Dashboard
    Depends on: StorageService (session history), AppState (ouraData)
    Entirely decoupled from BLE stack — can be built independently after Phase 1
```

---

## Anti-Patterns

### Anti-Pattern 1: Triggering Canvas Redraw on Every RR Event

**What people do:** Subscribe the canvas renderer directly to BLE events and call `drawWaveform()` inside the BLE notification handler.

**Why it's wrong:** BLE notifications arrive every ~800ms, but intermediate visual states are lost; more critically, drawing inside an event handler (not rAF) causes janky rendering and can block the main thread during burst notifications.

**Do this instead:** Write RR values to the circular buffer in AppState; let `requestAnimationFrame` drive all rendering independently. The renderer always draws whatever is currently in the buffer.

### Anti-Pattern 2: Using setInterval for Audio Scheduling

**What people do:** `setInterval(playTone, breathPeriodMs / 2)` for inhale/exhale cues.

**Why it's wrong:** JavaScript timers are not precise to the audio clock. Over a 20-minute session at 0.1 Hz, `setInterval` accumulates drift that makes the pacer audibly unstable. User will lose sync between audio cues and the visual circle.

**Do this instead:** Lookahead scheduler with `AudioContext.currentTime` as the reference (Pattern 3 above). Schedule 100ms ahead; update AppState with scheduled times for visual sync.

### Anti-Pattern 3: Calling `navigator.bluetooth.requestDevice()` Programmatically

**What people do:** Attempt to connect on page load or automatically without a user click.

**Why it's wrong:** Web Bluetooth requires a "transient activation" (direct user gesture). Programmatic calls throw `SecurityError`. This is enforced by the browser, not configurable.

**Do this instead:** Gate all `requestDevice()` calls behind a button click handler. Reconnect (to a previously paired device) can use `device.gatt.connect()` which does NOT require a gesture.

### Anti-Pattern 4: Applying FFT to Unevenly-Sampled RR Intervals Directly

**What people do:** Treat the RR array as a uniformly-sampled time series and feed it directly to a standard radix-2 FFT.

**Why it's wrong:** RR intervals are inherently unevenly spaced in time (each interval has a different duration). FFT assumes uniform sampling. Applying it directly to the raw RR series without resampling produces spectral smearing and incorrect LF/HF power estimates.

**Do this instead:** Either (a) resample the RR series to a uniform grid (4 Hz is standard) using cubic spline interpolation before FFT, or (b) use the Lomb-Scargle periodogram which is designed for unevenly sampled data and avoids the interpolation artifact. For a single-user personal tool where implementation complexity matters, cubic spline + FFT is simpler to implement correctly. Lomb-Scargle is more principled but requires porting from Python/R.

### Anti-Pattern 5: Storing RR Arrays in localStorage

**What people do:** `localStorage.setItem('session_123', JSON.stringify(rrArray))`.

**Why it's wrong:** localStorage is synchronous, limited to ~5MB, and JSON stringification of large Float32Array data blocks the main thread. A 20-minute session at ~70 BPM produces ~1400 RR values; multiply by weeks of sessions.

**Do this instead:** Use IndexedDB with asynchronous transactions. Store RR arrays as binary `Float32Array` or typed arrays directly — IndexedDB handles structured data natively without JSON serialization.

---

## Scalability Considerations

This is a single-user personal tool. "Scaling" means data growth over months of daily sessions.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, 1 week | localStorage could work, but IndexedDB is the right choice from day one (no migration cost) |
| 1 user, 1 year (~365 sessions) | IndexedDB handles this trivially; query by date range using index on `timestamp` key |
| Data export | Add a JSON export button in dashboard — reads IndexedDB, creates Blob URL. Single function addition, no architecture change. |

There is no multi-user concern. Cloud sync is explicitly out of scope. The only growth dimension is accumulated local session data.

---

## Sources

- MDN Web Bluetooth API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API (HIGH confidence)
- Bluetooth GATT Heart Rate Service Spec — https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/ (HIGH confidence)
- Web Audio "A Tale of Two Clocks" (Chris Wilson, web.dev) — https://web.dev/articles/audio-scheduling (HIGH confidence)
- MDN Web Audio Advanced Techniques — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques (HIGH confidence)
- Oura API OAuth2 authentication docs — https://cloud.ouraring.com/docs/authentication (MEDIUM confidence — PAT deprecation timeline LOW confidence)
- Polar Verity BLE parsing walkthrough — https://dev.to/manufac/interacting-with-polar-verity-sense-using-web-bluetooth-553a (MEDIUM confidence)
- Lomb-Scargle for HRV — ADInstruments blog, Physionet archive — https://archive.physionet.org/physiotools/lomb/ (HIGH confidence for algorithm, LOW for browser JS port availability)
- Artifact rejection methodology — Kubios blog https://www.kubios.com/blog/preprocessing-of-hrv-data/ (MEDIUM confidence)
- Canvas rAF waveform pattern — MDN Basic Animations https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_animations (HIGH confidence)

---
*Architecture research for: ResonanceHRV — real-time HRV biofeedback web app*
*Researched: 2026-03-21*
