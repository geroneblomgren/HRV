# v2.0: iPhone Portability — Design

**Date:** 2026-04-18
**Status:** Brainstorming complete; awaiting user review before planning

## Goal

The current desktop v1.2 experience runs on the user's iPhone with full device parity, a nightstand-friendly dim mode, and no behavioral regressions compared to desktop — validating the iPhone as the primary use surface before resuming mode-specific features (v2.1+).

## Motivation

The user wants ResonanceHRV on iPhone so it can be used at the times and in the places the actual use cases happen: pre-sleep at the bedside, eyes-closed meditation, portable practice. Desktop Chrome is the wrong form factor for these contexts. This is a personal tool; App Store distribution, multi-user, and TestFlight are explicitly not goals. The existing `iOS/Safari support — Web Bluetooth not available` constraint in `PROJECT.md` is being reversed in favor of a third-party browser (Bluefy) or native wrapper (Capacitor) approach.

## Scope

### In scope
- App runs on iPhone, installed to Home Screen, launches in standalone display mode.
- HRM 600 + Muse-S both connect and stream reliably during a full session.
- Complete session flow works end-to-end: connect → 60s RF tuning → practice session → summary → dashboard.
- Responsive layout for iPhone portrait widths (375–430px).
- Nightstand/dim-mode overlay: full-black visual, tap-to-dismiss, session continues uninterrupted.
- Wake Lock active during sessions to prevent auto-lock.
- Oura integration works on iPhone via a Vercel-hosted serverless function replacing the local `proxy.js`.
- Existing desktop session history remains on desktop; iPhone starts with its own local IndexedDB history. No sync between the two targets.

### Out of scope
- v1.3 features (pre-sleep mode, meditation mode, audio file upload, sonification) — parked until v2.0 ships; restart as v2.1 iPhone-first.
- Session continuity when the phone is backgrounded, screen locked, or screen truly off. The dim-mode design deliberately sidesteps this by keeping the screen technically awake with black pixels.
- App Store distribution, TestFlight, multi-user, cloud sync.
- Android, native Swift rewrite.
- Battery-optimized long-running sessions.

### Disposition of in-flight Phase 14 work
The 5 commits on `master` (mode picker markup, CSS, state primitives, session-lock wiring) are preserved as-is — not reverted. They are considered latent until v2.1, where the mode picker will be re-skinned for mobile. v2.0 branches from current `master`.

## Chosen approach

**Bluefy first, Capacitor as fallback.**

- **Default path:** The existing PWA runs inside Bluefy (third-party iOS browser with Web Bluetooth support). Zero changes to the BLE layer. The app is hosted on Vercel at a custom domain; the Oura proxy is a Vercel serverless function at `api/oura.js` in the same repo.
- **Fallback path:** If Phase 20's Bluefy POC shows Muse-S cannot stream reliably (dropped notifications, EEG/PPG buffer overruns, audio glitches), we pivot to a Capacitor wrapper using `@capacitor-community/bluetooth-le` to replace Web Bluetooth. The device adapter layer from Phase 6 isolates this change; nothing above `ble.js` / `devices/*Adapter.js` changes.

Rejected approaches and why:
- **Full native iOS rewrite (SwiftUI + CoreBluetooth + AVAudioEngine):** would reuse ~20% of existing code at the algorithm level, 0% at the file level. Months of part-time work. Overkill given the dim-mode design eliminates the backgrounding requirement.
- **Capacitor hybrid with native audio + BLE services:** required only if the user needs backgrounded audio (screen off, audio playing). The dim-mode design makes this unnecessary.
- **Capacitor "naive" as default:** ~1–2 weeks of work we might not need. Bluefy-first defers this cost until we confirm it's required.

## Architecture

### Code that stays unchanged
- `dsp.js`, `museSignalProcessing.js`, `phaseLock.js`, `paceController.js`, `tuning.js` — all signal processing.
- `state.js`, `storage.js` — state store and IndexedDB wrapper. IndexedDB works in Safari/Bluefy and WKWebView.
- `audio.js` — Web Audio API is supported in both targets.
- `renderer.js`, `dashboard.js`, `practice.js`, `discovery.js`, `main.js` — session flow and visualization.
- `oura.js` — logic unchanged; only the proxy URL constant changes.
- Phase 6's device adapter pattern (`devices/*Adapter.js` + `DeviceManager`) is what makes BLE-backend swapping clean — this is the Phase 6 dividend.

