---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Adaptive Closed-Loop Biofeedback
status: unknown
last_updated: "2026-04-04T04:38:33.154Z"
progress:
  total_phases: 10
  completed_phases: 9
  total_plans: 21
  completed_plans: 19
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Real-time HRV biofeedback during breathing sessions — the app actively optimizes your breathing to maximize autonomic training — right frequency, right phase alignment, every session.
**Current focus:** v1.2 Adaptive Closed-Loop Biofeedback — Phase 10 next

## Current Position

Phase: 10 (Resonance Tuning + Mapping) — in progress
Plan: 10-01 complete (tuning engine), 10-02 next
Status: Active — executing Phase 10 plans
Last activity: 2026-04-04 — 10-01 complete (js/tuning.js, AppState tuning fields, storage JSDoc)

Progress: [#---------] 1/4 phases in progress

## Performance Metrics

| Metric | v1.0 | v1.1 | v1.2 Target |
|--------|------|------|-------------|
| Phases | 5 | 4 | 4 |
| Plans | 11 | 8 | TBD |
| Milestones shipped | 2026-03-22 | 2026-04-03 | — |
| Phase 10 P01 | 8 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

- v1.2: Phase lock replaces coherence everywhere (live gauge, summary, dashboard)
- v1.2: 60s pre-session tuning phase with quick prompt UX (5 candidates at ±0.5 BPM, ~12s each)
- v1.2: RF shifts > 0.3 BPM celebrated as progress ("improved vagal tone")
- v1.2: Adaptive pace uses smooth drift (max ±0.01 Hz per 30s, bounded ±0.5 BPM from tuned freq)
- v1.2: Bowl echo timing shifts naturally with pace — user feels it, doesn't see it
- v1.2: Old coherence data labeled as "(legacy)" on dashboard — historical data preserved
- v1.2: New modules: js/tuning.js, js/phaseLock.js
- v1.2: Hilbert transform added to dsp.js (or inline in phaseLock.js)
- v1.2: Session schema additions: tuningFreqHz, tuningRsaAmplitude, phaseLock fields
- [Phase 10]: Candidate generation: stored ±0.5 BPM in 0.25 BPM steps; first-session fallback to Discovery range [4.5-6.5 BPM]
- [Phase 10]: RSA measurement uses computeSpectralRSA() directly — bypasses tick() calibration gate for tuning

### Roadmap Structure

| Phase | Goal | Requirements |
|-------|------|--------------|
| 10 - Resonance Tuning + Mapping | Pre-session RF identification + longitudinal RF trend | TUNE-01..04, MAP-01..03 |
| 11 - Phase Lock Engine | Hilbert transform phase score replacing coherence | LOCK-01..04 |
| 12 - Adaptive Pace Controller | Closed-loop pace micro-adjustment via phase lock | PACE-01..04 |
| 13 - Dashboard Integration | Phase lock + RF trends, legacy labeling | DASH-06..08 |

### Pending Todos

- Plan Phase 10: js/tuning.js + session schema additions + tuning UX in practice.js
- Plan Phase 11: Hilbert transform in dsp.js + phaseLock.js + gauge renderer swap
- Plan Phase 12: Adaptive pace controller wired into audio.js + practice.js
- Plan Phase 13: dashboard.js phase lock + RF trend lines + legacy data handling

### Blockers / Concerns

- **Tuning window duration:** 12s per candidate frequency may be tight for stable RSA measurement at 4 Hz resampled rate. Test empirically during Phase 10 implementation.
- **Hilbert transform stability:** At 4 Hz sampling with 60s window (240 samples), frequency resolution is 0.0167 Hz. May need 90-120s window for stable phase tracking — tradeoff with responsiveness. Evaluate during Phase 11.
- **Phase 12 UX risk:** User must understand the pacer is adapting to them — if they fight the drift, phase lock degrades. Framing copy matters.

## Session Continuity

Last session: 2026-04-04
Stopped at: Completed 10-01-PLAN.md — tuning engine created (js/tuning.js, state.js, storage.js)
Resume: Execute 10-02 next (tuning UX integration in practice.js)
