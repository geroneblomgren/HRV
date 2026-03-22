// js/oura.js — OuraClient: PAT-first auth, OAuth2 PKCE fallback, HRV fetch, IndexedDB cache
// ES module — no build tools, no external libraries (Web Crypto built-in)

import { getSetting, setSetting, getOuraCache, setOuraCache } from './storage.js';
import { AppState } from './state.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OURA_API_BASE   = 'https://api.ouraring.com';
const OURA_AUTH_URL   = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL  = 'https://api.ouraring.com/oauth/token';
const REDIRECT_URI    = 'http://localhost:5000/callback';
const CACHE_TTL_MS    = 6 * 60 * 60 * 1000; // 6 hours

// Module-level API base — switch to proxy URL if CORS blocks direct fetch
let _apiBase = OURA_API_BASE;

/**
 * Switch the API base URL to a local CORS proxy.
 * Call `setProxyBase('http://localhost:5001')` if direct browser fetch fails.
 * @param {string} url - Proxy base URL (no trailing slash)
 */
export function setProxyBase(url) {
  _apiBase = url;
}

// ---------------------------------------------------------------------------
// Token storage (via storage.js → IndexedDB — NOT localStorage)
// ---------------------------------------------------------------------------

/**
 * Retrieve the stored Oura token from IndexedDB.
 * @returns {Promise<{access_token: string, refresh_token?: string, expires_at?: number}|undefined>}
 */
export async function getStoredToken() {
  return getSetting('ouraToken');
}

/**
 * Persist an Oura token object to IndexedDB.
 * @param {{access_token: string, refresh_token?: string, expires_at?: number}} tokenObj
 */
export async function storeToken(tokenObj) {
  await setSetting('ouraToken', tokenObj);
}

// ---------------------------------------------------------------------------
// PAT-first auth
// ---------------------------------------------------------------------------

/**
 * Test whether the provided key works as a Personal Access Token (Bearer token).
 * Oura PATs were deprecated but existing ones may still work.
 * If successful, stores the token and sets AppState.ouraConnected = true.
 *
 * @param {string} key - Candidate PAT or API key
 * @returns {Promise<boolean>} true if the key authenticates as a Bearer token
 */
export async function tryPatAuth(key) {
  try {
    const resp = await fetch(`${_apiBase}/v2/usercollection/personal_info`, {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (resp.ok) {
      await storeToken({ access_token: key });
      AppState.ouraConnected = true;
      return true;
    }
    return false;
  } catch (_err) {
    // Network error or CORS block — signal failure
    return false;
  }
}

// ---------------------------------------------------------------------------
// PKCE helpers (Web Crypto — no external library)
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random PKCE code verifier (base64url, 32 bytes).
 * @returns {Promise<string>}
 */
async function generateCodeVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Derive the PKCE code challenge from a verifier using SHA-256 (base64url).
 * @param {string} verifier
 * @returns {Promise<string>}
 */
async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ---------------------------------------------------------------------------
// OAuth2 PKCE flow
// ---------------------------------------------------------------------------

/**
 * Initiate the OAuth2 PKCE authorization flow.
 * Stores the verifier in sessionStorage, then redirects to Oura's auth page.
 * The user returns to REDIRECT_URI (localhost:5000/callback) with `code` and `state` params.
 *
 * @param {string} clientId - Oura OAuth2 client ID (not the same as an access token)
 */
export async function launchPkceFlow(clientId) {
  const verifier  = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state     = crypto.randomUUID();

  // sessionStorage survives the redirect back; cleared on tab close
  sessionStorage.setItem('oura_pkce_verifier', verifier);
  sessionStorage.setItem('oura_pkce_state',    state);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          REDIRECT_URI,
    scope:                 'daily sleep',     // both scopes (Research open question 3)
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state
  });

  window.location.href = `${OURA_AUTH_URL}?${params}`;
}

/**
 * Complete the PKCE flow after Oura redirects back to the callback URL.
 * Reads `code` and `state` from window.location.search, verifies state,
 * exchanges the code for tokens, stores them, and clears the URL params.
 *
 * @returns {Promise<{access_token: string, refresh_token: string, expires_in: number}>}
 * @throws {Error} if state mismatches or token exchange fails
 */
export async function handleCallback() {
  const params       = new URLSearchParams(window.location.search);
  const code         = params.get('code');
  const returnedState = params.get('state');
  const verifier     = sessionStorage.getItem('oura_pkce_verifier');
  const savedState   = sessionStorage.getItem('oura_pkce_state');
  const clientId     = sessionStorage.getItem('oura_pkce_client_id');

  if (!code) throw new Error('No authorization code in callback URL');
  if (returnedState !== savedState) throw new Error('State mismatch — possible CSRF');

  const tokenEndpoint = _apiBase === OURA_API_BASE
    ? OURA_TOKEN_URL
    : `${_apiBase}/oauth/token`; // route through proxy if active

  const resp = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      code_verifier: verifier,
      ...(clientId ? { client_id: clientId } : {})
    })
  });

  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);

  const tokenData = await resp.json();

  // Compute absolute expiry timestamp (expires_in is seconds from now)
  const tokenObj = {
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at:    tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : undefined
  };

  await storeToken(tokenObj);
  AppState.ouraConnected = true;

  // Clean up sessionStorage
  sessionStorage.removeItem('oura_pkce_verifier');
  sessionStorage.removeItem('oura_pkce_state');
  sessionStorage.removeItem('oura_pkce_client_id');

  // Remove OAuth params from URL without triggering a page reload
  history.replaceState({}, document.title, window.location.pathname);

  return tokenObj;
}

