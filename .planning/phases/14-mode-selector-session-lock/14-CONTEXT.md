# Phase 14: Mode Selector + Session Lock - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a Standard / Pre-Sleep / Meditation mode picker inside the existing Practice tab, plus a global session lock that prevents a second session (of any mode, including Discovery) from starting while one is active. Standard mode's behavior and UI are unchanged — today's Practice flow simply sits under the Standard segment. Pre-Sleep and Meditation panels render as skeletal placeholders (heading + disabled Start) so the `{mode × view}` state matrix is fully wired before any mode-specific logic ships in Phases 16 / 18.

**In scope:** mode picker UI, session-lock state & enforcement, Pre-Sleep / Meditation placeholder shells, mode persistence, saveSession label change.

**Out of scope:** I:E ratio controls (Phase 16), meditation audio (Phase 18), audio routing refactor (Phase 15), sonification (Phase 19).

</domain>

<decisions>
## Implementation Decisions

### Selector Placement & Form

- **D-01:** Keep nav unchanged (`Discovery | Practice | Dashboard`). Mode picker lives at the top of the Practice panel body — no new nav tabs, no rename.
- **D-02:** Picker is a horizontal segmented-pill control with three options: Standard (default) · Pre-Sleep · Meditation. Visual style mirrors the existing `duration-picker` buttons in the Practice placeholder (`index.html:274-279`).
- **D-03:** During an active session the picker stays visible but is disabled (greyed-out pills). The active session's own viz communicates which mode is running — no additional badge or color strip elsewhere.

### Session Lock Enforcement

- **D-04:** Single global lock covers Discovery + all three modes. One source of truth — while any session is active, no other session (of any mode, including Discovery) can start. Treat this as `isSessionActive()` derived from AppState; exact shape (extended `sessionPhase` enum vs new flag + `sessionMode` pair) is planner's call.
- **D-05:** Enforcement is "disable everything," no modal dialog. While a session is active:
  - Mode picker pills are disabled (D-03).
  - All start buttons across the app are disabled (Practice Start, Discovery Start, Pre-Sleep / Meditation placeholder Start buttons).
  - Nav tabs (Discovery, Dashboard) are disabled — user cannot navigate away from the active session's tab.
- **D-06:** End Session button is the one escape hatch — always enabled during a session. Pressing it tears down the session and re-enables the picker, all start buttons, and nav tabs in one step.

### Placeholder Depth (Pre-Sleep / Meditation)

- **D-07:** Pre-Sleep and Meditation panels each render: mode heading, one-line description, and a disabled Start button with a tooltip pointing to the phase that will implement it ("Implemented in Phase 16" / "Implemented in Phase 18"). Nothing else — no I:E picker stub, no script chooser stub, no upload button. Those UIs get designed in their own phases.
- **D-08:** Standard mode's Practice UI is not restructured. The existing practice placeholder, tuning overlay, session viz, and summary move under the Standard segment unchanged. Zero behavioral change for Standard.

### Mode Persistence & Storage Label

- **D-09:** Selected mode persists in `sessionStorage` (not `localStorage`). Survives within-tab reloads; each new tab or browser restart defaults to Standard. Deliberate — user wants a fresh default rather than a sticky preference.
- **D-10:** From Phase 14 onward, `saveSession()` writes `mode: 'standard'` (not `'practice'`) for Standard-mode sessions. Pre-Sleep / Meditation phases will write `'pre-sleep'` / `'meditation'` when they ship.
- **D-11:** Existing session records with `mode: 'practice'` are NOT migrated in Phase 14. Dashboard and any other reader normalizes at read time — a small helper treats `'practice'` as equivalent to `'standard'`. Full schema normalization is deferred to Phase 17's planned IDB v1→v2 migration.

### Claude's Discretion

- Exact AppState shape for the session lock (extend `sessionPhase` vs introduce `sessionMode` + `isSessionActive` pair) — planner's call, but must cleanly support the Discovery + 3 modes unified lock in D-04.
- Picker pill colors / hover states / focus ring — style to match existing duration-picker aesthetic.
- Tooltip copy on disabled Pre-Sleep / Meditation Start buttons — "Implemented in Phase X" direction is locked, exact wording is discretion.
- Visual treatment of disabled nav tabs (muted text vs pointer: none vs explicit disabled class) — pick whatever matches current disabled-control conventions.
- Whether the disabled mode picker also shows the currently-running mode with some visual emphasis (subtle "active" indicator under the disabled state) or stays fully greyed — minor polish.
- Where the normalization helper for `'practice'` → `'standard'` lives (`storage.js` read path, or `dashboard.js`, or a new `sessionMode.js` util).

### Folded Todos

