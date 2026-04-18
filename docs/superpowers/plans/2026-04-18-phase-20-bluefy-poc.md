# Phase 20: Bluefy POC + Hardware Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the current ResonanceHRV v1.2 web stack works on iPhone via Bluefy browser with both Garmin HRM 600 and Muse-S streaming during a 5-minute end-to-end session, gating the rest of the v2.0 milestone.

**Architecture:** Deploy the existing static PWA (no build step) to Vercel. User installs Bluefy on iPhone, navigates to the Vercel URL, adds the app to Home Screen, and runs hardware validation tests. Bluefy exposes Web Bluetooth on iOS so the existing BLE adapter layer (HRMAdapter, MuseAdapter) is exercised unchanged. No code rewrites in this phase — the phase is primarily deploy + real-hardware validation. Oura integration is expected to fail silently (no proxy yet) and is explicitly out of scope for this phase.

**Tech Stack:** Vercel (static deploy from git), Bluefy iOS browser (Web BLE), existing vanilla JS/HTML/CSS stack unchanged.

**Parent spec:** `docs/superpowers/specs/2026-04-18-iphone-app-design.md`

---

## File Structure

**Files created:**
- `vercel.json` — minimal config to exclude legacy Node files (`proxy.js`, `server.js`) from deploy and disable automatic framework detection.
- `docs/superpowers/reports/2026-04-18-phase-20-bluefy-poc.md` — POC results report, test observations, pass/fail decision, and handoff notes for Phase 21/22/23 or 20b.

