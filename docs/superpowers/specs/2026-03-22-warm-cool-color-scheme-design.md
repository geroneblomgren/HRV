# Warm/Cool Split Color Scheme

## Problem

The current palette uses `#2979ff` (blue) for navigation and `#14b8a6` (teal) for data accents. These sit in an awkward zone on the color wheel — not analogous enough to feel cohesive, not distant enough to feel intentional. The dashboard adds a third direction with purple `#a78bfa` coherence dots, compounding the lack of unity. Warning amber `#ffab00` also sits too close to the proposed orange nav color.

## Design

Replace blue with warm orange for all UI chrome (navigation, buttons, interactive controls). Keep teal exclusively for biometric data display. Shift warning states from amber to yellow for visual separation from the new orange.

**Principle:** Warm = things you interact with. Cool = data about your body.

## CSS Variable Changes

| Variable | Current | New | Role |
|----------|---------|-----|------|
| `--accent-blue` | `#2979ff` | `#f97316` | Nav active, connect button, UI chrome |
| `--accent-amber` | `#ffab00` | `#eab308` | Warning/reconnecting states |
| `--accent-teal` | `#14b8a6` | `#14b8a6` | Unchanged — data accent, biometric display |

Rename `--accent-blue` to `--accent-action` to reflect its new semantic role. Update all four `var(--accent-blue)` references in `styles.css` accordingly.

## Per-Element Mapping

### Navigation and UI chrome (warm family)

| Element | File | Current | New |
|---------|------|---------|-----|
| Nav tab active (text + underline) | `styles.css` | `var(--accent-blue)` | `var(--accent-action)` / `#f97316` |
| Connect button default | `styles.css` | `var(--accent-blue)` | `#f97316` |
| Connect button hover | `styles.css` | `#448aff` | `#fb923c` |
| Active style button (Bowl/Swell/Pitch) | `styles.css` | `var(--accent-teal)` | `#f97316` |
| Duration picker active | `styles.css` | `var(--accent-teal)` | `#f97316` |
| Range button active (dashboard) | `styles.css` | `var(--accent-teal)` | `#f97316` |
| Discovery start button | `styles.css` | `var(--accent-teal)` | `#f97316` |
| Practice start button | `styles.css` | `var(--accent-teal)` | `#f97316` |
| Practice done button | `styles.css` | `var(--accent-teal)` | `#f97316` |
| Discovery confirm button | `styles.css` | inherits `.connect-button` | `#f97316` |
| Discovery confirm button hover | `styles.css` | `#0d9488` | `#ea580c` |
| Discovery start button hover | `styles.css` | `#0d9488` | `#ea580c` |
| Practice start button hover | `styles.css` | `#0d9488` | `#ea580c` |
| Practice done button hover | `styles.css` | `#0d9488` | `#ea580c` |

### Biometric data display (cool family — unchanged)

| Element | File | Value |
|---------|------|-------|
| HR value in live panel | `styles.css` | Change from `var(--accent-blue)` to `var(--accent-teal)` / `#14b8a6` |
| Pacer ring border + glow | `js/renderer.js` | `#14b8a6` (no change) |
| Waveform stroke + fill | `js/renderer.js` | `#14b8a6` (no change) |
| Spectrum stroke + fill | `js/renderer.js` | `#14b8a6` (no change) |
| Coherence value | `styles.css` | `#14b8a6` (no change) |
| Peak frequency value | `styles.css` | `#14b8a6` (no change) |
| Rate label (discovery) | `styles.css` | `var(--accent-teal)` (no change) |
| Progress dots (discovery) | `styles.css` | `var(--accent-teal)` (no change) |
| Countdown number | `styles.css` | `var(--accent-teal)` (no change) |
| Calibration bar fill | `js/renderer.js` | `#14b8a6` (no change) |
| Practice frequency display | `styles.css` | `var(--accent-teal)` (no change) |
| Summary metric values | `styles.css` | `var(--accent-teal)` (no change) |
| Oura input focus border | `styles.css` | `var(--accent-teal)` (no change) |

### Dashboard chart

| Element | File | Current | New |
|---------|------|---------|-----|
| HRV line stroke | `js/dashboard.js` | `#14b8a6` | No change |
| HRV axis labels + title | `js/dashboard.js` | `#14b8a6` | No change |
| Coherence dots fill | `js/dashboard.js` | `#a78bfa` | `#fb923c` |
| Coherence dots outline | `js/dashboard.js` | `#7c3aed` | `#ea580c` |
| Coherence axis labels + title | `js/dashboard.js` | `#a78bfa` | `#fb923c` |

### Warning states (shifted to yellow)

| Element | File | Current | New |
|---------|------|---------|-----|
| Reconnecting banner bg | `styles.css` | `var(--accent-amber)` | `#eab308` via updated variable |
| Connecting button bg | `styles.css` | `var(--accent-amber)` | `#eab308` |
| Reconnect button default | `styles.css` | `var(--accent-amber)` | `#eab308` |
| Reconnect button hover | `styles.css` | `#ffc107` | `#facc15` |
| Zone "building" color | `js/renderer.js` | `#eab308` | No change (already yellow) |

### Unchanged

- Green success: `#00c853` (connected banner), `#22c55e` (zone high/locked-in, trend up)
- Red error: `#ff1744` (disconnected banner, end session), `#ef4444` (zone low, trend down)
- All background colors: `#0d0d0d`, `#1a1a1a`, `#1e1e1e`
- All text colors: `#e8e8e8`, `#888888`
- Border color: `#2a2a2a`
- Meta/manifest theme: `#111111`

## Files to Modify

1. **`styles.css`** — Rename `--accent-blue` to `--accent-action`, update value to `#f97316`, update all references, button hover values (`#0d9488` to `#ea580c`), HR value color.
2. **`js/renderer.js`** — No changes needed (all teal, already correct).
3. **`js/discovery.js`** — No blue/purple references found. Note: line 507 has an inline `style="color:#14b8a6"` for the resonance frequency display — this is correct per warm/cool principle (data value) but bypasses CSS variables.
4. **`js/dashboard.js`** — Update coherence dot fill/outline colors and axis label colors from purple to orange.

## Edge Cases

- **Discovery comparison chart:** Selected bar uses `#14b8a6`, unselected uses `#2a4a47`. These are data-display colors (teal family) — no change needed.
- **Chime pulse animation:** Uses red `rgba(255, 23, 68, ...)` — no change.
- **Pacer gauge opacity in practice:** 0.45 — no change, it's a teal element.
- **Zone "building" and `--accent-amber` share `#eab308`:** Intentional — zone building renders as a gauge arc in `renderer.js`, while `--accent-amber` drives banner/button backgrounds in CSS. No visual conflict.

## Testing

- Visually verify each tab (Discovery idle, Discovery mid-session, Discovery results, Practice idle, Practice mid-session, Practice summary, Dashboard) to confirm no orphaned blue or purple values remain.
- Check all connection states: disconnected, connecting, connected, reconnecting.
- Verify zone color transitions (low/building/high) still read correctly against the new palette.
- Confirm orange action buttons have sufficient contrast against dark backgrounds (WCAG AA: 4.5:1 for text). `#f97316` on `#0d0d0d` = ~6.5:1 contrast ratio — passes.
- Verify yellow warning contrast: `#eab308` background with `#1a1a1a` text = ~8.5:1 — passes. `#facc15` hover = ~11:1 — passes.
