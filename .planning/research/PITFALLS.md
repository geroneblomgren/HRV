# Pitfalls Research

**Domain:** HRV biofeedback web app — Web Bluetooth, real-time spectral analysis, Web Audio, Oura API
**Researched:** 2026-03-21
**Confidence:** MEDIUM (core BLE parsing and HRV signal processing claims verified against multiple sources; some Chrome-specific bug details LOW confidence due to versioning uncertainty)

---

## Critical Pitfalls

### Pitfall 1: RR Interval Resampling Before FFT Introduces Systematic Spectral Errors

**What goes wrong:**
RR intervals arrive unevenly spaced in time (each beat is a timestamp, not a regular sample). Developers instinctively resample them onto a uniform grid (e.g., 4 Hz via linear or cubic interpolation) before running FFT. This resampling step consistently overestimates power spectral density (PSD) across all frequency bands, and the error compounds when artifacts have been deleted or interpolated. The resulting LF power reading will be artificially inflated, producing false "coherence" scores that do not reflect true RSA.

**Why it happens:**
FFT requires evenly sampled input. Resampling feels like a natural preprocessing step. The error is invisible — the spectrum still looks clean and well-shaped.

**How to avoid:**
Use the Lomb-Scargle periodogram directly on the unevenly sampled RR tachogram. It is designed for irregular time series and produces accurate PSD estimates with no resampling step. Multiple peer-reviewed studies show LS outperforms resampling+FFT, particularly when 10-20% of intervals are artifacts. If FFT is retained for simplicity, use cubic spline (not linear) interpolation at 4 Hz minimum, acknowledge the systematic overestimation bias, and never report absolute LF power — only relative changes across sessions.

**Warning signs:**
LF power values that seem implausibly high at session start (before breathing stabilizes). Coherence scores that read high even when the user is breathing irregularly. LF peak that broadens or bifurcates when artifacts are present.

**Phase to address:**
Phase implementing real-time spectral analysis (FFT/periodogram core). This is a foundational signal processing decision that cannot be easily swapped after the coherence scoring is built on top of it.

---

### Pitfall 2: Treating RMSSD as the Primary Biofeedback Metric During Slow Breathing

**What goes wrong:**
RMSSD (root mean square of successive differences) is the most commonly cited HRV metric and appears in consumer apps everywhere. It is appropriate for 24-hour recordings or 5-minute resting measurements. During resonance frequency biofeedback sessions at 4.5–6.5 breaths/min, RMSSD actually *decreases* or stays flat despite a marked increase in RSA and HRV. The reason: at slow breathing rates the dominant oscillation frequency drops below the HF band (0.15–0.40 Hz), where RMSSD is sensitive. The RFB signal lives in the LF band (0.04–0.15 Hz). Using RMSSD as the real-time coherence score will display declining numbers during a successful session, confusing and discouraging the user.

**Why it happens:**
RMSSD is the "default HRV number" in almost all tutorials and libraries. The distinction between time-domain and frequency-domain metrics, and their frequency sensitivities, is not widely appreciated outside research literature.

**How to avoid:**
Use LF power (0.04–0.15 Hz) and RSA amplitude (peak-to-trough HR swing within each breath cycle) as the primary real-time session metrics. RMSSD can still appear in the historical dashboard as a secondary metric comparing pre/post or day-to-day resting values, where it is meaningful. Do not use it as the real-time biofeedback signal.

**Warning signs:**
If session coherence scores correlate negatively with breathing depth/regularity, the wrong metric is being tracked. If users report "my score went down even though that felt great," this pitfall has been hit.

**Phase to address:**
Phase implementing coherence scoring and the real-time dashboard. Define the coherence metric formula before building any UI that displays it.

---

### Pitfall 3: Single Ectopic Beat Destroys HRV Calculation Accuracy

**What goes wrong:**
One undetected ectopic beat (premature contraction) in a short session recording can inflate RMSSD by 200–400% and distort SDNN by 50%. In frequency-domain analysis, a single artifact produces spectral smearing across all bands. The artifact appears as an anomalously short RR interval followed by a compensatory long one — generating two large squared differences that dominate the RMSSD sum, or appearing as broadband noise in the power spectrum.

