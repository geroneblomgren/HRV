# Phase 1: Foundation - Research

**Researched:** 2026-03-21
**Domain:** Web Bluetooth GATT, Proxy-based reactive state, IndexedDB persistence, PWA shell
**Confidence:** HIGH for BLE parsing and AppState patterns; MEDIUM for getDevices() reconnect; HIGH for idb API

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Connection UX**
- Subtle banner notification for connection drops: "Reconnecting..." — session UI stays visible, data pauses
- Aggressive auto-reconnect: retry immediately, then exponential backoff (1s, 2s, 4s, 8s), up to 5 attempts before showing manual reconnect button
- Store last paired device name in IndexedDB — offer one-click "Connect to HRM 600" on return visits instead of generic browser picker
- Instructional error messages on pairing failure: "Make sure your HRM 600 is on and within range. Try again." — assume first-time friendly

**Data Visibility**
- Always-visible live data panel showing: current HR, RR count, artifact count, connection uptime
- HR displayed prominently; raw RR interval values are not surfaced to the user
- Storage writes are trusted silently — no persistence indicator needed

**App Shell + Layout**
- Dark theme — easier on eyes during breathing sessions, waveforms will pop against dark background
- Top navigation tabs: Discovery | Practice | Dashboard (Settings as needed)
- Layout structure is Claude's discretion — optimize for the biofeedback session experience
- Information density is Claude's discretion — balance calm and data depending on the view

**Startup Behavior**
- App opens straight to connection area with "Connect to HRM 600" button (or saved device quick-connect)
- Dashboard and session history accessible without HRM connection — only Discovery/Practice require live connection
- PWA with service worker and manifest — installable, works offline for dashboard browsing
- Serving approach is Claude's discretion (localhost for dev, can deploy to HTTPS later)

### Claude's Discretion
- Artifact rejection feedback approach (counter, flash, or silent)
- Layout structure (single panel vs split)
- Information density per view
- Serving/hosting strategy
- Exact visual design (spacing, typography, color palette within dark theme)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BLE-01 | App connects to Garmin HRM 600 via Web Bluetooth using Heart Rate Service (0x180D) | Standard GATT service UUID; use `{services: ['heart_rate']}` filter in `requestDevice()`; verified against Bluetooth SIG spec |
| BLE-02 | App streams RR intervals in real-time from characteristic 0x2A37, handling multiple RR values per notification | GATT 0x2A37 flag byte parsing; must iterate all remaining byte pairs after HR value offset; 1/1024 sec resolution per Garmin |
| BLE-03 | Connection status indicator shows connecting/connected/disconnected states | Simple state machine in AppState; `connected` boolean + `connectionStatus` string field; UI subscribes via pub/sub |
| BLE-04 | App auto-reconnects when BLE connection drops, with Promise.race() timeout to prevent hung promises | Confirmed Chrome Web Bluetooth issue: `gatt.connect()` can hang; `Promise.race()` with 10–15s timeout is the verified mitigation |
| BLE-05 | App rejects artifact RR intervals (< 300ms, > 2000ms, > 20% deviation from 5-beat running median) | Two-tier rejection verified in signal processing literature; running median window of 5 beats; interpolate removed beats, do not delete |
| STOR-01 | All session data (date, mode, duration, frequency, mean coherence, RR summary stats) stored in IndexedDB via idb library | idb v8.0.3 `openDB` + `put` pattern; single transaction at session end; not per-RR-interval |
| STOR-02 | Saved resonance frequency persisted in IndexedDB, loaded on app start | Simple key-value store in idb; `get`/`put` by fixed key `'resonance_frequency'` |
| STOR-03 | Oura data cached in IndexedDB with timestamp for freshness checking | Object store with timestamp field; freshness check on app load via `get` + date comparison |

</phase_requirements>

---

## Summary

Phase 1 establishes the three foundational systems everything else depends on: a reactive AppState (central data bus), a BLEService (GATT connection + RR pipeline), and a StorageService (IndexedDB wrapper). The architecture research is strong and well-validated — these are standard Web Bluetooth and IndexedDB patterns with no unknowns that would force rework later.

The most technically nuanced requirement is BLE-04 (auto-reconnect). Chrome's `device.gatt.connect()` is documented to hang indefinitely after unexpected disconnects. The `Promise.race()` timeout is the required mitigation, verified in both official Chrome samples and WebBluetoothCG spec issue discussions. The exponential backoff sequence (1s, 2s, 4s, 8s, 5 attempts) is a locked user decision and matches the Google Chrome official reconnect sample pattern.

