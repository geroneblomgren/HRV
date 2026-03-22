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
  - "setProxyBase() makes CORS proxy transparent — all fetch calls use _apiBase, callers switch proxy with one call"
  - "Token stored in IndexedDB via setSetting('ouraToken') — not localStorage (security per Research)"
  - "long_sleep type filter prevents nap HRV from distorting overnight averages; fallback to longest duration if no long_sleep"
  - "proxy.js created upfront as required artifact even though CORS behavior is unconfirmed until smoke test"

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
- **Tasks:** 1 of 2 complete (Task 2 is checkpoint:human-verify — awaiting user smoke test)
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

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `js/oura.js` - OuraClient: PAT-first auth, PKCE flow, HRV fetch with long_sleep filter, IndexedDB cache
- `proxy.js` - Minimal Node.js CORS proxy (port 5001) for fallback if direct browser fetch is CORS-blocked

## Decisions Made

- Token stored in IndexedDB (via setSetting) not localStorage — security requirement from research
- `_apiBase` module variable + `setProxyBase()` makes proxy use transparent to all callers
- `proxy.js` created upfront as a plan artifact even though CORS is unconfirmed — needed for smoke test instructions
- `handleCallback()` reads `code`/`state` from `window.location.search` and calls `history.replaceState` to clean URL

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None for this plan — Task 2 (CORS smoke test) handles the verification. No external service config required beyond the user's existing Oura key.

## Next Phase Readiness

- `js/oura.js` exports are ready for `js/dashboard.js` to consume in Plan 02
- CORS strategy will be resolved by Task 2 smoke test (direct fetch vs proxy)
- If CORS is blocked: user runs `node proxy.js` and calls `setProxyBase('http://localhost:5001')` before getHrvData
- Plan 02 can be built regardless of which auth path (PAT vs OAuth2) the smoke test confirms

---
*Phase: 05-oura-recovery-dashboard*
*Completed: 2026-03-22*