**Why it happens:**
Basic artifact rejection (reject <300ms or >2000ms) catches obvious outliers but misses ectopic beats at plausible beat intervals (e.g., a PVC at 650ms when the running mean is 900ms passes the absolute threshold check but is 28% shorter than expected — flagged by a relative threshold only if the threshold is tight).

**How to avoid:**
Implement two-tier artifact rejection:
1. Absolute bounds: reject RR < 300ms or RR > 2000ms.
2. Relative bounds: reject RR that differs from a local running median by more than 20% (already in PROJECT.md requirements — verify this is implemented before the coherence algorithm is built on top).

After rejection, use *interpolation* (cubic spline or linear fill from neighbors) rather than deletion. Deletion removes the beat entirely, reducing the total IBI count and introducing gaps that distort spectral estimation. Even a small gap percentage (>5% deleted) causes more than 5% error in LF/HF power estimates. Log artifact count and percentage per session; flag sessions with >5% artifact rate as low-quality.

**Warning signs:**
Coherence score spikes suddenly during a calm session. RMSSD jumps by 2-3x in a single 10-second window. Session ends with artifact percentage logged above 5%.

**Phase to address:**
Phase implementing BLE data ingestion and RR interval processing — before any HRV metrics are computed.

---

### Pitfall 4: Insufficient Data Window for LF Band Spectral Resolution

**What goes wrong:**
The LF band starts at 0.04 Hz. To resolve a frequency of 0.04 Hz with FFT, the time window must be at least 1/0.04 = 25 seconds long. In practice, 90–120 seconds is needed for stable LF power estimates, and 5 minutes is the Task Force standard for fully valid frequency-domain HRV. Running FFT on a 30-second rolling window produces an LF power estimate with frequency resolution of only 0.033 Hz — too coarse to distinguish LF from VLF, and unstable enough to make coherence scores jump wildly second-to-second.

**Why it happens:**
Short windows feel more "real-time." Developers grab 30 seconds of data, throw it at FFT, and the spectrum *looks* reasonable because something appears at approximately 0.1 Hz. The instability only becomes obvious when watching the score change erratically.

**How to avoid:**
Use a minimum 120-second window for LF power estimation (90 seconds absolute minimum per the PMC resonance frequency assessment study). Implement a sliding window that advances every 5–10 seconds but always spans at least 120 seconds of data — this gives reasonable update frequency with stable spectral estimates. Apply a Hann window to the data segment before FFT to reduce spectral leakage at segment edges. Display a "calibrating" state during the first 2 minutes of each session while the buffer fills.

**Warning signs:**
Coherence score oscillates faster than the breathing cycle. LF peak location jumps by more than one frequency bin between successive updates. Score changes drastically when the user takes a single unusual breath.

**Phase to address:**
Phase implementing real-time FFT and coherence display. The window duration decision must be made before the waveform/score UI is built.

---

### Pitfall 5: Web Bluetooth GATT Promise Hangs After gattserverdisconnected Without Timeout

**What goes wrong:**
When the BLE connection drops (Garmin HRM goes to sleep, user moves out of range, battery low), the `gattserverdisconnected` event fires. The standard reconnect pattern calls `device.gatt.connect()` again. This call can hang indefinitely — the Promise never resolves or rejects. Chrome's Web Bluetooth implementation does not enforce a timeout on `gatt.connect()` if the peripheral is still broadcasting but not responding to the connection handshake. The app appears frozen waiting for a connection that will never complete.

**Why it happens:**
Chrome's Web Bluetooth implementation has known gaps around connection promise resolution after an unexpected disconnect. This is a recognized issue in the WebBluetoothCG spec discussions and multiple community bug reports.

**How to avoid:**
Wrap every `device.gatt.connect()` call in a `Promise.race()` with a manual timeout (10–15 seconds). On timeout, abort and display a "reconnect failed" UI with a manual "Try Again" button. Implement exponential backoff on reconnect attempts (1s, 2s, 4s, up to 30s cap). Listen for `gattserverdisconnected` and immediately re-register all characteristic notification listeners after a successful reconnect — they are not automatically restored. Keep a session-state flag so the app does not silently continue displaying stale waveform data after disconnect.

