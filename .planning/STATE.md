---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Adaptive Closed-Loop Biofeedback
status: defining_requirements
last_updated: "2026-04-04"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Real-time HRV biofeedback during breathing sessions — the app actively optimizes your breathing to maximize autonomic training.
**Current focus:** Defining requirements for v1.2 Adaptive Closed-Loop Biofeedback

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-04 — Milestone v1.2 started

## Accumulated Context

### Decisions

- v1.2: Phase lock replaces coherence everywhere (live gauge, summary, dashboard)
- v1.2: 60s pre-session tuning phase with quick prompt UX
- v1.2: RF shifts celebrated as progress ("improved vagal tone")
- v1.2: Adaptive pace uses smooth drift (imperceptible, felt through bowl echo timing)
- v1.2: Old coherence data labeled as "(legacy)" on dashboard

### Pending Todos

None yet.

### Blockers/Concerns

- **Tuning window duration:** 12s per candidate frequency may be tight for stable RSA measurement. Needs empirical testing.
- **Hilbert transform at 4 Hz:** Phase estimation may need 90-120s windows for stability at the 4 Hz resampled RR rate.

## Session Continuity

Last session: 2026-04-04
Stopped at: Milestone v1.2 initialized, defining requirements
Resume: Continue with requirements definition → roadmap
