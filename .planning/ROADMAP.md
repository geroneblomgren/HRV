# Roadmap: ResonanceHRV

## Milestones

- ✅ **v1.0 Core HRV Biofeedback** - Phases 1-5 (shipped 2026-03-22)
- ✅ **v1.1 Muse-S Neurocardiac Integration** - Phases 6-9 (shipped 2026-04-03)
- 🔄 **v1.2 Adaptive Closed-Loop Biofeedback** - Phases 10-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 Core HRV Biofeedback (Phases 1-5) - SHIPPED 2026-03-22</summary>

**Milestone Goal:** Build a complete resonance frequency breathing trainer with real-time HRV biofeedback via Garmin HRM 600 and Oura overnight recovery tracking.

### Phase 1: Foundation
**Goal**: The app can connect to the Garmin HRM 600, stream verified RR intervals into a reactive state store, and persist session data to IndexedDB — the data pipeline all later phases depend on.
**Depends on**: Nothing (first phase)
**Requirements**: BLE-01, BLE-02, BLE-03, BLE-04, BLE-05, STOR-01, STOR-02, STOR-03
**Success Criteria** (what must be TRUE):
  1. User clicks "Connect" and the browser prompts for Bluetooth device selection; status indicator transitions through connecting → connected
  2. After pairing, RR intervals appear in the app state in real-time (verifiable via console/debug overlay) with multiple RR values per notification parsed correctly
  3. When BLE drops, the app automatically attempts reconnect with visible status change; connection resumes without page reload
  4. Session records and resonance frequency are written to IndexedDB and survive a browser refresh
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01: AppState (Proxy-based reactive store + pub/sub bus) and StorageService (idb wrapper, session/frequency/Oura stores)
- [x] 01-02: BLEService — GATT connection, 0x2A37 parsing (all RR values per notification), connection status UI, reconnect with Promise.race timeout and exponential backoff

### Phase 2: Signal Processing + Visualization
**Goal**: Raw RR intervals are cleaned, spectrally analyzed, and rendered — coherence score updates live and the HR waveform scrolls in real-time — so that every data-dependent UI element has a working foundation.
**Depends on**: Phase 1
**Requirements**: DSP-01, DSP-02, DSP-03, DSP-04, DSP-05, VIZ-01, VIZ-02, VIZ-03
**Success Criteria** (what must be TRUE):
  1. Beats outside 300ms-2000ms or deviating >20% from the 5-beat running median are silently dropped and the waveform remains smooth
  2. The app displays "Calibrating" for the first 90-120 seconds of a session, then transitions to showing a live coherence score (0-100) that updates every 1-2 seconds
  3. A scrolling HR waveform on Canvas renders at 60fps showing heart rate oscillation; a power spectrum chart shows the LF band highlighted
  4. RSA amplitude (peak-to-trough HR variation) is computed per breathing-rate block for use in Discovery mode comparison
**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — DSPEngine: FFT + cubic spline resampling, coherence scoring (HeartMath formula), RSA amplitude, calibration gate
- [x] 02-02-PLAN.md — Canvas renderers (waveform, spectrum, coherence gauge), HTML/CSS canvas layout, main.js wiring

### Phase 3: Breathing Pacer
**Goal**: The app can guide a breathing session with precise, drift-free audio and visual cues at any configurable breathing rate, with all three audio styles switchable mid-session.
**Depends on**: Phase 1
**Requirements**: PAC-01, PAC-02, PAC-03, PAC-04, PAC-05, PAC-06, PAC-07
**Success Criteria** (what must be TRUE):
  1. The expanding/contracting circle animates smoothly in sync with the configured breathing rate with no visible drift over a 20-minute session
  2. All three audio styles (rising/falling pitch, volume swell, soft chimes) produce audible cues timed to inhale/exhale transitions; user can switch between them without restarting
  3. A session countdown timer is visible and accurate (no drift vs. wall clock) for both per-block and full-session use
  4. AudioContext starts only after a user gesture; no "AudioContext not allowed" errors on load
