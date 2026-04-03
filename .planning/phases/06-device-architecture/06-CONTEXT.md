# Phase 6: Device Architecture - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor the BLE layer from a single-device HRM 600 implementation into a multi-device adapter pattern. HRM 600 must work identically to v1.0 after refactoring. The app should support connecting two devices simultaneously (chest strap + Muse-S) with independent status tracking and data routing. This phase builds the architecture only — Muse-S streaming implementation is Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Device Picker UX
- Two separate buttons: "Connect Chest Strap" and "Connect Muse-S" — each opens BLE picker pre-filtered for that device type
- Remember both devices separately for quick reconnect (save last-used chest strap name AND last-used Muse-S name independently)
- On page load, show pre-labeled buttons for saved devices ("Connect to [saved name]") but wait for user click — no auto-connect
- Web Bluetooth requestDevice() requires user gesture, so click-to-connect is the natural pattern

### Connection Status
- Both devices use the same exponential backoff reconnect pattern (0ms, 1s, 2s, 4s, 8s)
- Device disconnect during a session pauses the session (timer stops). Resumes when device reconnects or user ends manually.

### Data Source Priority
- Chest strap is default HR source when connected. Falls back to Muse PPG automatically if chest strap disconnects or isn't present
- Always show which device is providing HR data — small label near HR/coherence display: "HR: Chest Strap" or "HR: Muse PPG"
- If chest strap reconnects while Muse PPG is active fallback, stay on Muse PPG for the remainder of the session (no mid-session source switching to avoid coherence discontinuity)

### Capability Gating
- Each adapter declares boolean capability flags: `{ hr: true, rr: true, eeg: false, ppg: false }`
- When connected device can't provide HRV: coherence score, spectrum chart, and coherence gauge stay visible but grayed out with "No HRV data" placeholder
- Discovery mode available with any HRV-capable source, but shows warning when using Muse PPG: "Results may be less accurate than chest strap"

### Claude's Discretion
- Device button placement in existing UI layout
- Connection status display style (chips, banner, or hybrid)
- Exact adapter interface method signatures
- DeviceManager internal state management pattern
- How to handle the "both devices disconnected" state visually

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ble.js`: Contains 0x2A37 parsing, artifact rejection, circular buffer write, reconnect state machine — all can be extracted into HRMAdapter
- `state.js`: Proxy-based AppState with pub/sub — will need new fields for multi-device (activeDevices map, device capabilities, HR source label)
- `storage.js`: setSetting/getSetting for device name persistence — extend to save per-device-type names

### Established Patterns
- Module state via closure variables (`_device`, `_reconnectAttempt`, `_rrHistory`) — same pattern for each adapter
- AppState as central bus — all modules communicate through AppState subscriptions, never direct imports between feature modules
- Connection flow: `initiateConnection()` → `connect()` → `handleNotification()` with reconnect on `gattserverdisconnected`

### Integration Points
- `main.js` lines 164-195: Connect button click handler — needs to become device-type-aware
- `main.js` lines 122-133: `subscribe('connected')` handler that starts uptime timer and notifies session controllers — needs multi-device awareness
- `discovery.js` / `practice.js`: Both have `onDisconnect()` handlers called when BLE drops — need to know WHICH device disconnected
- `dsp.js`: Consumes `AppState.rrBuffer` — doesn't care about source device, just needs clean RR intervals in the buffer

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for adapter pattern in vanilla JS.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-device-architecture*
*Context gathered: 2026-04-03*
