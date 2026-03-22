# Warm/Cool Split Color Scheme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the clashing blue/teal palette with a warm/cool split — orange for UI chrome, teal for biometric data, yellow for warnings.

**Architecture:** Pure CSS variable + hardcoded hex replacement across 2 files (`styles.css`, `js/dashboard.js`). No structural changes, no new files, no JS logic changes.

**Tech Stack:** CSS, Canvas JS (dashboard chart colors)

**Spec:** `docs/superpowers/specs/2026-03-22-warm-cool-color-scheme-design.md`

---

### Task 1: Rename and update CSS variables

**Files:**
- Modify: `styles.css:6-21` (`:root` block)

- [ ] **Step 1: Rename `--accent-blue` to `--accent-action` and update values**

In `styles.css`, replace the `:root` variable declarations:

```css
/* Before */
  --accent-amber: #ffab00;
  --accent-red: #ff1744;
  --accent-blue: #2979ff;

/* After */
  --accent-amber: #eab308;
  --accent-red: #ff1744;
  --accent-action: #f97316;
```

This changes:
- `--accent-blue` → `--accent-action` (rename + value `#2979ff` → `#f97316`)
- `--accent-amber` value `#ffab00` → `#eab308` (shift to yellow)

- [ ] **Step 2: Verify no parse errors**

Open `index.html` in a browser. The page should load without errors. Colors will look broken (nav/buttons still reference old variable name) — that's expected until Task 2.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "refactor: rename --accent-blue to --accent-action, shift amber to yellow"
```

---

### Task 2: Update all `var(--accent-blue)` references in CSS

**Files:**
- Modify: `styles.css:98-100` (nav tab active)
- Modify: `styles.css:117-118` (connect button)
- Modify: `styles.css:267-268` (HR value)

- [ ] **Step 1: Update nav tab active state**

In `styles.css`, replace the `.nav-tab.active` rule (lines 98-101):

```css
/* Before */
.nav-tab.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
}

/* After */
.nav-tab.active {
  color: var(--accent-action);
  border-bottom-color: var(--accent-action);
}
```

- [ ] **Step 2: Update connect button**

In `styles.css`, replace the `.connect-button` background (line 118):

```css
/* Before */
  background: var(--accent-blue);

/* After */
  background: var(--accent-action);
```

- [ ] **Step 3: Update connect button hover**

In `styles.css`, replace the `.connect-button:hover` background (line 131):

```css
/* Before */
  background: #448aff;

/* After */
  background: #fb923c;
```

- [ ] **Step 4: Update HR value color to teal**

In `styles.css`, replace `#hr-value` rule (line 268):

```css
/* Before */
  color: var(--accent-blue);

/* After */
  color: var(--accent-teal);
```

This moves HR from the blue/action family to the biometric/teal family.

- [ ] **Step 5: Verify in browser**

Open `index.html`. Check:
- Nav tabs: active tab should show orange text + orange underline
- Connect button: orange background
- HR value (if visible): teal

- [ ] **Step 6: Commit**

```bash
git add styles.css
git commit -m "feat: update nav, connect button, HR to warm/cool scheme"
```

---

### Task 3: Update warning state colors

**Files:**
- Modify: `styles.css:179-180` (reconnect button hover)

- [ ] **Step 1: Update reconnect button hover**

In `styles.css`, replace the `.reconnect-button:hover` background (line 180):

```css
/* Before */
  background: #ffc107;

/* After */
  background: #facc15;
```

Note: The reconnecting banner and reconnect button default already use `var(--accent-amber)` which was updated to `#eab308` in Task 1. Only the hardcoded hover value needs changing.

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: shift reconnect hover to yellow"
```

---

### Task 4: Update action buttons from teal to orange

**Files:**
- Modify: `styles.css:417-420` (style button active)
- Modify: `styles.css:593-601` (discovery confirm + hover)
- Modify: `styles.css:603-609` (discovery start + hover)
- Modify: `styles.css:650-654` (duration picker active)
- Modify: `styles.css:656-663` (practice start + hover)
- Modify: `styles.css:737-744` (practice done + hover)
- Modify: `styles.css:827-831` (range button active)

- [ ] **Step 1: Update style button active state**

In `styles.css`, replace `.style-btn.active` (lines 417-420):

```css
/* Before */
.style-btn.active {
  border-color: var(--accent-teal);
  color: var(--accent-teal);
}

/* After */
.style-btn.active {
  border-color: var(--accent-action);
  color: var(--accent-action);
}
```

- [ ] **Step 2: Update discovery confirm button + hover**

In `styles.css`, replace `.discovery-confirm-btn` (lines 593-601):

```css
/* Before */
.discovery-confirm-btn {
  background: var(--accent-teal);
  padding: 12px 36px;
  font-size: 1rem;
}

.discovery-confirm-btn:hover {
  background: #0d9488;
}

/* After */
.discovery-confirm-btn {
  background: var(--accent-action);
  padding: 12px 36px;
  font-size: 1rem;
}

.discovery-confirm-btn:hover {
  background: #ea580c;
}
```

- [ ] **Step 3: Update discovery start button + hover**

In `styles.css`, replace `.discovery-start-btn` (lines 603-609):

```css
/* Before */
.discovery-start-btn {
  background: var(--accent-teal);
}

.discovery-start-btn:hover:not(:disabled) {
  background: #0d9488;
}

/* After */
.discovery-start-btn {
  background: var(--accent-action);
}