**Files modified:**
- None in the success path. If Task 2 uncovers a concrete blocker on Vercel (e.g., a hard-coded `localhost` reference that the existing try/catch doesn't cover), the plan amends in place and the fix is called out explicitly.

**Files explicitly NOT changed in this phase:**
- `js/ble.js`, `js/devices/*` — BLE adapters tested as-is through Web Bluetooth in Bluefy.
- `js/oura.js` — already fails gracefully on network errors (see `oura.js:62-75` and `oura.js:302-311`). Dashboard shows no HRV data; non-blocking.
- `styles.css` — desktop layout squished into iPhone portrait is intentionally acceptable for this POC. Responsive CSS is Phase 22.
- `js/audio.js`, `js/dsp.js`, algorithms — tested as-is.
- `manifest.json`, `icons/` — missing 192/512 icons fall back to iOS default; cosmetic, deferred to Phase 24.

---

## Tasks

### Task 1: Pre-deploy inventory — confirm no hard blockers

**Files:**
- Read: `index.html`, `js/main.js`, `js/storage.js`, `js/ble.js`, `manifest.json`, `sw.js`

**Purpose:** Walk through the entry points and confirm there are no hard-coded `localhost` URLs that would crash when loaded from a Vercel origin. `oura.js` is already known to fail gracefully (try/catch returns null). This task scans the remaining files.

- [ ] **Step 1: Scan entry files for `localhost` references**

Run:
```bash
grep -rn "localhost" index.html js/ manifest.json sw.js
```

Expected output: matches appear **only** in `js/oura.js` (REDIRECT_URI for OAuth — not on the Phase 20 path) and in code comments. If any match appears in BLE, audio, storage, or rendering code paths, stop and triage before continuing.

- [ ] **Step 2: Scan for 127.0.0.1 / http:// absolute URLs**

Run:
```bash
grep -rnE "(127\.0\.0\.1|http://)" index.html js/ manifest.json sw.js
```

Expected output: matches only in comments or the known OAuth `REDIRECT_URI` in `js/oura.js`. Any match in a fetch() or load path is a blocker — triage and add a fix task before continuing.

- [ ] **Step 3: Confirm `sw.js` asset list is current**

Run:
```bash
grep -n "SHELL_ASSETS" -A 25 sw.js
```

Expected: a list including at minimum `/`, `/index.html`, `/styles.css`, `/manifest.json`, `/js/main.js`, `/js/state.js`, `/js/storage.js`, `/js/ble.js`, `/js/dsp.js`, `/js/renderer.js`, `/js/audio.js`, `/js/discovery.js`, `/js/practice.js`, `/js/dashboard.js`, `/js/oura.js`. Modules added after the list was last touched (`tuning.js`, `phaseLock.js`, `paceController.js`, `sessionMode.js`, `museSignalProcessing.js`, `js/devices/*`) will load over the network on first visit — acceptable for Phase 20 since the app is online. Record in the report.

- [ ] **Step 4: No commit**

This task is read-only inventory. Findings go into the Phase 20 report in Task 8.

---

### Task 2: Create `vercel.json` to keep the deploy clean

**Files:**
- Create: `vercel.json`

**Purpose:** Vercel's framework auto-detection can get confused by a repo that contains `.js` files at root but no `package.json` build scripts. A tiny `vercel.json` disables auto-detection, declares static output, and lists files to exclude.

- [ ] **Step 1: Create `vercel.json`**

Write the file with this exact content:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    }
  ]
}
```

Notes on what each field does:
- `cleanUrls: true` — allows `/dashboard` to resolve to `/dashboard.html`. Not needed for this SPA but harmless and future-proof.
- The `X-Content-Type-Options` header is a baseline security header; no operational effect.
- `Cache-Control: no-cache` on `sw.js` prevents a stale service worker from being served indefinitely — a well-known PWA footgun.

- [ ] **Step 2: Create `.vercelignore` to exclude legacy Node files**

Write `.vercelignore` with this exact content:

```
proxy.js
server.js
node_modules
.planning
.superpowers
docs
Screenshots
.git
.gitignore
```

Purpose: keeps the deploy slim and avoids any risk of Vercel trying to execute `proxy.js` or `server.js` as entry points. `docs/` and `.planning/` are project artifacts, not deployed assets.

- [ ] **Step 3: Commit**

```bash
git add vercel.json .vercelignore
git commit -m "chore(20): add vercel.json and .vercelignore for static deploy"
```

---

### Task 3: Create and link Vercel project (user-driven)

**Files:** None modified.

**Purpose:** Create a Vercel project bound to this git repo and trigger the first deploy. This is user-driven because Vercel project creation requires an interactive browser login.

- [ ] **Step 1: Sign in to Vercel**

User action (you, Gerone): open https://vercel.com in a browser, sign in with GitHub / your preferred provider.

- [ ] **Step 2: Import the repo**

User action: Dashboard → Add New → Project → Import Git Repository. Point it at this Sleep repo.

When prompted:
- Framework Preset: **Other** (do not pick a framework)
- Root Directory: leave default (`./`)
- Build Command: leave empty
- Output Directory: leave empty
- Install Command: leave empty

- [ ] **Step 3: Deploy and capture URL**

Click **Deploy**. Wait ~30 seconds. Vercel returns a URL of the form `https://<project-name>-<hash>.vercel.app`. A short alias (`https://<project-name>.vercel.app`) is also created.

Save both URLs for the report (see Task 8).

- [ ] **Step 4: Verify deploy smoke-test in desktop Chrome**

From desktop Chrome, open the Vercel URL (the short `.vercel.app` alias).

Expected:
- Page loads with no console errors that weren't present on localhost (some Oura-related errors are expected and acceptable — they confirm the app is running).
- No `404` for `index.html`, `styles.css`, or `js/*.js` files in the Network tab.
- Service worker registers successfully (Application tab → Service Workers → status: activated).

If any of these fail, stop and triage before proceeding to Task 4.

- [ ] **Step 5: No commit**

This task is deploy-only; no local file changes.

---

### Task 4: Desktop parity test from hosted URL

**Files:** None modified.

**Purpose:** Confirm the hosted URL behaves identically to localhost when accessed from the same desktop Chrome that currently runs v1.2 from localhost. This catches any HTTPS-specific or hosting-specific issues before we add the iPhone variable.

