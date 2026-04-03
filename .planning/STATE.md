---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Muse-S Neurocardiac Integration
status: defining_requirements
last_updated: "2026-04-03"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency.
**Current focus:** Defining requirements for v1.1 Muse-S integration

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-03 — Milestone v1.1 started

## Accumulated Context

### Decisions

- v1.1: Muse-S focus over Fenix 8 — Fenix 8 can't transmit RR intervals over BLE
- v1.1: Try standalone PPG HRV from Muse — chest strap remains gold standard fallback
- v1.1: Neural Calm metric (alpha/beta ratio) + live EEG waveform during sessions
- v1.1: Neural calm trends added to recovery dashboard
- v1.1: EEG displayed alongside HRV, not merged into single feedback signal (no validated protocol)

### Pending Todos

None yet.

### Blockers/Concerns

- **PPG HRV accuracy:** Muse PPG at 64 Hz — no published validation for HRV spectral analysis at this sample rate. Needs empirical testing.
- **PPG channel selection:** Which of 3 Muse PPG channels gives best cardiac signal is unconfirmed — needs device testing.
- **EEG artifact rejection:** Eye blinks, jaw clenching, movement during breathing will contaminate EEG. Need robust rejection.
- **muse-js library status:** Abandoned but functional. Respiire/MuseJS fork is vanilla JS alternative — needs code review.

## Session Continuity

Last session: 2026-04-03
Stopped at: Milestone v1.1 initialized, defining requirements
Resume: Continue with requirements definition → roadmap
