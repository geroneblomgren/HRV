# Phase 5: Oura + Recovery Dashboard - Research

**Researched:** 2026-03-22
**Domain:** Oura API v2 OAuth2/PAT authentication, Canvas 2D dual-axis charting, IndexedDB caching
**Confidence:** MEDIUM (Oura CORS behavior unconfirmed without live smoke test; auth strategy hinges on whether user's key is PAT or client ID)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Oura auth experience**
- "Connect Oura" prompt lives inside the Dashboard tab itself — button transitions to chart after connecting
- Silent token refresh in the background — user never sees re-auth unless refresh token expires
- Fetch Oura data only when Dashboard tab is opened (lazy fetch), not on every app load
- No disconnect UI — personal tool, just let tokens expire naturally
- User has an existing Oura key (may be a PAT). Try using it as a static Bearer token first — if it works, skip the full OAuth2 PKCE flow entirely. If it's a client ID, fall back to OAuth2 PKCE with redirect to localhost:5000/callback

**Dashboard chart design**
- Selectable time range: 7 / 14 / 30 / 90 day buttons above chart (default 30d)
- Dual Y-axes: HRV in milliseconds (rMSSD) on left, mean coherence 0-100 on right
- Visual style: Oura overnight HRV as a smooth teal line (continuous, nightly data), session coherence as individual dots/circles on practice days only
- Hover/tap tooltips: show date, HRV value, coherence score, session duration for that data point
- Rest days (no practice): just a gap in coherence dots, HRV line continues — visual contrast makes practice days obvious

**Data display & metrics**
- 4 summary metric cards positioned above the chart (same card style as Practice session summary)
  1. Current overnight HRV — last night's rMSSD with trend arrow (up/down/flat vs 7-day avg)
  2. Practice streak — consecutive days with at least one session
  3. Average coherence (7d) — rolling 7-day mean session coherence
  4. HRV trend direction — "Improving / Stable / Declining" based on 7-day vs 30-day HRV average
- No session history list — chart and metrics only, individual session data available via tooltips
- Chart and metrics only view — keep dashboard focused on the recovery trend story

**CORS fallback strategy**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OURA-01 | App authenticates with Oura API v2 via OAuth2 (authorization code flow or implicit flow) | PAT-first strategy documented; PKCE flow as fallback with `window.crypto.subtle` — no external library needed |
| OURA-02 | App pulls daily readiness/sleep data including overnight HRV (rMSSD) for the past 30 days | Endpoint: `GET https://api.ouraring.com/v2/usercollection/sleep` with `start_date`/`end_date` params; field is `average_hrv` |
| OURA-03 | Oura data cached in IndexedDB and refreshed on each app load | `getOuraCache()` / `setOuraCache()` already exist in storage.js; freshness check pattern documented |
| DASH-01 | Dashboard displays session coherence trend (mean coherence per session) over days/weeks | `querySessions()` returns practice sessions with coherence; date aggregation pattern documented |
| DASH-02 | Dashboard overlays Oura overnight HRV trend on the same time axis | Shared X-axis with date alignment; data merge pattern documented |
| DASH-03 | Dashboard renders as a Canvas chart with dual Y-axes (coherence 0-100, HRV in ms) | Canvas 2D dual-scale pattern using two independent `yToPixel()` functions documented below |
</phase_requirements>

---

## Summary

Phase 5 adds Oura API integration and a recovery dashboard. The technical challenge splits into two independent concerns: (1) authenticating with Oura and fetching HRV data, and (2) rendering a dual-axis Canvas chart that merges Oura HRV with session coherence data.

**Authentication strategy:** The user holds an existing Oura key of unknown type. Personal Access Tokens have been deprecated on the Oura platform according to official library documentation (Pinta365/oura_api README, cloud.ouraring.com/docs). However, PATs issued before the deprecation may still function as Bearer tokens — the strategy is to try the user's key as `Authorization: Bearer <key>` against `GET https://api.ouraring.com/v2/usercollection/personal_info`. If it returns 200, use it directly and skip OAuth2 entirely. If it fails, build the OAuth2 PKCE flow. This avoids building unnecessary infrastructure.

**CORS is the highest risk item.** There is no official documentation confirming that `api.ouraring.com` sends `Access-Control-Allow-Origin` headers allowing browser fetches from `localhost:5000`. The decision to attempt direct browser fetch first is correct — a 30-second smoke test on the real endpoint will resolve this before any UI is built. The minimal Node.js proxy fallback (documented below) is the safety net.

**Canvas chart:** This project uses raw Canvas 2D exclusively — no charting libraries. The dual-axis pattern is straightforward: define two `yToPixel(value, min, max, canvasH, padding)` functions, one for HRV (left axis, 20–80 ms range) and one for coherence (right axis, 0–100), and draw both data series in a single pass through the shared X-axis (date → pixel). The existing `setupCanvas()`, `drawSmoothCurve()`, and gradient fill patterns from `renderer.js` are directly reusable.

**Primary recommendation:** Build `js/oura.js` first with PAT-first auth and a CORS smoke test gate; build `js/dashboard.js` second with Canvas chart only after the data contract is confirmed.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| None (Vanilla JS) | ES2022+ | OAuth2 PKCE, fetch, Canvas 2D | Project constraint: CDN ESM, no build tools |
| idb | 8.0.3 (already installed) | IndexedDB token + cache storage | Already used in `storage.js` for sessions and Oura cache |
| Web Crypto API | Browser built-in | PKCE code verifier/challenge generation | No external library needed; `crypto.subtle.digest` available in all modern browsers |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js http module | Built-in | Minimal CORS proxy for Oura API | Only if direct browser fetch is CORS-blocked |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw Canvas 2D dual-axis | Chart.js or uPlot via CDN | Libraries add 40-100KB CDN weight and break the no-external-library pattern established in phases 1-4 |
| Node.js one-file proxy | CORS Anywhere public service | Public proxy exposes token; never acceptable for a personal health tool |
| PKCE (fallback only) | Implicit flow / client-side token | Implicit flow deprecated in OAuth 2.1; PKCE is current standard for SPAs |

**Installation:** No new packages — idb already in `storage.js`. Node.js proxy uses only built-in `http` and `https` modules.

---

## Architecture Patterns

### Recommended Project Structure
```
js/
├── oura.js          # OuraClient: PAT-first auth, OAuth2 PKCE fallback, /sleep fetch, IndexedDB cache
├── dashboard.js     # DashboardController: DOM wiring, data merge, Canvas chart, metric cards
├── main.js          # Add: import dashboard, wire tab-click lazy fetch
proxy.js             # (root) Minimal Node.js CORS proxy — only created if browser fetch fails
```

### Pattern 1: PAT-First Auth with OAuth2 PKCE Fallback

**What:** On first Dashboard tab open, check IndexedDB for stored token. If none, try user's key as Bearer token. If that fails (401), launch OAuth2 PKCE flow.
**When to use:** Exactly once per install; subsequent opens use cached token.

```javascript
// js/oura.js
// Source: project pattern + aaronpk/pkce-vanilla-js reference

const OURA_API_BASE = 'https://api.ouraring.com';
const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const REDIRECT_URI = 'http://localhost:5000/callback';

// --- PAT-first check ---
export async function tryPatAuth(patKey) {
  const resp = await fetch(`${OURA_API_BASE}/v2/usercollection/personal_info`, {
    headers: { Authorization: `Bearer ${patKey}` }
  });
  return resp.ok; // true = PAT works; false = need OAuth2
}

// --- PKCE helpers (Web Crypto, no external library) ---
async function generateCodeVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function launchPkceFlow(clientId) {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = crypto.randomUUID();

  // Store verifier in sessionStorage (survives redirect, cleared on tab close)
  sessionStorage.setItem('oura_pkce_verifier', verifier);
  sessionStorage.setItem('oura_pkce_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: 'daily sleep',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
  });
  window.location.href = `${OURA_AUTH_URL}?${params}`;
}

export async function handleCallback(code, returnedState) {
  const verifier = sessionStorage.getItem('oura_pkce_verifier');
  const savedState = sessionStorage.getItem('oura_pkce_state');
  if (returnedState !== savedState) throw new Error('State mismatch — possible CSRF');

  const resp = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: clientId  // public client: no client_secret
    })
  });
  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
  return resp.json(); // { access_token, refresh_token, expires_in }
}
```

### Pattern 2: Lazy Fetch with IndexedDB Cache

**What:** Fetch 30 days of sleep/HRV on Dashboard tab open; use cached data if < 6 hours old.
**When to use:** Every time Dashboard tab is activated.

```javascript
// js/oura.js (continued)
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getHrvData(token) {
  // Check cache first
  const cached = await getOuraCache();
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.data;
  }

  // Fetch 30 days of sleep data
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const resp = await fetch(
    `${OURA_API_BASE}/v2/usercollection/sleep?start_date=${start}&end_date=${end}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Oura fetch failed: ${resp.status}`);

  const json = await resp.json();
  // json.data = array of sleep period objects; each has .day, .average_hrv
  const hrv = json.data
    .filter(d => d.average_hrv != null)
    .map(d => ({ day: d.day, hrv: d.average_hrv }));

  await setOuraCache(hrv);
  return hrv;
}
```

### Pattern 3: Dual-Axis Canvas Chart

**What:** Two independent Y-scale functions map HRV and coherence to pixel coordinates on the same Canvas. Single shared X-axis (dates).
**When to use:** Always — this is the only chart rendering approach in this project.

```javascript
// js/dashboard.js — dual-axis chart renderer

function yToPixel(value, min, max, chartH, padTop, padBottom) {
  const range = max - min;
  const usable = chartH - padTop - padBottom;
  return padTop + usable - ((value - min) / range) * usable;
}

function drawDashboardChart(ctx, w, h, hrvData, sessionData, rangeDays) {
  const PAD = { top: 20, bottom: 40, left: 55, right: 55 };
  const chartW = w - PAD.left - PAD.right;
  const chartH = h - PAD.top - PAD.bottom;

  // X scale: date string → pixel
  const now = new Date();
  const xToPixel = (dayStr) => {
    const daysAgo = (now - new Date(dayStr)) / (1000 * 60 * 60 * 24);
    return PAD.left + chartW - (daysAgo / rangeDays) * chartW;
  };

  // Y scales
  const hrvMin = 20, hrvMax = 80;   // ms — adjust based on user's data range
  const cohMin = 0, cohMax = 100;

  const hY = (v) => yToPixel(v, hrvMin, hrvMax, h, PAD.top, PAD.bottom);
  const cY = (v) => yToPixel(v, cohMin, cohMax, h, PAD.top, PAD.bottom);

  // Draw HRV teal line (continuous)
  ctx.strokeStyle = '#14b8a6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  hrvData.forEach((d, i) => {
    const x = xToPixel(d.day);
    const y = hY(d.hrv);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw coherence dots (practice days only)
  ctx.fillStyle = '#a78bfa';  // purple accent
  sessionData.forEach(s => {
    const x = xToPixel(s.day);
    const y = cY(s.meanCoherence);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Left axis labels (HRV, ms)
  ctx.fillStyle = '#14b8a6';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  [30, 45, 60, 75].forEach(v => {
    ctx.fillText(`${v}ms`, PAD.left - 6, hY(v));
  });

  // Right axis labels (Coherence)
  ctx.fillStyle = '#a78bfa';
  ctx.textAlign = 'left';
  [0, 25, 50, 75, 100].forEach(v => {
    ctx.fillText(`${v}`, w - PAD.right + 6, cY(v));
  });
}
```

### Pattern 4: Tooltip Hit Detection (Canvas 2D)

**What:** On `mousemove`, find nearest data point within a pixel radius; render tooltip box at that position.
**When to use:** Hover and tap interactions on the chart.

```javascript
// js/dashboard.js — tooltip hit detection
function findNearestPoint(mouseX, mouseY, points, threshold = 12) {
  let nearest = null, minDist = Infinity;
  for (const pt of points) {
    const d = Math.hypot(mouseX - pt.x, mouseY - pt.y);
    if (d < threshold && d < minDist) {
      minDist = d;
      nearest = pt;
    }
  }
  return nearest;
}
```

### Pattern 5: Minimal Node.js CORS Proxy (Fallback Only)

**What:** Single-file Node.js script that proxies requests to `api.ouraring.com`, adds CORS headers, runs on localhost:5001 (separate port from `npx serve`).
**When to use:** Only if direct browser fetch to Oura API is blocked by CORS.

```javascript
// proxy.js (project root — only create if CORS test fails)
// Run: node proxy.js
const http = require('http');
const https = require('https');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5000');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const options = {
    hostname: 'api.ouraring.com',
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: 'api.ouraring.com' }
  };
  const proxy = https.request(options, apiRes => {
    res.writeHead(apiRes.statusCode, apiRes.headers);
    apiRes.pipe(res);
  });
  req.pipe(proxy);
}).listen(5001, () => console.log('Oura proxy on http://localhost:5001'));
```

### Anti-Patterns to Avoid
- **Fetching Oura data on every app load:** Contradicts user decision (lazy fetch on tab open only) and wastes API quota.
- **Storing access token in localStorage:** localStorage is readable by any JS on the page. Use IndexedDB via `setSetting('ouraToken', token)` — same origin protection applies.
- **Building a full OAuth2 library:** The PKCE flow is ~40 lines of vanilla JS. The `@pinta365/oura-api` JSR package requires Deno/Node.js module system incompatible with this project's CDN ESM pattern.
- **Hard-coding HRV Y-axis range:** User's rMSSD range is unknown. Compute min/max from actual data with 10% padding. The 20-80ms range above is a placeholder.
- **Drawing chart on every `requestAnimationFrame`:** The dashboard chart is static data (not live streaming). Redraw only when: data updates, time range changes, or window resizes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing for PKCE | Custom hash | `crypto.subtle.digest('SHA-256', ...)` | Built into every modern browser, zero dependencies |
| Base64url encoding | Custom encoder | `btoa().replace()` chain (3 regex replaces) | Standard pattern, 1 line |
| Date range calculation | Custom calendar | `new Date(Date.now() - N*86400000).toISOString().slice(0,10)` | ISO date string native to JS Date |
| Tooltip positioning | Coordinate system math | Canvas `mousemove` with `getBoundingClientRect()` offset | Already established in this codebase pattern |
| Token refresh scheduling | Custom timer | Check token expiry on each `getHrvData()` call; refresh only if expired | Simpler than background timers; lazy is correct for this use case |

**Key insight:** Every problem in this phase has a one-liner or small function solution using browser built-ins. The temptation is to reach for a library; the project pattern is to stay in vanilla JS.

---

## Common Pitfalls

### Pitfall 1: Oura API CORS Blocks Direct Browser Fetch
**What goes wrong:** `fetch('https://api.ouraring.com/...')` from `localhost:5000` throws a CORS error because Oura does not document sending `Access-Control-Allow-Origin: *` headers.
**Why it happens:** Browser enforces CORS for cross-origin XHR/fetch; Oura's API is designed for server-side use where CORS doesn't apply.
**How to avoid:** Smoke-test first (`curl -I` or a quick browser fetch in DevTools before building the UI). If blocked, deploy `proxy.js` as documented.
**Warning signs:** `TypeError: Failed to fetch` with CORS error in DevTools console.

### Pitfall 2: Token Exchange POST to Oura Token Endpoint Also CORS-Blocked
**What goes wrong:** The OAuth2 token exchange (`POST https://api.ouraring.com/oauth/token`) is a cross-origin POST from the browser — also subject to CORS.
**Why it happens:** Token endpoints are designed for server-to-server calls. Many OAuth2 providers deliberately block browser-origin token exchange.
**How to avoid:** If CORS blocks data fetches, the proxy also handles the token exchange. Route `POST /oauth/token` through the proxy just like data endpoints.
**Warning signs:** CORS error specifically on the POST to the token URL after successful authorization redirect.

### Pitfall 3: PAT vs OAuth2 Detection
**What goes wrong:** User's key looks like a UUID/token string. Code assumes it's a PAT and tries it as Bearer; it's actually a client_id (not a bearer token) and returns 401/403.
**Why it happens:** Oura client IDs are also UUID-format strings; visually indistinguishable from tokens.
**How to avoid:** The detection strategy is correct: try `GET /v2/usercollection/personal_info` with the key as Bearer. A 401 response means it's not a token — fall back to OAuth2 PKCE where the key is used as `client_id`.
**Warning signs:** 401 on the PAT test call is expected and handled; 403 may indicate scope issue; any 2xx confirms PAT works.

### Pitfall 4: Multiple Sleep Periods Per Night
**What goes wrong:** Oura v2 `/sleep` endpoint returns multiple records per day (nap + main sleep period, or split nights). Naive grouping by day takes only the first record and misses the overnight HRV.
**Why it happens:** Oura logs each sleep period separately; a single night can have 2-4 records.
**How to avoid:** Filter for `type === 'long_sleep'` (Oura's label for the main overnight sleep period) before extracting `average_hrv`. If no `long_sleep` found for a day, fall back to the record with the highest `total_sleep_duration`.
**Warning signs:** HRV data has unexpected gaps or suspiciously low values on days the user slept normally.

### Pitfall 5: Callback URL Handling on Page Reload
**What goes wrong:** OAuth2 PKCE redirects back to `localhost:5000/callback?code=...&state=...`. But `npx serve` serves `index.html` for all paths. The callback URL params must be read from `window.location.search` on page load and processed before the UI renders.
**Why it happens:** Single-page app served by a static file server doesn't have routing; all paths serve the same `index.html`.
**How to avoid:** In `main.js` `init()`, check `window.location.search` for a `code` param before any other initialization. If found, call `handleCallback()` immediately, store token, clear params with `history.replaceState`, then continue normal init.
**Warning signs:** Page loads on `/callback` URL but nothing happens — the code param goes unread.

### Pitfall 6: Canvas Mouse Coordinates Off by DPR
**What goes wrong:** Tooltip hit detection calculates wrong positions on retina/high-DPI displays.
**Why it happens:** `canvas.getBoundingClientRect()` returns CSS pixels; `mousemove` event gives CSS pixels; but canvas internal coordinates are scaled by `devicePixelRatio`. The existing `setupCanvas()` applies a `setTransform(dpr, 0, 0, dpr, 0, 0)` which makes drawing coordinates match CSS pixels — so mouse coordinates from events are already in the right space.
**How to avoid:** Use `getBoundingClientRect()` offset for mouse coordinates. Do NOT divide by `devicePixelRatio` — the `setTransform` in `setupCanvas()` already handles it.
**Warning signs:** Tooltips appear offset from cursor on retina displays.

---

## Code Examples

### HRV Data Endpoint Response Shape
```javascript
// Source: github.com/hedgertronic/oura-ring + official v2 docs reference
// GET https://api.ouraring.com/v2/usercollection/sleep?start_date=2026-02-20&end_date=2026-03-22
// Authorization: Bearer <token>

// Response:
{
  "data": [
    {
      "id": "uuid",
      "day": "2026-03-21",          // date string YYYY-MM-DD
      "type": "long_sleep",          // or "late_nap", "rest"
      "average_hrv": 42,             // rMSSD in ms (this is the overnight HRV)
      "average_heart_rate": 52,
      "total_sleep_duration": 28800, // seconds
      // ...many other fields
    }
  ],
  "next_token": null
}
```

### Metric Card Reuse (existing CSS)
```html
<!-- Uses existing .summary-grid / .summary-metric / .metric-value / .metric-label CSS from styles.css -->
<div class="summary-grid" id="dashboard-metrics">
  <div class="summary-metric">
    <span class="metric-value" id="dash-hrv-now">--</span>
    <span class="metric-label">Tonight HRV</span>
  </div>
  <div class="summary-metric">
    <span class="metric-value" id="dash-streak">0</span>
    <span class="metric-label">Streak</span>
  </div>
  <div class="summary-metric">
    <span class="metric-value" id="dash-coh-7d">--</span>
    <span class="metric-label">Avg Coherence 7d</span>
  </div>
  <div class="summary-metric">
    <span class="metric-value" id="dash-hrv-trend">--</span>
    <span class="metric-label">HRV Trend</span>
  </div>
</div>
```

### Tab-Click Lazy Fetch Wiring (main.js addition)
```javascript
// main.js — add inside navTabs.forEach click handler
if (target === 'dashboard') {
  // Lazy-initialize dashboard on first click
  initDashboard();  // imported from dashboard.js
}
```

### Session Data Aggregation (per day)
```javascript
// js/dashboard.js — aggregate sessions from storage.js querySessions()
async function getSessionsByDay(rangeDays) {
  const sessions = await querySessions({ limit: rangeDays * 3 }); // allow multiple per day
  const byDay = {};
  for (const s of sessions) {
    const day = new Date(s.timestamp).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(s.coherenceScore ?? s.meanCoherence ?? 0);
  }
  // Per Claude's Discretion: average multiple sessions per day
  return Object.entries(byDay).map(([day, scores]) => ({
    day,
    meanCoherence: scores.reduce((a, b) => a + b, 0) / scores.length
  }));
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Oura Personal Access Tokens (PAT) | OAuth2 only (PATs deprecated) | Announced ~2023-2024 | Must use OAuth2 PKCE for new token; existing PATs may still work as Bearer tokens |
| OAuth2 Implicit Flow for SPAs | Authorization Code + PKCE | OAuth 2.1 spec, ~2019-2022 | No token in URL fragment; code verifier prevents interception |
| `localStorage` for tokens | `sessionStorage` or `IndexedDB` | Security best practices 2020+ | localStorage accessible to any script; IndexedDB same-origin but less XSS-vulnerable |

**Deprecated/outdated:**
- Oura API v1: Removed January 22, 2024. Do not use any v1 endpoints.
- Implicit OAuth2 flow (`response_type=token`): Deprecated in OAuth 2.1. Use `response_type=code` + PKCE.

---

## Open Questions

1. **Does `api.ouraring.com` send CORS headers allowing browser fetch from localhost?**
   - What we know: Not documented; most OAuth2 data APIs are server-side by design
   - What's unclear: Whether Oura specifically allows browser-origin requests
   - Recommendation: Run smoke test in browser DevTools as first task in 05-01. `fetch('https://api.ouraring.com/v2/usercollection/personal_info', {headers:{Authorization:'Bearer <token>'}})` — 200 or CORS error settles this in 30 seconds.

2. **Is the user's existing Oura key a valid Bearer token or a client_id?**
   - What we know: PATs are deprecated; Oura client IDs are also UUID-format strings
   - What's unclear: Whether the user's specific key was issued before deprecation and still functions
   - Recommendation: The PAT-first strategy handles this. `tryPatAuth(key)` call at auth init resolves it automatically.

3. **Does Oura's `sleep` endpoint require `daily` scope or `sleep` scope?**
   - What we know: `@pinta365/oura-api` lists `daily` and `sleep` as separate scopes
   - What's unclear: Whether `/v2/usercollection/sleep` requires `sleep` scope specifically
   - Recommendation: Request both `daily sleep` in the OAuth2 scope string. OAuth2 allows requesting multiple scopes space-separated.

4. **Session `coherenceScore` vs `meanCoherence` field name in IndexedDB**
   - What we know: `practice.js` saves sessions via `saveSession()`; the exact field name needs verification
   - What's unclear: Whether stored sessions use `coherenceScore`, `meanCoherence`, or another name
   - Recommendation: Read `js/practice.js` session save call to confirm field name before writing aggregation code in `dashboard.js`.

---

## Sources

### Primary (HIGH confidence)
- `js/storage.js` — `getOuraCache()`, `setOuraCache()`, `querySessions()` confirmed in codebase
- `js/state.js` — `AppState.ouraData`, `AppState.ouraConnected` confirmed pre-wired
- `js/renderer.js` — `setupCanvas()`, dual-Y pattern derivable from existing single-Y waveform code
- `index.html` — `#tab-dashboard` placeholder confirmed; `.summary-grid` / `.summary-metric` CSS confirmed in `styles.css`
- `github.com/aaronpk/pkce-vanilla-js` — PKCE implementation using `crypto.subtle.digest`, no external library

### Secondary (MEDIUM confidence)
- `github.com/Pinta365/oura_api` README — PAT deprecated, OAuth2 only; endpoints include `/v2/usercollection/sleep`
- `github.com/hedgertronic/oura-ring` — `average_hrv` field name in sleep response; endpoint URLs
- `cloud.ouraring.com/docs/authentication` — Authorization URL, token URL, redirect URI requirements
- `jsr.io/@pinta365/oura-api` — `OuraOAuth` class methods: `generateAuthUrl`, `exchangeCodeForToken`, `refreshAccessToken`

### Tertiary (LOW confidence — verify before relying)
- PAT deprecation claim: Multiple sources agree but none show official Oura announcement with date. Existing PATs may still work.
- CORS behavior: No source confirms Oura API sends or blocks browser-origin CORS. Must empirically verify.
- `long_sleep` type field: Mentioned in community integrations; not confirmed in official v2 schema documentation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all code patterns are vanilla JS with built-in APIs; no new libraries introduced
- Architecture: HIGH — patterns directly derived from existing codebase (`renderer.js`, `storage.js`, `state.js`)
- Oura API field names: MEDIUM — `average_hrv` and endpoint URL from multiple cross-referenced community sources
- PAT deprecation: MEDIUM — multiple secondary sources agree; no official Oura announcement found
- CORS behavior: LOW — empirically unknown; must smoke-test before building proxy

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (30 days; Oura API is stable but auth policy could change)