- [ ] **Step 1: Connect HRM 600 from the hosted URL**

Open the Vercel URL in desktop Chrome. Click the HRM connect control.

Expected:
- Browser Bluetooth picker appears.
- HRM 600 is listed; select it.
- Status chip transitions `connecting → connected`.
- HR waveform starts scrolling within 5 seconds.

- [ ] **Step 2: Connect Muse-S from the hosted URL**

Click the Muse connect control while HRM remains connected.

Expected:
- Browser Bluetooth picker appears; Muse-S visible.
- Pair it.
- Neural Calm gauge appears; EEG waveform (if visible) starts scrolling.
- Both device status chips show connected.

- [ ] **Step 3: Run a 2-minute session**

Start a standard Practice session. Let it run 2 minutes.

Expected:
- Breathing pacer animation smooth, audio cues on schedule.
- Coherence, phase lock, and neural calm gauges all update.
- No console errors beyond the expected Oura network errors.

Stop the session. Verify session summary renders.

- [ ] **Step 4: Record findings**

Note in the Task 8 report: desktop parity from Vercel URL = pass or fail, with specifics.

- [ ] **Step 5: No commit**

Validation-only; no file changes.

---

### Task 5: Install Bluefy and load the hosted URL on iPhone

**Files:** None modified.

**Purpose:** Get the app running in Bluefy on the iPhone and add it to the Home Screen so subsequent tasks exercise the intended runtime (PWA in standalone mode).

- [ ] **Step 1: Install Bluefy**

User action: on the iPhone, open the App Store, search for **"Bluefy – Web BLE Browser"** by WebBLE LLC. Install it. (Free app.)

- [ ] **Step 2: Open the Vercel URL in Bluefy**

Launch Bluefy, tap the URL bar, type the Vercel URL (or paste from a shared clipboard / email it to yourself).

Expected:
- Page loads. Layout will be squished/desktop-oriented — that is intentional and acceptable at this stage.
- No "this site cannot be reached" errors (would indicate Vercel misconfiguration).

- [ ] **Step 3: Add to Home Screen**

In Bluefy, tap the Share icon (bottom bar) → **Add to Home Screen**. Keep the default name "ResonanceHRV" (from `manifest.json:2`). Tap Add.

Expected:
- Home Screen gets a new icon labeled "ResonanceHRV". Icon image will be generic (missing apple-touch-icon) — cosmetic, fixed in Phase 24.

- [ ] **Step 4: Launch from Home Screen and confirm standalone mode**

From the Home Screen, tap the new icon.

Expected:
- App opens full-screen (no Bluefy URL bar visible), matching `manifest.json:5` `"display": "standalone"`.
- If the URL bar is visible, the PWA install failed. Re-add to Home Screen and confirm Bluefy's "Open in Bluefy" option is chosen (it should be default behavior for Add to Home Screen).

- [ ] **Step 5: Take a reference screenshot**

Screenshot the launched app, save to `Screenshots/` directory on the iPhone, AirDrop or otherwise transfer to the repo's `Screenshots/` folder later.

- [ ] **Step 6: No commit**

---

### Task 6: HRM 600 hardware test in Bluefy

**Files:** None modified.

**Purpose:** Validate spec success criterion 2 — HRM 600 connects and streams RR intervals reliably in Bluefy. Isolates the chest strap from the Muse-S variable.

- [ ] **Step 1: Put on the HRM 600 and ensure it's active**

Wear the chest strap, moistened electrodes. Confirm the LED blinks (if equipped) or that your Garmin watch picks up HR (sanity check that the strap is transmitting).

- [ ] **Step 2: Launch ResonanceHRV from Home Screen**

Tap the Home Screen icon (launches in standalone Bluefy container).

- [ ] **Step 3: Connect HRM 600**

Tap the HRM connect control.