**Warning signs:**
App UI appears to show HR data frozen at last value. "Connecting..." spinner that never resolves. No error message after device goes out of range.

**Phase to address:**
Phase implementing BLE connection management. Do not defer reconnection logic to "polish" — it is a core reliability requirement for a tool used in daily sessions.

---

### Pitfall 6: Parsing Only the First RR Interval From Each BLE Notification

**What goes wrong:**
The BLE Heart Rate Service (characteristic 0x2A37) can deliver up to 9 RR-interval values in a single notification, depending on the flag byte, heart rate format (UINT8 vs UINT16), and whether Energy Expended is present. A common implementation error reads only the first RR interval and discards the rest. At 60 bpm with slow breathing, there may be 2–4 RR intervals per notification. Discarding them creates a sparse tachogram that misses beats, reducing effective sampling density and making coherence scoring less accurate.

**Why it happens:**
Tutorials and examples typically show how to read the HR value and stop. RR interval extraction is buried in the spec. The "read remaining bytes as pairs" logic is not obvious.

**How to avoid:**
After reading the flags byte (byte 0), conditionally skip the HR value (1 byte for UINT8, 2 bytes for UINT16) and the optional Energy Expended field (2 bytes if flag bit 3 is set), then iterate over all remaining bytes in pairs as little-endian UINT16 values, dividing each by 1024 to convert to seconds. Process all RR intervals extracted from a single notification as sequential beats. Note the Garmin HRM 600 uses 1/1024-second resolution, not milliseconds — do not multiply by 1000 until after the 1024 division.

**Warning signs:**
Heart rate appears to skip beats (tachogram shows gaps). RR interval count per session is approximately half what's expected for the session duration and HR. Coherence scores are stable but lower than expected even with clean, regular breathing.

**Phase to address:**
Phase implementing BLE data ingestion — specifically the `characteristicvaluechanged` handler. Verify parsed beat count vs. expected beat count (session_duration_seconds * avg_HR / 60) before computing any HRV metrics.

---

### Pitfall 7: Web Audio Breathing Pacer Timing Drift from JavaScript Timer Reliance

**What goes wrong:**
Scheduling breathing cues with `setInterval()` or `setTimeout()` causes the audio to drift and jitter. JavaScript's event loop can be delayed by DOM rendering, garbage collection, or even incoming BLE notifications processed on the main thread. A 25ms jitter in a 5-breath/min pacer (12-second cycle) is imperceptible. But 150–300ms jitter (common under GC pressure) makes the audio cue feel sloppy, and a user synchronizing their breath to the pacer will notice desynchronization. Over a 20-minute session the drift compounds.

**Why it happens:**
`setInterval` feels like the natural tool for "play a sound every N seconds." The Web Audio clock is less discoverable. The jitter is not noticeable during development when the machine is idle.

**How to avoid:**
Use the "lookahead scheduler" pattern from web.dev/audio-scheduling. Maintain a `nextNoteTime` variable in `AudioContext.currentTime` units. Use `setInterval` at 25ms as a tick to check whether any scheduled notes are within the lookahead window (100ms ahead), and pre-schedule them using `oscillatorNode.start(nextNoteTime)`. Audio nodes are scheduled on the audio thread with sample-accurate precision regardless of main-thread activity. The `AudioContext.currentTime` clock is hardware-backed and does not drift. Create a fresh `OscillatorNode` for each cue — oscillators are one-shot and cannot be restarted.

**Warning signs:**
Breathing pacer sounds choppy or irregular during a 15-minute session. Pacer timing appears fine in a 30-second test but drifts during longer sessions. User reports the audio cue "slipped" compared to the visual circle animation.

**Phase to address:**
Phase implementing the audio breathing pacer. The scheduler architecture must be correct from the start — it is extremely difficult to retrofit precise timing onto an existing setTimeout-based scheduler.

---

### Pitfall 8: AudioContext Created on Page Load Starts Suspended

**What goes wrong:**
Chrome enforces autoplay policy: an `AudioContext` created before a user gesture starts in the "suspended" state. Calling `.start()` on nodes returns no error, but produces no audio. The context silently discards all scheduled audio. There is no thrown exception. Users see a functioning UI but hear nothing.