.discovery-start-btn:hover:not(:disabled) {
  background: #ea580c;
}
```

- [ ] **Step 4: Update duration picker active state**

In `styles.css`, replace `.duration-btn.active` (lines 650-654):

```css
/* Before */
.duration-btn.active {
  background: var(--accent-teal);
  border-color: var(--accent-teal);
  color: #fff;
}

/* After */
.duration-btn.active {
  background: var(--accent-action);
  border-color: var(--accent-action);
  color: #fff;
}
```

- [ ] **Step 5: Update practice start button + hover**

In `styles.css`, replace `.practice-start-btn` and hover (lines 656-663):

```css
/* Before */
.practice-start-btn {
  background: var(--accent-teal);
  margin-top: 0;
}

.practice-start-btn:hover:not(:disabled) {
  background: #0d9488;
}

/* After */
.practice-start-btn {
  background: var(--accent-action);
  margin-top: 0;
}

.practice-start-btn:hover:not(:disabled) {
  background: #ea580c;
}
```

- [ ] **Step 6: Update practice done button + hover**

In `styles.css`, replace `.practice-done-btn` and hover (lines 737-744):

```css
/* Before */
.practice-done-btn {
  background: var(--accent-teal);
  padding: 12px 48px;
  font-size: 1rem;
}

.practice-done-btn:hover {
  background: #0d9488;
}

/* After */
.practice-done-btn {
  background: var(--accent-action);
  padding: 12px 48px;
  font-size: 1rem;
}

.practice-done-btn:hover {
  background: #ea580c;
}
```

- [ ] **Step 7: Update range button active state**

In `styles.css`, replace `.range-btn.active` (lines 827-831):

```css
/* Before */
.range-btn.active {
  background: var(--accent-teal);
  color: var(--bg-primary);
  border-color: var(--accent-teal);
}

/* After */
.range-btn.active {
  background: var(--accent-action);
  color: var(--bg-primary);
  border-color: var(--accent-action);
}
```

- [ ] **Step 8: Verify in browser**

Open `index.html` and check all three tabs:
- **Discovery:** Start button orange, confirm button orange (if visible)
- **Practice:** Duration picker active orange, Start Session button orange, Done button orange
- **Dashboard:** Range button active orange
- **All tabs:** Style buttons (Pitch/Swell/Bowl) active state orange

- [ ] **Step 9: Commit**

```bash
git add styles.css
git commit -m "feat: switch action buttons from teal to orange"
```

---

### Task 5: Update dashboard chart colors (purple → orange)

**Files:**
- Modify: `js/dashboard.js:462` (coherence axis labels)
- Modify: `js/dashboard.js:481` (coherence axis title)
- Modify: `js/dashboard.js:529` (coherence dot fill)
- Modify: `js/dashboard.js:534` (coherence dot outline)

- [ ] **Step 1: Replace all `#a78bfa` with `#fb923c`**

In `js/dashboard.js`, find and replace all three instances of `#a78bfa`:

Line 462: `_ctx.fillStyle = '#a78bfa';` → `_ctx.fillStyle = '#fb923c';`
Line 481: `_ctx.fillStyle = '#a78bfa';` → `_ctx.fillStyle = '#fb923c';`
Line 529: `_ctx.fillStyle = '#a78bfa';` → `_ctx.fillStyle = '#fb923c';`

- [ ] **Step 2: Replace `#7c3aed` with `#ea580c`**

In `js/dashboard.js`, line 534:

`_ctx.strokeStyle = '#7c3aed';` → `_ctx.strokeStyle = '#ea580c';`

- [ ] **Step 3: Verify in browser**

Open the Dashboard tab with Oura data loaded (or check canvas rendering). Coherence dots and axis labels should appear orange instead of purple.

- [ ] **Step 4: Commit**

```bash
git add js/dashboard.js
git commit -m "feat: update dashboard coherence colors from purple to orange"
```

---

### Task 6: Final sweep — verify no orphaned blue/purple values

**Files:**
- Read: `styles.css`, `js/dashboard.js`, `js/renderer.js`, `js/discovery.js`

- [ ] **Step 1: Search for orphaned blue**

```bash
grep -rn "#2979ff\|#448aff\|accent-blue" styles.css js/
```

Expected: zero results.

- [ ] **Step 2: Search for orphaned purple**

```bash
grep -rn "#a78bfa\|#7c3aed" styles.css js/
```

Expected: zero results.

- [ ] **Step 3: Search for old amber hover**

```bash
grep -rn "#ffc107\|#ffab00" styles.css js/
```

Expected: zero results.

- [ ] **Step 4: Search for old teal hover on action buttons**

```bash
grep -rn "#0d9488" styles.css js/
```

Expected: zero results.

- [ ] **Step 5: Visual walkthrough**

Open `index.html` and verify each view:

| View | What to check |
|------|---------------|
| Discovery idle | Start button = orange |
| Discovery mid-session | Rate label = teal, progress dots = teal, pacer = teal |
| Discovery results | Confirm button = orange, chart bars = teal |
| Practice idle | Duration active = orange, Start = orange, freq display = teal |
| Practice mid-session | Pacer = teal, style btn active = orange, spectrum = teal |
| Practice summary | Metric values = teal, Done button = orange |
| Dashboard | Range btn active = orange, HRV line = teal, coherence dots = orange |
| Connection states | Connected = green, connecting = yellow, reconnecting = yellow, disconnected = red |
| Nav bar | Active tab = orange underline + text |

- [ ] **Step 6: Commit (if any fixes needed)**

Only if the sweep found issues. Otherwise skip.