Expected:
- iOS native Bluetooth picker appears (Bluefy routes to CoreBluetooth).
- HRM 600 visible in the list.
- Select it, authorize.
- Status chip transitions to connected within 5 seconds.
- HR waveform begins scrolling within 5 more seconds.

If the iOS picker does not list the HRM 600 after ~15 seconds, ensure iOS Bluetooth is on, the strap is worn (not in standby), and no other app is currently connected to the strap.

- [ ] **Step 4: Run a 5-minute continuous connection test**

Leave the app open on the HRM connect screen for 5 minutes. Watch the HR waveform.

Expected:
- Continuous, smooth waveform for the full 5 minutes.
- No disconnects (status chip stays "connected").
- No parse errors in the on-screen debug overlay (if available) or obvious waveform glitches.

- [ ] **Step 5: Record result**

Note in the Task 8 report:
- Time to first data: ___ seconds
- Disconnects observed: yes/no; count
- Reconnect behavior observed: yes/no
- Any waveform anomalies

- [ ] **Step 6: Disconnect HRM for clean Muse test**

Disconnect the HRM in-app before starting Task 7 (clean isolation).

- [ ] **Step 7: No commit**

---

### Task 7: Muse-S hardware test in Bluefy

**Files:** None modified.

**Purpose:** Validate spec success criterion 3 — Muse-S connects and streams EEG + PPG reliably in Bluefy. Highest-risk task in the phase; outcome drives the Phase 20 gate decision.

- [ ] **Step 1: Turn on the Muse-S headband**

Put on the Muse-S. Ensure it's charged and in pairing/discoverable mode (per Muse's normal power-on behavior — LED indicator).

- [ ] **Step 2: Launch ResonanceHRV from Home Screen (HRM disconnected)**

Confirm HRM is not currently connected. Open the app fresh from Home Screen.

- [ ] **Step 3: Connect Muse-S**

Tap the Muse connect control.

Expected:
- iOS Bluetooth picker shows "Muse-S" (or similar name).
- Select, authorize.
- Status chip transitions through connecting → streaming within 10 seconds.
- Neural Calm gauge appears; PPG-derived HR gauge starts populating.
- EEG alpha bar (if visible in current UI) begins animating.

If the picker does not show Muse-S, confirm the headband is powered on and no other app (Mind Monitor, Muse official app) is currently connected to it.

- [ ] **Step 4: Run a 5-minute continuous streaming test — the critical test**

Put the headband on comfortably, close your eyes, sit still. Let the app run for **at least 5 continuous minutes**.

