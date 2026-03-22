# Roadmap: ResonanceHRV

## Overview

ResonanceHRV is built in five phases that follow the strict data dependency chain inherent to a real-time biofeedback system. The BLE pipeline must exist before signal processing can run; DSP and the breathing pacer must both be solid before session modes integrate them; Oura and the dashboard are fully decoupled and close out the build. Every phase delivers a coherent, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - BLE connection + RR streaming + IndexedDB storage wired through AppState (completed 2026-03-22)
- [x] **Phase 2: Signal Processing + Visualization** - Artifact rejection, spectral analysis, coherence scoring, and Canvas rendering (completed 2026-03-22)
- [x] **Phase 3: Breathing Pacer** - Visual expanding-circle animation and three audio styles with drift-free lookahead scheduler (completed 2026-03-22)
- [ ] **Phase 4: Session Modes** - Discovery protocol (5 blocks) and Practice mode (20-min guided sessions), integrating all prior phases
- [ ] **Phase 5: Oura + Recovery Dashboard** - OAuth2 PKCE Oura auth, overnight HRV pull, and dual-axis recovery trend chart

## Phase Details

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
**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — Discovery mode: 5-block state machine, per-block RSA/LF capture, inter-block countdown, comparison bar chart, frequency selection and save
- [ ] 04-02-PLAN.md — Practice mode: load saved frequency, duration picker, timed session with live coherence, chime at timer end, session summary, IndexedDB persistence

### Phase 5: Oura + Recovery Dashboard
**Goal**: The app pulls the user's overnight HRV data from Oura and displays a recovery dashboard showing how session coherence and overnight HRV are trending together over weeks.
**Depends on**: Phase 1
**Requirements**: OURA-01, OURA-02, OURA-03, DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. User completes OAuth2 PKCE Oura authorization flow from within the app; token is stored and reused on subsequent loads without re-auth
  2. App fetches and caches 30 days of overnight HRV (rMSSD) data from Oura API v2 on each app load; cached data is used when offline
  3. Recovery dashboard displays a Canvas chart with session coherence trend and Oura overnight HRV trend on the same time axis with dual Y-axes
**Plans**: TBD

Plans:
- [ ] 05-01: OuraClient — OAuth2 PKCE flow, token storage in IndexedDB, /daily_readiness and sleep HRV fetch, IndexedDB cache with freshness check
- [ ] 05-02: Recovery Dashboard — Canvas dual-axis chart (coherence 0-100 left, HRV ms right), data merge from session store + Oura cache, navigation to dashboard view

## Progress

**Execution Order:**
Phases 1 -> 2 -> 3 (can overlap with 2) -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete    | 2026-03-22 |
| 2. Signal Processing + Visualization | 2/2 | Complete    | 2026-03-22 |
| 3. Breathing Pacer | 2/2 | Complete    | 2026-03-22 |
| 4. Session Modes | 0/2 | Not started | - |
| 5. Oura + Recovery Dashboard | 0/2 | Not started | - |
