# Project Research Summary

**Project:** ResonanceHRV — Real-Time HRV Biofeedback Breathing Trainer
**Domain:** HRV biofeedback web app — Web Bluetooth, real-time spectral analysis, Web Audio API, Oura API
**Researched:** 2026-03-21
**Confidence:** MEDIUM-HIGH

## Executive Summary

ResonanceHRV is a single-user, browser-based HRV biofeedback trainer that guides the user to discover their personal resonance frequency (the breathing rate that maximizes heart rate variability amplitude) and then trains at that frequency. The expert approach is a vanilla JS, no-build-toolchain web app using Web Bluetooth to stream RR intervals from a Garmin HRM 600 chest strap, Lomb-Scargle or FFT-based spectral analysis for real-time coherence scoring, Web Audio API for breathing pace cues, Canvas 2D for waveform rendering, and IndexedDB for session persistence. No framework, no backend, no cloud — this is the correct scope for a personal tool of this complexity.

The recommended build order follows strict data dependencies: AppState foundation first, then the BLE data pipeline, then signal processing (DSP engine with artifact rejection), then visualization and audio, then session logic that integrates all layers, and finally Oura API integration and the historical dashboard as a standalone module. The most important architectural decision is using Lomb-Scargle periodogram rather than FFT with resampled RR intervals — this choice prevents systematic spectral errors that would produce false coherence scores and cannot be easily swapped post-launch. The second critical decision is using the LF band power ratio (0.04–0.15 Hz) as the live coherence metric, not RMSSD, which decreases during successful resonance frequency biofeedback despite the user doing everything right.

The key risks are front-loaded in the BLE and DSP layers: hung GATT promises during reconnect, incorrect multi-RR-interval parsing from BLE notifications, inadequate artifact rejection during large RSA swings, and insufficient spectral window length for valid LF power estimation. These are all preventable with explicit implementation strategies documented in the pitfalls research, and all of them must be solved before any coherence-dependent UI is built on top.

---

## Key Findings

### Recommended Stack

The stack is lean and dependency-minimal by design: Vanilla JS ES2022+, four native browser APIs (Web Bluetooth, Web Audio, Canvas 2D, IndexedDB), and two small libraries (fft.js 4.0.4 via CDN, idb 8.0.3 via CDN). No build toolchain is needed; the app serves from `python -m http.server 8080` or `npx serve`. The most important stack constraint is Chrome desktop only — Web Bluetooth is unsupported on iOS/Safari by Apple's policy, which eliminates mobile and makes this a deliberate desktop-focused tool. See `.planning/research/STACK.md` for full details.

**Core technologies:**
- Vanilla HTML/CSS/JS (ES2022+): Application shell and all logic — no framework overhead at ~1000 lines scope
- Web Bluetooth API (Chrome 130+): RR interval streaming from Garmin HRM 600 via GATT Heart Rate Service 0x180D/0x2A37
- Web Audio API (Chrome 130+): Breathing pace tone synthesis with lookahead scheduler — hardware-clock precision required
- Canvas 2D API (Chrome 130+): Real-time scrolling HR waveform at 60fps via requestAnimationFrame
- IndexedDB (via idb 8.0.3): Session persistence — async, no size cap, stores typed arrays natively
- fft.js 4.0.4: Radix-4 FFT for LF/HF spectral band power when FFT approach is used

**Critical version/auth note:** Oura Personal Access Tokens are deprecated (removal targeted end of 2025). OAuth2 PKCE flow is mandatory from day one.

### Expected Features

The core feature set is well-established from peer-reviewed biofeedback literature and competitor analysis. The differentiating combination no existing app offers: Web Bluetooth chest-strap biofeedback + Oura overnight HRV overlay + browser-based no-install + multi-style audio pacers + resonance frequency discovery protocol. See `.planning/research/FEATURES.md` for full analysis.

