# Requirements: ResonanceHRV

**Defined:** 2026-04-04
**Core Value:** The app actively optimizes your breathing to maximize autonomic training — right frequency, right phase alignment, every session.

## v1.2 Requirements

Requirements for Adaptive Closed-Loop Biofeedback. Each maps to roadmap phases.

### Resonance Tuning

- [ ] **TUNE-01**: User sees a 60-second tuning phase before each practice session that identifies their current resonance frequency
- [ ] **TUNE-02**: Tuning phase cycles through candidate frequencies centered on stored RF and selects the one with highest RSA amplitude
- [ ] **TUNE-03**: User sees their tuned frequency with comparison to stored frequency ("Today: 4.7 BPM" vs stored 5.0)
- [ ] **TUNE-04**: When RF has shifted significantly, app celebrates the change as a sign of improved vagal tone

### Resonance Mapping

- [ ] **MAP-01**: Each session record includes the tuned frequency and peak RSA amplitude
- [ ] **MAP-02**: Dashboard displays RF trend over sessions on the recovery chart
- [ ] **MAP-03**: RF trend correlates visually with Oura HRV recovery on same time axis

### Phase Lock

- [ ] **LOCK-01**: App computes instantaneous phase angle between breathing pacer and HR oscillation via Hilbert transform
- [ ] **LOCK-02**: Phase lock score (0-100) replaces coherence as the primary biofeedback metric during sessions
- [ ] **LOCK-03**: Phase lock gauge replaces coherence gauge in session UI
- [ ] **LOCK-04**: Session summary shows phase lock metrics (mean, peak, time locked in) instead of coherence

### Adaptive Pace

- [ ] **PACE-01**: When phase lock is below threshold for >10 seconds, pace controller begins micro-adjusting breathing rate
- [ ] **PACE-02**: Pace adjustments are smooth and imperceptible (max ±0.01 Hz per 30 seconds)
- [ ] **PACE-03**: Pace never adjusts more than ±0.5 BPM from tuned frequency
- [ ] **PACE-04**: Bowl echo timing shifts naturally with pace changes

### Dashboard Integration

- [ ] **DASH-06**: Phase lock trend replaces coherence trend on recovery dashboard
- [ ] **DASH-07**: Old coherence data points display with legacy labeling
- [ ] **DASH-08**: RF trend line appears on dashboard alongside HRV and phase lock

## Future Requirements

### Advanced Tuning

- **ATUNE-01**: Continuous background RF tracking during sessions (not just pre-session)
- **ATUNE-02**: Oura-informed session timing recommendations (morning vs evening)

## Out of Scope

| Feature | Reason |
|---------|--------|
| HEP neurofeedback | HRM 600 lacks R-peak timestamps, Muse SNR insufficient |
| Baroreflex sensitivity training | Requires beat-by-beat blood pressure data |
| Polyvagal state classification | Contested science, would relabel existing metrics |
| ML-based frequency prediction | Simple RSA peak comparison is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TUNE-01 | — | Pending |
| TUNE-02 | — | Pending |
| TUNE-03 | — | Pending |
| TUNE-04 | — | Pending |
| MAP-01 | — | Pending |
| MAP-02 | — | Pending |
| MAP-03 | — | Pending |
| LOCK-01 | — | Pending |
| LOCK-02 | — | Pending |
| LOCK-03 | — | Pending |
| LOCK-04 | — | Pending |
| PACE-01 | — | Pending |
| PACE-02 | — | Pending |
| PACE-03 | — | Pending |
| PACE-04 | — | Pending |
| DASH-06 | — | Pending |
| DASH-07 | — | Pending |
| DASH-08 | — | Pending |

**Coverage:**
- v1.2 requirements: 18 total
- Mapped to phases: 0
- Unmapped: 18

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after initial definition*