**Plans**: 2/2 plans complete

Plans:
- [x] 03-01: AudioEngine — lookahead scheduler (25ms setTimeout + 100ms pre-schedule on AudioContext.currentTime), three tone style synthesizers, mid-session style switching, AudioContext lifecycle management
- [x] 03-02: VisualPacer — expanding/contracting circle animation synchronized to AudioEngine's nextCueTime, session timer display (countdown + per-block)

### Phase 4: Session Modes
**Goal**: The user can run a complete Discovery protocol to identify their resonance frequency and then run guided Practice sessions at that frequency — the core clinical value proposition of the app.
**Depends on**: Phase 2, Phase 3
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, PRAC-01, PRAC-02, PRAC-03, PRAC-04, PRAC-05
**Success Criteria** (what must be TRUE):
  1. User can start Discovery mode and be guided through all 5 frequency blocks (6.5, 6.0, 5.5, 5.0, 4.5 BPM) with visible HR waveform, power spectrum, and per-block countdown during each block
  2. After Discovery completes, a comparison display shows RSA amplitude and LF peak power across all 5 frequencies; user selects and saves their resonance frequency
  3. User can start Practice mode, which loads the saved resonance frequency and runs a 20-minute guided session with live coherence score and scrolling HR waveform
  4. At Practice session end, a summary screen shows duration, mean coherence, peak coherence, and time in high coherence
**Plans:** 2/2 plans complete

Plans:
- [x] 04-01-PLAN.md — Discovery mode: 5-block state machine, per-block RSA/LF capture, inter-block countdown, comparison bar chart, frequency selection and save
- [x] 04-02-PLAN.md — Practice mode: load saved frequency, duration picker, timed session with live coherence, chime at timer end, session summary, IndexedDB persistence

### Phase 5: Oura + Recovery Dashboard
**Goal**: The app pulls the user's overnight HRV data from Oura and displays a recovery dashboard showing how session coherence and overnight HRV are trending together over weeks.
**Depends on**: Phase 1
**Requirements**: OURA-01, OURA-02, OURA-03, DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. User completes OAuth2 PKCE Oura authorization flow from within the app; token is stored and reused on subsequent loads without re-auth
  2. App fetches and caches 30 days of overnight HRV (rMSSD) data from Oura API v2 on each app load; cached data is used when offline
  3. Recovery dashboard displays a Canvas chart with session coherence trend and Oura overnight HRV trend on the same time axis with dual Y-axes
**Plans**: 2/2 plans complete

Plans:
- [x] 05-01-PLAN.md — OuraClient: PAT confirmed, CORS blocked (proxy required), /sleep HRV fetch, IndexedDB cache with 6h freshness, 29 days of data verified end-to-end
- [x] 05-02-PLAN.md — Recovery Dashboard: 4 metric cards, Canvas dual-axis chart (HRV teal line + coherence purple dots), time range selector, hover tooltips, main.js wiring

</details>

<details>
<summary>✅ v1.1 Muse-S Neurocardiac Integration (Phases 6-9) - SHIPPED 2026-04-03</summary>

**Milestone Goal:** Add Muse-S headband as a second biofeedback device, providing standalone PPG-derived HRV plus live EEG neural calm metrics during sessions, with trends tracked on the recovery dashboard.

### Phase 6: Device Architecture
**Goal**: The BLE layer is refactored into an adapter pattern so HRM 600 continues working and the app is ready to host any new device type — Muse-S and future devices require zero changes to core session logic.
**Depends on**: Phase 5
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04
**Success Criteria** (what must be TRUE):
  1. User sees a device picker UI and can initiate a Garmin HRM 600 connection exactly as before — no regression in existing behavior
  2. When user connects a second device (simulated or real), both appear in an active devices panel with individual connection status indicators
  3. App correctly routes HR and RR data based on which device is connected; sessions using HRM 600 alone produce identical results to v1.0
  4. Session UI adapts based on connected device capabilities — coherence scoring is hidden when no RR-capable device is connected
