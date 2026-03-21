# Phase 1: Foundation - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

BLE connection to Garmin HRM 600, real-time RR-interval streaming with artifact rejection, Proxy-based reactive AppState, and IndexedDB persistence via idb. This phase delivers the data pipeline and app shell that all later phases build on. No waveforms, no breathing pacer, no session modes — just the connection, the data, and the storage.

</domain>

<decisions>
## Implementation Decisions

### Connection UX
- Subtle banner notification for connection drops: "Reconnecting..." — session UI stays visible, data pauses
- Aggressive auto-reconnect: retry immediately, then exponential backoff (1s, 2s, 4s, 8s), up to 5 attempts before showing manual reconnect button
- Store last paired device name in IndexedDB — offer one-click "Connect to HRM 600" on return visits instead of generic browser picker
- Instructional error messages on pairing failure: "Make sure your HRM 600 is on and within range. Try again." — assume first-time friendly

### Data Visibility
- Always-visible live data panel showing: current HR, RR count, artifact count, connection uptime
- HR displayed prominently; raw RR interval values are not surfaced to the user
- Storage writes are trusted silently — no persistence indicator needed

### App Shell + Layout
- Dark theme — easier on eyes during breathing sessions, waveforms will pop against dark background
- Top navigation tabs: Discovery | Practice | Dashboard (Settings as needed)
- Layout structure is Claude's discretion — optimize for the biofeedback session experience
- Information density is Claude's discretion — balance calm and data depending on the view

### Startup Behavior
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

</decisions>

<specifics>
## Specific Ideas

- The live data panel in Phase 1 serves as validation that the BLE pipeline works before waveforms are built in Phase 2 — it should show enough to prove data is flowing correctly
- Connection status should feel like a Bluetooth audio device connecting — familiar, not clinical
- Dark theme reference: think of it like a cockpit instrument — data visible at a glance, nothing distracting

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None yet — Phase 1 establishes the patterns: Proxy-based AppState, idb for storage, ES modules from CDN

### Integration Points
- AppState is the central bus: BLEService writes RR intervals, DSPEngine (Phase 2) reads them
- StorageService wraps idb and is used by every subsequent phase for persistence
- The app shell (nav tabs, dark theme, layout) is inherited by all future phases

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-21*