None — todo matcher returned no matches for Phase 14.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Infrastructure — INFRA-01 (selector), INFRA-02 (global lock). INFRA-03 is Phase 15, not this phase.
- `.planning/ROADMAP.md` §"Phase 14: Mode Selector + Session Lock" — 4 success criteria, plan of record.
- `.planning/PROJECT.md` §Constraints — desktop-Chrome-only, vanilla JS, no build tools.

### Existing Code Required Reading
- `js/state.js` — AppState schema; `sessionPhase` enum (`'idle' | 'discovery' | 'practice'`) is what the lock hangs off.
- `js/practice.js` — `startPractice()` sets `AppState.sessionPhase = 'practice'` (line 159); `saveSession({ mode: 'practice', … })` is at line 691. These are the two insertion points for D-10 / D-05.
- `js/discovery.js` — Discovery's start/stop flow; it must also consult the unified session lock per D-04.
- `js/main.js:259-273` — nav tab click handler; D-05 disabled-tab behavior lands here.
- `index.html:19-22` (nav), `:163-282` (Practice panel), `:274-279` (duration-picker — style reference for D-02 pills).
- `js/storage.js` — session read/write surface; D-11 normalization helper sits here.

No external specs beyond the above — requirements fully captured in ROADMAP.md + REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **duration-picker** (`index.html:274-279` + styling in `styles.css`) — three horizontal buttons with an `.active` class; exact visual pattern D-02 clones for the mode pills.
- **AppState.sessionPhase** (`state.js:24`) — already distinguishes `'idle' | 'discovery' | 'practice'`. Natural anchor for D-04's unified lock.
- **sessionPhase subscribe pattern** (`state.js:124`) — pub/sub bus; disabling nav tabs / start buttons in response to session-active changes uses this same subscribe mechanism (see `main.js:131` etc.).
- **saveSession** (`storage.js` via `practice.js:688-717`) — already accepts a `mode` field on every record. D-10 is a one-string change at the call site.
- **Nav tab click handler** (`main.js:259-273`) — the single place that toggles `.active` on tabs and panels. D-05's nav-lock hooks in here.

### Established Patterns
- Central reactive store + pub/sub: no module calls another module's DOM directly — they subscribe to AppState changes (`main.js:112+`, `practice.js:282+`).
- UI-element references are cached at module load (`main.js:12-35`, `practice.js:39`); new mode panels and the picker follow this.
- Per-controller disconnect hooks (`discovery.onDisconnect` / `practice.onDisconnect` in `main.js:178-189`) — the unified lock doesn't change this; each mode controller still owns its own teardown.
- Canvas-drawn viz, no framework; placeholder panels are pure HTML.

### Integration Points
- `index.html` — add segmented-pill markup at top of `#tab-practice` body; add two new sibling `<div>`s for Pre-Sleep and Meditation panels (shown/hidden by the picker).
- `state.js` — whatever the final lock shape is (extended `sessionPhase` enum, or new `sessionMode` + derived `isSessionActive`), it's declared here.
- `practice.js` — startPractice writes `mode: 'standard'` (D-10); existing `_active` guard consults the unified lock (D-04).
- `discovery.js` — startDiscovery consults the same unified lock.
- `main.js` — picker event listener wires mode switches; nav-tab handler reads session-active state to enable/disable tabs (D-05); all start buttons subscribe to session-active and disable accordingly.
- `dashboard.js` / `storage.js` — small helper normalizes stored `mode === 'practice'` to `'standard'` at read time (D-11).

</code_context>

<specifics>
## Specific Ideas

- User explicitly affirmed "preserve what works, add minimally" — D-08 (Standard UI unchanged) and D-02 (pills clone existing duration-picker style) follow from this.
- User wants End Session to always re-enable everything in one step (D-06) — no staged unlock, no "are you sure?" prompt after ending.
- User chose `sessionStorage` over `localStorage` deliberately (D-09) — each fresh open starts on Standard rather than inheriting "last night I was on Pre-Sleep." Treat this as a feature, not a limitation.
- Disabled nav tabs during session (D-05) is stricter than a typical "block start actions only" design. Downstream planner should not soften this.

</specifics>

<deferred>
## Deferred Ideas

- Mode icons / colors on the picker pills — not spec'd now; can add later if distinct visual identity helps during actual use.
- Whether the `'practice'` → `'standard'` normalization becomes an actual DB rewrite as part of Phase 17's v1→v2 migration, or stays a read-time alias forever — Phase 17's decision.
- Any start-button-disabled tooltip copy beyond "Implemented in Phase X" (e.g., "End Session first") — polish-level, planner can decide or defer.
- Mode-aware tuning overlay copy (the 60-sec tuning ring could say "Tuning for Pre-Sleep…" when Pre-Sleep is selected) — belongs in Phase 16 where Pre-Sleep actually starts using tuning.

### Reviewed Todos (not folded)

None — todo matcher found no matches for this phase.

</deferred>

---

*Phase: 14-mode-selector-session-lock*
*Context gathered: 2026-04-17*