**Plans**: 2/2 plans complete

Plans:
- [x] 06-01-PLAN.md — DeviceAdapter interface, HRMAdapter extracted from ble.js, DeviceManager orchestrator, multi-device AppState fields (completed 2026-04-03)
- [x] 06-02-PLAN.md — Dual device picker UI, per-device status chips, main.js rewired to DeviceManager, capability-gated UI, HR source label (completed 2026-04-03)

### Phase 7: Muse-S Connection + Signal Processing
**Goal**: The app connects to the Muse-S headband, receives live EEG and PPG data streams, and runs the full signal processing pipeline — PPG peak detection extracts RR intervals and the EEG alpha/beta FFT computes a Neural Calm score — all in real-time in the browser.
**Depends on**: Phase 6
**Requirements**: MUSE-01, MUSE-02, MUSE-03, MUSE-04, MUSE-05, PPG-01, PPG-02, EEG-01, EEG-02
**Success Criteria** (what must be TRUE):
  1. User clicks "Connect Muse-S", selects the headband in the browser picker, and sees status transition through connecting → streaming within 5 seconds; p50 preset is applied automatically enabling both PPG and EEG streams
  2. Raw PPG waveform from the infrared channel is visible in a debug or diagnostic view, showing a clear cardiac pulse waveform at approximately the user's resting heart rate
  3. App extracts beat-to-beat intervals from PPG via peak detection and artifact rejection; derived HR stays within ±5 bpm of chest strap reading during a side-by-side seated rest test
  4. Neural Calm score (alpha/beta power ratio from AF7/AF8) updates every 1-2 seconds and noticeably rises when the user closes their eyes and relaxes for 10 seconds
  5. EEG artifact rejection prevents eye blinks (100+ µV spikes on AF7/AF8) from corrupting the Neural Calm score — score remains stable during a deliberate blink sequence
**Plans**: 3/3 plans complete

Plans:
- [x] 07-01-PLAN.md — MuseAdapter BLE connection (service 0xfe8d, p50 preset, EEG/PPG data parsing), AppState Phase 7 fields, DeviceManager wiring (completed 2026-04-03)
- [x] 07-02-PLAN.md — PPG pipeline: 4th-order Butterworth bandpass (0.5-3 Hz), peak detection, IBI extraction, artifact rejection, signal quality indicator, hidden debug view (completed 2026-04-03)
- [x] 07-03-PLAN.md — EEG pipeline: sliding FFT on TP9/TP10, alpha/beta power, Neural Calm score (0-100), artifact rejection (100 µV), per-session baseline, eyes-open detection (completed 2026-04-03)

### Phase 8: Session Integration
**Goal**: A Muse-S user can run a complete practice or discovery session using PPG-derived HRV with the Neural Calm score and live EEG waveform visible alongside the existing coherence display — and the session summary captures all Muse-S metrics.
**Depends on**: Phase 7
**Requirements**: PPG-03, PPG-04, EEG-03, SESS-01, SESS-02, SESS-03
**Success Criteria** (what must be TRUE):
  1. User can start and complete a full Practice session using only the Muse-S (no chest strap) — breathing pacer runs, coherence score updates from PPG-derived RR intervals, session saves to IndexedDB
  2. Neural Calm score is visible as a live metric during any session where Muse-S is connected — it updates continuously and is visually distinct from the coherence score
  3. A live scrolling EEG waveform renders on Canvas during sessions, showing real-time brain activity across at least 2 channels
  4. When PPG-derived data is used for HRV, the coherence display is visually marked to indicate lower confidence compared to chest strap data
  5. Session summary screen shows mean Neural Calm, peak Neural Calm, and time spent above a high-calm threshold when Muse-S was used
**Plans**: 2/2 plans complete