**Why it happens:**
`new AudioContext()` is often placed in module initialization code that runs immediately. The Chrome DevTools console does warn "The AudioContext was not allowed to start," but only if the developer has the console open.

**How to avoid:**
Create `AudioContext` inside the handler for the first user interaction (the "Start Session" button click, which also initiates the BLE connection). Alternatively, create it on page load but call `audioContext.resume()` inside the first user gesture handler and check `audioContext.state === 'suspended'` before playing any sound. Never rely on audio working if the context was created outside a user gesture.

**Warning signs:**
No audio during first test run. Audio works after clicking any button but not on initial page load test. `audioContext.state` logs as `'suspended'`.

**Phase to address:**
Phase implementing the audio breathing pacer — specifically the initialization sequence.

---

### Pitfall 9: Oura API Personal Access Tokens Being Deprecated — OAuth2 Required

**What goes wrong:**
Oura announced the deprecation of Personal Access Tokens (PAT) by end of 2025. Apps built on PAT-only authentication will break when tokens are invalidated. Additionally, the OAuth2 "client-side only" flow (implicit flow / PKCE without a backend) does not support refresh tokens — once the 30-day access token expires, the user must re-authenticate manually. For a personal tool with no backend, this creates a friction point every month.

**Why it happens:**
PATs are far simpler to implement in a pure frontend app (just store the token string in localStorage). OAuth2 with PKCE in a client-only app requires implementing the authorization code flow redirect, which requires either a localhost redirect URI during development or a hosted redirect handler.

**How to avoid:**
Implement OAuth2 PKCE flow from the start. Set the redirect URI to `http://localhost:PORT/callback` during development. For a personal tool, accepting monthly re-authentication as a known limitation is acceptable — document it explicitly. Store the access token in `localStorage` (it is a personal single-user tool, not multi-tenant). Implement a token expiration check on startup and redirect to OAuth if expired. Do not store the token in a JavaScript variable that resets on page reload.

**Warning signs:**
Oura API returns 401 after working for several weeks. App built using PAT flow stops receiving data after the deprecation cutoff. User must manually copy-paste a new token.

**Phase to address:**
Phase implementing Oura API integration and the historical dashboard.

---

### Pitfall 10: Oura API CORS — Direct Browser Fetch May Require Specific Headers

**What goes wrong:**
Browser-direct API calls to `api.ouraring.com` from `localhost` or a hosted origin require the Oura API to send appropriate CORS headers. If Oura does not include the requesting origin in `Access-Control-Allow-Origin`, the browser blocks the response before JavaScript sees it. This is invisible during server-side testing (curl works fine) but silently fails in the browser. Official Oura docs do not explicitly document CORS behavior for browser clients.

**Why it happens:**
Personal tools are often built as pure frontend apps without a CORS proxy backend. The developer tests with curl or Postman and assumes browser fetch will work identically.

**How to avoid:**
Test the Oura API call early in development from the actual browser origin (not curl/Postman). If CORS errors appear, options are: (a) a simple localhost proxy server (a few lines of Node.js), or (b) verify that OAuth2 bearer token requests to the v2 API use the standard `Authorization: Bearer` header which many APIs whitelist. Confidence on Oura's CORS policy is LOW — verify this with an actual browser fetch call in phase 1 of Oura integration before building any dependent UI.

**Warning signs:**
DevTools Network tab shows the Oura request as "blocked" or returns a CORS error. `fetch()` rejects with a network error rather than an HTTP status error.

