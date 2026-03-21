# Stack Research

**Domain:** Real-time HRV biofeedback breathing web app (Vanilla JS, Desktop Chrome)
**Researched:** 2026-03-21
**Confidence:** HIGH for Web APIs (verified via MDN + Chrome docs); MEDIUM for FFT library (actively maintained but last updated 2017); MEDIUM for Oura Auth (PAT deprecation in progress)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vanilla HTML/CSS/JS (ES2022+) | ES2022 | Application shell and all logic | No build toolchain needed; app is ~1000 lines; zero framework overhead is the right call for a personal tool of this scope |
| Web Bluetooth API | Living standard (Chrome 130+) | Connect to Garmin HRM 600 over BLE, subscribe to Heart Rate Measurement characteristic (0x2A37) | Only viable browser API for BLE on desktop Chrome; requires HTTPS or localhost; fully supports standard GATT Heart Rate Service |
| Web Audio API | Living standard (Chrome 130+) | Generate sine-wave breathing tones, volume swells, soft chimes | Native browser API; zero dependencies; OscillatorNode + GainNode covers all three audio styles with precise AudioContext scheduling |
| Canvas 2D API | Living standard (Chrome 130+) | Real-time scrolling HR waveform and breathing circle animation | Canvas outperforms SVG by ~10x at continuous high-frequency redraws; direct pixel control at 60fps without DOM churn |
| IndexedDB | Living standard (Chrome 130+) | Persist RR-interval session data, coherence scores, resonance frequency results | 80% disk quota in Chrome vs 10 MB localStorage cap; async so it doesn't block the main thread; stores structured objects without serialization |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fft.js (indutny) | 4.0.4 | Radix-4/Radix-2 FFT for LF/HF spectral power bands | Use for all spectral analysis of resampled RR-interval time series; ~35,000 ops/sec at 2048-sample sizes, fastest pure-JS FFT available via CDN |
| idb (jakearchibald) | 8.0.3 | Promise-based IndexedDB wrapper (~1.2kB brotli'd) | Use instead of raw IndexedDB to avoid callback pyramid; `openDB`, `get`, `put` cover all needed operations; tiny overhead |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Python `http.server` or `npx serve` | Local HTTPS-equivalent dev server | Web Bluetooth requires secure origin; `localhost` is treated as secure by Chrome, so plain `python -m http.server` on port 8080 works without SSL certs |
| Chrome DevTools Bluetooth Internals | Debug BLE connections | Navigate to `chrome://bluetooth-internals` to inspect device logs and GATT characteristics during development |
| Chrome DevTools Application tab | Inspect IndexedDB | Built-in; no extra tooling needed to browse stored sessions |

---

## Installation

This is a no-build-tool project. Serve static files from disk.

```bash
# Option 1: Python (zero dependencies)
python -m http.server 8080

# Option 2: Node-based (if npm is already installed)
npx serve .

# No npm install needed for core APIs.
# Load fft.js and idb via CDN in HTML:
# <script src="https://cdn.jsdelivr.net/npm/fft.js@4.0.4/lib/fft.js"></script>
# <script type="module">
#   import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8.0.3/+esm';
# </script>
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| fft.js 4.0.4 | als-fft 3.4.1 | als-fft is actively maintained (updated March 2026) and supports STFT natively. Switch to als-fft if you need short-time Fourier transform for windowed analysis during live streaming — fft.js requires you to implement windowing manually |
| Canvas 2D | SVG | SVG only if you need DOM event handling on individual waveform data points (e.g., click-to-annotate). For scrolling waveform at 60fps, Canvas wins by a large margin |
| idb 8.0.3 | Raw IndexedDB | Raw IndexedDB if you want zero dependencies and don't mind verbose callback/cursor boilerplate. idb is 1.2kB and saves significant code |
| Web Audio API (native) | Tone.js | Tone.js if the audio requirements grow to sequenced multi-instrument patterns. For three oscillator types + gain envelope, native Web Audio API is far simpler and has no load overhead |
| Vanilla JS | React/Vue/Svelte | A framework only if the UI grows beyond ~5 views with shared state. At current scope (one active session view + dashboard), vanilla JS with module pattern is cleaner |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| localStorage for RR-interval storage | 10 MB cap; synchronous writes block the main thread during streaming; binary RR data JSON-serialized is wasteful | IndexedDB via idb — async, no size pressure, stores typed arrays directly |
| Tone.js | 200kB+ bundle; wraps Web Audio API in abstractions designed for music composition, not simple timed tones; AudioContext lifecycle management is already simple enough with vanilla API | Web Audio API OscillatorNode + GainNode directly |
| d3.js for waveform rendering | D3 is a data-binding and SVG manipulation library; 85kB for DOM manipulation you don't need when Canvas draw calls are 5 lines of code | Canvas 2D `clearRect` + `lineTo` loop |
| WebSockets or SSE | No server component exists; this is entirely a client-side app | Web Bluetooth `addEventListener('characteristicvaluechanged')` is the data stream |
| React / Next.js / any framework | Build toolchain complexity is out of scope per PROJECT.md constraints; framework adds 40kB+ for no benefit at this scale | Vanilla JS ES modules |
| Camera PPG (MediaDevices API) | Explicitly out of scope; also has higher latency and noise than chest-strap ECG; BLE is the correct data source | Web Bluetooth to Garmin HRM 600 |

---

## Stack Patterns by Context

**Web Bluetooth connection flow:**
- Call `navigator.bluetooth.requestDevice()` inside a click handler (user gesture required)
- Filter by `{services: ['heart_rate']}` (GATT UUID 0x180D) — no need to know Garmin's vendor prefix
- Subscribe to `characteristic.startNotifications()` on 0x2A37
- Parse the DataView: byte 0 is flags (bit 0 = 16-bit HR; bit 4 = RR-intervals present); RR fields start at byte offset 2 or 3 and are in units of 1/1024 seconds

**Garmin HRM 600 BLE notes:**
- The HRM 600 supports both secure (bonded) and open BLE connection modes
- Web Bluetooth does not support bonding/SMP; use the open connection type — the HRM 600 operates in open mode when paired with a new device without prior bonding
- RR-interval flag (bit 4 of the flags byte in 0x2A37) is set by the HRM 600 when RR data is included

**FFT for HRV spectral analysis:**
- RR intervals are unevenly spaced in time; resample to evenly spaced series at 4 Hz (standard for HRV) using linear or cubic spline interpolation before FFT
- Apply a Hann window to the resampled series before calling `fft.realTransform()` to reduce spectral leakage
- LF band = 0.04–0.15 Hz; HF band = 0.15–0.4 Hz; RSA/resonance peak will appear in LF near 0.08–0.12 Hz during coherent breathing at 5–6 breaths/min
- A 2-minute window at 4 Hz yields 480 samples; use the next power of 2 (512) for FFT input

**Web Audio API breathing pacer:**
- Create a single `AudioContext` on first user click (autoplay policy requires gesture)
- Style 1 (pitch ramp): `OscillatorNode` at 300 Hz, ramp frequency to 400 Hz over inhale duration using `exponentialRampToValueAtTime`
- Style 2 (volume swell): Fixed-frequency OscillatorNode through a `GainNode`; ramp gain 0→1 inhale, 1→0 exhale using `linearRampToValueAtTime`
- Style 3 (soft chime): Short-duration OscillatorNode burst with fast gain decay for bell-like attack; trigger at inhale/exhale phase transitions only
- All scheduling against `AudioContext.currentTime` for sample-accurate timing — never use `setTimeout` for audio events

**Oura API v2 authentication:**
- Personal Access Tokens are deprecated and scheduled for removal by end of 2025. Do NOT build on PAT as primary auth
- Implement OAuth2 Authorization Code Flow: redirect to `https://cloud.ouraring.com/oauth/authorize`, receive code, exchange at `https://api.ouraring.com/oauth/token`
- Required scopes for this app: `daily` (sleep/readiness summaries) and `heartrate` (Gen 3+ time series)
- Since this is a personal single-user tool, the OAuth2 redirect_uri can be `http://localhost:8080/callback` during dev — Chrome will receive the redirect on the local server
- Store `access_token` and `refresh_token` in IndexedDB (not localStorage) to avoid the 10 MB cap; implement token refresh on 401 responses

**Canvas waveform rendering:**
- Use `requestAnimationFrame` loop, not `setInterval`, for smooth 60fps waveform scroll
- Maintain a circular buffer of the last N HR values (e.g., 300 for a 60-second window at ~5 Hz HR updates)
- `clearRect` the entire canvas and redraw from buffer each frame — simpler than scrolling transforms and fast enough at these dimensions
- Use `devicePixelRatio` to avoid blurry canvas on HiDPI displays: `canvas.width = canvas.clientWidth * devicePixelRatio`

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| fft.js | 4.0.4 | Chrome ES5+ (no transpile needed) | UMD module; loads directly via `<script>` tag or ESM import; no dependencies |
| idb | 8.0.3 | Chrome 86+ (requires `structuredClone` support) | ES module; load via `<script type="module">` or CDN ESM build; Chrome 86+ covers all desktop Chrome users as of 2026 |

---

## Sources

- MDN Web Docs: Web Bluetooth API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API (verified: HTTPS requirement, user gesture, Chrome support)
- Chrome Developers: Communicating with Bluetooth devices over JavaScript — https://developer.chrome.com/docs/capabilities/bluetooth (verified: security requirements, GATT access pattern)
- Bluetooth SIG: Heart Rate Service 0x180D / 0x2A37 specification — https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/ (verified: RR-interval flag bit 4)
- Oura API authentication docs — https://cloud.ouraring.com/docs/authentication (verified: OAuth2 only, PAT deprecated)
- GitHub: indutny/fft.js — https://github.com/indutny/fft.js (version 4.0.4 confirmed; last commit 2017 but stable)
- GitHub: jakearchibald/idb — https://github.com/jakearchibald/idb (version 8.0.3 confirmed; actively maintained)
- npm: als-fft 3.4.1 — https://www.npmjs.com/package/als-fft (confirmed current as of March 2026; STFT support noted as alternative)
- MDN: OscillatorNode, GainNode, AudioContext — https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode (Web Audio API patterns verified)
- SVG vs Canvas performance 2025 — https://www.svggenie.com/blog/svg-vs-canvas-vs-webgl-performance-2025 (Canvas 10x faster for high-frequency redraws; MEDIUM confidence, single source)
- RxDB: localStorage vs IndexedDB — https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html (storage limits and async benefits verified)
- DEV Community: GATT RR-interval parsing — https://dev.to/manufac/interacting-with-polar-verity-sense-using-web-bluetooth-553a (flag byte parsing pattern; MEDIUM confidence, same GATT spec applies to Garmin)

---

*Stack research for: ResonanceHRV — real-time HRV biofeedback breathing trainer*
*Researched: 2026-03-21*