Plans:
- [x] 08-01-PLAN.md — PPG standalone sessions, Neural Calm live gauge, PPG confidence badge, session provenance + Neural Calm trace collection (completed 2026-04-04)
- [x] 08-02-PLAN.md — Scrolling EEG waveform renderer, Neural Calm session summary metrics, human verification (completed 2026-04-03)

### Phase 9: Neural Calm Dashboard
**Goal**: Neural Calm session averages are persisted and displayed on the recovery dashboard alongside coherence and Oura HRV, so the user can see how their brain-state metric trends over days and weeks of practice.
**Depends on**: Phase 8
**Requirements**: DASH-04, DASH-05
**Success Criteria** (what must be TRUE):
  1. After completing a Muse-S session, the session's mean Neural Calm value is persisted to IndexedDB and appears on the recovery dashboard immediately on next page load
  2. Recovery dashboard displays a Neural Calm trend line alongside the existing coherence and Oura HRV trends — all three are visible on the same time axis with clearly labeled Y-axes
  3. Sessions recorded without Muse-S show no Neural Calm data point (gap in line) rather than a zero — the chart handles missing data gracefully
**Plans**: 1/1 plans complete

Plans:
- [x] 09-01-PLAN.md — Neural Calm data aggregation, blue trend line on Canvas chart, inline legend, enriched tooltips, gap handling, Avg Neural Calm 7d metric card (completed 2026-04-03)

</details>

### v1.2 Adaptive Closed-Loop Biofeedback

**Milestone Goal:** Convert from open-loop breathing pacer to closed-loop autonomic training system. Auto-tune resonance frequency before each session and optimize breath-heart phase alignment in real-time.

- [x] **Phase 10: Resonance Tuning + Mapping** - Pre-session RF identification and longitudinal trend tracking (completed 2026-04-04)
- [ ] **Phase 11: Phase Lock Engine** - Hilbert transform phase computation and score replacing coherence
- [ ] **Phase 12: Adaptive Pace Controller** - Closed-loop pace micro-adjustment driven by phase lock
- [ ] **Phase 13: Dashboard Integration** - Phase lock and RF trends on recovery dashboard with legacy labeling

## Phase Details

### Phase 10: Resonance Tuning + Mapping
**Goal**: Every practice session begins by identifying the user's current resonance frequency from live RSA data, and each session record captures that tuned frequency so the dashboard can show how RF shifts over weeks alongside Oura HRV recovery.
**Depends on**: Phase 9
**Requirements**: TUNE-01, TUNE-02, TUNE-03, TUNE-04, MAP-01, MAP-02, MAP-03
**Success Criteria** (what must be TRUE):
  1. When the user clicks "Start Session", a 60-second tuning phase begins automatically — the pacer cycles through candidate frequencies centered on their stored RF and the user sees a live "Tuning..." indicator with time remaining
  2. After tuning completes, the user sees their result: "Today: 4.7 BPM" with comparison to the stored frequency, and the practice session starts at the newly identified frequency — not the stored one
  3. When the tuned frequency differs from stored by more than 0.3 BPM, the app displays a celebratory message framing the shift as a sign of improved vagal tone, with a sparkline of RF over recent sessions
  4. The recovery dashboard displays a resonance frequency trend line showing RF across all sessions on the same time axis as Oura overnight HRV
**Plans**: 3 plans

Plans:
- [ ] 10-01-PLAN.md — Tuning engine module (js/tuning.js), AppState tuning fields, session schema
- [ ] 10-02-PLAN.md — Practice.js tuning integration, scanning animation, result display, celebration UX
- [ ] 10-03-PLAN.md — Dashboard RF trend line (purple dashed, BPM Y-axis, tooltips)