// ---------------------------------------------------------------------------
// Token refresh (lazy — checked before each getHrvData call)
// ---------------------------------------------------------------------------

/**
 * Attempt a silent token refresh using the stored refresh_token.
 * Updates stored token on success; sets AppState.ouraConnected = false on failure.
 *
 * @param {string} refreshToken
 * @returns {Promise<string|null>} New access_token, or null on failure
 */
async function refreshAccessToken(refreshToken) {
  try {
    const tokenEndpoint = _apiBase === OURA_API_BASE
      ? OURA_TOKEN_URL
      : `${_apiBase}/oauth/token`;

    const resp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!resp.ok) {
      AppState.ouraConnected = false;
      return null;
    }

    const tokenData = await resp.json();
    const tokenObj = {
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? refreshToken,
      expires_at:    tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1000
        : undefined
    };
    await storeToken(tokenObj);
    return tokenObj.access_token;
  } catch (_err) {
    AppState.ouraConnected = false;
    return null;
  }
}

// ---------------------------------------------------------------------------
// HRV data fetch (30 days, long_sleep filter, IndexedDB cache)
// ---------------------------------------------------------------------------

/**
 * Fetch 30 days of overnight HRV (rMSSD) from the Oura sleep endpoint.
 *
 * Strategy:
 *   1. Use `token` arg if provided, otherwise retrieve stored token from IndexedDB
 *   2. Check token expiry and silently refresh if needed (returns null if refresh fails)
 *   3. Check IndexedDB cache — return cached data if fresh (< 6 hours)
 *   4. Fetch /v2/usercollection/sleep for the last 30 days
 *   5. Filter for type === 'long_sleep' to exclude naps (Research pitfall 4)
 *      Fallback: if no long_sleep on a given day, use the record with longest total_sleep_duration
 *   6. Map to [{day: 'YYYY-MM-DD', hrv: number}]
 *   7. Cache result in IndexedDB and set AppState.ouraData
 *   8. Return the array
 *
 * @param {string} [token] - Optional override access token (skips storage lookup)
 * @returns {Promise<Array<{day: string, hrv: number}>|null>} HRV array, or null on auth failure
 */
export async function getHrvData(token) {
  // Step 1: Resolve access token
  let accessToken = token;
  if (!accessToken) {
    const stored = await getStoredToken();
    if (!stored) return null;

    accessToken = stored.access_token;

    // Step 2: Lazy token refresh if expired
    if (stored.expires_at && Date.now() > stored.expires_at) {
      if (stored.refresh_token) {
        accessToken = await refreshAccessToken(stored.refresh_token);
        if (!accessToken) return null; // refresh failed — dashboard shows reconnect
      } else {
        // PAT never expires; if no refresh_token, just use the stored token
      }
    }
  }

  // Step 3: Check IndexedDB cache
  const cached = await getOuraCache();
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    // Cache is fresh — populate AppState and return
    AppState.ouraData      = cached.data;
    AppState.ouraConnected = true;
    return cached.data;
  }

  // Step 4: Fetch 30 days of sleep data from Oura API
  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let resp;
  try {
    resp = await fetch(
      `${_apiBase}/v2/usercollection/sleep?start_date=${startDate}&end_date=${endDate}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } catch (networkErr) {
    // Likely a CORS error — caller should switch to proxy via setProxyBase()
    console.error('[oura.js] Network/CORS error fetching sleep data:', networkErr);
    return null;
  }

  if (resp.status === 401 || resp.status === 403) {
    AppState.ouraConnected = false;
    return null;
  }

  if (!resp.ok) {
    console.error(`[oura.js] Oura API error: ${resp.status}`);
    return null;
  }

  const json = await resp.json();

  // Step 5: Filter for long_sleep, with fallback to longest duration per day
  // Group records by day first
  const byDay = {};
  for (const record of json.data ?? []) {
    const { day } = record;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(record);
  }

  // Step 6: Map to [{day, hrv}], preferring long_sleep records
  const hrvArray = [];
  for (const [day, records] of Object.entries(byDay)) {
    // Prefer type === 'long_sleep' (main overnight session)
    const longSleep = records.find(r => r.type === 'long_sleep');
    const primary   = longSleep
      ?? records.reduce((best, r) =>
          (r.total_sleep_duration ?? 0) > (best.total_sleep_duration ?? 0) ? r : best
        );

    const hrv = primary.average_hrv;
    if (hrv != null) {
      hrvArray.push({ day, hrv });
    }
  }

  // Sort by date ascending (oldest first)
  hrvArray.sort((a, b) => a.day.localeCompare(b.day));

  // Step 7: Cache and update AppState
  await setOuraCache(hrvArray);
  AppState.ouraData      = hrvArray;
  AppState.ouraConnected = true;

  return hrvArray;
}
