---
phase: 06-device-architecture
plan: 02
subsystem: ui
tags: [ble, device-manager, dual-device, hrm, muse, capability-gating]

# Dependency graph
requires:
  - phase: 06-01
    provides: DeviceManager, HRMAdapter, DeviceAdapter interface, multi-device AppState fields

provides:
  - Dual device chip buttons in connection area (chest strap + Muse-S)
  - Per-device status dots (disconnected/connecting/connected/reconnecting)
  - HR source label in live data panel
  - Capability-gated coherence UI (no-hrv-data overlay)
  - Muse PPG accuracy warning in discovery mode
  - main.js wired to DeviceManager instead of ble.js
  - Per-device disconnect routing to session controllers

affects:
  - 07-muse-connection (Muse button already wired, PPG warning already subscribed)
  - 08-session-integration (disconnect routing uses hrSourceLabel, ready for Muse)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-device status chip pattern: status-dot + status-text + button in device-chip"
    - "Capability-gated UI: toggle no-hrv-data class on panel based on RR availability"
    - "HR source routing: disconnect only pauses session when hrSourceLabel matches device"
    - "Status-pulse CSS animation for connecting/reconnecting states"

key-files:
  created: []
  modified:
    - index.html
    - styles.css
    - js/main.js

key-decisions:
  - "Per-device chip UI: two side-by-side chips replacing single connect button"
  - "Disconnect routing uses hrSourceLabel to determine which device pause should respond to"
  - "updateCapabilityGating checks chestStrapCapabilities.rr OR museCapabilities.rr for coherence panel"
  - "Legacy deviceName storage key supported as fallback when loading chestStrapName on startup"

patterns-established:
  - "Device chip: button + status-dot + device-status-text stacked in flex column"
  - "ConnectionArea hidden after 2s when any device connects via DeviceManager"

requirements-completed: [DEV-01, DEV-02, DEV-03, DEV-04]

# Metrics
duration: 2min
completed: 2026-04-03
---

# Phase 06 Plan 02: Dual Device UI Wiring Summary

**Dual-device chip UI with per-device status dots wired to DeviceManager, replacing single ble.js connect button with independent chest strap and Muse-S controls**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-03T18:58:49Z
- **Completed:** 2026-04-03
- **Tasks:** 3 of 3 (all complete — Task 3 human-verify APPROVED)
- **Files modified:** 3

## Accomplishments
- Replaced single HRM 600 connect button with two independent device chip buttons (chest strap + Muse-S), each showing their own status dot and status text
- Rewired main.js to import DeviceManager (connectChestStrap, connectMuse, init) instead of ble.js; all ble.js references removed
- Per-device disconnect routing: session controllers only pause when the active HR source device disconnects (uses hrSourceLabel to route correctly)
- HR source label shown in live panel; Muse PPG accuracy warning auto-displays when Muse PPG is active HR source in discovery mode
- Capability-gated coherence panel: toggles no-hrv-data class when no RR-capable device is connected

## Task Commits

Each task was committed atomically:

1. **Task 1: Update HTML and CSS for dual device UI** - `65f93bb` (feat)
2. **Task 2: Rewire main.js to use DeviceManager and per-device subscriptions** - `18165f0` (feat)
3. **Task 3 fix: Show paired status after Muse-S BLE picker selection** - `0578906` (fix)
4. **Task 3: Verify dual device UI and HRM 600 regression test** - APPROVED by user

## Files Created/Modified
- `index.html` - Replaced connection-area contents with dual device-chips, added hr-source-label in live panel, added discovery-ppg-warning
- `styles.css` - Added device-chips, device-chip, device-connect-btn, status-dot variants with pulse animation, hr-source-label, no-hrv-data overlay, ppg-warning styles
- `js/main.js` - Full rewrite: DeviceManager import, per-device chip DOM refs, updateDeviceChipUI helper, per-device subscriptions, capability gating, disconnect routing, device button event handlers

## Decisions Made
- Used `--accent-action` CSS variable for warning/connecting states (plan referenced `--accent-orange` which doesn't exist; `--accent-action` is the orange in this project's palette)
- connectionArea hides after 2s when any device connects (using `AppState.connected` backward-compat flag)
- Reconnect button attempts chest strap reconnect by default (primary device)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CSS variable name correction: --accent-orange -> --accent-action**
- **Found during:** Task 1 (CSS authoring)
- **Issue:** Plan specified `var(--accent-orange)` but the project uses `var(--accent-action)` for its orange color; `--accent-orange` is undefined
- **Fix:** Used `var(--accent-action)` throughout new device chip CSS
- **Files modified:** styles.css
- **Verification:** Variable exists in :root, no undefined CSS custom property references
- **Committed in:** 65f93bb (Task 1 commit)

**2. [Rule 1 - Bug] Muse-S BLE picker gave no UI feedback after pairing**
- **Found during:** Task 3 (human-verify — Muse button tested in browser)
- **Issue:** `connectMuse()` stub completed pairing but never updated museStatus, leaving status dot stuck on "Not connected" and user with no confirmation that pairing succeeded
- **Fix:** After BLE picker selection in the Muse stub, set `AppState.museStatus = 'paired'` and update status dot to orange with text "Paired — ready for Phase 7"
- **Files modified:** js/devices/DeviceManager.js
- **Verification:** Clicking Connect Muse-S, selecting device, and confirming status chip updates correctly
- **Committed in:** 0578906

---

**Total deviations:** 2 auto-fixed (1 bug — undefined CSS variable; 1 bug — missing UI feedback on Muse pairing)
**Impact on plan:** Both fixes necessary for correctness and usability. No scope creep.

## Issues Encountered
None beyond the CSS variable name.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dual device UI fully wired; HRM 600 flow is zero-regression (same DeviceManager -> HRMAdapter path as ble.js)
- Muse-S button wired and already subscribed to museName, museStatus, museConnected — Phase 7 just needs to implement MuseAdapter and wire it into DeviceManager
- PPG accuracy warning subscription already live — activates automatically when hrSourceLabel becomes 'Muse PPG'
- Capability-gated coherence panel ready for Phase 8 when Muse PPG RR capability is enabled

---
*Phase: 06-device-architecture*
*Completed: 2026-04-03*
