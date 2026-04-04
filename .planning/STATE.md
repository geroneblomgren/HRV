---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Muse-S Neurocardiac Integration
status: unknown
last_updated: "2026-04-04T01:29:47.663Z"
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 18
  completed_plans: 18
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency.
**Current focus:** Phase 6 — Device Architecture (ready to plan)

## Current Position

Phase: 9 of 9 (Neural Calm Dashboard) — COMPLETE
Plan: 1 of 1 — ALL TASKS COMPLETE (checkpoint approved 2026-04-03)
Status: v1.1 milestone COMPLETE
Last activity: 2026-04-03 — 09-01 all tasks done; grid fix + SW cache bump applied; checkpoint approved

Progress: [██████████] 100% (v1.1) — 18 of 18 plans complete

## Performance Metrics

**Velocity:**
- Total plans completed (v1.1): 0
- v1.0 baseline: 10 plans, all complete as of 2026-03-22

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 6. Device Architecture | 2/2 | 5 min | 2.5 min |
| 7. Muse-S Connection + Signal Processing | 0/3 | - | - |
| 8. Session Integration | 1/2 | 3 min | - |
| 9. Neural Calm Dashboard | 0/1 | - | - |

*Updated after each plan completion*
| Phase 06-device-architecture P02 | 2 | 3 tasks | 3 files |
| Phase 07-muse-s-connection P01 | 2 | 2 tasks | 3 files |
| Phase 07-muse-s-connection-signal-processing P03 | 3 | 2 tasks | 5 files |
| Phase 07 P02 | 9 | 2 tasks | 5 files |
| Phase 08-session-integration P01 | 3 | 2 tasks | 5 files |
| Phase 08-session-integration P02 | ~60 | 3 tasks | 5 files |
| Phase 09-neural-calm-dashboard P01 | 2 | 1 tasks | 2 files |

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
- [Phase 07-03]: TP9/TP10 used for Neural Calm (not AF7/AF8) — frontal channels too susceptible to blink artifacts
- [Phase 07-03]: Separate FFT(512) instance created in initEEGPipeline — isolated from dsp.js HRV FFT
- [Phase 07-03]: Artifact rejection: reject entire epoch if EITHER TP9 or TP10 exceeds 100 µV peak-to-peak; carry forward last valid Neural Calm
- [Phase 07]: Cascaded HP+LP Butterworth sections (not joint bandpass design): -3 dB exactly at 0.5 Hz and 3.0 Hz, matches scipy butter(2, [f1/32, f2/32], 'band')
- [Phase 07-03]: IR channel (Ch0) confirmed empirically as best Muse-S PPG channel for forehead placement; Green (Ch1) was noisier — default updated to IR
- [Phase 07-03]: BLE characteristic UUIDs corrected post hardware verification — initial implementation used wrong base UUID; fixed in a5b43c7
- [Phase 07-03]: AppState exposed on window.AppState for live console debugging during hardware sessions
- [Phase 07-03]: Forehead PPG polarity inverted vs wrist PPG — peak detection flipped; longer warmup and different decay tuning required
- [Phase 08-01]: Neural Calm gauge uses bottom-left corner of session-pacer (coherence is bottom-right) — symmetric paired layout
- [Phase 08-01]: PPG arc shifts to lighter teal #5eead4 — arc color indicates lower confidence; score number stays zone color for readability
- [Phase 08-01]: neuralCalmCanvas passed as optional 7th arg to startRendering() with null guard — existing callers with 6 args still work
- [Phase 08-01]: EEG calibrating window uses 20s (AppState.eegCalibrating baseline), not 120s HRV calibration window
- [Phase 08-02]: EEG stacked layout: TP9 centered at h*0.3, TP10 at h*0.7 — symmetric within 80px canvas
- [Phase 08-02]: Neural Calm summary section uses display:none toggle — hidden by default, shown when meanCalm != null
- [Phase 08-02]: PPG source badge placed immediately after h2 title in both Practice summary and Discovery comparison
- [Phase 08-02]: Alpha power bar replaced raw scrolling EEG waveform — calmer visual more appropriate for meditation context
- [Phase 08-02]: Neural Calm gauge smoothed with 12-sec rolling average to reduce jitter during live sessions
- [Phase 08-02]: Session summary provides 3 line graphs (HR, HRV-RMSSD, Neural Calm) with 7-point moving average for post-session trend review
- [Phase 08-02]: Coherence graph replaced by RMSSD HRV graph in session summary — more clinically meaningful than redundant coherence
- [Phase 08-02]: Bowl audio uses quarter-beat echo subdivisions — aids eyes-closed pacing; pitch/swell styles removed
- [Phase 09-01]: Right Y-axis relabeled from 'Coherence' to 'Score (0-100)' — applies to both coherence and Neural Calm
- [Phase 09-01]: Neural Calm line uses broken-path rendering for days without Muse-S — honest gap representation, no zero-fill
- [Phase 09-01]: Neural Calm line width 1.5 and globalAlpha 0.85 — thinner and slightly transparent to layer cleanly under coherence dots

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
- **EEG artifact rejection quality:** Implementation uses TP9/TP10 (resolved per 07-03 decision). Empirical validation of 100 µV threshold still pending physical test.
- **muse-js firmware compatibility:** Library abandoned 2021 — community reports it still works; test early in Phase 7 before committing to full port.

## Session Continuity

Last session: 2026-04-03
Stopped at: Completed 09-01-PLAN.md — v1.1 milestone fully complete
Resume: No active work. v1.1 is shipped. Begin planning v1.2 if desired.
