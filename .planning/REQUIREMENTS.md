# Requirements: ResonanceHRV

**Defined:** 2026-04-03
**Core Value:** Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency.

## v1.1 Requirements

Requirements for Muse-S Neurocardiac Integration. Each maps to roadmap phases.

### Device Architecture

- [x] **DEV-01**: User can select between HRM 600 chest strap and Muse-S headband from a device picker before connecting
- [x] **DEV-02**: App detects device type from BLE scan results and loads the appropriate adapter
- [x] **DEV-03**: User can connect to both HRM 600 and Muse-S simultaneously for dual biofeedback
- [x] **DEV-04**: Session modes gracefully adapt UI based on connected device capabilities (HR-only vs HR+EEG)

### Muse-S Connectivity

- [x] **MUSE-01**: User can connect to Muse-S headband via Web Bluetooth (service 0xfe8d)
- [x] **MUSE-02**: App initializes Muse-S with p50 preset to enable both EEG and PPG streaming
- [x] **MUSE-03**: App receives 4-channel EEG data (TP9, AF7, AF8, TP10) at 256 Hz from Muse-S
- [x] **MUSE-04**: App receives 3-channel PPG data at 64 Hz from Muse-S
- [x] **MUSE-05**: Connection status UI shows Muse-S state (connecting, connected, streaming, disconnected)

### PPG Heart Rate

- [x] **PPG-01**: App performs peak detection on Muse PPG waveform to extract inter-beat intervals
- [x] **PPG-02**: PPG-derived RR intervals are artifact-rejected (physiological bounds + rate-of-change filter)
- [x] **PPG-03**: User can run a full practice or discovery session using only Muse-S PPG for heart rate (no chest strap required)
- [x] **PPG-04**: PPG-derived HR and coherence scores are visually distinguished from chest-strap-derived values when accuracy confidence is lower

### EEG Processing

- [x] **EEG-01**: App computes alpha (8-12 Hz) and beta (13-30 Hz) power from EEG channels in real-time
- [x] **EEG-02**: EEG artifact rejection filters out eye blinks, jaw clenching, and movement contamination
- [x] **EEG-03**: App computes Neural Calm score (alpha/beta power ratio) updating every 1-2 seconds

### Session Integration

- [x] **SESS-01**: Neural Calm score displays as a live metric during practice and discovery sessions when Muse-S is connected
- [x] **SESS-02**: Live scrolling EEG waveform renders on Canvas during sessions when Muse-S is connected
- [x] **SESS-03**: Session summary includes mean Neural Calm, peak Neural Calm, and time in high calm when Muse-S was used

### Dashboard

- [x] **DASH-04**: Session Neural Calm averages are persisted to IndexedDB alongside coherence data
- [x] **DASH-05**: Recovery dashboard displays Neural Calm trend line alongside Oura HRV and session coherence trends

## Future Requirements

### Garmin Fenix 8

- **FEN-01**: User can connect Fenix 8 as HR-only device (no HRV capability)
- **FEN-02**: Sessions with Fenix 8 show HR waveform but disable coherence scoring

### Advanced EEG

- **AEEG-01**: Theta/alpha ratio for deeper meditation state tracking
- **AEEG-02**: EEG-guided breathing rate suggestion (adjust pace based on neural state)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Combined neurocardiac single metric | No validated protocol exists for merging EEG + HRV into one feedback signal |
| Garmin Fenix 8 support | Cannot transmit RR intervals over BLE; wrist PPG too noisy for HRV |
| Muse-S accelerometer data | Low value for seated breathing sessions |
| Raw EEG export | Can add later; not core to biofeedback purpose |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEV-01 | Phase 6 | Complete |
| DEV-02 | Phase 6 | Complete |
| DEV-03 | Phase 6 | Complete |
| DEV-04 | Phase 6 | Complete |
| MUSE-01 | Phase 7 | Complete |
| MUSE-02 | Phase 7 | Complete |
| MUSE-03 | Phase 7 | Complete |
| MUSE-04 | Phase 7 | Complete |
| MUSE-05 | Phase 7 | Complete |
| PPG-01 | Phase 7 | Complete |
| PPG-02 | Phase 7 | Complete |
| PPG-03 | Phase 8 | Complete (08-01) |
| PPG-04 | Phase 8 | Complete (08-01) |
| EEG-01 | Phase 7 | Complete |
| EEG-02 | Phase 7 | Complete |
| EEG-03 | Phase 8 | Complete (08-01) |
| SESS-01 | Phase 8 | Complete (08-01) |
| SESS-02 | Phase 8 | Complete |
| SESS-03 | Phase 8 | Complete |
| DASH-04 | Phase 9 | Complete |
| DASH-05 | Phase 9 | Complete |

**Coverage:**
- v1.1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after roadmap creation (phases 6-9)*
