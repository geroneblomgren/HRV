# Phase 6: Device Architecture - Research

**Researched:** 2026-04-03
**Domain:** Vanilla JS adapter pattern over Web Bluetooth API
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Device Picker UX:** Two separate buttons — "Connect Chest Strap" and "Connect Muse-S" — each opens BLE picker pre-filtered for that device type.
- **Quick reconnect:** Remember both devices separately. Save last-used chest strap name AND last-used Muse-S name independently in storage.
- **No auto-connect:** On page load, show pre-labeled buttons for saved devices ("Connect to [saved name]") but wait for user click.
- **Reconnect backoff:** Both devices use the same exponential backoff pattern (0ms, 1s, 2s, 4s, 8s).
- **Disconnect behavior:** Device disconnect during a session pauses the session (timer stops). Resumes when device reconnects or user ends manually.
- **HR source priority:** Chest strap is default HR source. Falls back to Muse PPG automatically if chest strap disconnects or isn't present.
- **HR source label:** Always show which device is providing HR data — small label near HR/coherence display: "HR: Chest Strap" or "HR: Muse PPG".
- **No mid-session source switching:** If chest strap reconnects while Muse PPG is active fallback, stay on Muse PPG for the remainder of the session (avoids coherence discontinuity).
- **Capability flags:** Each adapter declares `{ hr: boolean, rr: boolean, eeg: boolean, ppg: boolean }`.
- **Capability-gated UI:** Coherence score, spectrum chart, and coherence gauge stay visible but grayed out with "No HRV data" placeholder when connected device lacks RR capability.
- **Discovery with PPG warning:** Discovery mode available with any HRV-capable source, but shows warning when using Muse PPG: "Results may be less accurate than chest strap".

### Claude's Discretion

- Device button placement in existing UI layout
- Connection status display style (chips, banner, or hybrid)
- Exact adapter interface method signatures
- DeviceManager internal state management pattern
- How to handle the "both devices disconnected" state visually

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEV-01 | User can select between HRM 600 chest strap and Muse-S headband from a device picker before connecting | Two separate `requestDevice()` calls with device-type-specific filters; namePrefix "Muse" for Muse-S, `heart_rate` service for HRM 600 |
| DEV-02 | App detects device type from BLE scan results and loads the appropriate adapter | Device type determined at picker-selection time (two separate buttons); adapter instantiated by DeviceManager based on which button was clicked, not auto-detected from scan |
| DEV-03 | User can connect to both HRM 600 and Muse-S simultaneously for dual biofeedback | DeviceManager holds two independent adapter slots; each runs its own reconnect state machine |
| DEV-04 | Session modes gracefully adapt UI based on connected device capabilities (HR-only vs HR+EEG) | Capability flags `{ hr, rr, eeg, ppg }` on each adapter; UI subscribes to `AppState.deviceCapabilities` and applies grayed-out class when RR unavailable |
</phase_requirements>

## Summary

Phase 6 refactors the existing single-device BLE layer in `ble.js` into an adapter pattern that supports simultaneous connection of HRM 600 (chest strap) and Muse-S (headband). The work splits into two plans: 06-01 extracts the core interfaces and moves existing HRM 600 logic into `HRMAdapter`, and 06-02 adds the UI for two independent device connect buttons with per-device status and capability-gated display.

The existing code already uses solid patterns that carry forward cleanly. `ble.js` closure variables (`_device`, `_reconnectAttempt`, `_rrHistory`) become per-adapter state. The reconnect state machine, artifact rejection, and circular buffer write are all self-contained and move to `HRMAdapter` with zero changes to their logic. AppState remains the central bus — the adapters write to it, and UI subscribes to it. No direct adapter-to-UI coupling.

The critical architectural rule: DeviceManager does not auto-detect device type from scan results. The user's choice of button (chest strap vs Muse-S) determines which adapter is constructed. This avoids any scan-result parsing ambiguity and aligns with the locked decision to have two separate pickers with device-type-specific filters.