The one-click "Connect to HRM 600" UX (return-visit quick-connect) involves `navigator.bluetooth.getDevices()`, which retrieves previously permitted devices without triggering the picker. This API exists in Chrome but its stable-release status is uncertain — it may require the `#enable-experimental-web-platform-features` flag. The plan must treat this as a best-effort feature: attempt `getDevices()` and fall back gracefully to the standard `requestDevice()` picker if it returns an empty list or is unavailable.

The PWA shell (service worker + manifest) is minimal for Phase 1 — the user wants "installable, works offline for dashboard browsing." Since the dashboard has no live data in Phase 1 (that's Phase 5), the service worker only needs to cache the app shell (HTML, CSS, JS files). Cache-first strategy for static assets is the correct approach. No background sync or push notifications needed.

**Primary recommendation:** Build AppState and StorageService first (plan 01-01), then BLEService + app shell UI (plan 01-02). AppState must exist before any other module can communicate. Stub the live data panel with AppState subscription patterns so later phases can wire in real values without changing the UI.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS ES modules | ES2022 | All application logic | No build tool; greenfield project; app scale (~1000 lines) does not justify framework overhead |
| Web Bluetooth API | Living standard (Chrome 130+) | GATT connection to Garmin HRM 600 | Only viable browser BLE API; requires HTTPS or localhost; Chrome-only but that is the explicit target |
| idb (jakearchibald) | 8.0.3 | IndexedDB Promise wrapper | 1.19kB brotli; `openDB`/`get`/`put`/`getAll` covers all needed operations; avoids raw IDB callback pyramid |
| Service Worker API | Living standard (Chrome 130+) | PWA offline shell caching | Native browser API; no Workbox needed for simple cache-first strategy at this scale |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fft.js (indutny) | 4.0.4 | Radix-4/2 FFT — required by Phase 2 | Load via CDN in `<script>` tag; not needed until Phase 2 but include in import map now |
| als-fft | 3.4.1 | Alternative FFT with STFT support | Only if switching from fft.js in Phase 2 planning; do not include in Phase 1 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| idb 8.0.3 | Raw IndexedDB | Raw IDB avoids a dependency but adds ~60 lines of boilerplate per store; not worth it |
| Vanilla Proxy AppState | MobX or Zustand | Framework state libraries add build tooling and 10–40kB; overkill for this architecture |
| Service Worker (manual) | Workbox | Workbox is 50kB+ and designed for complex cache strategies; manual sw.js is 20 lines for cache-first shell caching |

**Installation:**
```bash
# No npm install — pure CDN ES modules loaded in index.html
# idb (ES module via CDN):
# import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8.0.3/+esm';
# fft.js (UMD via script tag, for Phase 2):
# <script src="https://cdn.jsdelivr.net/npm/fft.js@4.0.4/lib/fft.js"></script>

# Dev server (pick one):
python -m http.server 8080
# OR
npx serve .
```

---

## Architecture Patterns

### Recommended Project Structure

```
/
├── index.html          # Entry point: import map, nav tabs, connection area, live data panel
├── manifest.json       # PWA manifest: name, icons, display:standalone, theme_color
├── sw.js               # Service worker: cache-first for app shell assets
├── styles.css          # Global dark-theme styles
└── js/
    ├── main.js         # Bootstrap: init modules, wire subscriptions, register SW
    ├── state.js        # AppState: Proxy reactive store + pub/sub bus
    ├── storage.js      # StorageService: openDB wrapper, session/frequency/oura stores
    └── ble.js          # BLEService: GATT connect, 0x2A37 parse, reconnect, status
```

Phase 1 only creates `state.js`, `storage.js`, `ble.js`, `main.js`, `index.html`, `styles.css`, `manifest.json`, and `sw.js`. Files for `dsp.js`, `audio.js`, `renderer.js`, and `oura.js` are added in later phases but their integration points are pre-wired in AppState.

### Pattern 1: Proxy-Based AppState with Named Pub/Sub

**What:** A plain JavaScript object wrapped in `Proxy` intercepts property assignments and fires named subscriber callbacks. All modules subscribe to keys they care about; none import each other directly.

**When to use:** This is the primary inter-module communication pattern for the entire app. BLEService writes to AppState; DSPEngine (Phase 2), renderer (Phase 2), and UI panels all read from it via subscriptions.

**Critical design decision:** Phase 1 must define the full AppState schema (all fields that later phases will use). Fields not yet populated have sensible null/zero defaults. This prevents refactoring the schema in Phase 2 and 3.

**Example:**
```javascript
// js/state.js
// Source: Architecture research + MDN Proxy docs
const _listeners = {};

export const AppState = new Proxy({
  // BLE state (Phase 1)
  connectionStatus: 'disconnected',  // 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  connected: false,
  deviceName: null,
  connectionUptime: 0,              // seconds since last connect
  lastConnectTime: null,

  // RR stream (Phase 1 — BLEService writes)
  rrBuffer: new Float32Array(512),  // circular buffer: clean RR intervals in ms
  rrHead: 0,                        // write pointer into circular buffer
  rrCount: 0,                       // total clean RR intervals received this session
  artifactCount: 0,                 // total rejected artifacts this session
  currentHR: 0,                     // bpm computed from last clean RR interval

  // Session state (used by phases 3–4)
  sessionPhase: 'idle',             // 'idle' | 'discovery' | 'practice'
  sessionStartTime: null,

  // DSP results (populated by Phase 2)
  coherenceScore: 0,
  lfPower: 0,
  spectralBuffer: null,
  calibrating: true,

  // Pacer (Phase 3)
  pacingFreq: 0.0833,               // Hz = 5 breaths/min default
  nextCueTime: 0,
  nextCuePhase: 'inhale',

  // Storage-backed settings (Phase 1 — loaded on startup)
  savedResonanceFreq: null,
  savedDeviceName: null,

  // Oura (Phase 5)
  ouraData: null,
  ouraConnected: false,
}, {
  set(target, key, value) {
    target[key] = value;
    (_listeners[key] || []).forEach(fn => fn(value));
    return true;
  }
});

export function subscribe(key, fn) {
  if (!_listeners[key]) _listeners[key] = [];
  _listeners[key].push(fn);
}

export function unsubscribe(key, fn) {
  if (_listeners[key]) {
    _listeners[key] = _listeners[key].filter(f => f !== fn);
  }
}
```

### Pattern 2: 0x2A37 Notification Parsing — All RR Values

**What:** The Heart Rate Measurement characteristic (0x2A37) can deliver 0–9 RR values per notification. The correct implementation reads all of them, not just the first.

**When to use:** Always — this is the only correct interpretation of the GATT spec.

**Parsing rules (HIGH confidence — verified against Bluetooth SIG HRS v1.0 spec):**
- Byte 0: flags
  - Bit 0: HR format (0 = UINT8, 1 = UINT16)
  - Bit 3: Energy Expended present (skip 2 bytes if set)
  - Bit 4: RR Interval(s) present
- Bytes 1–2 (or 1): HR value (UINT8 or UINT16 little-endian)
- Remaining bytes: RR interval pairs (UINT16 little-endian, in units of 1/1024 second)

**Garmin HRM 600 note:** Uses 1/1024 second resolution. Multiply `rawRR / 1024 * 1000` to get milliseconds. Do not multiply by 1000 before dividing by 1024.

**Example:**
```javascript
// js/ble.js — parseHRMNotification
// Source: Bluetooth SIG HRS v1.0 spec + verified against PITFALLS.md Pitfall 6
function parseHRMNotification(event) {
  const view = event.target.value;
  const flags = view.getUint8(0);
  const hr16bit  = (flags & 0x01) !== 0;
  const eePresent = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;

  // Skip flags byte (1) + HR value (1 or 2 bytes) + optional Energy Expended (2 bytes)
  let offset = 1 + (hr16bit ? 2 : 1) + (eePresent ? 2 : 0);

  const hrRaw = hr16bit
    ? view.getUint16(1, true)
    : view.getUint8(1);
  const bpm = hr16bit ? hrRaw : hrRaw;  // already in bpm

  const rrValues = [];
  if (rrPresent) {
    while (offset + 1 < view.byteLength) {
      const rawRR = view.getUint16(offset, true);  // little-endian
      const ms = (rawRR / 1024) * 1000;            // Garmin: 1/1024 sec
      offset += 2;
      rrValues.push(ms);
    }
  }
  return { bpm, rrValues };  // rrValues may be empty array
}
```

### Pattern 3: BLE Connection State Machine + Reconnect with Promise.race

**What:** A deterministic state machine for connection lifecycle. Uses `Promise.race()` to prevent `device.gatt.connect()` from hanging forever.

**When to use:** All connection attempts and reconnect attempts — required due to confirmed Chrome bug where gatt.connect() can hang indefinitely after unexpected disconnects.

**Critical constraint:** `navigator.bluetooth.requestDevice()` requires a user gesture. `device.gatt.connect()` on a previously obtained device reference does NOT require a gesture — it can be called programmatically for reconnects.

**Example:**
```javascript
// js/ble.js — connection + reconnect
// Source: Google Chrome automatic-reconnect sample + WebBluetoothCG issue #152
const RECONNECT_TIMEOUTS = [1000, 2000, 4000, 8000, 8000];  // ms per attempt
const CONNECT_TIMEOUT_MS = 12000;  // Promise.race timeout

let _device = null;
let _reconnectAttempt = 0;

function connectWithTimeout(device) {
  const connectPromise = device.gatt.connect();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('GATT connect timeout')), CONNECT_TIMEOUT_MS)
  );
  return Promise.race([connectPromise, timeoutPromise]);
}

async function connect() {
  AppState.connectionStatus = 'connecting';
  try {
    const server = await connectWithTimeout(_device);
    const service = await server.getPrimaryService('heart_rate');
    const characteristic = await service.getCharacteristic('heart_rate_measurement');
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleNotification);

    _device.addEventListener('gattserverdisconnected', onDisconnected);
    _reconnectAttempt = 0;
    AppState.connected = true;
    AppState.connectionStatus = 'connected';
    AppState.lastConnectTime = Date.now();
  } catch (err) {
    AppState.connectionStatus = 'disconnected';
    throw err;
  }
}

function onDisconnected() {
  AppState.connected = false;
  AppState.connectionStatus = 'reconnecting';
  scheduleReconnect();
}

function scheduleReconnect() {
  if (_reconnectAttempt >= RECONNECT_TIMEOUTS.length) {
    AppState.connectionStatus = 'disconnected';
    // Show manual reconnect button via AppState flag
    AppState.showManualReconnect = true;
    return;
  }
  const delay = RECONNECT_TIMEOUTS[_reconnectAttempt++];
  setTimeout(async () => {
    try {
      await connect();
    } catch {
      scheduleReconnect();
    }
  }, delay);
}
```

**Note on characteristic re-registration:** After a successful reconnect, `startNotifications()` and the `characteristicvaluechanged` listener must be re-added. They are NOT automatically restored after a GATT reconnect. The `connect()` function above handles this by going through the full service/characteristic setup on every connection attempt.

### Pattern 4: Artifact Rejection — Two-Tier with Interpolation

**What:** Reject RR intervals that fail absolute or relative thresholds, then fill gaps with linear interpolation (not deletion).

**Why interpolation, not deletion:** Deleting beats causes the tachogram length to no longer match elapsed time. With >5% deletion rate, spectral estimation errors exceed 5% in LF/HF power estimates.

**Example:**
```javascript
// js/ble.js — ingest clean RR intervals into AppState
// Source: PITFALLS.md Pitfall 3 + Kubios artifact rejection methodology
const MEDIAN_WINDOW = 5;   // beat count for running median
const MAX_DEVIATION = 0.20; // 20% relative threshold
let _rrHistory = [];        // last N clean RR values (for median)

function rejectArtifact(ms) {
  // Tier 1: absolute bounds
  if (ms < 300 || ms > 2000) return true;

  // Tier 2: relative bounds (need minimum history)
  if (_rrHistory.length >= MEDIAN_WINDOW) {
    const window = _rrHistory.slice(-MEDIAN_WINDOW);
    const sorted = [...window].sort((a, b) => a - b);
    const median = sorted[Math.floor(MEDIAN_WINDOW / 2)];
    if (Math.abs(ms - median) / median > MAX_DEVIATION) return true;
  }
  return false;
}

function ingestRRValues(rrValues) {
  for (const ms of rrValues) {
    if (rejectArtifact(ms)) {
      AppState.artifactCount++;
      // Interpolate: fill with last known clean value if available
      const fillValue = _rrHistory.length > 0
        ? _rrHistory[_rrHistory.length - 1]
        : ms;
      writeToCircularBuffer(fillValue);
    } else {
      _rrHistory.push(ms);
      if (_rrHistory.length > 20) _rrHistory.shift();  // keep window lean
      AppState.rrCount++;
      AppState.currentHR = Math.round(60000 / ms);
      writeToCircularBuffer(ms);
    }
  }
}
```

### Pattern 5: idb StorageService — Schema Design

**What:** A thin wrapper around idb `openDB` that initializes all object stores the app needs and exposes typed async methods for each store.

**Store design (Phase 1):**

| Store name | Key | Fields | Phase |
|------------|-----|--------|-------|
| `sessions` | autoIncrement `id` | `timestamp`, `mode`, `durationMs`, `resonanceFreq`, `meanCoherence`, `rrSummary` | 1 |
| `settings` | string key | `value` | 1 (resonance freq, device name) |
| `oura` | string key `'cache'` | `data`, `fetchedAt` | 1 (schema only; populated in Phase 5) |

**Example:**
```javascript
// js/storage.js
// Source: idb v8 GitHub README + WebFetch verification
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8.0.3/+esm';

const DB_NAME = 'resonancehrv';
const DB_VERSION = 1;

let _db = null;

export async function initStorage() {
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { autoIncrement: true, keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');  // key = setting name string
      }
      if (!db.objectStoreNames.contains('oura')) {
        db.createObjectStore('oura');      // key = 'cache'
      }
    }
  });
}

export async function saveSession(sessionData) {
  return _db.put('sessions', { ...sessionData, timestamp: Date.now() });
}

export async function getSetting(key) {
  return _db.get('settings', key);
}

export async function setSetting(key, value) {
  return _db.put('settings', value, key);
}

export async function getOuraCache() {
  return _db.get('oura', 'cache');
}

export async function setOuraCache(data) {
  return _db.put('oura', { data, fetchedAt: Date.now() }, 'cache');
}

export async function querySessions({ limit = 30 } = {}) {
  const all = await _db.getAllFromIndex('sessions', 'timestamp');
  return all.slice(-limit);
}
```

### Pattern 6: PWA Manifest + Service Worker (Minimal)

**What:** A `manifest.json` and a `sw.js` that installs and serves the app shell from cache. No background sync. No push notifications. Cache-first for static assets.

**Cache scope:** `index.html`, `styles.css`, `js/main.js`, `js/state.js`, `js/storage.js`, `js/ble.js` — the 6 Phase 1 files. Each new phase updates the cache list in `sw.js`.

**Service worker install strategy:**
```javascript
// sw.js
// Source: MDN Making PWAs installable guide
const CACHE_NAME = 'resonancehrv-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/js/main.js',
  '/js/state.js',
  '/js/storage.js',
  '/js/ble.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
```

**Manifest minimum for installability:**
```json
{
  "name": "ResonanceHRV",
  "short_name": "ResonanceHRV",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#111111",
  "theme_color": "#111111",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Anti-Patterns to Avoid

- **Calling `requestDevice()` on page load or programmatically without user gesture:** Chrome throws `SecurityError`. Gate all `requestDevice()` calls behind an explicit button click. Reconnect via `device.gatt.connect()` on a saved device reference does NOT require a gesture.
- **Adding only one notification listener and assuming it survives reconnect:** After `gatt.connect()` succeeds following a disconnect, `characteristic.startNotifications()` and the `characteristicvaluechanged` listener must be re-registered from scratch.
- **Writing each RR interval to IndexedDB as a separate transaction:** Do not write per-beat during a session. Accumulate in memory; write in a single transaction at session end.
- **Using the `rrBuffer` Float32Array directly for array push/splice operations:** Float32Arrays are fixed-size. The circular buffer pattern (head pointer + modulo indexing) is required. Pre-allocate the buffer at AppState initialization.
- **Leaving `AppState.showManualReconnect` out of the initial schema:** If this flag is added ad-hoc in a reconnect handler, the UI won't have a subscription path. Define all state fields at AppState construction.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB async boilerplate | Custom Promise wrapper around IDB transactions, cursors, upgrades | idb v8.0.3 `openDB`/`get`/`put`/`getAll` | IDB's raw API has 200+ lines of upgrade/error/version-handling boilerplate; idb handles all edge cases in 1.19kB |
| Exponential backoff reconnect | Manual setTimeout arithmetic with attempt counter | Chrome official reconnect sample pattern (parameterized delays array) | Google's official sample is the reference implementation; delay arithmetic is off-by-one prone |
| BLE notification parsing | Custom DataView parser written from scratch | The exact parser in the Architecture research (verified against Bluetooth SIG spec) | Flag byte offset logic has documented mistakes (Energy Expended skipped wrong, UINT16 HR width wrong) that invalidate all RR data silently |
| Reactive state library | Observer class, EventEmitter, custom framework | JS `Proxy` + listeners map as shown in Pattern 1 | At this app's scale, a custom framework adds no value; Proxy gives full reactivity in 15 lines |
| Service worker caching | Complex Workbox configuration | Manual `sw.js` using the Cache API (Pattern 6) | Workbox adds 50kB for features this app doesn't need; manual cache-first for 6 files is 30 lines |

**Key insight:** The highest value "don't hand-roll" here is the BLE notification parser. Mistakes in RR extraction are silent and corrupt all downstream HRV metrics permanently for the session.

---

## Common Pitfalls

### Pitfall 1: gatt.connect() Hangs Forever After Unexpected Disconnect

**What goes wrong:** When the HRM 600 goes out of range or powers down mid-session, Chrome's `gattserverdisconnected` event fires but the subsequent `device.gatt.connect()` call returns a Promise that never resolves or rejects. The app appears frozen.

**Why it happens:** Confirmed Chrome Web Bluetooth bug in the reconnection path (WebBluetoothCG issue #152, issue #640). The peripheral broadcasts without completing the handshake.

**How to avoid:** Every `gatt.connect()` call must be wrapped in `Promise.race()` with a 10–15 second timeout promise. On timeout, set status to disconnected and schedule the next backoff attempt.

**Warning signs:** "Connecting..." spinner that never transitions. HR display frozen at last reading with no error message.

### Pitfall 2: Parsing Only the First RR Interval Per Notification

**What goes wrong:** At 60 BPM the HRM 600 sends 2–4 RR values per BLE notification. Parsing only the first produces a tachogram that misses ~50–75% of beats.

**Why it happens:** Tutorial code shows how to extract the HR value and stops. The "iterate remaining bytes as UINT16 pairs" step is not shown.

**How to avoid:** Use the full parser (Pattern 2). After setting the offset past the HR value and any Energy Expended bytes, loop while `offset + 1 < view.byteLength`.

**Warning signs:** Expected RR count = `session_seconds × avg_HR / 60`. If actual count is 30–50% of expected, only the first RR per notification is being parsed.

### Pitfall 3: Artifact Deletion Instead of Interpolation

**What goes wrong:** Deleting an artifact removes a beat from the tachogram. After 5–10% deletion, the tachogram length no longer matches elapsed time, causing systematic spectral errors in Phase 2.

**Why it happens:** Rejection logic is written as "skip this value" — the simplest implementation.

**How to avoid:** Fill rejected intervals with the last clean value (linear fill from neighbors). Log artifact count for diagnostics but don't shorten the buffer.

**Warning signs:** Tachogram beat count is less than `session_seconds × avg_HR / 60`.

### Pitfall 4: getDevices() Behind an Experimental Flag

**What goes wrong:** The one-click "Connect to HRM 600" feature depends on `navigator.bluetooth.getDevices()` to retrieve the previously paired device without the picker dialog. Per the WebBluetoothCG implementation-status file (checked 2026-03-21), this API is behind `chrome://flags/#enable-experimental-web-platform-features` and has not shipped in stable Chrome.

**Why it happens:** The API exists and is documented on MDN, making it appear stable when it isn't.

**How to avoid:** Always check `typeof navigator.bluetooth.getDevices` before calling it. If unavailable, fall back to the standard `requestDevice()` picker. Store the device name in IndexedDB for display purposes ("Connect to HRM 600" label) regardless of which path is used. The "one-click" behavior works fully if the user has enabled the experimental flag; otherwise the picker shows with the stored device name as the button label.

**Warning signs:** `navigator.bluetooth.getDevices is not a function` error in the console on a standard Chrome install.

### Pitfall 5: AppState Schema Gaps Cause Phase 2 Refactors

**What goes wrong:** State fields needed by the DSPEngine (Phase 2) like `calibrating`, `lfPower`, and `spectralBuffer` are not defined in Phase 1 AppState. Phase 2 adds them ad-hoc, breaking subscriptions established in Phase 1 UI.

**Why it happens:** Phase 1 naturally focuses on what Phase 1 needs. Future state needs are deferred until they feel urgent.

**How to avoid:** Define the full AppState schema in Phase 1 with null/zero defaults for all Phase 2–5 fields. Use the schema in Pattern 1 above as the authoritative definition.

**Warning signs:** Phase 2 code adding `AppState.calibrating = true` after subscribing to it in Phase 1 UI, causing the subscription to never fire on initial load.

---

## Code Examples

### Full openDB with All Three Object Stores

```javascript
// js/storage.js — initStorage()
// Source: idb v8 README (verified via WebFetch of github.com/jakearchibald/idb)
const _db = await openDB('resonancehrv', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('sessions')) {
      const s = db.createObjectStore('sessions', { autoIncrement: true, keyPath: 'id' });
      s.createIndex('timestamp', 'timestamp');
    }
    if (!db.objectStoreNames.contains('settings')) {
      db.createObjectStore('settings');
    }
    if (!db.objectStoreNames.contains('oura')) {
      db.createObjectStore('oura');
    }
  }
});
```

### requestDevice with Heart Rate Service Filter

```javascript
// js/ble.js — initiateConnection() (called from button click handler only)
// Source: Chrome Developers BLE guide (developer.chrome.com/docs/capabilities/bluetooth)
async function initiateConnection() {
  _device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }]
  });
  AppState.savedDeviceName = _device.name;
  await StorageService.setSetting('deviceName', _device.name);
  await connect();
}
```

### Quick-Connect via getDevices() with Fallback

```javascript
// js/ble.js — tryQuickConnect()
// Source: Google Chrome get-devices sample (googlechrome.github.io/samples/web-bluetooth/get-devices.html)
async function tryQuickConnect() {
  if (typeof navigator.bluetooth.getDevices !== 'function') {
    // Feature not available in stable Chrome — fall back to picker
    return initiateConnection();
  }
  const devices = await navigator.bluetooth.getDevices();
  const hrm = devices.find(d => d.name === AppState.savedDeviceName);
  if (hrm) {
    _device = hrm;
    await connect();
  } else {
    // No previously permitted device found — show picker
    return initiateConnection();
  }
}
```

### Dark Theme CSS Variables

```css
/* styles.css — CSS custom properties for dark theme */
:root {
  --bg-primary: #0d0d0d;
  --bg-secondary: #1a1a1a;
  --bg-panel: #1e1e1e;
  --text-primary: #e8e8e8;
  --text-secondary: #888888;
  --accent-green: #00c853;   /* connected state, coherence high */
  --accent-amber: #ffab00;   /* reconnecting, calibrating */
  --accent-red: #ff1744;     /* disconnected, artifact spike */
  --accent-blue: #2979ff;    /* HR waveform color */
  --border: #2a2a2a;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;  /* data values */
  --font-ui: system-ui, -apple-system, sans-serif;
}
```

### Live Data Panel HTML Structure

```html
<!-- index.html — live data panel (always visible) -->
<div id="live-data-panel" class="live-panel">
  <div class="data-cell" id="hr-display">
    <span class="data-value" id="hr-value">--</span>
    <span class="data-label">BPM</span>
  </div>
  <div class="data-cell">
    <span class="data-value" id="rr-count">0</span>
    <span class="data-label">Beats</span>
  </div>
  <div class="data-cell">
    <span class="data-value" id="artifact-count">0</span>
    <span class="data-label">Artifacts</span>
  </div>
  <div class="data-cell">
    <span class="data-value" id="uptime">0:00</span>
    <span class="data-label">Uptime</span>
  </div>
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PAT for Oura auth | OAuth2 PKCE (PATs deprecated) | End of 2025 | Not relevant to Phase 1 but StorageService must include `oura` store for token storage in Phase 5 |
| Manual IDB callbacks | idb library v8 Promise API | Stable since v1; v8 is current | Use idb; never write raw IDB boilerplate |
| `setInterval` for BLE reconnect | `Promise.race()` + exponential backoff | Documented in WebBluetoothCG spec discussions 2023–2025 | MUST use Promise.race to avoid hung connects |
| `getDevices()` as stable API | Still experimental in Chrome (flag required) | Status as of 2026-03-21 | Use with `typeof` guard and fallback to picker |

**Deprecated/outdated:**
- Oura Personal Access Tokens: deprecated end of 2025. StorageService must include a `settings` store that can hold OAuth tokens for Phase 5 (already in schema above).
- `connectGATT()` (old name): now `device.gatt.connect()`. Only relevant if reading old tutorial code.

---

## Open Questions

1. **Garmin HRM 600 open mode without bonding**
   - What we know: Community sources say HRM 600 operates in open BLE mode when connecting with a new device that has no prior bonding; Web Bluetooth does not support BLE bonding/SMP.
   - What's unclear: Whether the HRM 600 requires any special conditions (specific activity mode, non-sleep mode) to advertise the Heart Rate Service.
   - Recommendation: The project STATE.md flags this as "verify empirically in Phase 1." The BLE plan (01-02) should include a manual verification step: power on HRM 600, run `requestDevice({filters:[{services:['heart_rate']}]})` from the browser console, confirm device appears in picker and characteristic 0x2A37 delivers notifications. Document result.

2. **navigator.bluetooth.getDevices() stable Chrome status**
   - What we know: As of 2026-03-21, the WebBluetoothCG implementation-status.md lists it as behind `#enable-experimental-web-platform-features` flag. MDN marks it experimental.
   - What's unclear: Whether it shipped in stable Chrome between early 2025 and now (March 2026). Chrome Platform Status page was inaccessible during research.
   - Recommendation: In Phase 1 BLE plan, include a verification step: test `navigator.bluetooth.getDevices()` in the dev Chrome build to determine if it's available without flags. If available, use it. If not, the `typeof` guard fallback pattern (Code Examples above) handles graceful degradation with no UX regression beyond showing the picker.

3. **RR Interpolation edge case — first beats of a session**
   - What we know: The interpolation logic fills rejected artifacts with the last clean value. On the very first RR of a session, there is no "last clean value."
   - What's unclear: Whether initializing `_rrHistory` to an empty array and using a fallback of the artifact value itself (effectively accepting it) vs. a hardcoded default (800ms = 75 BPM) is the better approach.
   - Recommendation: Use the artifact's own value as the fill for the first N beats before the median window is populated. This prevents the buffer from starting with silent zeros. Log that no rejection was applied until the median window fills (after 5 clean beats).

---

## Sources

### Primary (HIGH confidence)
- Bluetooth SIG HRS v1.0 specification — https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/ — 0x2A37 flag byte layout, RR interval encoding, Energy Expended field
- idb v8 GitHub README — https://github.com/jakearchibald/idb — `openDB` API signature, object store creation, `get`/`put`/`getAll` methods (verified via WebFetch)
- MDN Web Bluetooth API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API — security requirements, user gesture constraint, HTTPS/localhost requirement
- MDN Bluetooth.getDevices() — https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/getDevices — experimental status, SecurityError conditions
- MDN Making PWAs installable — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable — manifest requirements, service worker registration
- MDN Proxy — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy — set trap, handler semantics

### Secondary (MEDIUM confidence)
- Google Chrome automatic-reconnect-async-await sample — https://googlechrome.github.io/samples/web-bluetooth/automatic-reconnect-async-await.html — exponential backoff pattern, gattserverdisconnected handler (verified via WebFetch)
- Google Chrome get-devices sample — https://googlechrome.github.io/samples/web-bluetooth/get-devices.html — `getDevices()` usage pattern (verified via WebFetch)
- WebBluetoothCG implementation-status.md — https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md — getDevices() and watchAdvertisements() flag status (verified via WebFetch)
- Chrome Developers BLE guide — https://developer.chrome.com/docs/capabilities/bluetooth — requestDevice filters, characteristic subscription pattern
- Frontend Masters: Vanilla JS Reactivity — https://frontendmasters.com/blog/vanilla-javascript-reactivity/ — Proxy + EventTarget patterns

### Tertiary (LOW confidence)
- WebBluetoothCG issue #152 / #640 — GATT connect promise hang behavior — referenced in PITFALLS.md; individual issue thread not re-fetched but consistent with official Chrome samples' use of timeout pattern
- Espruino community discussions — getDevices() reconnect without picker — MEDIUM/LOW (community forum, not official)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — idb v8 and Web Bluetooth are well-documented with verified official sources
- AppState/Proxy architecture: HIGH — standard JS pattern, verified against MDN + established community sources
- BLE parsing patterns: HIGH — verified against Bluetooth SIG HRS v1.0 spec
- Reconnect pattern: HIGH — Promise.race() timeout verified against Chrome official sample
- getDevices() availability: LOW/MEDIUM — experimental status confirmed; stable-Chrome shipping date uncertain; must verify empirically in Phase 1
- PWA shell: HIGH — standard cache-first service worker pattern, MDN-verified
- Pitfalls: HIGH — sourced from official Chrome issue trackers and peer-reviewed HRV literature

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 for stable findings; getDevices() status should be re-verified at Phase 1 start (rapidly changing API)
