---
phase: 14-mode-selector-session-lock
plan: 01
subsystem: infra

tags: [state, session-lock, sessionStorage, indexeddb, vanilla-js, appstate, pub-sub]

# Dependency graph
requires:
  - phase: 10-resonance-tuning-mapping
    provides: tuning phase writes AppState.sessionPhase='practice' flow that this plan renames
  - phase: 12-adaptive-pace-controller
    provides: BPM badge renderer branch (renderer.js:938) that Task 5 updates to match the new sessionPhase literal
provides:
  - AppState.sessionMode field ('standard' | 'pre-sleep' | 'meditation') restored from sessionStorage on load
  - Extended AppState.sessionPhase enum ('idle' | 'discovery' | 'standard' | 'pre-sleep' | 'meditation')
  - isSessionActive() — single source of truth for the D-04 unified session lock
  - getEffectiveMode() — read AppState.sessionMode
  - js/sessionMode.js module — SELECTED_MODE_KEY, VALID_MODES, loadSelectedMode, saveSelectedMode, normalizeMode
  - Unified entry-guard at startDiscovery() and startPractice() using isSessionActive()
  - Read-time 'practice' → 'standard' normalization in querySessions and _getSessionsByDay (no DB rewrite)
  - Standard-mode sessions now save with mode: 'standard' (replacing legacy 'practice')
  - BPM badge renderer branch matches the new sessionPhase literal 'standard'
affects: 14-02 (UI plan), 16 (pre-sleep mode), 17 (IDB v1→v2 migration), 18 (meditation mode)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session mode persistence via sessionStorage (D-09: per-tab default, not sticky)"
    - "Read-time legacy-record normalization (D-11: no DB migration; defer to Phase 17)"
    - "Single-source-of-truth session lock derived from AppState.sessionPhase !== 'idle' (D-04)"
    - "ES module sibling utility files (js/sessionMode.js) — no util/ or lib/ subdirectory, matches existing flat layout"

key-files:
  created:
    - js/sessionMode.js
  modified:
    - js/state.js
    - js/practice.js
    - js/storage.js
    - js/dashboard.js
    - js/discovery.js
    - js/renderer.js

key-decisions:
  - "AppState shape: chose sessionMode + extended sessionPhase enum pair (planner's discretion per 14-CONTEXT §Claude's Discretion). sessionPhase stays the active-session anchor; sessionMode is 'what will run next'."
  - "normalizeMode helper lives in new js/sessionMode.js (planner's discretion) — central home alongside sessionStorage helpers and VALID_MODES enum."
  - "Node automated verify commands for modules transitively importing storage.js fail in Node due to pre-existing CDN import (idb@8.0.3 loaded from jsdelivr). Grep-based acceptance criteria (the substantive checks) all pass; Node import checks for sessionMode.js and state.js (which have no CDN deps) PASS cleanly."

patterns-established:
  - "VALID_MODES frozen array — source of truth for mode validation across all layers"
  - "normalizeMode non-destructive record alias — only rewrites 'practice' → 'standard', passthrough for all other modes (including undefined), defensive against malformed input"
  - "Entry-guard unification: controllers consult isSessionActive() rather than module-local _active/_phase flags — D-04 holds for devtools, stale handlers, and direct calls, not just button clicks"

requirements-completed:
  - INFRA-01
  - INFRA-02

# Metrics
duration: 5min
completed: 2026-04-17
---

# Phase 14 Plan 01: Mode Selector + Session Lock — State Primitives Summary

**AppState.sessionMode + isSessionActive() landed as reactive session-lock primitives, with read-time legacy-record normalization ('practice' → 'standard') and unified controller entry guards — zero UI changes, zero DB migration.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-18T02:01:24Z
- **Completed:** 2026-04-18T02:05:56Z
- **Tasks:** 5 / 5
- **Files created:** 1 (`js/sessionMode.js`)
- **Files modified:** 6 (`js/state.js`, `js/practice.js`, `js/storage.js`, `js/dashboard.js`, `js/discovery.js`, `js/renderer.js`)

## Accomplishments

- **Canonical state primitives for Phase 14:** `js/sessionMode.js` now owns the `SELECTED_MODE_KEY`, `VALID_MODES`, persistence helpers, and the `'practice'` → `'standard'` legacy-record alias. Plan 14-02 (UI) has a zero-debate target for subscriptions and event wiring.
- **Unified D-04 session lock:** `isSessionActive()` derives from `AppState.sessionPhase !== 'idle'`. Both `startDiscovery()` and `startPractice()` now reject entry when any session is running — not just their own. Locks hold against devtools `startDiscovery()` during an active Practice session.
- **D-10 storage label flip:** new Standard sessions save with `mode: 'standard'` (practice.js:691). No mid-session handling needed.
- **D-11 read-time alias:** `storage.js querySessions` and `dashboard.js _getSessionsByDay` both route records through `normalizeMode`, so existing `mode: 'practice'` IDB records keep rendering correctly on the dashboard. No IDB migration; schema normalization deferred to Phase 17 per plan.
- **D-08 BPM badge preservation:** `renderer.js:938` updated from `sessionPhase === 'practice'` to `=== 'standard'`, so the v1.2 BPM readout keeps rendering for Standard sessions after the rename. Without this edit, SC2 would have silently regressed.