### Code that changes
| Component | Change | Notes |
|-----------|--------|-------|
| `styles.css` | Add mobile breakpoints (`@media (max-width: 430px)`) | Additive; desktop rules preserved |
| `index.html` | Viewport meta for iOS, touch-optimized controls, dim-mode overlay element, Apple PWA meta tags | `display: standalone` in `manifest.json` already correct |
| **New** `dimMode.js` | Full-viewport black overlay + tap-to-dismiss + Wake Lock lifecycle | ~100 LOC. Independent module. |
| `ble.js` / `devices/*` | Unchanged if Bluefy works; swapped for `@capacitor-community/bluetooth-le` plugin if fallback triggers | Adapter interface holds; internals replaced |
| `oura.js` | Change proxy URL to Vercel function endpoint | Drop localhost references |
| **New** `api/oura.js` | Vercel serverless function replacing `proxy.js` | ~30 LOC. Same behavior; PAT in Vercel env var |
| `sw.js` | Verify full offline cache for PWA install | Already exists; minor tweaks |

### Dim mode contract
- Engaged via a button in session UI during active session only.
- Overlay: `position: fixed; inset: 0; background: #000; z-index: 9999`.
- Tap (or double-tap — to be decided in implementation) on the overlay removes it.
- Wake Lock (`screen.wakeLock.request('screen')`) is requested on session start (not when dim engages), ensuring the screen never auto-locks during the session whether or not dim is active.
- Session state, `AudioEngine`, BLE layer, and DSP are entirely untouched by dim engagement. Dim is a pure presentation-layer toggle.
- On Wake Lock release events (visibility change, system pressure), we log to the session record and re-request on visibility regain; we do not attempt to fight iOS backgrounding.

### Hosting
- **App:** Vercel. Static deploy from git. Custom domain optional.
- **Oura proxy:** Vercel serverless function `api/oura.js` in the same repo. PAT stored as Vercel env var. No CORS configuration needed (same origin).
- **Desktop development loop:** localhost continues to work unchanged during development; the hosted deploy is only relevant for iPhone testing.

## Phase sequence

Six phases. Phase 20 is a hard gate. Phases 21–23 run in parallel after the gate. Phase 20b is contingent (only runs if Phase 20 fails).

### Phase 20: Bluefy POC + Hardware Validation (GATE)
**Goal:** Prove the current web stack works on iPhone with both devices.
**Depends on:** Nothing
**Success criteria:**
1. App deploys to Vercel and loads in Bluefy on iPhone, PWA-installed to Home Screen, launches in standalone.
2. HRM 600 connects via Web Bluetooth in Bluefy; RR intervals stream into AppState without parse errors.
3. Muse-S connects via Web Bluetooth in Bluefy; EEG + PPG streams without notification drops for ≥5 minutes continuous.
4. A 5-minute standard session completes end-to-end — audio pacer timing remains accurate, coherence + phase lock + neural calm all update.
5. Session is saved to IndexedDB and visible in dashboard after reload.

**Gate outcome:** Pass → proceed to 21/22/23 in parallel. Fail → proceed to Phase 20b.

### Phase 20b: Capacitor Wrapper Migration (CONTINGENT)
**Goal:** Replace Web Bluetooth with a native BLE plugin so the failing device works reliably.
**Depends on:** Phase 20 failure
**Success criteria:**
1. Xcode project builds and installs on iPhone via free Apple Developer cert (7-day re-sign accepted for personal use).
2. `@capacitor-community/bluetooth-le` replaces `navigator.bluetooth` in `ble.js`.
3. HRMAdapter and MuseAdapter satisfy Phase 20 success criteria 2–5 (5-min session end-to-end, no drops).

### Phase 21: Hosted Oura Proxy Migration
**Goal:** Oura HRV data loads on iPhone without reliance on a localhost proxy.
**Depends on:** Phase 20 pass
**Success criteria:**
1. `api/oura.js` Vercel serverless function forwards authenticated requests to Oura API v2.
2. Oura PAT stored in Vercel env vars, never committed.
3. `oura.js` points to the hosted endpoint; 30-day HRV data loads on iPhone dashboard.

### Phase 22: Responsive Layout for iPhone Portrait
**Goal:** Every existing screen renders and functions correctly at iPhone widths (375–430px portrait).
**Depends on:** Phase 20 pass
**Success criteria:**
1. Session UI (gauges, waveform, breathing circle, pacer controls) is usable and legible at 390×844 baseline (iPhone 15/16).
2. Device picker, tuning flow, discovery flow, practice start screen all functional on iPhone portrait.
3. Dashboard chart legible and scrollable; tooltips usable via touch.
4. No regressions at desktop breakpoints — existing desktop UI is preserved.