**Must have (table stakes — v1):**
- Web Bluetooth connection to Garmin HRM 600 with status indicator and reconnection
- RR-interval artifact rejection with biofeedback-safe thresholds (not standard HRV thresholds)
- Real-time scrolling HR waveform (~60s window)
- Visual breathing pacer (expanding circle, sine-wave animation)
- Audio breathing pacer (at minimum: rising/falling pitch style)
- Live coherence score (LF spectral ratio, rolling 120s window)
- Discovery mode: 5 frequency blocks (6.5, 6.0, 5.5, 5.0, 4.5 BPM), 2 min each, with RSA amplitude comparison
- Resonance frequency selection and save
- Practice mode: 20-min guided session at saved frequency with live coherence
- Session history: date, duration, mode, mean coherence stored in IndexedDB

**Should have (v1.x — after core validated):**
- Remaining audio pacer styles (volume swell, soft chimes)
- Spectral RSA display (power spectrum chart) during Discovery mode
- Oura Ring API integration (OAuth2 PKCE, overnight HRV pull)
- Recovery dashboard: session coherence trend + Oura overnight HRV overlay
- Session history view with coherence time-series chart

**Defer (v2+):**
- JSON/CSV data export
- Multiple resonance frequency profiles
- Adjustable inhale/exhale ratio (currently fixed 1:1)

**Anti-features to deliberately exclude:** gamification, cloud sync, iOS/mobile support, camera PPG fallback, social features, RMSSD morning readiness mode.

### Architecture Approach

The architecture is a flat module graph coordinated through a single Proxy-based AppState object that acts as both reactive state store and pub/sub event bus. Seven modules (ble.js, dsp.js, audio.js, renderer.js, oura.js, storage.js, state.js) plus main.js as the wiring layer — no module imports siblings directly, all communication flows through AppState. This keeps the dependency graph acyclic and makes each module independently testable with AppState stubs. See `.planning/research/ARCHITECTURE.md` for full diagram, data flow, and code patterns.

**Major components:**
1. AppState (state.js) — Proxy-based reactive store and pub/sub bus; single source of truth for all modules
2. BLEService (ble.js) — GATT connection, characteristic notifications, DataView parsing, disconnect/reconnect with Promise.race timeout
3. DSPEngine (dsp.js) — RR artifact rejection, circular buffer, Lomb-Scargle PSD (preferred) or FFT with cubic spline, coherence score
4. AudioEngine (audio.js) — Lookahead scheduler using AudioContext.currentTime, breathing cue synthesis, three tone styles
5. WaveformRenderer (renderer.js) — requestAnimationFrame loop, Canvas 2D draw from circular buffer, visual pacer circle animation synchronized to AudioEngine's nextCueTime
6. OuraClient (oura.js) — OAuth2 PKCE flow, token storage, fetch overnight HRV/readiness from Oura API v2
7. StorageService (storage.js) — IndexedDB wrapper (idb); session records written in single transaction at session end
8. UI Panels — DOM manipulation, mode transitions (idle / discovery / practice / dashboard)

### Critical Pitfalls

1. **RR resampling before FFT inflates LF power** — Use Lomb-Scargle periodogram on the unevenly-sampled RR tachogram directly. If FFT is used, acknowledge systematic overestimation and use only relative session-to-session comparisons. This decision must be made before coherence scoring is built.