**Primary recommendation:** Build `js/devices/DeviceAdapter.js` (interface doc), `js/devices/HRMAdapter.js` (extracted from `ble.js`), and `js/devices/DeviceManager.js` (orchestrator). Wire two connect buttons in main.js pointing to DeviceManager. Move per-device AppState fields in state.js. All in plan 06-01. Plan 06-02 adds the dual status panel UI and capability-gated graying in HTML/CSS/main.js.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Bluetooth API (browser native) | Chrome 56+ / Edge 79+ | BLE GATT connection, notifications | No alternative — only browser BLE API |
| Vanilla ES modules | Native | Module system for adapters | Existing project uses ES modules throughout |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `idb` via CDN | 8.0.3 (already in use) | Persist per-device saved names | Already used in `storage.js`; add two new keys (`chestStrapName`, `museDeviceName`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla JS adapter class pattern | TypeScript interfaces | No TS in this project; JSDoc `@interface` comments give same documentation benefit |
| Two separate buttons | Single smart picker with auto-detect | User decided against; two buttons is simpler and avoids scan-result parsing |

**Installation:** No new packages required. All tooling already present.

## Architecture Patterns

### Recommended File Structure

```
js/
├── ble.js                    # DELETED or emptied — replaced by devices/
├── devices/
│   ├── DeviceAdapter.js      # JSDoc interface definition (no runtime code)
│   ├── HRMAdapter.js         # Extracted from ble.js; all HRM 600 logic
│   └── DeviceManager.js      # Orchestrates both adapter slots, routing, fallback
├── state.js                  # Add multi-device fields
├── main.js                   # Wire two connect buttons to DeviceManager
└── (discovery.js, practice.js — onDisconnect updated to receive deviceType)
```

### Pattern 1: DeviceAdapter Interface (JSDoc)

**What:** A documented interface that both `HRMAdapter` and future `MuseAdapter` must satisfy. Pure documentation — no runtime enforcement — because the project is vanilla JS.

**When to use:** Define once in `DeviceAdapter.js`. Import it in adapter implementations only for JSDoc `@implements` annotation.

```javascript
// js/devices/DeviceAdapter.js
// No runtime code — interface documentation only.

/**
 * @interface DeviceAdapter
 * Contract that every device adapter must fulfill.
 * DeviceManager calls these methods; adapters must not assume
 * any other module calls them directly.
 */

/**
 * @method connect
 * Called by DeviceManager when user clicks the device's connect button.
 * Must be triggered from a user gesture (Web Bluetooth requirement).
 * Opens BLE picker if no saved device, otherwise attempts quick reconnect.
 * @returns {Promise<void>} Resolves on successful GATT connection.
 */

/**
 * @method disconnect
 * Cleanly stops notifications and disconnects GATT.
 * @returns {void}
 */

/**
 * @method getCapabilities
 * Returns static capability flags for this device type.
 * @returns {{ hr: boolean, rr: boolean, eeg: boolean, ppg: boolean }}
 */
```

### Pattern 2: HRMAdapter (extracted from ble.js)

**What:** Moves all existing `ble.js` logic into a class/closure module. API surface becomes `connect()`, `disconnect()`, `getCapabilities()`. Internal state (`_device`, `_reconnectAttempt`, `_rrHistory`, reconnect timers) stays as closure variables.

**When to use:** `DeviceManager` constructs one `HRMAdapter` instance for the chest strap slot.

```javascript
// js/devices/HRMAdapter.js
import { AppState } from '../state.js';
import { getSetting, setSetting } from '../storage.js';

const RECONNECT_TIMEOUTS = [0, 1000, 2000, 4000, 8000];
const STORAGE_KEY = 'chestStrapName'; // renamed from 'deviceName'

let _device = null;
let _reconnectAttempt = 0;
let _reconnectTimer = null;
let _rrHistory = [];

export function getCapabilities() {
  return { hr: true, rr: true, eeg: false, ppg: false };
}

export async function connect() {
  const savedName = await getSetting(STORAGE_KEY);
  if (savedName) {
    await _tryQuickConnect(savedName);
  } else {
    await _initiateConnection();
  }
}

async function _initiateConnection() {
  _device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }]
  });
  await setSetting(STORAGE_KEY, _device.name);
  AppState.chestStrapName = _device.name;
  await _connect();
}

// ... rest of existing logic moved verbatim from ble.js
// _connect(), _connectWithTimeout(), onDisconnected(), scheduleReconnect(),
// cancelReconnect(), parseHRMNotification(), rejectArtifact(), ingestRRValues()
// writeToCircularBuffer() — all unchanged except AppState field names updated
```

### Pattern 3: DeviceManager (new orchestration layer)

**What:** Holds two adapter slots (chestStrap, muse). Routes HR data to AppState. Manages HR source priority and fallback logic. Called from main.js connect buttons.

**When to use:** Import in main.js. Export `connectChestStrap()`, `connectMuse()`, `disconnectAll()`.

```javascript
// js/devices/DeviceManager.js
import { AppState, subscribe } from '../state.js';
import { connect as hrmConnect, disconnect as hrmDisconnect, getCapabilities as hrmCaps } from './HRMAdapter.js';
// MuseAdapter imported in Phase 7

const _adapters = {
  chestStrap: { connect: hrmConnect, disconnect: hrmDisconnect, getCapabilities: hrmCaps },
  muse: null // Phase 7 wires this
};

export async function connectChestStrap() {
  await _adapters.chestStrap.connect();
  _updateCapabilities();
}

export async function connectMuse() {
  // Phase 7: _adapters.muse.connect()
  // Phase 6: stub that shows "Coming soon" or is simply not wired yet
}

function _updateCapabilities() {
  const caps = _adapters.chestStrap?.getCapabilities() ?? { hr: false, rr: false, eeg: false, ppg: false };
  AppState.chestStrapCapabilities = caps;
  _updateHRSource();
}

function _updateHRSource() {
  // HR source priority: chest strap preferred if connected and has RR
  // Source label written to AppState.hrSourceLabel
  // Session lock: mid-session source switch blocked via AppState.hrSourceLocked
}
```

### Pattern 4: AppState Multi-Device Fields

**What:** New fields added to `state.js` to support two devices and capability gating.

```javascript
// New fields in state.js AppState proxy initial value:

// Chest strap (HRM 600)
chestStrapConnected: false,
chestStrapStatus: 'disconnected',   // 'disconnected'|'connecting'|'connected'|'reconnecting'
chestStrapName: null,               // loaded from storage on init
chestStrapCapabilities: { hr: false, rr: false, eeg: false, ppg: false },

// Muse-S (Phase 7 populates data; Phase 6 adds the fields)
museConnected: false,
museStatus: 'disconnected',
museName: null,
museCapabilities: { hr: false, rr: false, eeg: false, ppg: false },

// HR source routing
hrSourceLabel: 'Chest Strap',       // 'Chest Strap' | 'Muse PPG'
hrSourceLocked: false,              // true once a session starts; prevents mid-session switch
```

### Pattern 5: Web Bluetooth requestDevice Filters (per device type)

**What:** Each connect button calls `requestDevice()` with a different filter to pre-scope the BLE picker to the relevant device type.

**Source:** MDN Web Bluetooth API docs (verified, HIGH confidence)

```javascript
// Chest strap: filter by standard heart_rate GATT service
navigator.bluetooth.requestDevice({
  filters: [{ services: ['heart_rate'] }]
});

// Muse-S: filter by namePrefix (Muse devices broadcast "Muse-S..." or "Muse-...")
// optionalServices required because 0xfe8d is NOT in filters.services
navigator.bluetooth.requestDevice({
  filters: [{ namePrefix: 'Muse' }],
  optionalServices: [0xfe8d]  // Muse control/data service — needed for Phase 7
});
```

Key rule: any service you want to access after connection must be listed in either `filters[].services` or `optionalServices`, or the browser will deny access. For Muse-S in Phase 6 (stub), include `optionalServices: [0xfe8d]` now so Phase 7 does not need to re-pair.

### Pattern 6: Per-Device Quick Reconnect via getDevices()

**What:** The existing `tryQuickConnect()` pattern from `ble.js` works identically for both adapters. Each adapter has its own storage key and its own `getDevices()` lookup.

**Source:** MDN `Bluetooth.getDevices()` docs (verified, HIGH confidence)

```javascript
// Per-adapter quick connect (same pattern, different storage key)
async function _tryQuickConnect(savedName) {
  if (typeof navigator.bluetooth.getDevices !== 'function') {
    return _initiateConnection();
  }
  const devices = await navigator.bluetooth.getDevices();
  const found = devices.find(d => d.name === savedName);
  if (found) {
    _device = found;
    await _connect(); // existing connect() logic
  } else {
    return _initiateConnection();
  }
}
```

Note: `getDevices()` only returns devices the origin has previously been granted permission to use. If user clears browser permissions, falls back to picker naturally.

### Pattern 7: Disconnect Routing to Session Controllers

**What:** `discovery.js` and `practice.js` currently export `onDisconnect()` that is called generically. With two devices, the session controllers need to know which device disconnected, because:
- If the HR source device disconnects: pause session
- If the non-HR-source device disconnects: don't pause (no data impact yet in Phase 6)

**Approach:** DeviceManager writes to `AppState.chestStrapConnected` and `AppState.museConnected` independently. Session controllers subscribe to those, not to the generic `connected` field. The generic `AppState.connected` becomes the logical OR of both devices (any device connected = true).

```javascript
// In discovery.js / practice.js — replace subscribe('connected') with:
subscribe('chestStrapConnected', (val) => {
  if (AppState.hrSourceLabel === 'Chest Strap') {
    if (!val) onHRSourceLost();
    else if (_pausedForReconnect) onHRSourceRestored();
  }
});
```

### Anti-Patterns to Avoid

- **Writing AppState.connected directly from adapters:** Both adapters set device-specific fields (`chestStrapConnected`, `museConnected`). DeviceManager derives and sets `AppState.connected` as the OR. Adapters never touch `AppState.connected` directly.
- **Auto-detecting device type from scan:** Parsing device names or services during the picker to decide which adapter to create. The user clicked a specific button — that is the device type. No ambiguity resolution needed.
- **Shared reconnect state between adapters:** Each adapter owns its own `_reconnectAttempt` and `_reconnectTimer`. If HRM disconnects while Muse is reconnecting, they do not interfere.
- **Mid-session HR source switching:** Once a session starts, `AppState.hrSourceLocked = true`. Even if chest strap reconnects while Muse PPG is the fallback source, the source label does not change until session ends.
- **Deleting ble.js before HRMAdapter is verified:** Keep `ble.js` as a reference until `HRMAdapter.js` passes a real HRM 600 connection test.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BLE connection timeout | Custom timeout promise | `Promise.race()` (already in use) | Already battle-tested in `ble.js` `connectWithTimeout()` |
| Per-adapter device name persistence | Custom storage layer | `getSetting`/`setSetting` from `storage.js` | Already exists; just add new keys |
| Capability enforcement | Runtime interface checking | JSDoc `@interface` pattern | Overkill for two adapters in vanilla JS |
| Service access enforcement | Scanning returned services | Browser enforces via `optionalServices` | Browser throws `SecurityError` if service not pre-declared |

**Key insight:** The reconnect state machine, artifact rejection, and circular buffer logic in `ble.js` are already correct and tested against real hardware. Move them verbatim — do not redesign.

## Common Pitfalls

### Pitfall 1: optionalServices Missing for Muse-S

**What goes wrong:** Phase 6 creates the Muse connect button with `filters: [{ namePrefix: 'Muse' }]` but omits `optionalServices: [0xfe8d]`. Phase 7 then tries to call `server.getPrimaryService(0xfe8d)` and gets a `SecurityError` ("Service not authorized"). The fix requires the user to unpair and re-pair the device.

**Why it happens:** Web Bluetooth enforces an allowlist at `requestDevice()` time. Services not declared in filters or optionalServices are inaccessible even on a connected device.

**How to avoid:** Declare `optionalServices: [0xfe8d]` in the Muse picker call during Phase 6, even though Phase 6 does not use that service. Plan 06-01 must include this.

**Warning signs:** `DOMException: Origin is not allowed to access any service.` or `GATT Error: Not supported.` on `getPrimaryService()`.

### Pitfall 2: Generic `connected` AppState Field Ambiguity

**What goes wrong:** Current `main.js` subscribes to `connected` (boolean) and calls both `discoveryDisconnect()` and `practiceDisconnect()` on any BLE disconnect. With two devices, Muse disconnecting would pause an active chest-strap-driven session, even though the chest strap is still connected.

**Why it happens:** The generic `connected` field doesn't distinguish which device disconnected.

**How to avoid:** Session controllers subscribe to per-device state (`chestStrapConnected`, `museConnected`) and only pause when the active HR source disconnects. The generic `AppState.connected` becomes a derived convenience field for UI elements that just need "is anything connected."

**Warning signs:** Session pauses unexpectedly when second device disconnects.

### Pitfall 3: `gattserverdisconnected` Listener Accumulation

**What goes wrong:** Each call to `_connect()` in the reconnect loop adds a new `gattserverdisconnected` listener via `_device.addEventListener(...)`. After 5 reconnect attempts, there are 5 listeners firing simultaneously on next disconnect.

**Why it happens:** `ble.js` already has this bug latent. With two adapters, the surface doubles.

**How to avoid:** Use `{ once: true }` or call `removeEventListener` before re-adding in `_connect()`. Fix this during extraction.

```javascript
// Before adding new listener, remove any stale one:
_device.removeEventListener('gattserverdisconnected', _onDisconnected);
_device.addEventListener('gattserverdisconnected', _onDisconnected);
```

**Warning signs:** Reconnect attempts fire in multiples; console shows duplicate "Reconnect attempt N failed" logs.

### Pitfall 4: HR Source Fallback Not Set Before Session Start

**What goes wrong:** If Muse is connected but chest strap is not, and user starts a session, `hrSourceLabel` defaults to 'Chest Strap' (the preferred source). The session then has no data because the chest strap is not connected.

**Why it happens:** Source selection logic runs at connection time, not session-start time.

**How to avoid:** DeviceManager's `_updateHRSource()` runs whenever `chestStrapConnected` or `museConnected` changes. At session start, session controllers read `AppState.hrSourceLabel` to verify the source is actually connected before allowing session start.

**Warning signs:** Session starts, coherence stays at 0, no RR intervals logged.

### Pitfall 5: Storage Key Collision During Migration

**What goes wrong:** `ble.js` saves device name under key `'deviceName'`. If the migration renames this to `'chestStrapName'`, existing users lose their saved device name on first load after update.

**Why it happens:** Key rename breaks the getSetting lookup.

**How to avoid:** In `HRMAdapter.js`, read `'chestStrapName'` first. If empty, try `'deviceName'` as fallback, then migrate by writing to `'chestStrapName'` and clearing `'deviceName'`.

```javascript
let savedName = await getSetting('chestStrapName');
if (!savedName) {
  savedName = await getSetting('deviceName'); // legacy key
  if (savedName) await setSetting('chestStrapName', savedName);
}
```

**Warning signs:** Users complain about losing quick-connect after update.

## Code Examples

### Muse-S BLE Filter with optionalServices

```javascript
// Source: MDN Web Bluetooth requestDevice() docs (HIGH confidence)
// Must declare optionalServices NOW so Phase 7 can access 0xfe8d without re-pair
const device = await navigator.bluetooth.requestDevice({
  filters: [{ namePrefix: 'Muse' }],
  optionalServices: [0xfe8d]
});
```

### Dual Device Status Subscription in main.js

```javascript
// Replace single 'connectionStatus' subscription with two per-device subscriptions
subscribe('chestStrapStatus', status => {
  updateDeviceStatusUI('chest-strap', status);
});

subscribe('museStatus', status => {
  updateDeviceStatusUI('muse', status);
});

function updateDeviceStatusUI(deviceId, status) {
  // Updates chip/badge UI for that specific device
}
```

### Capability-Gated UI on Coherence Panel

```javascript
// Subscribe to chest strap capabilities; gray out coherence UI if no RR
subscribe('chestStrapCapabilities', caps => {
  const rrAvailable = caps.rr || (AppState.museConnected && AppState.museCapabilities.rr);
  document.getElementById('coherence-panel').classList.toggle('no-hrv-data', !rrAvailable);
});
```

```css
/* styles.css */
.no-hrv-data .coherence-score,
.no-hrv-data .spectrum-chart,
.no-hrv-data .coherence-gauge {
  opacity: 0.35;
  filter: grayscale(1);
}

.no-hrv-data::after {
  content: 'No HRV data';
  /* positioned overlay */
}
```

### HR Source Label Display

```javascript
// Small label under HR readout — subscribe to hrSourceLabel
subscribe('hrSourceLabel', label => {
  document.getElementById('hr-source-label').textContent = `HR: ${label}`;
});
```

### Session-Start HR Source Lock

```javascript
// In startDiscovery() / startPractice() — lock source at session start
AppState.hrSourceLocked = true;
// At session end:
AppState.hrSourceLocked = false;
// DeviceManager checks this flag before switching hrSourceLabel
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ble.js` monolith (single device) | `devices/` folder with adapter pattern | Phase 6 | HRM 600 behavior unchanged; Muse-S pluggable in Phase 7 |
| Single `connected` boolean | Per-device `chestStrapConnected` + `museConnected` | Phase 6 | Session controllers can distinguish which device dropped |
| Generic `connectionStatus` string | Per-device `chestStrapStatus` + `museStatus` | Phase 6 | Independent status UI per device type |
| `savedDeviceName` (single) | `chestStrapName` + `museName` (per-type) | Phase 6 | Independent quick-reconnect for each device |

**Deprecated after Phase 6:**
- `ble.js`: Replaced entirely by `devices/HRMAdapter.js` + `devices/DeviceManager.js`
- `AppState.connected`: Keep as derived convenience field (OR of both devices); session controllers must NOT use it as the sole disconnect signal
- `AppState.connectionStatus`: Keep for backward compat on banner; supplement with per-device fields

## Open Questions

1. **Muse connect button stub behavior in Phase 6**
   - What we know: Phase 6 builds the UI for the Muse button and the DeviceManager slot. Phase 7 implements actual Muse streaming.
   - What's unclear: Should the Muse button be fully non-functional in Phase 6 (just disabled), or should it open the picker and connect (GATT connect succeeds) without any data flow yet?
   - Recommendation: Wire the Muse picker call (with correct filters and optionalServices) but have the adapter stub return no data. This lets Phase 7 begin with a real connection in hand rather than debugging picker issues. Mark button with "Muse-S (coming soon)" label during Phase 6.

2. **Dual status panel layout**
   - What we know: Claude's discretion controls placement and style.
   - What's unclear: Whether the existing `connection-area` div (single button) expands to two buttons vertically, or a new side-by-side chip layout replaces it.
   - Recommendation: Side-by-side chips in `connection-area` — chest strap chip on left, Muse chip on right. Each chip has device name + status dot. Tapping chip connects or shows status. This is compact and matches the app's minimal aesthetic.

3. **What happens when BOTH devices disconnect mid-session**
   - What we know: Session pauses on HR source disconnect.
   - What's unclear: If Muse PPG was the fallback HR source and Muse disconnects (chest strap already disconnected), the session is doubly paused?
   - Recommendation: Session pause state is boolean (`_pausedForReconnect`). Already-paused + second disconnect = no change to UI. Resume requires reconnection of the current `hrSourceLabel` device. This should be explicitly stated in the plan task so it doesn't get overlooked.

## Sources

### Primary (HIGH confidence)
- MDN Web Bluetooth API: `Bluetooth.requestDevice()` — filter options, optionalServices requirement
  https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/requestDevice
- MDN Web Bluetooth API: `Bluetooth.getDevices()` — remembered device reconnect pattern
  https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/getDevices
- Existing codebase: `js/ble.js` (read directly) — all GATT logic, artifact rejection, reconnect state machine
- Existing codebase: `js/state.js` (read directly) — Proxy pub/sub pattern
- Existing codebase: `js/main.js` lines 122-195 (read directly) — connect button and subscription wiring

### Secondary (MEDIUM confidence)
- WebSearch: Web Bluetooth optionalServices requirement for service access post-connection — consistent with MDN docs
- WebSearch: `getDevices()` returns only origin-permitted devices — consistent with MDN docs

### Tertiary (LOW confidence)
- None. All critical claims verified against MDN official documentation or codebase source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; Web Bluetooth API verified via MDN; existing storage/state patterns from codebase
- Architecture: HIGH — adapter pattern is well-established; specific method signatures derived from existing code
- Pitfalls: HIGH — listener accumulation and optionalServices pitfalls verified against MDN spec behavior; storage migration pitfall derived from codebase reading

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (Web Bluetooth API stable; adapter pattern stable)
