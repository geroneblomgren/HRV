# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.2 — Adaptive Closed-Loop Biofeedback

**Shipped:** 2026-04-06
**Phases:** 4 | **Plans:** 12

### What Was Built
- Pre-session resonance frequency tuning (60s auto-scan with RSA comparison)
- Phase lock score via Hilbert transform FFT bin extraction (replaced coherence as primary metric)
- Adaptive pace controller with smooth bowl echo drift (±0.01 Hz/30s, bounded ±0.5 BPM)
- Three live ring gauges (coherence, phase lock, neural calm) during practice sessions
- Dashboard evolution: phase lock + coherence split trends, RF trend line, legacy session labeling

### What Worked
- Fast 3-day execution cycle for 4 phases / 12 plans — tight scope and clear requirements kept momentum
- Phase lock debugging (Phase 11) caught 3 real bugs through live session validation — human verification checkpoints caught issues automated checks missed
- Covariance-based phase lock replacement was a mid-execution pivot that improved signal quality significantly
- Reusing existing CSS classes and Y-axis scales (cohYPx) for new metrics avoided UI sprawl
- Spectral concentration coherence formula replaced HeartMath formula during Phase 13 — simpler and more robust

### What Was Inefficient
- Phase 11 required multiple debugging rounds (6+ fix commits) — Hilbert transform approach from research was theoretically sound but practically unstable; covariance method was the eventual solution
- Milestone audit was done before Phases 12-13 were built (flagged gaps that were about to be built) — audit timing should be after all phases complete
- Phase 12 ROADMAP checkbox was never updated to [x] despite being complete — manual roadmap updates are error-prone

### Patterns Established
- Human verification checkpoints at plan-03 of each phase — catches UX issues no automated check finds
- Session controller pattern (from practice.js) reused for tuning.js — Promise-based async flow with _active guards
- Module-level state objects (_seriesVisible, pace controller state) preferred over AppState for renderer-internal concerns
- Linear detrending before FFT established as standard DSP preprocessing step

### Key Lessons
1. Live session testing is non-negotiable for DSP code — mathematical correctness does not guarantee real-world behavior with noisy biosignals
2. Covariance beats Hilbert for phase lock in this context — simpler math, fewer edge cases, more stable under real breathing variability
3. Three ring gauges is the practical maximum for the session UI — any more requires a layout redesign
4. Legacy data labeling should be planned from the start when replacing a metric — Phase 13 had to retrofit this

### Cost Observations
- Model mix: primarily opus for planning/execution, sonnet for research
- Sessions: ~6 sessions across 3 days
- Notable: Phase 12 (adaptive pace) was the smoothest execution — research was thorough, no debugging needed

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 5 | 11 | Initial build — established session controller pattern |
| v1.1 | 4 | 8 | Multi-device architecture — adapter pattern, EEG/PPG pipelines |
| v1.2 | 4 | 12 | Closed-loop biofeedback — DSP-heavy, required mid-execution pivots |

### Cumulative Quality

| Milestone | LOC | Files | Key Addition |
|-----------|-----|-------|--------------|
| v1.0 | ~3,500 | ~12 | Core HRV biofeedback + Oura dashboard |
| v1.1 | ~5,500 | ~16 | Muse-S BLE + EEG/PPG pipelines |
| v1.2 | ~7,400 | ~19 | Tuning, phase lock, adaptive pace, three-gauge UI |
