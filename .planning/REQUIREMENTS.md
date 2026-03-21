# Requirements: ResonanceHRV

**Defined:** 2026-03-21
**Core Value:** Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### BLE Connection

- [ ] **BLE-01**: App connects to Garmin HRM 600 via Web Bluetooth using Heart Rate Service (0x180D)
- [ ] **BLE-02**: App streams RR intervals in real-time from characteristic 0x2A37, handling multiple RR values per notification
- [ ] **BLE-03**: Connection status indicator shows connecting/connected/disconnected states
- [ ] **BLE-04**: App auto-reconnects when BLE connection drops, with Promise.race() timeout to prevent hung promises
- [ ] **BLE-05**: App rejects artifact RR intervals (< 300ms, > 2000ms, > 20% deviation from 5-beat running median)

### Signal Processing

- [ ] **DSP-01**: App computes instantaneous heart rate from clean RR intervals for waveform display
- [ ] **DSP-02**: App performs spectral analysis on RR-interval data to identify LF power peak (0.04-0.15 Hz band)
- [ ] **DSP-03**: App computes coherence score as LF peak power / total spectral power (0.04-0.26 Hz), rolling 64s window, updated every 1-2s
- [ ] **DSP-04**: App displays "calibrating" state for first 90-120s while accumulating sufficient data for stable spectral analysis
- [ ] **DSP-05**: App computes RSA amplitude (peak-to-trough HR variation) per frequency block during Discovery mode

### Breathing Pacer

- [ ] **PAC-01**: Visual pacer displays expanding/contracting circle animation timed to inhale/exhale at configurable breathing rate
- [ ] **PAC-02**: Audio pacer style 1: sine wave (~300-400 Hz) with pitch rising on inhale, falling on exhale, smooth gain envelopes
- [ ] **PAC-03**: Audio pacer style 2: constant pitch with volume swelling on inhale, fading on exhale
- [ ] **PAC-04**: Audio pacer style 3: soft chime tones at inhale/exhale transition points
- [ ] **PAC-05**: User can switch between audio styles without restarting the session
- [ ] **PAC-06**: Audio uses Web Audio API lookahead scheduler pattern (25ms setTimeout + 100ms pre-scheduling) for drift-free timing over 20-min sessions
- [ ] **PAC-07**: Session timer displays time remaining (countdown) for practice sessions and per-block countdown for discovery sessions

### Discovery Mode

- [ ] **DISC-01**: Discovery mode guides user through 5 breathing rate blocks: 6.5, 6.0, 5.5, 5.0, 4.5 breaths/min, 2 minutes each
- [ ] **DISC-02**: Real-time HR waveform visible during each block showing RSA oscillation
- [ ] **DISC-03**: Power spectrum chart visible during each block showing LF peak position and amplitude
- [ ] **DISC-04**: After all blocks, app displays comparison of RSA amplitude and LF peak power across all 5 frequencies
- [ ] **DISC-05**: User confirms resonance frequency selection and app saves it to IndexedDB for Practice mode

### Practice Mode

- [ ] **PRAC-01**: Practice mode loads saved resonance frequency and runs breathing pacer at that rate
- [ ] **PRAC-02**: Default session length is 20 minutes with visible countdown timer
- [ ] **PRAC-03**: Real-time scrolling HR waveform displayed during practice (60s visible window)
- [ ] **PRAC-04**: Live coherence score displayed prominently, updating every 1-2 seconds
- [ ] **PRAC-05**: Session summary shown on completion: duration, mean coherence, peak coherence, time in high coherence

### Visualization

- [ ] **VIZ-01**: Real-time scrolling HR waveform rendered on Canvas 2D using requestAnimationFrame at 60fps
- [ ] **VIZ-02**: Power spectrum chart rendered on Canvas showing frequency (Hz) vs power, with LF band highlighted
- [ ] **VIZ-03**: Coherence score displayed as a large readable number/gauge that updates smoothly

### Oura Integration

