---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Muse-S Neurocardiac Integration
status: ready_to_plan
last_updated: "2026-04-03"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 8
  completed_plans: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency.
**Current focus:** Phase 6 — Device Architecture (ready to plan)

## Current Position

Phase: 6 of 9 (Device Architecture)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-04-03 — Completed 06-01 device adapter layer (DeviceAdapter, HRMAdapter, DeviceManager)

Progress: [█░░░░░░░░░] 12% (v1.1) — 1 of 8 plans complete

## Performance Metrics

**Velocity:**
- Total plans completed (v1.1): 0
- v1.0 baseline: 10 plans, all complete as of 2026-03-22

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 6. Device Architecture | 1/2 | 3 min | 3 min |
| 7. Muse-S Connection + Signal Processing | 0/3 | - | - |
| 8. Session Integration | 0/2 | - | - |
| 9. Neural Calm Dashboard | 0/1 | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

- v1.1: Muse-S over Fenix 8 — Fenix 8 cannot transmit RR intervals over BLE; wrist PPG inadequate for HRV
- v1.1: Standalone PPG HRV from Muse — chest strap remains gold standard; PPG coherence marked lower confidence
- v1.1: Neural Calm = alpha/beta power ratio (AF7/AF8); displayed alongside HRV, not merged into single metric
- v1.1: EEG displayed as parallel metric — no validated combined EEG+HRV protocol exists
- v1.1: Threshold-based artifact rejection (>100 µV epoch discard) — ICA too expensive for real-time JS
- v1.1: Port muse-js protocol as custom vanilla JS adapter (reference Respiire/MuseJS) — avoid RxJS dependency

### Decisions

- 06-01: HRMAdapter quick-reconnect-first: reads saved chestStrapName, attempts getDevices() lookup, falls back to picker
- 06-01: Storage key migration chained — chestStrapName primary, deviceName legacy fallback, writes both on picker selection
- 06-01: DeviceManager derives backward-compat AppState.connected and connectionStatus — zero changes to main.js/DSP in plan 06-01
- 06-01: Muse stub uses optionalServices:[0xfe8d] so Phase 7 can reuse pairing without re-prompting

### Pending Todos

None yet.

### Blockers/Concerns

- **PPG HRV accuracy:** Muse PPG at 64 Hz — no published Muse-S-specific HRV validation. Needs empirical dual-wear test (Muse + HRM 600 simultaneously).
- **PPG channel selection:** Which of 3 PPG channels gives strongest cardiac signal is unconfirmed for Muse-S (IR vs Green vs Unknown). Must test empirically early in Phase 7.
- **EEG artifact rejection quality:** AF7/AF8 are most blink-contaminated channels. May need to fall back to TP9/TP10 for Neural Calm if frontal channels are too noisy.
- **muse-js firmware compatibility:** Library abandoned 2021 — community reports it still works; test early in Phase 7 before committing to full port.

## Session Continuity

Last session: 2026-04-03
Stopped at: Completed 06-01-PLAN.md — DeviceAdapter, HRMAdapter, DeviceManager created; state.js updated with multi-device fields
Resume: `/gsd:execute-phase 6` to execute plan 06-02 (main.js wiring)