**Phase to address:**
Phase implementing Oura API integration — specifically as a first-integration smoke test before building the dashboard.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use FFT with cubic spline resampling instead of Lomb-Scargle | Much simpler to implement; FFT is widely understood | Systematic LF power overestimation; coherence scores are inflated but consistent | Acceptable for MVP if LF power is only used for relative session-to-session comparison, never as an absolute value |
| Use `setInterval` for breathing pacer instead of lookahead scheduler | Faster to implement | Timing jitter in long sessions; user notices drift at 15+ minutes | Never acceptable for the core pacer — use lookahead scheduler from day 1 |
| Store Oura PAT directly in localStorage | Zero OAuth2 complexity | Breaks when PAT deprecated (end of 2025); no refresh mechanism | Acceptable only for a 2-3 week MVP proof-of-concept, not for ongoing use |
| Skip per-session artifact percentage tracking | Simpler session storage schema | Cannot identify low-quality sessions in historical analysis; no early warning for lead placement issues | Never acceptable — log artifact count costs nothing |
| Use RMSSD for real-time display instead of LF power | Widely understood metric | Wrong metric for slow-breathing biofeedback; actively misleads user | Never for real-time session display; acceptable as secondary historical metric only |
| Single-transaction IndexedDB writes (one transaction per RR interval) | Simpler async code | ~2 seconds to write 1000 records; will block UI at session end | Never — batch writes in a single transaction at session save time |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Web Bluetooth / Garmin HRM 600 | Requesting the HRM service by name rather than UUID, or requesting only `heart_rate` without ensuring the `0x2A37` characteristic is correctly subscribed | Request `'heart_rate'` service (or UUID `0x180D`); explicitly get characteristic `'heart_rate_measurement'` (UUID `0x2A37`); call `startNotifications()` and attach `characteristicvaluechanged` listener |
| BLE 0x2A37 characteristic | Assuming HR value is always UINT8; assuming only one RR interval per notification | Always check flag byte bit 0 for UINT8 vs UINT16 HR format; iterate all remaining byte pairs as RR values |
| Web Audio API | Creating `AudioContext` outside a user gesture; reusing `OscillatorNode` (cannot be restarted) | Create (or resume) `AudioContext` inside the "Start Session" click handler; create a new `OscillatorNode` for each audio event |
| Oura API v2 | Using deprecated Personal Access Token flow; ignoring token expiration; not implementing token refresh | Implement OAuth2 PKCE flow; check token expiry on startup; handle 401 with re-auth redirect |
| IndexedDB | Writing each RR interval as a separate transaction during a 20-minute session | Accumulate RR intervals in memory during the session; write all to IndexedDB in a single transaction at session end |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Running FFT on every new RR interval (per-beat updates) | Main thread spikes every ~800ms; canvas animation stutters; BLE notification processing falls behind | Throttle FFT updates to every 5–10 seconds on a sliding window | Immediately on first run — FFT on 120s of data at 4 Hz sample rate is ~480 points, CPU-trivial, but scheduling it per beat wastes cycles |
| Canvas waveform that redraws the entire plot on each BLE notification | Waveform jank at 60+ bpm; canvas flicker | Use a circular buffer and redraw only the new segment each animation frame; use `requestAnimationFrame` — decouple BLE data ingestion from canvas rendering | Visible immediately when HR > 60 bpm |
| localStorage for RR interval history (sessions accumulate over weeks) | localStorage quota exceeded (~5MB) silently fails; `setItem` throws | Use IndexedDB from day 1 for session storage; localStorage only for app preferences and tokens | After approximately 30–60 sessions depending on session length |
| Keeping all session RR intervals in memory across the page lifetime | Memory grows continuously if the user browses the dashboard for a long time | Load only the current session data eagerly; load historical RR intervals lazily (on demand per session view) | With weeks of daily sessions, this could be 100k+ RR intervals loaded unnecessarily |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing Oura OAuth2 access token in a JavaScript global variable | Token lost on page refresh; user must re-authenticate constantly | Store in localStorage with expiry check on load |
| Logging RR interval data to browser console in production | Health data leakage if DevTools is open and screenshared | Use a `DEBUG` flag; disable all HR/RR console logging in production builds |
| No HTTPS for local development | Web Bluetooth API unavailable without secure origin; Oura OAuth redirect will fail | Use `localhost` (which counts as secure origin) during development; for any hosted version, HTTPS is mandatory |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Displaying coherence score during the first 2 minutes before the analysis window is filled | Score oscillates wildly and looks broken | Show a "Calibrating (filling analysis window)" state for the first 120 seconds; display estimated seconds remaining |
| No visual distinction between "connected and receiving data" vs. "connected but no beats detected" (e.g., lead not wet) | User thinks the app is working but no valid HRV data is being collected | Show a beat-indicator heartbeat animation that pulses with each received RR interval; grey out the waveform and score if no beats received for >5 seconds |
| Abrupt audio cues (clicks, pops when oscillator starts/stops) | Distracting during a relaxation practice session | Apply short envelope attack and release (5–20ms) to every audio cue using a `GainNode`; never cut audio abruptly |
| Playing audio before the user is visually cued the session has started | Startling; user may not understand what they are hearing | Keep audio muted until the user explicitly clicks "Start Session" and the BLE connection confirms data is flowing |
| Coherence score displayed as a raw LF power value in ms² | Meaningless to non-researchers; no intuitive range | Map to a 0–100% coherence index: (current LF power) / (best LF power in session) * 100; or use peak prominence as a dimensionless ratio |