- [ ] **OURA-01**: App authenticates with Oura API v2 via OAuth2 (authorization code flow or implicit flow)
- [ ] **OURA-02**: App pulls daily readiness/sleep data including overnight HRV (rMSSD) for the past 30 days
- [ ] **OURA-03**: Oura data cached in IndexedDB and refreshed on each app load

### Recovery Dashboard

- [ ] **DASH-01**: Dashboard displays session coherence trend (mean coherence per session) over days/weeks
- [ ] **DASH-02**: Dashboard overlays Oura overnight HRV trend on the same time axis
- [ ] **DASH-03**: Dashboard renders as a Canvas chart with dual Y-axes (coherence 0-100, HRV in ms)

### Storage

- [x] **STOR-01**: All session data (date, mode, duration, frequency, mean coherence, RR summary stats) stored in IndexedDB via idb library
- [x] **STOR-02**: Saved resonance frequency persisted in IndexedDB, loaded on app start
- [x] **STOR-03**: Oura data cached in IndexedDB with timestamp for freshness checking

## v2 Requirements

### Data Export

- **EXP-01**: User can export all session data to JSON with one click
- **EXP-02**: User can export RR-interval time series from individual sessions

### Refinement

- **REF-01**: Adjustable inhale/exhale ratio (default 1:1, support 4:6 and custom)
- **REF-02**: Multiple resonance frequency profiles for periodic re-testing

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile/responsive design | Desktop Chrome only; seated sessions; Web Bluetooth unavailable on iOS |
| Cloud sync / user accounts | Personal tool; local storage sufficient; avoids backend complexity |
| iOS/Safari support | Web Bluetooth not available on WebKit platforms |
| Camera PPG fallback | HRM 600 provides superior RR data; camera adds complexity for no gain |
| Gamification (streaks, badges) | Encourages quantity over quality; conflicts with session length goals |
| Guided meditation audio | Distracts from biofeedback signal; user should watch waveform |
| Morning readiness measurement | Oura Ring already provides this via API |
| Social/sharing features | Misaligned with personal medical/recovery tool |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BLE-01 | Phase 1 | Pending |
| BLE-02 | Phase 1 | Pending |
| BLE-03 | Phase 1 | Pending |
| BLE-04 | Phase 1 | Pending |
| BLE-05 | Phase 1 | Pending |
| STOR-01 | Phase 1 | Complete |
| STOR-02 | Phase 1 | Complete |
| STOR-03 | Phase 1 | Complete |
| DSP-01 | Phase 2 | Pending |
| DSP-02 | Phase 2 | Pending |
| DSP-03 | Phase 2 | Pending |
| DSP-04 | Phase 2 | Pending |
| DSP-05 | Phase 2 | Pending |
| VIZ-01 | Phase 2 | Pending |
| VIZ-02 | Phase 2 | Pending |
| VIZ-03 | Phase 2 | Pending |
| PAC-01 | Phase 3 | Pending |
| PAC-02 | Phase 3 | Pending |
| PAC-03 | Phase 3 | Pending |
| PAC-04 | Phase 3 | Pending |
| PAC-05 | Phase 3 | Pending |
| PAC-06 | Phase 3 | Pending |
| PAC-07 | Phase 3 | Pending |
| DISC-01 | Phase 4 | Pending |
| DISC-02 | Phase 4 | Pending |
| DISC-03 | Phase 4 | Pending |
| DISC-04 | Phase 4 | Pending |
| DISC-05 | Phase 4 | Pending |
| PRAC-01 | Phase 4 | Pending |
| PRAC-02 | Phase 4 | Pending |
| PRAC-03 | Phase 4 | Pending |
| PRAC-04 | Phase 4 | Pending |
| PRAC-05 | Phase 4 | Pending |
| OURA-01 | Phase 5 | Pending |
| OURA-02 | Phase 5 | Pending |
| OURA-03 | Phase 5 | Pending |
| DASH-01 | Phase 5 | Pending |
| DASH-02 | Phase 5 | Pending |
| DASH-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 39 total (note: header previously stated 30; actual count is 39 across 9 categories)
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after roadmap creation*