### Phase 11: Phase Lock Engine
**Goal**: The app continuously computes the instantaneous phase alignment between the breathing pacer and HR oscillation via Hilbert transform, produces a phase lock score (0-100) that replaces coherence everywhere in the session UI, and stores phase lock data per session.
**Depends on**: Phase 10
**Requirements**: LOCK-01, LOCK-02, LOCK-03, LOCK-04
**Success Criteria** (what must be TRUE):
  1. During a practice session, a phase lock gauge (0-100) is visible where the coherence gauge was — it updates every 5-10 seconds and the label reads "Phase Lock", not "Coherence"
  2. When the user breathes in steady rhythm with the pacer for 30+ seconds, the phase lock score rises above 70; when the user pauses or shifts attention, it drops noticeably within two breath cycles
  3. At session end, the summary screen shows mean phase lock, peak phase lock, and time locked in (score above 66) — coherence metrics are absent from new sessions
  4. The session record in IndexedDB contains phase lock fields (mean, peak, time locked) that can be queried by the dashboard
**Plans**: TBD

### Phase 12: Adaptive Pace Controller
**Goal**: When phase alignment falls below threshold, the app smoothly micro-adjusts the breathing pace toward better phase lock — the adjustment is felt through natural shifts in bowl echo timing, never seen as an abrupt change, and never moves more than ±0.5 BPM from the tuned frequency.
**Depends on**: Phase 11
**Requirements**: PACE-01, PACE-02, PACE-03, PACE-04
**Success Criteria** (what must be TRUE):
  1. When phase lock stays below 50 for more than 10 seconds, the pacer begins drifting — the user can hear the bowl echo interval subtly shifting but does not see any visual pace indicator change abruptly
  2. The pacer frequency never moves more than ±0.5 BPM from the tuned frequency established in the tuning phase — it cannot drift into a range where coherence would degrade significantly
  3. When the user deliberately breathes slightly slower than the pacer for 60 seconds, the controller moves toward the user's rhythm rather than fighting it — phase lock score stabilizes or improves
**Plans**: TBD

### Phase 13: Dashboard Integration
**Goal**: The recovery dashboard reflects the v1.2 metrics fully — phase lock replaces the coherence trend line, the RF trend line appears as an additional series alongside HRV, and all old coherence-based sessions remain visible with clear legacy labeling so historical data is never lost.
**Depends on**: Phase 10, Phase 11
**Requirements**: DASH-06, DASH-07, DASH-08
**Success Criteria** (what must be TRUE):
  1. The recovery dashboard displays a phase lock trend line where the coherence line was — new sessions show phase lock scores and old coherence sessions show their scores labeled "(legacy)" in a visually distinct style
  2. A resonance frequency trend line appears on the dashboard alongside the HRV and phase lock lines — all three are legible on the same chart with a clear legend
  3. Hovering over any data point shows a tooltip that correctly identifies the metric type — "Phase Lock: 78" for new sessions, "Coherence (legacy): 62" for old sessions
**Plans**: TBD

## Progress

**Execution Order:**
v1.0: 1 → 2 → 3 → 4 → 5 (complete)
v1.1: 6 → 7 → 8 → 9 (complete)
v1.2: 10 → 11 → 12 → 13

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-22 |
| 2. Signal Processing + Visualization | v1.0 | 2/2 | Complete | 2026-03-22 |
| 3. Breathing Pacer | v1.0 | 2/2 | Complete | 2026-03-22 |
| 4. Session Modes | v1.0 | 2/2 | Complete | 2026-03-22 |
| 5. Oura + Recovery Dashboard | v1.0 | 2/2 | Complete | 2026-03-22 |
| 6. Device Architecture | v1.1 | 2/2 | Complete | 2026-04-03 |
| 7. Muse-S Connection + Signal Processing | v1.1 | 3/3 | Complete | 2026-04-03 |
| 8. Session Integration | v1.1 | 2/2 | Complete | 2026-04-04 |
| 9. Neural Calm Dashboard | v1.1 | 1/1 | Complete | 2026-04-04 |
| 10. Resonance Tuning + Mapping | 3/3 | Complete    | 2026-04-04 | - |
| 11. Phase Lock Engine | 1/3 | In Progress|  | - |
| 12. Adaptive Pace Controller | v1.2 | 0/? | Not started | - |
| 13. Dashboard Integration | v1.2 | 0/? | Not started | - |
