# Phase 14: Mode Selector + Session Lock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 14-mode-selector-session-lock
**Areas discussed:** Selector placement & form, Session lock enforcement, Placeholder depth, Mode persistence & storage label

---

## Selector Placement & Form

### Q1: How should the mode selector surface in the UI?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline picker in Practice tab | Keep nav as-is; segmented control at top of Practice panel | ✓ |
| Rename Practice → Sessions, picker inside | Same mechanics + rename for clarity | |
| Replace Practice with 3 mode tabs in nav | Five tabs total: Discovery / Standard / Pre-Sleep / Meditation / Dashboard | |

**User's choice:** Inline picker in Practice tab (with ASCII preview of nav + Practice body layout).
**Notes:** Matches Phase 13's "preserve, add minimally" pattern.

### Q2: What form factor for the mode picker?

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented pill control | Three connected buttons; mirror existing duration-picker style | ✓ |
| Radio buttons with labels | Traditional radio group | |
| Dropdown (`<select>`) | 3-option dropdown | |

**User's choice:** Segmented pill control.
**Notes:** Reuses established duration-picker aesthetic from Practice placeholder.

### Q3: Should the active mode stay visible during a session?

| Option | Description | Selected |
|--------|-------------|----------|
| Selector stays visible (disabled) during session | Picker greys out but remains visible | ✓ |
| Add a mode badge in the session viz | Picker hides, badge appears near pacer | |
| Nothing visible mid-session | Picker disappears entirely | |

**User's choice:** Selector stays visible (disabled) during session.
**Notes:** No additional badge needed — picker itself is the persistent indicator.

---

## Session Lock Enforcement

### Q1: How should the session lock be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Disable everything (no modal) | Picker + start buttons disabled app-wide | ✓ |
| Confirmation modal on bypass attempt | Modal prompts to end-and-switch | |
| Both — belt and suspenders | Disable + modal fallback | |

**User's choice:** Disable everything.
**Notes:** User added that End Session must always be available and ending re-enables everything disabled.

### Q2: Can the user switch to other nav tabs during a session?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — tabs switchable, start-actions disabled | Other tabs browsable; start buttons there disabled | |
| No — lock nav during active session | Other nav tabs disabled during session | ✓ |
| Auto-snap back to active mode | Tabs clickable but app snaps back | |

**User's choice:** Lock nav during active session.
**Notes:** User specified that ending the session must restore disabled nav actions.

### Q3: Is Discovery treated as "a mode" for session-lock purposes?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — one global lock covers Discovery + all 3 modes | Single AppState flag for the whole app | ✓ |
| No — Discovery and modes have separate locks | Independent locks | |

**User's choice:** One global lock.

---

## Placeholder Depth

### Q1: How deep should the Pre-Sleep and Meditation placeholder views go?

| Option | Description | Selected |
|--------|-------------|----------|
| Skeletal: heading + disabled Start | Title + one-line + disabled Start + "Implemented in Phase X" tooltip | ✓ |
| Heading only (no controls) | Just a title + sentence, no Start button | |
| Full non-functional mock | All anticipated controls disabled | |

**User's choice:** Skeletal placeholder (with ASCII preview of Pre-Sleep + Meditation panels).
**Notes:** Exercises the session-lock path for these modes without speccing UIs that belong in Phases 16/18.

### Q2: Does Standard mode's existing Practice UI change in Phase 14?

| Option | Description | Selected |
|--------|-------------|----------|
| Stay identical — just relabeled under the picker | Zero behavioral change for Standard | ✓ |
| Minor refactor to share layout with other modes | Restructure Practice panel into a common mode-container | |

**User's choice:** Stay identical.

---

## Mode Persistence & Storage Label

### Q1: Should the selected mode persist across page reloads?

| Option | Description | Selected |
|--------|-------------|----------|
| localStorage, default Standard on first run | Survives tabs + restarts | |
| Reset to Standard on every reload | No persistence | |
| sessionStorage (per-tab only) | Survives within-tab reloads only | ✓ |

**User's choice:** sessionStorage.
**Notes:** Deliberate — fresh default on each new tab / browser open.

### Q2: Old session records use `mode: 'practice'`. What does Phase 14 do?

| Option | Description | Selected |
|--------|-------------|----------|
| Write 'standard' going forward; alias old 'practice' at read time | No DB migration in Phase 14 | ✓ |
| Do a one-shot rename migration now | Rewrite all old records | |
| Keep writing 'practice' for Standard mode | Don't change stored label | |

**User's choice:** Write 'standard' going forward; alias old 'practice' at read time.
**Notes:** Full normalization deferred to Phase 17's planned IDB v1→v2 migration.

---

## Claude's Discretion

- Exact AppState shape for the session lock (extend `sessionPhase` enum vs new `sessionMode` + `isSessionActive` pair).
- Picker pill colors / hover / focus styles.
- Tooltip copy on disabled Pre-Sleep / Meditation Start buttons.
- Visual treatment of disabled nav tabs.
- Location of the `'practice'` → `'standard'` normalization helper.

## Deferred Ideas

- Mode icons / colors on the picker pills.
- Whether Phase 17 rewrites legacy `'practice'` records or leaves the read-time alias.
- Disabled-button tooltip copy beyond "Implemented in Phase X".
- Mode-aware tuning-overlay copy (lives in Phase 16 where Pre-Sleep actually uses tuning).