---

## "Looks Done But Isn't" Checklist

- [ ] **BLE connection:** Reconnect logic handles the hung-promise case — verify with `Promise.race()` timeout, not just `gattserverdisconnected` listener
- [ ] **RR interval parsing:** Parser extracts *all* RR intervals per notification, not just the first — verify by logging parsed beat count vs expected
- [ ] **Artifact rejection:** Both absolute AND relative thresholds implemented — verify with a synthetic RR stream containing a PVC at 650ms (mean 900ms)
- [ ] **Artifact handling:** Deleted artifacts are *interpolated*, not simply removed — verify tachogram length equals elapsed time × mean HR
- [ ] **FFT window:** Buffer refuses to compute LF power until 120 seconds of clean data are accumulated — verify calibration state displays for full first 2 minutes
- [ ] **FFT window function:** Hann (or Hamming) window applied to data segment before FFT — verify by checking that a pure 0.1 Hz sine input produces a narrow single peak, not a smeared broad peak
- [ ] **Audio pacer:** Uses lookahead scheduler with `AudioContext.currentTime`, not `setInterval` for note timing — verify by measuring actual audio gap over 60-second interval
- [ ] **AudioContext state:** Checked for `'suspended'` and resumed inside the first user gesture — verify by opening app, waiting 5 seconds, clicking Start, and confirming audio plays
- [ ] **Oura OAuth:** Access token expiration detected on startup; re-auth flow triggered automatically — verify by manually setting a past expiry timestamp in localStorage
- [ ] **IndexedDB writes:** Session RR data written in a single transaction at session end, not per-beat — verify by measuring save time for a 20-minute session
- [ ] **Session data integrity:** Sessions with >5% artifact rate are flagged as low-quality in storage — verify by injecting 6% synthetic artifacts

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong metric used for real-time display (RMSSD instead of LF power) | LOW | Replace display computation; existing RR storage is unaffected; historical RR data can be recomputed |
| FFT resampling errors in stored session coherence scores | MEDIUM | Re-run spectral analysis offline against stored RR interval buffers if switching to Lomb-Scargle post-launch; stored raw RR data is the source of truth |
| Artifact deletion instead of interpolation implemented | MEDIUM | Add interpolation pass; re-process all stored sessions against raw RR buffers |
| Audio timing using setInterval — drifts during long sessions | HIGH | Requires full refactor of pacer scheduling; cannot be patched incrementally; user-facing quality regression until fixed |
| PAT-only Oura auth breaks at deprecation | MEDIUM | Implement OAuth2 PKCE flow; existing stored session data (RR intervals) is unaffected; only Oura integration needs update |
| GATT promise hang in reconnect — app freezes | MEDIUM | Add `Promise.race()` timeout to reconnect; add "Connection failed — tap to retry" manual fallback |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| RR resampling spectral errors (use Lomb-Scargle or acknowledge FFT bias) | Phase: Real-time spectral analysis | Run synthetic test: pure 0.1 Hz RR oscillation produces LF peak at 0.1 Hz with correct power; compare LS vs FFT+resample output |
| RMSSD as wrong metric for slow breathing | Phase: Coherence scoring design | Confirm coherence score rises when LF peak amplitude increases; confirm it does not track RMSSD direction during 5 bpm breathing test |
| Ectopic beat artifact inflation | Phase: BLE data ingestion & RR processing | Inject synthetic PVC into RR stream; verify artifact detected, interpolated, and session quality flag triggers |
| Insufficient FFT window (< 120s) | Phase: Real-time spectral analysis | Assert analysis refuses to output coherence score before 120s buffer filled; show calibrating UI |
| GATT promise hang on reconnect | Phase: BLE connection management | Test by powering off HRM mid-session; verify reconnect attempt times out in ≤15s and displays error |
| Multiple RR intervals per notification dropped | Phase: BLE data ingestion | Log notification beat count; verify total beats / session time ≈ avg HR / 60 |
| Web Audio timing drift | Phase: Audio breathing pacer | Measure actual audio interval over 60 seconds; verify < 5ms deviation from target |
| AudioContext suspended on load | Phase: Audio breathing pacer | Test on fresh page load without pre-interaction; verify audio plays after first button click only |
| Oura PAT deprecation / OAuth required | Phase: Oura API integration | Implement and test PKCE flow from day one; do not build on PAT assumption |
| Oura CORS browser access | Phase: Oura API integration (smoke test first) | Run actual browser fetch from development origin before building any dashboard UI |
| IndexedDB single-transaction writes | Phase: Session storage | Benchmark write time for 1440 RR intervals (20-min session at 72 bpm); verify < 100ms |