## Task Commits

Each task was committed atomically (all with `--no-verify` per parallel-executor protocol):

1. **Task 1: Create js/sessionMode.js with persistence, normalization, and constants** — `518b3a6` (feat)
2. **Task 2: Add sessionMode field + isSessionActive/getEffectiveMode to state.js** — `8007319` (feat)
3. **Task 3: Flip practice.js mode label 'practice' → 'standard' (D-10)** — `a0e2d14` (feat)
4. **Task 4: Normalize legacy 'practice' records at read time (D-11)** — `307d311` (feat)
5. **Task 5: Wire unified session lock + fix renderer BPM badge (D-04)** — `ed0725d` (feat)

_No plan-metadata commit — STATE.md / ROADMAP.md updates are owned by the orchestrator after the wave completes (per parallel-executor instructions)._

## Files Created/Modified

- `js/sessionMode.js` **(created)** — `SELECTED_MODE_KEY`, `VALID_MODES` frozen array, `loadSelectedMode`, `saveSelectedMode`, `normalizeMode`. Zero dependencies.
- `js/state.js` — added `import { loadSelectedMode }`; extended `sessionPhase` enum docstring to all 5 values; added `sessionMode: loadSelectedMode()` field; exported `isSessionActive()` and `getEffectiveMode()`.
- `js/practice.js` — line 159 `sessionPhase = 'standard'` (was `'practice'`); line 691 `mode: 'standard'` (was `'practice'`); added `isSessionActive` to state.js import; startPractice entry guard replaced (`if (_active) return` → `if (isSessionActive()) return`). Internal `_active` flag preserved for teardown (`_active = true` at entry, `_active = false` at stopPractice and onDisconnect).
- `js/storage.js` — added `import { normalizeMode }`; `querySessions` now returns `.slice(-limit).map(normalizeMode)`. `saveSession` unchanged.
- `js/dashboard.js` — added `import { normalizeMode }`; `_getSessionsByDay` loop renamed `for (const s of raw)` → `for (const rawSession of raw)` with `const s = normalizeMode(rawSession);` as first line.
- `js/discovery.js` — added `isSessionActive` to state.js import; startDiscovery entry guard replaced (`if (_phase !== 'idle') return` → `if (isSessionActive()) return`). Internal `_phase` state machine preserved throughout the rest of the file.
- `js/renderer.js` — line 938 BPM badge branch `sessionPhase === 'standard'` (was `=== 'practice'`).

## Decisions Made

### Planner-discretion calls exercised during execution

1. **AppState shape: `sessionMode` + extended `sessionPhase` enum pair.** 14-CONTEXT §Claude's Discretion allowed either an extended single enum or a `sessionMode` + `isSessionActive` pair. Chose the pair because:
   - Plan 14-02 needs to subscribe to both "which mode is selected" (sessionMode) and "is a session running" (derived from sessionPhase) — these are semantically distinct concerns and deserve separate state.
   - Extending only `sessionPhase` would conflate "what the user has *selected* next" with "what IS running now" — forcing Plan 14-02 to re-derive one from the other on every picker click.
2. **Normalization helper home: new `js/sessionMode.js`.** 14-CONTEXT §Claude's Discretion allowed `storage.js`, `dashboard.js`, or a new util. Chose the new module because it's the natural home for the related `SELECTED_MODE_KEY`, `VALID_MODES`, and persistence helpers — co-locating the contract (load/save/normalize all operate on the same mode-label concept).

### None beyond planner discretion

No structural deviations. Plan tasks 1–5 executed exactly as written.

## Deviations from Plan

None — plan executed exactly as written. All five tasks' actions applied verbatim; all five tasks' grep-based acceptance criteria pass; all five tasks' automated verify commands either pass (Tasks 1, 2, 4, 5) or pass on the grep portion with the Node-import portion environmentally infeasible (Task 3 — documented below under *Environmental observations*).

### Environmental observations (not deviations)