If scope balloons: split into Phase 22a (session + tuning) and Phase 22b (dashboard + discovery).

### Phase 23: Dim Mode + Wake Lock
**Goal:** The user can engage a full-black nightstand overlay mid-session without interrupting audio, BLE, or DSP; screen never auto-locks during a session.
**Depends on:** Phase 20 pass
**Success criteria:**
1. Dim toggle appears in session UI during active session only; engaging it shows a `#000` full-viewport overlay within 100ms.
2. Any tap on the overlay dismisses it; session state is unchanged, audio cues continue on schedule, RR/EEG/PPG data continues streaming.
3. Wake Lock is requested on session start and released on session end; screen does not auto-lock during a 20-minute session with dim engaged.
4. Dim mode is a pure presentation toggle — no coupling to SessionMode, AudioEngine, or any stateful module.

### Phase 24: Production iPhone Install + End-to-End Verification
**Goal:** Personal daily-use build installed on the user's iPhone, validated with a real session.
**Depends on:** Phases 21, 22, 23
**Success criteria:**
1. iOS PWA polish: `apple-touch-icon` tuned, `apple-mobile-web-app-capable`, status bar style, splash screen.
2. End-to-end test: open from Home Screen → connect HRM + Muse → run 60s tuning → run 20-min practice session with dim mode engaged ≥10 minutes → view summary → dashboard. Zero critical bugs.
3. One-page personal install/use reference doc (how to reinstall Bluefy, how to re-authorize Oura, how to redeploy).

## Risks

### R1 — Muse-S compatibility in Bluefy (HIGH)
The largest unknown. Bluefy exposes Web Bluetooth, but Muse-S uses a custom service (0xfe8d) with multiple notify characteristics streaming binary packets at ~10–50 Hz. Bluefy's BLE bridge has had reported quirks with dense notify streams historically.
**Mitigation:** Phase 20 tests this directly. Fallback (Phase 20b) is fully designed. Ceiling on surprise: +1–2 weeks.

### R2 — Wake Lock release under iOS edge cases (MEDIUM)
Wake Lock auto-releases on tab visibility change, low-power mode, or sometimes spontaneously. If it silently releases mid-session, the screen auto-locks and the session effectively ends.
**Mitigation:** listen for `visibilitychange` and Wake Lock release events; re-request on visibility regain; log releases to the session record for diagnostics.

### R3 — AudioContext suspension mid-session (MEDIUM)
Incoming phone calls, Siri, or notifications with sound can interrupt the AudioContext (`state: 'interrupted'`). Pacer audio silently stops until resumed.
**Mitigation:** `audioContext.addEventListener('statechange', ...)` with auto-resume on visibility regain, extending existing user-gesture startup handling.

### R4 — Responsive CSS scope creep (MEDIUM)
`styles.css` is 25 KB and was built desktop-first over 13 phases. Phase 22 could balloon if we try to polish every screen.
**Mitigation:** Phase 22 success criteria explicitly scope to "functional and legible," not "beautiful." Polish deferred. If needed, split into 22a/22b.

### R5 — IndexedDB eviction on iOS (LOW-MEDIUM)
iOS Safari has historically evicted IDB aggressively under storage pressure, especially for web apps not installed to Home Screen.
**Mitigation:** call `navigator.storage.persist()` on first session save. The PWA install from Home Screen also helps substantially.

### R6 — Desktop/iPhone divergence during v2.0 (LOW)
One codebase, two targets. A change that breaks desktop while we're focused on iPhone could go unnoticed.
**Mitigation:** quick desktop smoke test (connect HRM, run 2-min session) after each phase.

### Non-risks confirmed
- **Oura OAuth refresh flow:** using PAT; no refresh needed.
- **CORS between app and proxy:** same Vercel origin.
- **Apple Developer cost:** only relevant if Phase 20b triggers; free tier sideload is acceptable for personal use.

## Open decisions deferred to implementation

- **Dim-mode tap sensitivity:** single tap vs. double-tap vs. tap-and-hold. Easiest to default to single tap and adjust if accidental dismissals are a problem in practice.
- **Vercel custom domain vs. `.vercel.app` subdomain:** either works; no cost difference for the app's use case.
- **PWA icon artwork:** existing icons may be fine; Phase 24 validates on iOS.
