---
phase: 05-oura-recovery-dashboard
plan: 01
subsystem: api
tags: [oura, oauth2, pkce, indexeddb, cache, hrv, cors]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: storage.js (getOuraCache/setOuraCache/getSetting/setSetting) and state.js (AppState.ouraData/ouraConnected)
provides:
  - OuraClient ES module (js/oura.js): PAT-first auth, OAuth2 PKCE fallback, 30-day HRV fetch, IndexedDB cache
  - Minimal Node.js CORS proxy (proxy.js): for use if direct browser fetch is blocked
affects:
  - 05-02 (dashboard.js needs getHrvData() and setProxyBase() from this module)
  - main.js (needs to handle PKCE callback on page load, import handleCallback)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PAT-first auth with OAuth2 PKCE fallback (try Bearer token; fall back to authorization_code + PKCE)
    - Web Crypto API for PKCE (crypto.subtle.digest SHA-256, crypto.getRandomValues — no external library)
    - Proxy-transparent API base (_apiBase variable + setProxyBase() toggle)
    - Lazy token refresh (check expiry on each getHrvData call, not on a background timer)
    - long_sleep type filter for Oura sleep records (exclude naps, fallback to longest total_sleep_duration)

key-files:
  created:
    - js/oura.js
    - proxy.js
  modified: []

key-decisions:
  - "PAT-first auth: try user's key as Bearer token against /v2/usercollection/personal_info; only launch PKCE if 401"
  - "PAT CONFIRMED: W6BL4MVQCFFULLJP3TZIDGDMYBWVUUVO is a valid PAT — OAuth2 PKCE flow is NOT needed"
  - "CORS BLOCKED: Direct browser fetch to api.ouraring.com is blocked; proxy.js on localhost:5001 is REQUIRED"
  - "Proxy is mandatory default path: dashboard.js (05-02) must call setProxyBase('http://localhost:5001') before any API calls"
  - "setProxyBase() makes CORS proxy transparent — all fetch calls use _apiBase, callers switch proxy with one call"
  - "Token stored in IndexedDB via setSetting('ouraToken') — not localStorage (security per Research)"
  - "long_sleep type filter prevents nap HRV from distorting overnight averages; fallback to longest duration if no long_sleep"
  - "29 days of overnight HRV data confirmed fetched through proxy — data layer is functional end-to-end"

patterns-established:
  - "Pattern: proxy-transparent _apiBase variable — default to production URL, setProxyBase() switches to localhost proxy"
  - "Pattern: lazy token expiry check — check before fetch, not on background timer (correct for lazy-fetch dashboard)"

requirements-completed: [OURA-01, OURA-02, OURA-03]

# Metrics
duration: 15min
completed: 2026-03-22
---

# Phase 05 Plan 01: OuraClient Module Summary

**Vanilla JS OuraClient with PAT-first Bearer auth, OAuth2 PKCE fallback, long_sleep HRV fetch with 6-hour IndexedDB cache, and proxy-transparent API base**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-22T13:46:36Z
- **Completed:** 2026-03-22T14:01:00Z
- **Tasks:** 2 of 2 complete (Task 2 checkpoint resolved — CORS/PAT verified by user live test)
- **Files modified:** 2

## Accomplishments

- `js/oura.js` built with all 7 required exports: tryPatAuth, launchPkceFlow, handleCallback, getHrvData, getStoredToken, storeToken, setProxyBase
- PKCE flow implemented with Web Crypto API (crypto.subtle.digest SHA-256) — zero external dependencies
- HRV fetch filters for `long_sleep` type to exclude naps; falls back to longest `total_sleep_duration` per day
- Lazy token refresh: checks `expires_at` before each getHrvData call; sets AppState.ouraConnected = false if refresh fails
- `proxy.js` created as minimal Node.js CORS proxy on port 5001 for fallback if direct browser fetch is blocked

## Task Commits

Each task was committed atomically:

1. **Task 1: Create js/oura.js — auth, fetch, cache** - `47ae3c0` (feat)
2. **Task 2: CORS smoke test and auth verification** - checkpoint resolved via live user test (no code commit — verification only)

**Plan metadata:** `c613747` (docs: complete OuraClient plan)

## Files Created/Modified

- `js/oura.js` - OuraClient: PAT-first auth, PKCE flow, HRV fetch with long_sleep filter, IndexedDB cache
- `proxy.js` - Minimal Node.js CORS proxy (port 5001) for fallback if direct browser fetch is CORS-blocked

## Decisions Made

- **PAT confirmed** — user's key (W6BL4MVQCFFULLJP3TZIDGDMYBWVUUVO) is a valid Personal Access Token. OAuth2 PKCE flow is not needed for this user.
- **CORS blocked** — direct browser fetch to api.ouraring.com is blocked. The proxy on localhost:5001 is the required and only path.
- **Proxy is mandatory default** — Plan 02 (dashboard.js) must call `setProxyBase('http://localhost:5001')` before any Oura API calls. No toggle needed.
- **Data confirmed** — 29 days of overnight HRV data successfully fetched through the proxy. The data layer works end-to-end.
- Token stored in IndexedDB (via setSetting) not localStorage — security requirement from research.
- `_apiBase` module variable + `setProxyBase()` makes proxy use transparent to all callers.
- `handleCallback()` reads `code`/`state` from `window.location.search` and calls `history.replaceState` to clean URL.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None for this plan — Task 2 (CORS smoke test) handles the verification. No external service config required beyond the user's existing Oura key.

## Next Phase Readiness

- `js/oura.js` exports are ready for `js/dashboard.js` to consume in Plan 02
- CORS strategy confirmed: proxy is required. Plan 02 must call `setProxyBase('http://localhost:5001')` at startup.
- PAT confirmed: no OAuth2 PKCE UI flow needed. `tryPatAuth` handles it with the stored key.
- 29 days of HRV data flows correctly through proxy — data layer is production-ready for the dashboard Canvas chart.
- Blocker from STATE.md resolved: "Oura API CORS for direct browser fetch from localhost" — answer is CORS-blocked, proxy is the path.

---
*Phase: 05-oura-recovery-dashboard*
*Completed: 2026-03-22*
