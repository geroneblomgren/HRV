---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Adaptive Closed-Loop Biofeedback
status: unknown
last_updated: "2026-04-06T15:02:35.187Z"
progress:
  total_phases: 13
  completed_phases: 13
  total_plans: 30
  completed_plans: 30
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Real-time HRV biofeedback during breathing sessions — the app actively optimizes your breathing to maximize autonomic training — right frequency, right phase alignment, every session.
**Current focus:** v1.2 Adaptive Closed-Loop Biofeedback — Phase 12 (Adaptive Pace Controller) next

## Current Position

Phase: 13 (Dashboard Integration) — AWAITING HUMAN VERIFICATION
Plan: 13-03 checkpoint reached — awaiting human verify of live gauges + dashboard
Status: 13-03 checkpoint:human-verify — 3/3 plans reached in Phase 13
Last activity: 2026-04-05 — Human verification checkpoint for Phase 13 Dashboard Integration

Progress: [####################] Phase 13 checkpoint:human-verify (3/3 plans)

## Performance Metrics

| Metric | v1.0 | v1.1 | v1.2 Target |
|--------|------|------|-------------|
| Phases | 5 | 4 | 4 |
| Plans | 11 | 8 | TBD |
| Milestones shipped | 2026-03-22 | 2026-04-03 | — |
| Phase 10 P01 | 8 | 2 tasks | 3 files |
| Phase 10 P02 | 18 | 3 tasks | 4 files |
| Phase 10 P03 | 15 | 2 tasks | 1 files |
| Phase 11-phase-lock-engine P01 | 15 | 2 tasks | 3 files |
| Phase 11-phase-lock-engine P02 | 8 | 2 tasks | 3 files |
| Phase 11-phase-lock-engine P03 | 20 | 1 tasks | 2 files |

## Accumulated Context

### Decisions

- v1.2: Phase lock ADDED alongside coherence — three live gauges (coherence, phase lock, neural calm), both series on dashboard
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
- [10-03]: RF Y-axis on far right (PAD.right=110); Score title at _canvasW-35, RF title at _canvasW-12
- [10-03]: RF line dashed [6,3] with diamond markers; gap >2 days produces broken segment
- [Phase 10]: 10-02: startPractice() is async — tuning is mandatory before every session, no skip path
- [Phase 10]: 10-02: Start button requires only connected (tuning handles null savedResonanceFreq — first-session capable)
- [Phase 11-phase-lock-engine]: FFT bin extraction (Pattern 2) chosen for phase lock — reuses _fft instance, no IFFT needed
- [Phase 11-phase-lock-engine]: Pacer phase computed relative to window center — avoids AudioContext epoch dependency
- [Phase 11-phase-lock-engine]: MIN_POWER_THRESHOLD=0 (amplitude gate disabled) — tune after first real session
- [Phase 11-phase-lock-engine]: Phase lock gauge uses 0.05 smoothing interpolation (between coherence 0.08 and Neural Calm 0.015)
- [Phase 11-phase-lock-engine]: Locked zone threshold is 70 for phase lock (was 66 for old coherence Locked In)
- [Phase 11-phase-lock-engine]: Phase lock runs before coherence gate — has its own 25s calibration window
- [Phase 11-phase-lock-engine]: PLV over 10 samples replaces single-snapshot phase error — stable under baroreflex delay
- [Phase 12]: _schedulerTick reads AppState.pacingFreq live each 25ms — no closure, no restart needed for frequency changes
- [Phase 12]: pacingFreqTuned anchors the tuned RF; pacingFreq drifts around it; no stopPacer/startPacer on tempo change
- [Phase 12]: binToHz/hzToBin imported from dsp.js (already exported); findPeakBin inlined as _findPSDPeak in paceController.js per research recommendation
- [Phase 12]: summary-pace reuses summary-hr-source CSS class — consistent styling with zero new CSS
- [13-01]: Coherence gauge has no "Connect Muse-S" placeholder — coherence derives from RR data, always available
- [13-01]: meanCoherence saved unconditionally (null if no data) — uniform session schema for all v1.2 records
- [13-01]: Three-gauge layout: neural calm (left), coherence (center-bottom), phase lock (right)
- [13-02]: _seriesVisible const object at module level — persists across redraws, toggled by legend clicks
- [13-02]: Legacy session detection uses meanPhaseLock === null — aggregation normalizes to null, not undefined
- [13-02]: Phase lock Y-axis reuses cohYPx() (shared 0-100 right axis) — same scale as coherence

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

- **Tuning window duration RESOLVED:** Fixed — now uses 2 full breath cycles per candidate (not fixed 12s). RSA measurement is stable at all candidate frequencies tested.
- **Hilbert transform stability RESOLVED:** PLV over 10 samples provides stable scores without needing 90-120s window. Baroreflex delay offset does not degrade PLV score.
- **Phase 12 UX risk:** User must understand the pacer is adapting to them — if they fight the drift, phase lock degrades. Framing copy matters.

## Session Continuity

Last session: 2026-04-05
Stopped at: 13-03-PLAN.md checkpoint:human-verify — awaiting visual verification of live gauges and dashboard
Resume: After verification approved, Phase 13 is complete. Type "approved" to continue.
Resume file: .planning/phases/13-dashboard-integration/13-03-PLAN.md