Watch for:
- **Notification drops**: gauges/waveform freezing for >2 seconds at a time
- **Connection drops**: status chip changing state
- **Audio glitches** (even though no session is running, no audio is expected — but if any system sound triggers, confirm the app doesn't crash)
- **Neural Calm behavior**: should rise noticeably while eyes-closed and relaxed, then drop when eyes open (this confirms EEG AF7/AF8 data is valid, not just streaming noise)

- [ ] **Step 5: Record detailed result (this is the gate criterion)**

Note in the Task 8 report:
- Time to first EEG data: ___ seconds
- Time to first PPG data: ___ seconds
- Notification drops observed: count, average duration
- Did Neural Calm rise when eyes closed? yes/no
- PPG-derived HR stable or erratic?
- Any disconnects in 5 minutes
- Subjective assessment: "suitable for sessions" / "unstable — pivot to 20b"

**Gate decision criterion:** if more than 1 notification drop >3 seconds, or any disconnect during the 5-min window, mark Phase 20 as **fail on Muse criterion** and plan to proceed to Phase 20b (Capacitor pivot).

- [ ] **Step 6: Disconnect Muse for combined test**

- [ ] **Step 7: No commit**

---

### Task 8: Combined 5-minute end-to-end session in Bluefy

**Files:** None modified.

**Purpose:** Validate spec success criterion 4 + 5 — full session flow (tuning → practice → summary → persistence) works end-to-end with both devices connected.

Only run this task if Task 6 AND Task 7 both passed. If Task 7 failed, skip directly to Task 9 and route to Phase 20b.

- [ ] **Step 1: Connect both devices**

Wear HRM 600 and Muse-S. Launch app from Home Screen. Connect both devices (order doesn't matter).

Expected:
- Both status chips show connected.
- HR waveform (from HRM) scrolling.
- Neural Calm gauge active (from Muse).

- [ ] **Step 2: Run 60-second RF tuning**

Start the tuning phase. Breathe with the pacer as it sweeps frequencies.

Expected:
- Tuning UI displays countdown for 60 seconds.
- Bowl pacer audio plays on schedule (no audible gaps or drift).
- RF is identified at the end; result displayed.

- [ ] **Step 3: Start a 5-minute practice session**

Start practice mode with the tuned frequency. Set duration to 5 minutes (or the shortest available; extend if needed to meet spec). Breathe along.

Expected:
- Breathing circle animates smoothly, synchronized to audio bowl strikes.
- Session countdown timer accurate (use phone's clock app as external reference — start your stopwatch at session start, verify within ±2 seconds of app timer at session end).
- Coherence gauge updates every 1-2 seconds; values plausible (rising above 30 within a minute or two of on-pace breathing).
- Phase lock gauge updates; values plausible.
- Neural Calm gauge updates; rises as you relax.

- [ ] **Step 4: Let session complete**

Wait for session end chime / transition to summary.

Expected:
- Summary screen renders with duration, mean coherence, peak coherence, mean phase lock, mean neural calm.
- No layout breakage (content may be squished but is legible).

- [ ] **Step 5: Force-quit and reload to verify IDB persistence**

Swipe up on the app, force-close. Tap the Home Screen icon again to relaunch.

Expected:
- App loads fresh.
- Dashboard tab shows the just-completed session in the history list.
- Session chart includes the new data point.

- [ ] **Step 6: Record full end-to-end result**

Note in the Task 9 report:
- All 4 spec success criteria (#2, #3, #4, #5) — pass/fail per criterion
- Any unexpected behavior during tuning, session, or summary
- Any concerns to address in Phase 22 (responsive CSS) based on how the layout actually looked on iPhone

- [ ] **Step 7: No commit**

---

### Task 9: Write the Phase 20 report and make the gate decision

**Files:**
- Create: `docs/superpowers/reports/2026-04-18-phase-20-bluefy-poc.md`

**Purpose:** Capture all observations from Tasks 1–8, make the pass/fail decision on spec success criteria, and hand off to the next phase or the contingency (20b).

- [ ] **Step 1: Create the report file**

Write `docs/superpowers/reports/2026-04-18-phase-20-bluefy-poc.md` with this template (fill in during execution — do not commit placeholder text):

```markdown
# Phase 20 — Bluefy POC + Hardware Validation Report

**Date run:** YYYY-MM-DD
**iPhone model:** (e.g., iPhone 15 Pro, iOS 17.x)
**Bluefy version:** (Settings → About in Bluefy)
**Vercel deploy URL:** https://<project>.vercel.app
**Vercel deploy commit SHA:** <sha>

## Task 1: Pre-deploy inventory
- localhost scan results:
- Absolute URL scan results:
- sw.js SHELL_ASSETS state:
- Findings:

## Task 3: Vercel deploy
- Deploy status:
- Desktop Chrome smoke test from hosted URL:

## Task 4: Desktop parity from hosted URL
- HRM connect: pass/fail, notes
- Muse connect: pass/fail, notes
- 2-min session: pass/fail, notes

## Task 5: Bluefy + PWA install
- Bluefy install: pass/fail
- URL load in Bluefy: pass/fail
- Add to Home Screen + standalone mode: pass/fail
- Reference screenshot: (path in Screenshots/)

## Task 6: HRM 600 in Bluefy
- Time to first data:
- Disconnects in 5 min:
- Anomalies:
- Result vs. spec criterion 2: PASS / FAIL

## Task 7: Muse-S in Bluefy (gate-critical)
- Time to first EEG data:
- Time to first PPG data:
- Notification drops (count + max duration):
- Neural Calm eyes-closed response: yes/no
- PPG HR stable: yes/no
- Disconnects in 5 min:
- Result vs. spec criterion 3: PASS / FAIL
- Subjective: suitable / unstable

## Task 8: End-to-end session (skipped if Task 7 failed)
- 60s tuning: pass/fail, notes
- 5-min practice: pass/fail, timer drift
- Gauges (coherence / phase lock / neural calm): pass/fail, notes
- Session summary renders: pass/fail
- IDB persistence across relaunch: pass/fail
- Result vs. spec criteria 4, 5: PASS / FAIL

## Gate Decision

Per the design spec (`docs/superpowers/specs/2026-04-18-iphone-app-design.md`), Phase 20 passes if and only if ALL of:
- [ ] Criterion 1: App deploys to Vercel and loads in Bluefy on iPhone, PWA-installed
- [ ] Criterion 2: HRM 600 streams via Web Bluetooth in Bluefy without parse errors
- [ ] Criterion 3: Muse-S streams EEG + PPG in Bluefy without drops for ≥5 min
- [ ] Criterion 4: 5-min session completes end-to-end, pacer/gauges accurate
- [ ] Criterion 5: Session persists to IndexedDB and appears on dashboard after reload

**Decision:** PASS / FAIL

**Next phase:**
- If PASS: proceed to Phases 21 (Oura proxy), 22 (responsive CSS), 23 (dim mode + Wake Lock) in parallel.
- If FAIL: proceed to Phase 20b (Capacitor pivot), scoping a wrapper around the existing code with `@capacitor-community/bluetooth-le` replacing Web Bluetooth.

## Unresolved observations / notes for next phases
- (e.g., layout issues to prioritize in Phase 22)
- (e.g., audio timing concerns for Phase 23)
- (e.g., specific Muse-S behaviors to watch if we move to Capacitor in 20b)
```

- [ ] **Step 2: Fill in all sections with actual observations from Tasks 1–8**

No placeholder text survives in the committed version.

- [ ] **Step 3: Make the gate decision explicitly**

Set the **Decision** field to `PASS` or `FAIL` based strictly on the 5 spec criteria. Partial success is a fail.

- [ ] **Step 4: Commit the report**

```bash
git add docs/superpowers/reports/2026-04-18-phase-20-bluefy-poc.md
git commit -m "docs(20): Phase 20 Bluefy POC report and gate decision"
```

- [ ] **Step 5: Announce the decision**

If PASS: report "Phase 20 passed. Ready to plan Phases 21, 22, 23 (can run in parallel)."

If FAIL: report "Phase 20 failed on criterion N. Ready to plan Phase 20b (Capacitor pivot)." Name which criterion failed and summarize the failure mode in 1–2 sentences.

---

## Self-Review

Spec coverage check (from `docs/superpowers/specs/2026-04-18-iphone-app-design.md` Phase 20 section):

| Spec success criterion | Task coverage |
|------------------------|---------------|
| 1. App deploys to Vercel, loads in Bluefy, PWA-installs | Tasks 2–5 |
| 2. HRM 600 streams via Web Bluetooth in Bluefy | Task 6 |
| 3. Muse-S EEG+PPG without drops for ≥5 min | Task 7 (gate) |
| 4. 5-min session completes end-to-end | Task 8 |
| 5. Session saved to IDB, visible in dashboard after reload | Task 8 steps 5–6 |

Gate decision and handoff captured in Task 9.

Placeholder scan: no "TBD" / "TODO" / "fill in details" text in this plan. Report template contains fillable fields that are explicitly instructed to be replaced before commit.

Type/identifier consistency: this plan references no new code identifiers — all work is deploy + validation. Existing file paths verified against the repo.
