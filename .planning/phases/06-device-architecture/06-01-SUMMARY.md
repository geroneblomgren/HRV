---
phase: 06-device-architecture
plan: 01
subsystem: device-layer
tags: [ble, adapter-pattern, device-manager, hrm, state]
depends_on: []
provides: [device-adapter-interface, hrm-adapter, device-manager, multi-device-state]
affects: [js/main.js, js/ble.js]
tech_stack:
  added: []
  patterns: [adapter-pattern, pub-sub-state, backward-compat-derivation]
key_files:
  created:
    - js/devices/DeviceAdapter.js
    - js/devices/HRMAdapter.js
    - js/devices/DeviceManager.js
  modified:
    - js/state.js
decisions:
  - "HRMAdapter.connect() does quick-reconnect-first: reads saved name, attempts getDevices() lookup, falls back to picker — same UX as ble.js"
  - "Storage key migration chained: chestStrapName primary, deviceName legacy fallback, writes both on picker selection for full backward compat"
  - "DeviceManager._deriveBackwardCompat() derives AppState.connected and AppState.connectionStatus from per-device states — zero changes to main.js or DSP needed in plan 06-01"
  - "Muse stub uses optionalServices:[0xfe8d] in Phase 6 picker call so Phase 7 can reuse pairing without re-prompting user"
  - "Node import verification replaced with static analysis because storage.js uses CDN ESM (idb@8) that cannot resolve in Node — this is expected for a browser-only app"
metrics:
  duration_minutes: 3
  tasks_completed: 3
  files_created: 3
  files_modified: 1
  completed_date: "2026-04-03"
---

# Phase 6 Plan 01: Device Architecture Adapter Layer Summary

Adapter pattern for multi-device BLE with HRM 600 fully extracted and Muse-S slot created — zero changes to session logic.

## What Was Built

Three files in `js/devices/` implement the device adapter layer that allows HRM 600 to continue working unchanged while creating the slot for Muse-S (Phase 7).

**js/devices/DeviceAdapter.js** — JSDoc-only interface contract defining the four methods every adapter must implement: `connect()`, `disconnect()`, `getCapabilities()`, `getDeviceType()`. No runtime code — pure documentation for consistency.

**js/devices/HRMAdapter.js** — All HRM 600 BLE logic extracted verbatim from `ble.js`. Key changes during extraction:
- AppState field mapping: `connected` → `chestStrapConnected`, `connectionStatus` → `chestStrapStatus`, `savedDeviceName` → `chestStrapName`
- Storage key migration: reads `chestStrapName` first, falls back to legacy `deviceName`, migrates on find
- Listener accumulation bug fix (Pitfall 3): `removeEventListener` before `addEventListener` on `gattserverdisconnected`
- Quick-reconnect-first flow preserved: `getDevices()` lookup before opening picker

**js/devices/DeviceManager.js** — Orchestration layer:
- Adapter slots: `chestStrap` (HRMAdapter), `muse: null` (Phase 7)
- `init()` subscribes to per-device state changes and derives backward-compatible `AppState.connected` and `AppState.connectionStatus`
- `connectChestStrap()` and `connectMuse()` (Phase 6 stub with Muse picker pairing only)
- `_updateHRSource()`: chest strap (RR) > Muse PPG > null, respects `hrSourceLocked` during sessions
- `_updateCapabilities()`: logical OR across all connected adapters → `AppState.activeCapabilities`
- `AppState.savedDeviceName` mirrored from `chestStrapName` for legacy code

**js/state.js** — Added 11 new multi-device fields: per-device `Connected`, `Status`, `Name`, `Capabilities` for both chest strap and Muse; `hrSourceLabel`, `hrSourceLocked`, `activeCapabilities`. All 24 existing v1.0 fields preserved unchanged.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6794daf | DeviceAdapter interface + multi-device AppState fields |
| 2 | f042eee | HRMAdapter extracted from ble.js |
| 3 | 8616c62 | DeviceManager orchestrator |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Functionality] Backward compatibility: write both storage keys on picker selection**
- **Found during:** Task 2
- **Issue:** Plan specified writing only `chestStrapName` on picker selection. Legacy `deviceName` reads would miss the update if any code still calls `getSetting('deviceName')` directly.
- **Fix:** Write both `setSetting('chestStrapName', ...)` and `setSetting('deviceName', ...)` on picker selection.
- **Files modified:** js/devices/HRMAdapter.js
- **Commit:** f042eee

**2. [Rule 3 - Blocking] Node verification adapted for browser-only CDN imports**
- **Found during:** Task 2 verification
- **Issue:** `node -e "import('./js/devices/HRMAdapter.js')"` fails because `storage.js` imports from `https://cdn.jsdelivr.net/npm/idb@8.0.3/+esm` — Node cannot resolve CDN protocols. This is a pre-existing constraint of the project, not a code bug.
- **Fix:** Replaced live import test with `require('fs')` static analysis verifying all required exports, AppState field mappings, storage key migration, listener fix, and internal function presence.
- **Files modified:** None (verification approach only)

## Self-Check

Checking created files exist:
- js/devices/DeviceAdapter.js — FOUND
- js/devices/HRMAdapter.js — FOUND
- js/devices/DeviceManager.js — FOUND

Checking commits exist:
- 6794daf — FOUND
- f042eee — FOUND
- 8616c62 — FOUND

## Self-Check: PASSED
