# Requirements: ResonanceHRV

**Defined:** 2026-04-06
**Core Value:** Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency, not guessing.

## v1.3 Requirements

Requirements for v1.3: Session Modes & Eyes-Closed Training. Each maps to roadmap phases.

### Infrastructure

- [ ] **INFRA-01**: Session mode selector lets user choose standard, pre-sleep, or meditation mode before starting
- [ ] **INFRA-02**: Global session lock prevents multiple modes from running simultaneously
- [ ] **INFRA-03**: Audio routing uses independent gain nodes for pacer, meditation audio, and sonification

### Pre-Sleep

- [ ] **SLEEP-01**: User can select I:E ratio from presets (1:1, 1:1.5, 1:2) with 1:2 as default in pre-sleep mode
- [ ] **SLEEP-02**: Bowl pacer and echo subdivisions respect asymmetric I:E timing
- [ ] **SLEEP-03**: Visual breathing circle animation reflects asymmetric inhale/exhale durations
- [ ] **SLEEP-04**: Adaptive pace controller preserves I:E ratio when micro-adjusting breathing rate
- [ ] **SLEEP-05**: Pre-sleep sessions run the 60s RF tuning phase before practice begins
- [ ] **SLEEP-06**: Pre-sleep sessions show elapsed time only (no countdown), stopped manually
- [ ] **SLEEP-07**: Sessions saved with "pre-sleep" mode label, distinguishable on dashboard

### Meditation

- [ ] **MED-01**: User can select from built-in guided meditation scripts (body scan, yoga nidra, loving-kindness)
- [ ] **MED-02**: User can upload MP3 audio files for custom guided meditations
- [ ] **MED-03**: Uploaded audio files cached in IndexedDB for repeat use
- [ ] **MED-04**: Guided audio plays through meditation-specific gain node with volume control
- [ ] **MED-05**: HRV and neural calm tracked passively during meditation (no breathing pacer)
- [ ] **MED-06**: Post-session report shows HR, HRV (RMSSD), and neural calm trends during meditation
- [ ] **MED-07**: Sessions saved with "meditation" mode label and script/file name

### Sonification

- [ ] **SONI-01**: Phase lock score mapped to audio pitch using trend-based approach (direction of change, not raw value)
- [ ] **SONI-02**: Sonification tone perceptually distinct from bowl pacer audio
- [ ] **SONI-03**: Per-session on/off toggle for sonification
- [ ] **SONI-04**: Sonification available in standard, pre-sleep, and meditation modes

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Adherence & Gamification

- **GAM-01**: Progressive training schedule with fading visual feedback over weeks
- **GAM-02**: Personal records for key metrics (peak phase lock, longest session, etc.)
- **GAM-03**: Weekly summary dashboard with trend lines

### Recovery Correlation

- **CORR-01**: Oura session-to-overnight correlation (pre-sleep session metrics vs overnight HRV)
- **CORR-02**: Cold exposure tracking mode with dive reflex HR monitoring

### Additional Breathing Modes

- **BREATH-01**: Cyclic sighing mode (double inhale + extended exhale, 5-min protocol)
- **BREATH-02**: Humming exhale mode with vagal stimulation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Continuous drone sonification of raw phase lock | Perceptually chaotic — research shows anxiety-inducing (Audio Mostly 2024) |
| Breathing pacer during meditation audio | Audio collision — bowl strikes disrupt narration |
| Loading meditation audio from URL | CORS restrictions, contradicts local-only architecture |
| Fixed session timer in meditation/pre-sleep | Sessions are variable length — elapsed timer only |
| Multiple AudioContext instances | Memory-intensive, causes clock drift between streams |
| Binaural beats / isochronic tones | Weak and inconsistent evidence for HRV effects |
| 4-7-8 breathing mode | Weak evidence, sub-resonance rate, likely inferior to RFB |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 14 | Pending |
| INFRA-02 | Phase 14 | Pending |
| INFRA-03 | Phase 15 | Pending |
| SLEEP-01 | Phase 16 | Pending |
| SLEEP-02 | Phase 16 | Pending |
| SLEEP-03 | Phase 16 | Pending |
| SLEEP-04 | Phase 16 | Pending |
| SLEEP-05 | Phase 16 | Pending |
| SLEEP-06 | Phase 16 | Pending |
| SLEEP-07 | Phase 16 | Pending |
| MED-01 | Phase 18 | Pending |
| MED-02 | Phase 17 | Pending |
| MED-03 | Phase 17 | Pending |
| MED-04 | Phase 18 | Pending |
| MED-05 | Phase 18 | Pending |
| MED-06 | Phase 18 | Pending |
| MED-07 | Phase 18 | Pending |
| SONI-01 | Phase 19 | Pending |
| SONI-02 | Phase 19 | Pending |
| SONI-03 | Phase 19 | Pending |
| SONI-04 | Phase 19 | Pending |

**Coverage:**
- v1.3 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after roadmap creation*