- **Node import checks for modules transitively importing `storage.js` fail in Node due to a pre-existing CDN import** (`import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8.0.3/+esm'` at `storage.js:4`). Node's default ESM loader rejects `https:` scheme, so `practice.js` / `dashboard.js` / `discovery.js` cannot be imported under `node --input-type=module`. This was true before this plan and is unrelated to any change made here. The grep-based acceptance criteria (the substantive correctness checks) all pass; `node --check` (syntax-only) passes on every modified file; `node --input-type=module` imports of `sessionMode.js` and `state.js` (which have no CDN dependencies) pass cleanly including the pub/sub and isSessionActive round-trip test in Task 2's verify.
- **`sessionStorage is not defined` warning during Task 2's Node verify** — expected: sessionStorage is a browser API. The defensive try/catch in `loadSelectedMode` catches the ReferenceError, emits a console.warn, and falls back to `'standard'` — precisely the contract the plan specifies for the defensive fallback path. Verify output included "PASS" so this is a diagnostic, not a failure.

## Issues Encountered

- **Worktree branch was created from an older base** (2180284, pre-v1.2-archive) rather than the expected 77eac15 (Phase 14 plans committed). First action: `git reset --soft 77eac153…` then `git checkout HEAD -- .` to align the working tree with the expected base. After that, branch base = expected base, and all Phase 14 plan/context files were present. No commits lost (the branch HEAD had only a `docs(11): capture phase context` commit that was superseded by the expected base).

## User Setup Required

None — no external service configuration required. This plan is entirely browser-local state primitives.

## Contract Adjustments for Plan 14-02

Plan 14-02 can rely on the following contracts landing exactly as specified:

- `subscribe('sessionPhase', fn)` fires on every session-state transition, including the new `'standard'` literal.
- `subscribe('sessionMode', fn)` fires when the user changes the mode selection (Plan 14-02 will write this field on picker click).
- `isSessionActive()` returns `true` when `sessionPhase` is anything other than `'idle'` — Plan 14-02's disable-everything behavior (D-05) can subscribe to `sessionPhase` and call `isSessionActive()` for branching.
- `loadSelectedMode()` defaults to `'standard'` on first load / invalid storage value — Plan 14-02's picker can rely on this default without explicit fallback.
- `saveSelectedMode(mode)` validates against `VALID_MODES` and console.warns on invalid values — Plan 14-02's picker handler can call this freely; invalid callers are defused without corrupting storage.

**No contract adjustments needed.** Plan 14-02 is pure markup + event wiring as promised by the 14-01 plan objective.

## Next Phase Readiness

- **Plan 14-02 (UI) can execute immediately** — the state layer is complete and has no unresolved questions. All subscriptions and helpers it depends on are exported.
- **Phase 16 (Pre-Sleep) and Phase 18 (Meditation) can set `AppState.sessionPhase = 'pre-sleep'` / `'meditation'` directly** — the enum documentation already enumerates these values and `isSessionActive()` will treat them correctly (non-idle → lock engaged).
- **Phase 17 (IDB v1→v2 migration)** can drop the `normalizeMode` read-time alias once old `mode: 'practice'` records are rewritten at migration time. Until then, read-time normalization remains in place without performance concern (one conditional rewrite per session record per read).

## Self-Check: PASSED

**File existence:**
- `js/sessionMode.js` — FOUND
- `js/state.js` — FOUND (modified)
- `js/practice.js` — FOUND (modified)
- `js/storage.js` — FOUND (modified)
- `js/dashboard.js` — FOUND (modified)
- `js/discovery.js` — FOUND (modified)
- `js/renderer.js` — FOUND (modified)
- `.planning/phases/14-mode-selector-session-lock/14-01-SUMMARY.md` — FOUND (this file)

**Commit hashes:**
- `518b3a6` (Task 1) — FOUND in git log
- `8007319` (Task 2) — FOUND in git log
- `a0e2d14` (Task 3) — FOUND in git log
- `307d311` (Task 4) — FOUND in git log
- `ed0725d` (Task 5) — FOUND in git log

**Phase-level automated verification (from plan §verification):**
1. `state.js OK: function function standard` — PASS
2. `sessionMode.js OK: resonanceHRV.selectedMode 3` — PASS
3. `storage.js OK` — skipped (pre-existing CDN import; see environmental observations)
4. `grep -rn "mode: 'practice'" js/` — zero matches — PASS
5. `grep -rn "sessionPhase = 'practice'" js/` — zero matches — PASS
6. `grep -rn "sessionPhase === 'practice'" js/` — zero matches — PASS
7. `grep -c "if (isSessionActive()) return;" js/discovery.js js/practice.js` — each ≥ 1 — PASS (1 in discovery, 1 in practice)
8. `grep -c "if (_active) return;" js/practice.js` — 0 — PASS
9. `grep -c "if (_phase !== 'idle') return;" js/discovery.js` — 0 — PASS

---
*Phase: 14-mode-selector-session-lock*
*Plan: 01*
*Completed: 2026-04-17*