---

## Sources

- [Quantifying Errors in Spectral Estimates of HRV Due to Beat Replacement and Resampling — Clifford et al.](https://www.robots.ox.ac.uk/~gari/papers/CliffordTBME2004-Publish.pdf) (Lomb-Scargle vs FFT+resample systematic errors)
- [Spectral Analysis of HRV: Time Window Matters — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6548839/) (minimum window durations for LF validity)
- [A Practical Guide to Resonance Frequency Assessment for HRV Biofeedback — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7578229/) (90–180s epoch requirements, manual vs automated artifact correction, PPG vs ECG during slow breathing)
- [Impact of Artifact Correction Methods on HRV Parameters — Journal of Applied Physiology](https://journals.physiology.org/doi/full/10.1152/japplphysiol.00927.2016) (deletion vs interpolation error quantification)
- [RMSSD Not Valid for Parasympathetic Reactivity During Slow Breathing — American Journal of Physiology](https://journals.physiology.org/doi/full/10.1152/ajpregu.00272.2022) (RMSSD decreases during successful RFB sessions)
- [HRV4Training: Issues in HRV Analysis — Motion Artifacts & Ectopic Beats](https://www.hrv4training.com/blog2/issues-in-heart-rate-variability-hrv-analysis-motion-artifacts-ectopic-beats)
- [An Overview of HRV Metrics and Norms — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5624990/) (RMSSD formula, artifact sensitivity, ectopic beat effects)
- [A Tale of Two Clocks — web.dev (Web Audio scheduling)](https://web.dev/articles/audio-scheduling) (lookahead scheduler pattern, setTimeout unreliability)
- [Extracting Heart Rate Measurements from BLE Packets — mariam.qa](https://mariam.qa/post/hr-ble/) (0x2A37 flag parsing, multiple RR per notification, UINT16/1024 conversion)
- [Bluetooth Heart Rate Service Specification v1.0 — Bluetooth SIG](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/out/en/index-en.html) (official 0x2A37 characteristic structure)
- [Web Bluetooth Automatic Reconnect Sample — Google Chrome Samples](https://googlechrome.github.io/samples/web-bluetooth/automatic-reconnect.html) (exponential backoff reconnect pattern)
- [Web Bluetooth Issue #31 — Reconnection behavior](https://github.com/WebBluetoothCG/web-bluetooth/issues/31) (hung promise after gattserverdisconnected)
- [Oura API Authentication Documentation](https://cloud.ouraring.com/docs/authentication) (OAuth2, PAT deprecation, token expiry behavior)
- [Web Audio API Best Practices — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) (AudioContext suspended state, user gesture requirements)
- [RxDB: Solving IndexedDB Slowness](https://rxdb.info/slow-indexeddb.html) (single-transaction vs per-write performance)

---
*Pitfalls research for: HRV biofeedback web app (ResonanceHRV)*
*Researched: 2026-03-21*
