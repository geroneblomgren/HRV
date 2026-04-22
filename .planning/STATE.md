---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: iPhone Portability (Bluefy-first PWA)
status: executing
stopped_at: Phase 20 Task 4 — about to begin desktop parity test from hosted URL
last_updated: "2026-04-21T00:00:00.000Z"
last_activity: 2026-04-21 -- Tasks 1-3 complete, Vercel deployed, ready for Task 4
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 1
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (v1.x milestone history) and `docs/superpowers/specs/2026-04-18-iphone-app-design.md` (v2.0 iPhone pivot).

**Core value:** Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency. Now portable: bedside iPhone form factor for pre-sleep / meditation / eyes-closed use cases.
**Current focus:** v2.0 Phase 20 — Bluefy POC + Hardware Validation (gate for the rest of v2.0).

## Current Position

Milestone: v2.0 iPhone Portability
Phase: 20 — Bluefy POC + Hardware Validation (9 tasks, gate phase)
Plan: `docs/superpowers/plans/2026-04-18-phase-20-bluefy-poc.md`
Status: Task 4 about to start (hardware-in-the-loop)
Last activity: 2026-04-21 — Tasks 1-3 done, Vercel deploy live

Progress: [███░░░░░░░] 33% (3 of 9 tasks)

## Phase 20 Task Status (as of 2026-04-21)

| Task | Agent-doable? | Status |
|------|---------------|--------|
| 1. Pre-deploy inventory (greps) | Yes (read-only) | ✅ Done (findings captured in chat pre-crash; re-run if needed for Task 9 report) |
| 2. vercel.json + .vercelignore | Yes | ✅ Done — commit `4bb0d3a` |
| 3. Create Vercel project + first deploy | No (user-interactive) | ✅ Done — live at `https://breath-woad-eta.vercel.app` |
| 4. Desktop parity test from hosted URL | Partial — user runs, agent guides | ⏳ Next up |
| 5. Install Bluefy + Add to Home Screen | No (iPhone physical) | Not started |
| 6. HRM 600 hardware test (5 min) | No (HRM physical) | Not started |
| 7. Muse-S hardware test (gate-critical) | No (Muse physical) | Not started |
| 8. Combined end-to-end session | No (both devices) | Not started |
| 9. Phase 20 report + gate decision | Yes (compile user observations) | Not started |

## v2.0 Milestone Key Decisions (approved + committed)

- **Approach:** Bluefy-first PWA deploy → Capacitor wrapper (Phase 20b) as fallback if Phase 20 Muse-S test fails. Not native Swift, not React Native.
- **Dim-mode trick:** CSS `#000` overlay + Wake Lock keeps screen visually black on OLED while technically awake. Sidesteps the "phone locks mid-session" requirement and keeps the stack web-only.
- **Hosting:** Vercel all-in. Static PWA + `api/oura.js` serverless function in same repo.
- **Scope:** Personal tool only — no App Store. HRM 600 + Muse-S required for iPhone parity with desktop.
- **Branch strategy:** Commits to master directly (solo-dev convention). No `v2.0-iphone` branch.
- **v1.3 disposition:** Fully paused. 5 Phase 14 commits preserved as latent. v1.3 resumes as v2.1 iPhone-first after v2.0 ships.

## Blockers / Concerns

- **Task 7 (Muse-S) is the gate.** If >1 notification drop >3s or any disconnect in the 5-min window → mark Phase 20 fail on Muse criterion, pivot to Phase 20b (Capacitor).
- **Oura integration expected to fail silently in Phase 20** — no proxy deployed yet. `js/oura.js` already returns null on network errors. Non-blocking for this phase.
- **Icons / apple-touch-icon missing** — cosmetic only, deferred to Phase 24.
- **Pre-existing uncommitted changes** in `.planning/` (many `D` deletions) and `js/*` (modifications) must NOT be touched during Phase 20 execution. They are prior in-flight work unrelated to v2.0.

## Carried Concerns (from v1.3 — deferred to v2.1)

- Phase 16: Asymmetric I:E breaks 3 consumers simultaneously — must update atomically.
- Phase 17: IndexedDB v1→v2 migration must be tested against real seeded data.
- Phase 18: DSP tick must branch — phaseLock/paceController skipped during meditation.
- Phase 19: Sonification perceptual calibration requires live eyes-closed workflow test.

## Session Continuity

Last session: 2026-04-21 (this session, post-crash resume)
Stopped at: Phase 20 Task 4 — desktop parity test from hosted URL about to begin
Vercel URL: `https://breath-woad-eta.vercel.app`
Resume file: `docs/superpowers/plans/2026-04-18-phase-20-bluefy-poc.md` (Task 4 section, line ~184)
Next step: User opens Vercel URL in desktop Chrome; agent guides HRM + Muse connect + 2-min session. On pass, proceed to Task 5 (Bluefy install on iPhone).

## Do NOT on resume

- Do not revise spec or plan (`docs/superpowers/specs/2026-04-18-iphone-app-design.md`, `docs/superpowers/plans/2026-04-18-phase-20-bluefy-poc.md`) without user consent — both approved and committed.
- Do not plan Phase 21/22/23 before Phase 20 gate outcome.
- Do not touch the pre-existing uncommitted `.planning/` and `js/*` changes.
- Do not dispatch implementer subagents for Tasks 4–8 (hardware-dependent; user drives).
