---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Muse-S Neurocardiac Integration
status: in_progress
last_updated: "2026-04-03T20:25:57Z"
progress:
  total_phases: 9
  completed_phases: 6
  total_plans: 20
  completed_plans: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency.
**Current focus:** Phase 6 — Device Architecture (ready to plan)

## Current Position

Phase: 7 of 9 (Muse-S Connection + Signal Processing) — IN PROGRESS
Plan: 1 of 3 — 07-01 complete; advance to 07-02
Status: In progress — 07-01 executed and committed
Last activity: 2026-04-03 — 07-01 complete: MuseAdapter BLE layer + Phase 7 AppState fields

Progress: [████░░░░░░] 38% (v1.1) — 3 of 8 plans complete (phase 7 started)

## Performance Metrics

**Velocity:**
- Total plans completed (v1.1): 0
- v1.0 baseline: 10 plans, all complete as of 2026-03-22

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 6. Device Architecture | 2/2 | 5 min | 2.5 min |
| 7. Muse-S Connection + Signal Processing | 0/3 | - | - |
| 8. Session Integration | 0/2 | - | - |
| 9. Neural Calm Dashboard | 0/1 | - | - |

*Updated after each plan completion*
| Phase 06-device-architecture P02 | 2 | 3 tasks | 3 files |
| Phase 07-muse-s-connection P01 | 2 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

- 07-01: MuseAdapter quick-reconnect-first: reads saved museName, attempts getDevices() lookup, falls back to picker
- 07-01: eegHead incremented only from TP9 (channel 0) — single time reference for all 4 EEG channels
- 07-01: No auto-reconnect for Muse in Phase 7 — explicit user action required to reconnect
- 07-01: Buffers preserved on unexpected GATT disconnect (cleared only on explicit disconnect())
- v1.1: Muse-S over Fenix 8 — Fenix 8 cannot transmit RR intervals over BLE; wrist PPG inadequate for HRV
- v1.1: Standalone PPG HRV from Muse — chest strap remains gold standard; PPG coherence marked lower confidence
- v1.1: Neural Calm = alpha/beta power ratio (AF7/AF8); displayed alongside HRV, not merged into single metric
- v1.1: EEG displayed as parallel metric — no validated combined EEG+HRV protocol exists
- v1.1: Threshold-based artifact rejection (>100 µV epoch discard) — ICA too expensive for real-time JS
- v1.1: Port muse-js protocol as custom vanilla JS adapter (reference Respiire/MuseJS) — avoid RxJS dependency
- [Phase 06-02]: Muse-S BLE picker feedback: museStatus set to 'paired' with orange dot after picker selection so user gets visual confirmation before Phase 7 wires full GATT connection

### Decisions

- 06-01: HRMAdapter quick-reconnect-first: reads saved chestStrapName, attempts getDevices() lookup, falls back to picker
- 06-01: Storage key migration chained — chestStrapName primary, deviceName legacy fallback, writes both on picker selection
- 06-01: DeviceManager derives backward-compat AppState.connected and connectionStatus — zero changes to main.js/DSP in plan 06-01
- 06-01: Muse stub uses optionalServices:[0xfe8d] so Phase 7 can reuse pairing without re-prompting
- 06-02: Per-device chip UI — two side-by-side chips replacing single connect button; each chip has status-dot + status-text + connect button
- 06-02: Disconnect routing uses hrSourceLabel to determine which device pause should respond to (chest strap only pauses when Chest Strap is active HR source)
- 06-02: --accent-action used for orange states (--accent-orange undefined in project CSS palette)

### Pending Todos

None yet.

### Blockers/Concerns

- **PPG HRV accuracy:** Muse PPG at 64 Hz — no published Muse-S-specific HRV validation. Needs empirical dual-wear test (Muse + HRM 600 simultaneously).
- **PPG channel selection:** Which of 3 PPG channels gives strongest cardiac signal is unconfirmed for Muse-S (IR vs Green vs Unknown). Must test empirically early in Phase 7.
- **EEG artifact rejection quality:** AF7/AF8 are most blink-contaminated channels. May need to fall back to TP9/TP10 for Neural Calm if frontal channels are too noisy.
- **muse-js firmware compatibility:** Library abandoned 2021 — community reports it still works; test early in Phase 7 before committing to full port.

## Session Continuity

Last session: 2026-04-03
Stopped at: Completed 07-01-PLAN.md — MuseAdapter BLE layer, Phase 7 AppState fields, DeviceManager wired
Resume: Run `/gsd:execute-phase 7` for Plan 07-02 (PPG signal processing pipeline)
