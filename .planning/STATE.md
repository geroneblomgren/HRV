# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 5 (Foundation)
Plan: 0 of 2 in current phase
Status: Ready to plan
Last activity: 2026-03-21 — Roadmap created

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Pre-roadmap: Use Lomb-Scargle (or FFT + cubic spline) for spectral analysis — must decide before coherence UI is built (Phase 2 planning)
- Pre-roadmap: Oura Personal Access Tokens are deprecated; OAuth2 PKCE mandatory from day one
- Pre-roadmap: Garmin HRM 600 open BLE mode without bonding — verify empirically in Phase 1

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 2**: Lomb-Scargle browser JS port availability is LOW confidence. Evaluate als-fft (updated March 2026) vs. fft.js + cubic spline during Phase 2 planning. Decision affects coherence score accuracy.
- **Phase 5**: Oura API CORS for direct browser fetch from localhost is not explicitly documented. Run a browser fetch smoke test before building dashboard UI. Fallback: minimal Node.js localhost proxy.
- **Phase 1**: Garmin HRM 600 open BLE mode (no bonding) — stated in community sources but unverified with actual hardware.

## Session Continuity

Last session: 2026-03-21
Stopped at: Roadmap created; Phase 1 ready to plan
Resume file: None