2. **RMSSD is the wrong metric for slow-breathing biofeedback** — RMSSD decreases during successful resonance frequency sessions because RSA oscillations move into the LF band (below RMSSD's sensitive frequency range). Use LF spectral power ratio as the live coherence signal. RMSSD is valid only for historical resting comparisons, never for real-time session display.

3. **Single ectopic beat destroys HRV metrics** — Implement two-tier artifact rejection: absolute bounds (300ms–2000ms) AND relative bounds (>20% deviation from 5-beat running median). After rejection, interpolate rather than delete — deletion distorts spectral estimates. Standard 25% ectopic thresholds flag legitimate RSA swings as artifacts during deep slow breathing; use biofeedback-specific 20% threshold only.

4. **Spectral window must be 120+ seconds for valid LF estimates** — LF band starts at 0.04 Hz; resolving it requires at least 25 seconds, but 90–120 seconds minimum for stable estimates. Show a "Calibrating" state for the first 2 minutes. A 30-second rolling window produces wildly unstable coherence scores.

5. **GATT reconnect promise hangs indefinitely** — Wrap every `device.gatt.connect()` in `Promise.race()` with a 10–15 second timeout. Re-register all characteristic notification listeners after successful reconnect — they are not automatically restored. Implement exponential backoff. This is a core reliability requirement, not a polish item.

6. **Multiple RR intervals per BLE notification are routinely dropped** — The 0x2A37 characteristic can carry 0–9 RR values per notification. Parse all remaining byte pairs after the flag and HR value bytes, not just the first. Validate parsed beat count against expected (session_duration × avg_HR / 60).

7. **Web Audio scheduling drift from setInterval** — Never use setInterval for breathing cue timing. Use the lookahead scheduler pattern: a 25ms setTimeout tick that looks 100ms ahead using AudioContext.currentTime and pre-schedules OscillatorNodes. This cannot be retrofitted — implement correctly from the start.

---

## Implications for Roadmap

Based on research, the build order is strictly determined by data dependencies. Each phase is blocked until its inputs exist. Suggested phase structure:

### Phase 1: Foundation — AppState and StorageService
**Rationale:** Every other module depends on AppState for communication. StorageService must exist before any session data can be saved. Zero external dependencies; provides the scaffolding for all later work.
**Delivers:** Proxy-based reactive state store with pub/sub, IndexedDB session storage with date-indexed queries.
**Addresses:** Session history (table stakes), architecture foundation
**Avoids:** localStorage pitfall (10 MB cap, synchronous writes blocking main thread)

### Phase 2: BLE Data Pipeline — Connection and RR Parsing
**Rationale:** All data-dependent features are blocked without a verified RR stream. Must be solid before any analysis layer is built on top. Reconnection reliability is a core requirement, not polish.
**Delivers:** Verified RR interval stream to AppState, connection status UI, robust reconnect with Promise.race timeout and exponential backoff.
**Addresses:** Web Bluetooth sensor connection (table stakes critical path)
**Avoids:** GATT promise hang (Pitfall 5), multiple RR intervals dropped (Pitfall 6)
**Research flag:** Low — GATT Heart Rate Service is well-specified; reconnection patterns are documented.

### Phase 3: DSP Engine — Artifact Rejection and Spectral Analysis
**Rationale:** Coherence scoring and all HRV metrics depend on clean RR data. The spectral method choice (Lomb-Scargle vs. FFT+resampling) must be made here — it cannot be swapped after coherence UI is built on top. Artifact rejection thresholds must use biofeedback-safe values, not standard HRV values.
**Delivers:** Clean RR circular buffer in AppState, LF/HF power estimates, coherence score, session quality flags (>5% artifact rate).
**Addresses:** Live coherence score (table stakes), RR artifact rejection (table stakes)
**Avoids:** RR resampling spectral errors (Pitfall 1), wrong metric RMSSD (Pitfall 2), ectopic beat inflation (Pitfall 3), insufficient FFT window (Pitfall 4)
**Research flag:** Medium — Lomb-Scargle browser JS port availability is LOW confidence; may need to evaluate fft.js + cubic spline as the practical implementation path.

### Phase 4: Visualization — Waveform Renderer and Visual Pacer
**Rationale:** Can be developed in parallel with DSP using AppState stubs (no BLE required). requestAnimationFrame loop decoupled from BLE data arrival is the correct pattern.
**Delivers:** Scrolling HR waveform on Canvas 2D, expanding breathing circle animation synchronized to AudioEngine's nextCueTime.
**Addresses:** Real-time HR waveform display (table stakes), visual breathing pacer (table stakes)
**Avoids:** Canvas redraw on every BLE event anti-pattern, circular buffer wrap-around display errors

### Phase 5: Audio Engine — Breathing Pacer
**Rationale:** Entirely standalone — no dependency on BLE or DSP. Must implement lookahead scheduler from the start; cannot be retrofitted. AudioContext lifecycle must be gated on user gesture.
**Delivers:** Sample-accurate breathing pace cues (at minimum: rising/falling pitch style), AudioContext state management.
**Addresses:** Audio breathing pacer (table stakes), multi-style audio pacer (differentiator)
**Avoids:** setInterval timing drift (Pitfall 7), AudioContext suspended on load (Pitfall 8)
**Research flag:** Low — Web Audio lookahead scheduler is documented in Chris Wilson's web.dev article; pattern is well-established.

### Phase 6: Session Logic — Discovery Mode and Practice Mode
**Rationale:** Integrates all Phase 1–5 components. Discovery mode is the core value proposition and must ship before Practice mode (Practice requires a saved resonance frequency from Discovery). This is the highest-complexity phase.
**Delivers:** Full 5-block Discovery protocol (6.5–4.5 BPM, 2 min each, RSA amplitude comparison), resonance frequency save, Practice mode (20 min at saved frequency, live coherence).
**Addresses:** Discovery mode (table stakes P1), Practice mode (table stakes P1), session timer
**Avoids:** Coherence displayed before 120s buffer filled (UX pitfall — show calibrating state)
**Research flag:** Low — clinical protocol steps are documented in PMC peer-reviewed literature.

### Phase 7: Oura Integration and Recovery Dashboard
**Rationale:** Entirely decoupled from the BLE stack. Can be built independently after Phase 1. Oura CORS behavior from a browser origin is LOW confidence — must smoke-test actual browser fetch before building dependent UI.
**Delivers:** OAuth2 PKCE Oura authentication, overnight HRV data pull and cache, recovery dashboard with session coherence + Oura HRV overlay chart.
**Addresses:** Oura Ring overnight HRV trend overlay (differentiator), recovery dashboard (differentiator)
**Avoids:** Oura PAT deprecation (Pitfall 9), CORS blocking browser fetch (Pitfall 10)
**Research flag:** High — Oura CORS behavior for direct browser fetch is not explicitly documented; must verify early. OAuth2 implicit vs PKCE flow for a client-only app needs validation against current Oura API behavior.

### Phase Ordering Rationale

- Phases 1–3 are strictly sequential: AppState before BLE, BLE before DSP.
- Phases 4 and 5 are parallelizable with each other and with Phase 3 (using AppState stubs).
- Phase 6 cannot start until Phases 1–5 are all complete.
- Phase 7 is independent of Phases 2–6 and can start after Phase 1; the Oura smoke test should happen as an early sub-task regardless.
- The critical path is 1 → 2 → 3 → 6, which is also where all the high-risk pitfalls are concentrated.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3 (DSP Engine):** Lomb-Scargle browser JS implementation availability is LOW confidence. Evaluate als-fft (updated March 2026, supports STFT) as an alternative to fft.js. Determine whether cubic spline + FFT is the practical choice over LS for this scope.
- **Phase 7 (Oura Integration):** Oura API CORS for direct browser fetch is not explicitly documented — run a browser smoke test before any dashboard work. Confirm current OAuth2 flow behavior (implicit vs PKCE) against live Oura API.

Phases with standard/well-documented patterns (research-phase optional):

- **Phase 1 (AppState + Storage):** Proxy-based reactive store and idb wrapper are well-established patterns.
- **Phase 2 (BLE):** GATT Heart Rate Service is Bluetooth SIG standard; reconnection patterns are documented in Chrome samples.
- **Phase 4 (Visualization):** Canvas rAF waveform pattern is MDN-documented.
- **Phase 5 (Audio Engine):** Lookahead scheduler pattern is web.dev-documented by the Web Audio API spec author.
- **Phase 6 (Session Logic):** Discovery protocol steps are peer-reviewed and well-specified.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core APIs verified against MDN and Chrome docs. fft.js is stable at 4.0.4 though last updated 2017; als-fft is actively maintained as a fallback. Oura OAuth2 is confirmed required but exact PKCE behavior LOW confidence. |
| Features | MEDIUM | Core feature set grounded in 4 peer-reviewed papers and direct competitor analysis. UX specifics inferred from app screenshots/marketing; no access to internal competitor implementations. MVP definition is solid. |
| Architecture | HIGH | Core patterns (AppState, BLE pipeline, lookahead scheduler, Canvas rAF) verified against official docs and spec sources. Lomb-Scargle JS port availability is LOW confidence — the algorithm is correct but browser-ready libraries are sparse. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls are grounded in peer-reviewed papers and official spec behavior. Chrome-specific BLE bug details (GATT hung promise) are MEDIUM confidence — confirmed via WebBluetoothCG GitHub issues but browser version-specific behavior may vary. Oura CORS is LOW confidence — requires empirical verification. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Lomb-Scargle JS availability:** Research flagged als-fft (updated March 2026) as the best alternative to fft.js for FFT needs, but a browser-ready Lomb-Scargle implementation was not confirmed. During Phase 3 planning, decide definitively: implement LS from scratch (Python/R reference implementation exists at Physionet), use fft.js + cubic spline with documented bias, or use als-fft's STFT for windowed analysis. This decision affects coherence score accuracy.

- **Oura CORS behavior:** Oura API v2 CORS headers for browser-direct fetch from localhost are not explicitly documented. Run a browser fetch smoke test in Phase 7 before building any dashboard UI. If CORS blocks the request, a minimal localhost proxy (5 lines of Node.js) solves it.

- **Oura PAT timeline:** PAT deprecation was targeted for end of 2025; actual cutoff date has LOW confidence. Implement OAuth2 PKCE from day one regardless — do not build on PAT assumption even for prototyping.

- **Garmin HRM 600 open vs. bonded BLE modes:** Web Bluetooth does not support BLE bonding/SMP. The HRM 600 is stated to operate in open mode with new devices, but this should be verified empirically in Phase 2 with the actual hardware before assuming it.

---

## Sources

### Primary (HIGH confidence)
- MDN Web Bluetooth API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- Bluetooth SIG Heart Rate Service v1.0 spec — https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/
- Web Audio "A Tale of Two Clocks" (Chris Wilson, web.dev) — https://web.dev/articles/audio-scheduling
- Oura API v2 authentication docs — https://cloud.ouraring.com/docs/authentication
- A Practical Guide to Resonance Frequency Assessment for HRVB — PMC https://pmc.ncbi.nlm.nih.gov/articles/PMC7578229/
- Methods for HRVB: Systematic Review — PMC https://pmc.ncbi.nlm.nih.gov/articles/PMC10412682/
- Spectral Analysis of HRV: Time Window Matters — PMC https://pmc.ncbi.nlm.nih.gov/articles/PMC6548839/
- RMSSD Not Valid for Parasympathetic Reactivity During Slow Breathing — AJP https://journals.physiology.org/doi/full/10.1152/ajpregu.00272.2022
- Clifford et al.: Quantifying Errors in Spectral Estimates of HRV Due to Beat Replacement and Resampling — https://www.robots.ox.ac.uk/~gari/papers/CliffordTBME2004-Publish.pdf

### Secondary (MEDIUM confidence)
- GitHub: indutny/fft.js v4.0.4 — https://github.com/indutny/fft.js
- GitHub: jakearchibald/idb v8.0.3 — https://github.com/jakearchibald/idb
- Polar Verity BLE parsing walkthrough — https://dev.to/manufac/interacting-with-polar-verity-sense-using-web-bluetooth-553a
- Kubios: Preprocessing of HRV Data — https://www.kubios.com/blog/preprocessing-of-hrv-data/
- HRV4Biofeedback app features — https://www.hrv4biofeedback.com/the-app.html
- Elite HRV resonance breathing — https://help.elitehrv.com/article/394-how-can-i-find-my-resonance-breathing-pace
- Web Bluetooth reconnection pattern — https://googlechrome.github.io/samples/web-bluetooth/automatic-reconnect.html
- Heart Rate Variability Biofeedback Global Study (Scientific Reports 2025) — https://www.nature.com/articles/s41598-025-87729-7

### Tertiary (LOW confidence — needs validation)
- Oura API CORS behavior for browser-direct fetch — not explicitly documented; requires empirical test
- Garmin HRM 600 open BLE mode without bonding — stated in community sources; verify with hardware
- als-fft 3.4.1 as Lomb-Scargle or FFT alternative — https://www.npmjs.com/package/als-fft (confirmed March 2026 update but full capability not verified)
- WebBluetoothCG hung promise issue — https://github.com/WebBluetoothCG/web-bluetooth/issues/31 (Chrome version-specific behavior)

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
