# Phase 5: Oura + Recovery Dashboard - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect to Oura Ring API to pull overnight HRV data, and display a recovery dashboard showing session coherence and overnight HRV trending together over weeks. The dashboard is the "is this working?" view — it connects daily practice to autonomic recovery.

</domain>

<decisions>
## Implementation Decisions

### Oura auth experience
- "Connect Oura" prompt lives inside the Dashboard tab itself — button transitions to chart after connecting
- Silent token refresh in the background — user never sees re-auth unless refresh token expires
- Fetch Oura data only when Dashboard tab is opened (lazy fetch), not on every app load
- No disconnect UI — personal tool, just let tokens expire naturally
- User has an existing Oura key (may be a PAT). Try using it as a static Bearer token first — if it works, skip the full OAuth2 PKCE flow entirely. If it's a client ID, fall back to OAuth2 PKCE with redirect to localhost:5000/callback

### Dashboard chart design
- Selectable time range: 7 / 14 / 30 / 90 day buttons above chart (default 30d)
- Dual Y-axes: HRV in milliseconds (rMSSD) on left, mean coherence 0-100 on right
- Visual style: Oura overnight HRV as a smooth teal line (continuous, nightly data), session coherence as individual dots/circles on practice days only
- Hover/tap tooltips: show date, HRV value, coherence score, session duration for that data point
- Rest days (no practice): just a gap in coherence dots, HRV line continues — visual contrast makes practice days obvious

### Data display & metrics
- 4 summary metric cards positioned above the chart (same card style as Practice session summary)
  1. **Current overnight HRV** — last night's rMSSD with trend arrow (up/down/flat vs 7-day avg)
  2. **Practice streak** — consecutive days with at least one session
  3. **Average coherence (7d)** — rolling 7-day mean session coherence
  4. **HRV trend direction** — "Improving / Stable / Declining" based on 7-day vs 30-day HRV average
- No session history list — chart and metrics only, individual session data available via tooltips
- Chart and metrics only view — keep dashboard focused on the recovery trend story

### CORS fallback strategy
- Try direct browser fetch to Oura API first (simplest path)
- If CORS blocks it: fall back to a minimal Node.js localhost proxy — single file (`node proxy.js` or similar one-liner)
- Pin to localhost:5000 for OAuth redirect URI consistency
- Proxy is a separate concern from the static file server — user runs it alongside `npx serve` if needed

### Claude's Discretion
- Exact tooltip positioning and styling
- Chart axis tick marks and grid line density
- How to handle days with multiple practice sessions (average? best? most recent?)
- Loading/spinner state while Oura data fetches
- Metric card trend arrow design (icon, color)
- Whether PAT or OAuth2 flow based on what the user's key turns out to be

</decisions>

<specifics>
## Specific Ideas

- The dashboard should answer the question: "Is my RFB practice actually improving my autonomic recovery?"
- HRV trend direction ("Improving / Stable / Declining") is the headline metric — the main thing the user wants to know at a glance
- Practice streak serves as motivation — habit reinforcement
- User's goal is to get Oura HRV score back above 75 within 4-6 weeks of daily practice

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `storage.js`: `getOuraCache()` / `setOuraCache()` already built with `oura` object store in IndexedDB
- `storage.js`: `querySessions()` returns practice sessions with coherence data for chart dots
- `state.js`: `AppState.ouraData` and `AppState.ouraConnected` pre-wired in reactive state
- `renderer.js`: Canvas rendering patterns (setupCanvas, gradient fills, smooth curves) reusable for chart
- Practice session summary: 4-metric card grid CSS already exists in `styles.css`

### Established Patterns
- CDN ESM imports (no build tools) — Oura client should follow same pattern
- Module pattern: one JS file per concern (e.g., `js/oura.js` for API client)
- AppState pub/sub for cross-module communication
- Canvas 2D for all data visualization (no charting libraries)

### Integration Points
- Dashboard tab: existing empty placeholder in `index.html` (`#tab-dashboard`)
- `main.js`: will need to import and wire oura/dashboard modules
- Tab switching: existing nav tab system handles show/hide
- `storage.js`: `setSetting()` / `getSetting()` for storing Oura token

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-oura-recovery-dashboard*
*Context gathered: 2026-03-22*
