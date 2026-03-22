---
phase: 01-foundation
plan: 02
subsystem: ble, ui
tags: [web-bluetooth, gatt, heart-rate, 0x2A37, rr-intervals, artifact-rejection, reconnect, exponential-backoff]

# Dependency graph
requires:
  - phase: 01-foundation plan 01
    provides: "AppState reactive store, StorageService, PWA shell with Connect button placeholder"
provides:
  - "BLEService: GATT connection to Garmin HRM 600 via Web Bluetooth"
  - "0x2A37 notification parsing with multi-RR extraction per packet"
  - "Two-tier artifact rejection (absolute bounds + 20% median deviation) with interpolation"
  - "Auto-reconnect with exponential backoff (0, 1s, 2s, 4s, 8s) and manual reconnect fallback"
  - "Connection status UI: banner, button state transitions, instructional error messages"
affects: [02-01, 02-02, 03-01, 04-01, 04-02]

# Tech tracking
tech-stack:
  added: [Web Bluetooth API, Heart Rate Service 0x180D, Heart Rate Measurement 0x2A37]
  patterns: [GATT connect with Promise.race timeout, exponential backoff reconnect, two-tier artifact filter, circular buffer write]

key-files:
  created: [js/ble.js]
  modified: [js/main.js, index.html, sw.js, styles.css]

key-decisions:
  - "Immediate first reconnect attempt (0ms delay) then exponential backoff for subsequent retries"
  - "Artifact interpolation uses last clean value rather than deletion to maintain smooth waveform"
  - "Garmin HRM 600 confirmed to operate in open BLE mode without bonding (verified with hardware)"

patterns-established:
  - "BLE GATT connect pattern: Promise.race with 12s timeout to prevent hung connections"
  - "0x2A37 parsing: iterate ALL remaining byte pairs for multi-RR extraction"
  - "Artifact rejection: tier 1 absolute bounds (300-2000ms), tier 2 relative (20% from 5-beat median)"
  - "Reconnect state machine: 5 attempts with timeouts [0, 1000, 2000, 4000, 8000], then manual reconnect"

requirements-completed: [BLE-01, BLE-02, BLE-03, BLE-04, BLE-05]

# Metrics
duration: ~15min
completed: 2026-03-21
---

# Phase 1 Plan 02: BLEService Summary

**Web Bluetooth GATT connection to Garmin HRM 600 with multi-RR 0x2A37 parsing, two-tier artifact rejection, exponential backoff reconnect, and live data panel wiring**

## Performance

- **Duration:** ~15 min (across checkpoint pause)
- **Started:** 2026-03-21
- **Completed:** 2026-03-21
- **Tasks:** 3 (2 auto + 1 checkpoint verification)
- **Files modified:** 5

## Accomplishments
- Full BLE data pipeline: Connect button triggers browser BLE picker, pairs with Garmin HRM 600, streams RR intervals in real-time
- 0x2A37 notification parsing correctly extracts ALL RR values per notification (not just first), converting from 1/1024s resolution to milliseconds
- Two-tier artifact rejection: absolute bounds (300-2000ms) and relative bounds (20% deviation from 5-beat running median) with interpolation using last clean value
- Auto-reconnect with exponential backoff [0, 1s, 2s, 4s, 8s]; manual Reconnect button appears after 5 failed attempts
- Live data panel shows real-time HR (BPM), beat count, artifact count, and connection uptime
- Connection status UI: banner shows "Reconnecting..." in amber during reconnect, Connect button hides when connected, instructional error on pairing failure
- Hardware verification: Garmin HRM 600 confirmed operating in open BLE mode without bonding

## Task Commits

Each task was committed atomically:

1. **Task 1: Create BLEService with GATT connection, 0x2A37 parsing, artifact rejection, and reconnect** - `6b2902b` (feat)
2. **Task 2: Wire BLEService into app shell -- Connect button, status banner, manual reconnect** - `34b621b` (feat)
3. **Task 3: Verify BLE pipeline end-to-end with Garmin HRM 600** - checkpoint:human-verify (approved)

## Files Created/Modified
- `js/ble.js` - BLEService: GATT connection, 0x2A37 parsing, artifact rejection, reconnect state machine; exports initiateConnection, tryQuickConnect, disconnect
- `js/main.js` - Updated bootstrap: imports BLEService, wires Connect button to initiateConnection/tryQuickConnect, subscribes to connectionStatus/showManualReconnect/savedDeviceName
- `index.html` - Added manual reconnect button, connection status banner element, error message area
- `sw.js` - Added /js/ble.js to SHELL_ASSETS, incremented cache to resonancehrv-v2
- `styles.css` - Added reconnect button and connection banner styling

## Decisions Made
- Immediate first reconnect (0ms) before exponential backoff -- minimizes perceived disconnect for brief signal drops
- Artifact interpolation with last clean value rather than deletion -- maintains continuous data stream for downstream DSP
- Garmin HRM 600 confirmed in open BLE mode -- resolves STATE.md blocker about bonding requirement

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required. Hardware requirement: Garmin HRM 600 (or compatible BLE heart rate monitor).

## Next Phase Readiness
- BLE data pipeline complete: RR intervals flowing into AppState.rrBuffer circular buffer
- Phase 2 (Signal Processing) can read from AppState.rrBuffer/rrHead for spectral analysis
- Phase 2 (Visualization) can subscribe to AppState.currentHR for waveform rendering
- All 8 Phase 1 requirements (STOR-01-03, BLE-01-05) are now complete
- Blocker resolved: Garmin HRM 600 confirmed open BLE mode (no bonding needed)

## Self-Check: PASSED

All 5 files verified on disk. Both task commits (6b2902b, 34b621b) found in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-21*
