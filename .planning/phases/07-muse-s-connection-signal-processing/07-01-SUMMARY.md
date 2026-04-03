---
phase: 07-muse-s-connection-signal-processing
plan: "01"
subsystem: device-layer
tags: [ble, muse-s, eeg, ppg, adapter, web-bluetooth]
dependency_graph:
  requires: []
  provides: [MuseAdapter.js, Phase-7-AppState-fields]
  affects: [DeviceManager.js, js/state.js, Plans 02 and 03]
tech_stack:
  added: []
  patterns: [Web Bluetooth GATT, circular buffer, callback hooks, 12-bit packed EEG parsing, 24-bit PPG parsing]
key_files:
  created:
    - js/devices/MuseAdapter.js
  modified:
    - js/state.js
    - js/devices/DeviceManager.js
decisions:
  - "MuseAdapter uses quick-reconnect-first pattern (getSetting('museName') + getDevices()) mirroring HRMAdapter"
  - "eegHead incremented only from TP9 (channel 0) — single time reference for all 4 EEG channels"
  - "ppgDebugHead incremented only from IR channel 0 — single time reference for all 3 PPG channels"
  - "No auto-reconnect for Muse in Phase 7 — explicit disconnect only; user must re-click Connect"
  - "Buffers cleared on explicit disconnect() but NOT on unexpected GATT disconnect — preserve last data for debugging"
  - "Callback hooks (setPPGCallback, setEEGCallback) are module-level for Plans 02/03 to wire processing pipelines"
metrics:
  duration_seconds: 140
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_modified: 3
---

# Phase 7 Plan 01: MuseAdapter BLE Connection and Raw Data Streaming — Summary

**One-liner:** Full Muse-S BLE GATT adapter with p50 preset, 12-bit EEG and 24-bit PPG parsing, and AppState circular buffer writes — the data transport layer for Plans 02 and 03.

## What Was Built

### MuseAdapter.js (new)

Complete BLE data transport adapter for the Muse-S EEG headband, implementing the DeviceAdapter interface used by DeviceManager. Key behaviors:

- **BLE connection:** Quick-reconnect-first using `getSetting('museName')` + `navigator.bluetooth.getDevices()`, falls back to picker. Full GATT timeout (12 s) via `Promise.race`.
- **p50 preset sequence:** Subscribes ALL characteristics before sending commands. Command order: `h` -> `p50` -> `s` -> `d` via control characteristic `273e0001-...`.
- **EEG parsing:** `decodeUnsigned12BitData()` unpacks 12-bit samples from 3-bytes-per-2-samples format. Scales to microvolts via `0.48828125 * (n - 0x800)`. Writes 12 samples per notification into per-channel `AppState.eegBuffers[channelIndex]` circular buffers (512 samples each). `eegHead` advances only from TP9 (channel 0) to maintain a single time reference.
- **PPG parsing:** Parses 6 x 24-bit unsigned samples per notification (3 bytes each, big-endian: `(bytes[i] << 16) | (bytes[i+1] << 8) | bytes[i+2]`). Writes to `AppState.ppgDebugBuffers[channelIndex]` (256 samples each). `ppgDebugHead` advances only from channel 0.
- **Cleanup:** Stores bound handler references for precise `removeEventListener` on disconnect. Disconnect handler removes stale `gattserverdisconnected` listener before attaching fresh one.
- **Callback hooks:** `setPPGCallback(fn)` and `setEEGCallback(fn)` allow Plans 02 and 03 to register processing pipelines without circular imports.

### js/state.js (modified)

9 new AppState fields added after existing Muse fields:

| Field | Type | Purpose |
|-------|------|---------|
| `ppgSignalQuality` | `'good'\|'fair'\|'poor'` | Plan 02 writes; UI reads |
| `neuralCalm` | number 0-100 | Plan 03 writes; UI reads |
| `rawNeuralCalmRatio` | number | raw alpha/(alpha+beta) |
| `eegCalibrating` | boolean | true during 20-sec baseline |
| `eyesOpenWarning` | boolean | true 3s after sharp alpha drop |
| `ppgDebugBuffers` | Float32Array[3] x 256 | circular, all 3 PPG channels |
| `ppgDebugHead` | number | write pointer for PPG debug |
| `eegBuffers` | Float32Array[4] x 512 | circular, TP9/AF7/AF8/TP10 |
| `eegHead` | number | shared write pointer for EEG |

### js/devices/DeviceManager.js (modified)

- Added import of all 4 MuseAdapter exports (`museConnect`, `museDisconnect`, `museCaps`, `museType`)
- Replaced `muse: null` slot with fully wired adapter object
- Replaced Phase 6 `requestDevice` stub in `connectMuse()` with `await _adapters.muse.connect()` + capabilities update
- `disconnectAll()` for-loop already handles non-null muse slot correctly — no changes needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verification script quoting mismatch**
- **Found during:** Task 2 verification
- **Issue:** The plan's automated check used `'from ./MuseAdapter.js'` (no inner quotes) but the actual import statement is `from './MuseAdapter.js'` (with quotes around the path). The check string didn't match.
- **Fix:** Identified as a verification script bug, not an implementation bug. The DeviceManager.js import is correct. Verified with corrected check string.
- **Files modified:** None (verification only)
- **Commit:** N/A

## Self-Check

Verified:
- `js/devices/MuseAdapter.js` exists
- `js/state.js` contains all 9 new fields
- `js/devices/DeviceManager.js` contains MuseAdapter import and delegation
- Commits 3e8bd39 and 9afa92b exist in git log
