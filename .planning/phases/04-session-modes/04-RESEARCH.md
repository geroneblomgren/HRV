# Phase 4: Session Modes - Research

**Researched:** 2026-03-22
**Domain:** Vanilla JS state machines, session orchestration, Canvas bar chart, IndexedDB session persistence
**Confidence:** HIGH — codebase fully read; all integration points verified in source

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Discovery Flow**
- All 5 blocks auto-start with a 3-2-1 countdown between them — no manual start per block
- Brief 3-5 second pause between blocks showing: block just completed, next breathing rate coming up, "relax" moment
- Current breathing rate shown prominently near the circle during each block (e.g., "6.0 breaths/min")
- Progress indicator is Claude's discretion (dots, steps, or bar)
- Block order: 6.5, 6.0, 5.5, 5.0, 4.5 breaths/min — 2 minutes each

**Frequency Selection (Post-Discovery)**
- Bar chart showing RSA amplitude for all 5 frequencies — tallest bar is the winner
- App auto-selects the best frequency and highlights it with "Recommended" label
- User clicks "Confirm" to save, or taps a different bar to override the recommendation
- No individual block redo — if unhappy, restart the full Discovery protocol
- Discovery tab always available — running it again overwrites the saved frequency

**Practice Session UX**
- Adjustable duration before starting: 10/15/20/30 minute options
- Practice tab shows saved frequency and duration picker, then "Start Session" button
- During session: circle + waveform background + coherence gauge very subtle (small, low opacity)
- No spectrum chart during practice — keep it focused on breathing
- Session end: gentle chime when timer reaches 0:00, session continues until user clicks "End Session" — option to keep going
- End-of-session summary: four key metrics — duration, mean coherence, peak coherence, time in "Locked In" zone

**Session Persistence**
- Save per practice session: date, duration, frequency, mean coherence, peak coherence, time in high zone, AND full coherence-over-time trace array
- Discovery results saved: per-block RSA amplitude and LF peak power, selected frequency
- BLE disconnect mid-session: pause audio/circle, show reconnecting banner. Resume if reconnects. Save partial session if reconnect fails.

### Claude's Discretion
- Progress indicator style for discovery blocks
- Exact countdown animation between blocks
- Duration picker UI style (buttons vs dropdown vs slider)
- Summary screen layout
- Chime sound at session end (can reuse bowl tone)
- Coherence gauge opacity/size in practice mode

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-01 | Discovery mode guides user through 5 breathing rate blocks: 6.5, 6.0, 5.5, 5.0, 4.5 BPM, 2 minutes each | State machine pattern with `setTimeout`-driven block transitions; `AppState.pacingFreq` controls rate |
| DISC-02 | Real-time HR waveform visible during each block showing RSA oscillation | `startRendering()` already renders waveform on `waveform-canvas`; no new work needed |
| DISC-03 | Power spectrum chart visible during each block showing LF peak position and amplitude | `spectrum-canvas` already rendered in discovery tab by shared rAF loop |
| DISC-04 | After all blocks, app displays comparison of RSA amplitude and LF peak power across all 5 frequencies | New DOM section with Canvas-based bar chart; data collected from `computeRSAAmplitude(getHRArray(120))` and `AppState.lfPower` snapshot per block end |
| DISC-05 | User confirms resonance frequency selection and app saves it to IndexedDB for Practice mode | `setSetting('resonanceFreq', freq)` and `AppState.savedResonanceFreq = freq` already wired; Confirm button triggers save |
| PRAC-01 | Practice mode loads saved resonance frequency and runs breathing pacer at that rate | `AppState.savedResonanceFreq` loaded on init; `startPacer(freq)` called with it |
| PRAC-02 | Default session length is 20 minutes with visible countdown timer | `startRendering(..., sessionDuration)` already supports countdown mode; `_sessionDuration` drives circle timer |
| PRAC-03 | Real-time scrolling HR waveform displayed during practice (60s visible window) | `waveform-canvas` or a second practice waveform canvas; renderer already supports 60s window |
| PRAC-04 | Live coherence score displayed prominently, updating every 1-2 seconds | `gauge-canvas` already handles this via rAF loop reading `AppState.coherenceScore` |
| PRAC-05 | Session summary shown on completion: duration, mean coherence, peak coherence, time in high coherence | New DOM section; metrics computed from in-memory coherence trace collected during session |
</phase_requirements>

---

## Summary

Phase 4 is primarily a **session orchestration and UI flow problem**, not a new technology problem. All rendering, audio, DSP, and storage infrastructure was built in Phases 1-3 and is verified working. The core work is:

1. **Discovery state machine** — a 5-block sequential protocol using `setTimeout`-driven transitions, capturing per-block RSA amplitude and LF power snapshots, then displaying a comparison bar chart for frequency selection.

2. **Practice session manager** — loading saved resonance frequency, running a timed session with the existing pacer/renderer pipeline, collecting a coherence-over-time trace, chiming at timer end, and presenting a summary on close.

Both modes build on the same `startSession`/`stopSession` pattern already in `main.js`, but replace the current "auto-start on BLE connect" placeholder with explicit user-initiated flows. The largest new UI piece is the comparison bar chart and summary screen — both are simple DOM/Canvas elements with no new libraries needed.

Key integration insight: the current `startSession()` in `main.js` hardcodes the discovery tab's session-viz and always uses `_sessionDuration = 0` (elapsed mode). Phase 4 replaces this with two distinct session controllers: `DiscoveryController` and `PracticeController`, each managing their own DOM sections, calling into the shared renderer/audio/DSP modules.

**Primary recommendation:** Extract a reusable `SessionCore` (DSP init, rAF renderer, pacer) that both Discovery and Practice controllers delegate to. Keep the state machine logic in `js/discovery.js` and `js/practice.js` rather than growing `main.js` further.

---

## Standard Stack

### Core (no new libraries — everything already present)

| Module | Location | Purpose | Phase 4 Usage |
|--------|----------|---------|---------------|
| `AppState` + `subscribe` | `js/state.js` | Reactive state bus | `sessionPhase`, `pacingFreq`, `savedResonanceFreq`, `coherenceScore` |
| `initDSP` / `tick` / `computeRSAAmplitude` / `getHRArray` | `js/dsp.js` | Signal processing | Per-block RSA capture, live coherence during practice |
| `startRendering` / `stopRendering` | `js/renderer.js` | Canvas rAF loop | Both modes use it; practice passes `sessionDuration` |
| `initAudio` / `startPacer` / `stopPacer` | `js/audio.js` | Breathing audio | Frequency changes per block in discovery; single freq in practice |
| `saveSession` / `getSetting` / `setSetting` | `js/storage.js` | IndexedDB persistence | Save discovery results and practice sessions |
| idb v8 | CDN ESM | IndexedDB wrapper | Already initialized; `sessions` and `settings` stores ready |

### New Code Required (no new npm packages)

| Module | What to Build | Complexity |
|--------|--------------|------------|
| `js/discovery.js` | 5-block state machine, per-block data capture, transition UI | Medium |
| `js/practice.js` | Session manager: load freq, timed session, coherence trace, summary | Medium |
| Bar chart renderer | Canvas 2D bar chart for frequency comparison (inline or in `renderer.js`) | Low |
| Summary screen DOM | HTML/CSS section, shown/hidden on session end | Low |
| Chime at timer end | Reuse `_scheduleBowlCue` once at `_ctx.currentTime` when timer hits 0 | Very Low |

**Installation:** No new packages. All dependencies already loaded.

---

## Architecture Patterns

### Recommended Project Structure

```
js/
├── state.js          # AppState (existing — add discoveryResults field)
├── main.js           # Bootstrap only — wire tabs, connect btn, delegate to controllers
├── discovery.js      # NEW: DiscoveryController — state machine, block transitions
├── practice.js       # NEW: PracticeController — timed session, coherence trace, summary
├── dsp.js            # (existing — no changes needed)
├── renderer.js       # (existing — minor: support disabling spectrum in practice mode)
├── audio.js          # (existing — add one-shot chime function)
├── storage.js        # (existing — no changes needed)
└── ble.js            # (existing — no changes needed)
```

### Pattern 1: Discovery State Machine

**What:** A sequential 5-block protocol where each block runs for 120 seconds at a fixed frequency, followed by a 3-5 second inter-block pause, then auto-advances to the next block.

**When to use:** Structured test protocols with fixed ordering and no user intervention during execution.

**State representation:**

```javascript
// js/discovery.js

const DISCOVERY_BLOCKS = [
  { bpm: 6.5, hz: 6.5 / 60 },
  { bpm: 6.0, hz: 6.0 / 60 },
  { bpm: 5.5, hz: 5.5 / 60 },
  { bpm: 5.0, hz: 5.0 / 60 },
  { bpm: 4.5, hz: 4.5 / 60 },
];
const BLOCK_DURATION_MS = 2 * 60 * 1000;  // 120 seconds
const INTER_BLOCK_PAUSE_MS = 4000;         // 4 second "relax" pause

// State machine phases
// 'idle' → 'countdown' (3-2-1) → 'block' → 'inter-block-pause' → 'block' → ... → 'comparison' → 'idle'

let _phase = 'idle';           // current state machine phase
let _blockIndex = 0;           // 0-4
let _blockTimer = null;        // setTimeout handle
let _blockResults = [];        // [{bpm, rsaAmplitude, lfPower}] per completed block
let _blockStartTime = null;    // Date.now() when current block started
```

**Block transition flow:**

```javascript
function startBlock(index) {
  _blockIndex = index;
  _phase = 'block';

  // Switch pacer frequency for this block
  const block = DISCOVERY_BLOCKS[index];
  stopPacer();
  AppState.pacingFreq = block.hz;
  startPacer(block.hz);

  // Reset DSP session start time for per-block elapsed timer
  _blockStartTime = Date.now();
  AppState.sessionStartTime = _blockStartTime;

  // Update rate label in UI
  updateRateLabel(`${block.bpm} breaths/min`);

  // Schedule block end
  _blockTimer = setTimeout(() => endBlock(index), BLOCK_DURATION_MS);
}

function endBlock(index) {
  // Capture per-block metrics at end of block
  const hrSamples = getHRArray(120);  // last 2 minutes of HR data
  const rsaAmplitude = computeRSAAmplitude(hrSamples);
  const lfPower = AppState.lfPower;   // last computed LF power from DSP tick

  _blockResults.push({
    bpm: DISCOVERY_BLOCKS[index].bpm,
    hz: DISCOVERY_BLOCKS[index].hz,
    rsaAmplitude,
    lfPower,
  });

  if (index < DISCOVERY_BLOCKS.length - 1) {
    // Show inter-block pause with countdown
    showInterBlockPause(index, () => startBlock(index + 1));
  } else {
    // All blocks done → show comparison
    showComparison(_blockResults);
  }
}
```

### Pattern 2: Inter-Block Pause UI

**What:** A 4-second overlay showing the completed block, next block rate, and a countdown. Uses `setInterval` to tick the countdown and transitions automatically.

**Implementation:**

```javascript
function showInterBlockPause(completedIndex, onDone) {
  _phase = 'inter-block-pause';
  stopPacer();  // silence audio during pause

  const nextBlock = DISCOVERY_BLOCKS[completedIndex + 1];
  let countdown = 4;

  // Show pause overlay in UI (DOM manipulation)
  showPauseOverlay({
    completed: DISCOVERY_BLOCKS[completedIndex].bpm,
    next: nextBlock.bpm,
    countdown,
  });

  const interval = setInterval(() => {
    countdown--;
    updatePauseCountdown(countdown);
    if (countdown <= 0) {
      clearInterval(interval);
      hidePauseOverlay();
      onDone();
    }
  }, 1000);
}
```

### Pattern 3: Coherence Trace Collection (Practice Mode)

**What:** During a practice session, collect `AppState.coherenceScore` once per DSP tick (once per second) into an array for summary computation and storage.

**Why:** The summary screen needs mean, peak, and time-in-high-zone — all derivable from the trace array. Storing the full array in IndexedDB satisfies the CONTEXT.md requirement for the coherence-over-time trace.

```javascript
// js/practice.js

let _coherenceTrace = [];    // [number] coherence scores at 1-second intervals
let _dspInterval = null;

function collectCoherenceTick(elapsed) {
  tick(elapsed);  // run DSP
  _coherenceTrace.push(AppState.coherenceScore);
}

// At session end, compute summary from trace:
function computeSummary(durationSeconds) {
  const n = _coherenceTrace.length;
  const mean = n > 0 ? Math.round(_coherenceTrace.reduce((a, b) => a + b, 0) / n) : 0;
  const peak = n > 0 ? Math.max(..._coherenceTrace) : 0;
  const highCount = _coherenceTrace.filter(s => s >= 66).length;  // ZONE_THRESHOLDS.high = 66
  const timeInHigh = highCount;  // seconds (1 sample per second)
  return { durationSeconds, mean, peak, timeInHigh, trace: _coherenceTrace };
}
```

### Pattern 4: Frequency Comparison Bar Chart

**What:** A Canvas 2D bar chart rendered once (not in the rAF loop) after all discovery blocks complete. RSA amplitude on Y-axis, 5 frequency options on X-axis. Tallest bar auto-highlighted with "Recommended" label. Bars are clickable for manual override.

**Why Canvas over DOM bars:** The rAF renderer pattern is already established; Canvas gives precise control over the "Recommended" highlight and tap-to-select behavior.

```javascript
function drawComparisonChart(canvas, results, selectedIndex) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  const maxRSA = Math.max(...results.map(r => r.rsaAmplitude));
  const barW = (w - 60) / results.length;  // 60px padding

  results.forEach((r, i) => {
    const barH = maxRSA > 0 ? (r.rsaAmplitude / maxRSA) * (h - 60) : 0;
    const x = 30 + i * barW + barW * 0.1;
    const y = h - 30 - barH;
    const isSelected = i === selectedIndex;

    ctx.fillStyle = isSelected ? '#14b8a6' : 'rgba(20, 184, 166, 0.35)';
    ctx.fillRect(x, y, barW * 0.8, barH);

    // "Recommended" label above best bar
    if (i === selectedIndex) {
      ctx.fillStyle = '#14b8a6';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Recommended', x + barW * 0.4, y - 14);
    }

    // BPM label below bar
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${r.bpm}`, x + barW * 0.4, h - 12);
  });
}
```

**Click-to-select on canvas:**
```javascript
chartCanvas.addEventListener('click', (e) => {
  const rect = chartCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const barW = (chartCanvas.clientWidth - 60) / results.length;
  const clickedIndex = Math.floor((x - 30) / barW);
  if (clickedIndex >= 0 && clickedIndex < results.length) {
    _selectedIndex = clickedIndex;
    drawComparisonChart(chartCanvas, results, _selectedIndex);
  }
});
```

### Pattern 5: End-of-Session Chime

**What:** A single bowl-tone strike played once when the practice timer reaches 0:00. Session continues running until user clicks "End Session".

**Implementation:** Add a `playChime()` export to `audio.js` that schedules one bowl cue at `_ctx.currentTime` immediately:

```javascript
// js/audio.js — add export
export function playChime() {
  if (!_ctx) return;
  _scheduleBowlCue(_ctx.currentTime + 0.05, 'inhale', 1.5);
}
```

Detection: in `practice.js`, during the `setInterval` DSP tick loop, check if `Date.now() - _sessionStart >= _sessionDurationMs` and if `!_chimePlayed` — then call `playChime()` and set `_chimePlayed = true`. Do NOT stop the session; just show the "End Session" button more prominently (or change its label to "End Session / Keep Going").

### Pattern 6: BLE Disconnect Mid-Session Handling

**What:** When `AppState.connected` becomes `false` during an active session, pause audio and visual, show a reconnecting banner. Resume if reconnects within timeout. Save partial session on permanent disconnect.

**How:** Subscribe to `AppState.connected` inside both `DiscoveryController` and `PracticeController`:

```javascript
subscribe('connected', (value) => {
  if (!value && _phase !== 'idle') {
    // BLE dropped during active session
    stopPacer();
    showReconnectingBanner();
    _pausedForReconnect = true;
  } else if (value && _pausedForReconnect) {
    // Reconnected — resume
    hideBanner();
    startPacer(AppState.pacingFreq);
    _pausedForReconnect = false;
  }
});
```

On permanent disconnect (exponential backoff exhausted, `showManualReconnect` becomes true): save partial session via `saveSession({...sessionData, partial: true})` and return to idle.

### Anti-Patterns to Avoid

- **Growing main.js further:** It already handles BLE events, uptime, nav tabs, and pacer controls. Discovery and Practice logic belongs in dedicated modules.
- **Running DSP tick during inter-block pause:** Stop DSP interval during the pause or results from the previous block's tail will bleed into the next block's starting data. Restart DSP interval at the start of each new block.
- **Auto-starting session on BLE connect:** Phase 2 left `subscribe('connected', () => startSession())` as a temporary behavior. Phase 4 removes this — sessions start only via explicit user action.
- **Using Date.now() for timer precision in summary:** Use `Date.now()` only for wall-clock timestamps (stored start/end). Use the DSP tick count times 1000ms as session elapsed duration for coherence trace length.
- **Capturing RSA amplitude mid-block:** Capture at the END of each 2-minute block only, using `getHRArray(120)` which provides the last 120 seconds of data.
- **Sharing the same rAF canvases between Discovery and Practice:** The HTML already shows separate canvas IDs (`waveform-canvas` vs `practice-waveform-canvas`). Keep them separate and pass the correct canvases to `startRendering()` per mode.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB session writes | Custom IDB wrapper | `saveSession()` already in `storage.js` | Already handles schema, autoincrement, timestamp index |
| Reactive state changes | Event emitter or direct module calls | `AppState` Proxy + `subscribe()` | Established pattern; all modules already use it |
| Drift-free audio timing | Date.now() interval | `audio.js` lookahead scheduler (already built) | 20-min sessions accumulate 100ms+ drift with naive timers |
| Canvas DPR scaling | Manual devicePixelRatio math | `setupCanvas()` in `renderer.js` | Already handles DPR, flex layout one-frame delay |
| Coherence scoring | Custom formula | `computeCoherenceScore()` in `dsp.js` | HeartMath formula already verified and calibrated |
| RSA amplitude | Custom peak-trough algorithm | `computeRSAAmplitude()` in `dsp.js` | Already handles edge cases, zero inputs |

**Key insight:** Phase 4 is an integration phase. The value comes from orchestrating existing building blocks correctly, not from building new primitives.

---

## Common Pitfalls

### Pitfall 1: Stale RR Buffer at Block Boundaries

**What goes wrong:** At the end of block N, `getHRArray(120)` includes RR data from the previous blocks (or the inter-block pause), not just block N. The RSA amplitude reading is contaminated.

**Why it happens:** `AppState.rrBuffer` is a continuous circular buffer that never resets between blocks. `getHRArray(120)` walks backwards through it by accumulated time, so it may return data from before the block started.

**How to avoid:** Track `_blockStartTime` (Date.now() at block start). When calling `getHRArray()`, compute actual elapsed block seconds: `Math.min(120, (Date.now() - _blockStartTime) / 1000)`. Pass this as the window parameter instead of hardcoded 120.

**Warning signs:** RSA amplitudes that don't vary much between blocks (they're averaging across all blocks).

### Pitfall 2: DSP Calibration Window Spanning Multiple Blocks

**What goes wrong:** The DSP `tick()` function has a 120-second calibration gate. If Discovery starts from cold (no prior session), the first two blocks will show `AppState.calibrating = true` and `lfPower = 0`. LF power snapshots captured at block end will be zero.

**Why it happens:** `tick()` checks `sessionElapsedSeconds < MIN_WINDOW_SECONDS (120)` — this is the total elapsed since `initDSP()` was called, not since the current block started.

**How to avoid:** Call `initDSP()` once at the very start of the full Discovery session (not per block). Track session elapsed across all blocks. The first block's LF power snapshot may still be unreliable — note this in the comparison display (e.g., dim the first bar if calibrating). Alternatively, add a pre-discovery "warm-up" calibration minute — but this is NOT in scope per user decisions; just note the limitation.

**Warning signs:** All LF power values are 0 in comparison chart when starting Discovery with a fresh BLE connect.

### Pitfall 3: Multiple subscribe() Listeners Stacking on Re-Entry

**What goes wrong:** If the user starts Discovery, ends it early, and starts again, a second call to `subscribe('connected', handler)` registers a second listener. Both fire, causing double block transitions or double saves.

**Why it happens:** `subscribe()` in `state.js` only pushes — there is no deduplication. `unsubscribe()` requires the exact function reference.

**How to avoid:** Use module-level handler references (named functions, not anonymous arrows) so they can be unsubscribed. Call `unsubscribe()` in the controller's cleanup/stop function. Pattern:

```javascript
// Module-level reference — not anonymous
function _onConnectedChange(value) { ... }

// Start: register once
subscribe('connected', _onConnectedChange);

// Stop: always unsubscribe
unsubscribe('connected', _onConnectedChange);
```

### Pitfall 4: Auto-Start Session on BLE Connect (Phase 2 Leftover)

**What goes wrong:** `main.js` line 195 has `startSession()` called inside `subscribe('connected', value => { if (value) { startSession(); } })`. This fires on every BLE connect, which will conflict with Phase 4's explicit start flows.

**Why it happens:** Temporary Phase 2/3 scaffolding — SESSION.md note confirms "auto-starts on BLE connect (temporary; Phase 4 replaces)".

**How to avoid:** Remove or gate this subscriber at the start of Plan 04-01. Replace with: only start discovery/practice when the user explicitly clicks "Start Discovery" or "Start Session".

### Pitfall 5: startRendering() Called Before DOM Layout Completes

**What goes wrong:** `startRendering()` has a one-frame delay before calling `setupCanvas()` to let CSS flex layout compute. If the session-viz div is shown in the same frame as `startRendering()` is called, the canvas dimensions will be 0x0.

**Why it happens:** `display:none → flex` transitions do not update `clientWidth/clientHeight` synchronously.

**How to avoid:** The existing `requestAnimationFrame(() => _setupAllCanvases())` pattern in `renderer.js` already handles this. Just ensure the viz container's `display` is set BEFORE calling `startRendering()` — same as the current `startSession()` pattern (lines 33-35 in main.js).

### Pitfall 6: Practice Tab Canvas IDs Already Exist but are Incomplete

**What goes wrong:** The practice tab in `index.html` has `practice-waveform-canvas` and `practice-gauge-canvas` but no pacer canvas and no spectrum canvas. `startRendering()` takes 4 canvas arguments — passing `null` for spectrum canvas will cause a null-check pass-through in `stopRendering()` but may cause issues if `drawSpectrum()` is called without a null guard.

**Why it happens:** The HTML was scaffolded in Phase 3 with placeholder canvases, not the full set.

**How to avoid:** Add a `practice-pacer-canvas` to the practice tab. For spectrum: pass `null` and add a null guard in `drawSpectrum()` (or modify `startRendering()` to accept an options object with optional spectrum canvas). The CONTEXT.md decision "No spectrum chart during practice" means spectrum rendering should be skipped entirely for practice.

---

## Code Examples

### Switching Pacer Frequency Between Discovery Blocks

```javascript
// Source: js/audio.js (existing API) + js/state.js
// Stop, update frequency, restart — takes effect immediately
stopPacer();
AppState.pacingFreq = newFreqHz;  // e.g., 5.5 / 60 = 0.09167
startPacer(AppState.pacingFreq);
```

### Saving Discovery Results to IndexedDB

```javascript
// Source: js/storage.js saveSession() + setSetting()
// Save the resonance frequency choice
await setSetting('resonanceFreq', selectedHz);
AppState.savedResonanceFreq = selectedHz;

// Save the full discovery record for dashboard use later
await saveSession({
  mode: 'discovery',
  date: new Date().toISOString(),
  selectedFreqHz: selectedHz,
  blocks: _blockResults, // [{bpm, hz, rsaAmplitude, lfPower}]
});
```

### Saving a Practice Session with Coherence Trace

```javascript
// Source: js/storage.js saveSession()
const summary = computeSummary(elapsedSeconds);
await saveSession({
  mode: 'practice',
  date: new Date().toISOString(),
  durationSeconds: summary.durationSeconds,
  frequencyHz: AppState.pacingFreq,
  meanCoherence: summary.mean,
  peakCoherence: summary.peak,
  timeInHighSeconds: summary.timeInHigh,
  coherenceTrace: summary.trace,  // full array
});
```

### Rendering Session Summary DOM Section

```javascript
// Pure DOM — no library needed
function showPracticeSummary(summary) {
  const section = document.getElementById('practice-summary');
  section.innerHTML = `
    <div class="summary-grid">
      <div class="summary-metric">
        <span class="metric-value">${formatDuration(summary.durationSeconds)}</span>
        <span class="metric-label">Duration</span>
      </div>
      <div class="summary-metric">
        <span class="metric-value">${summary.mean}</span>
        <span class="metric-label">Mean Coherence</span>
      </div>
      <div class="summary-metric">
        <span class="metric-value">${summary.peak}</span>
        <span class="metric-label">Peak Coherence</span>
      </div>
      <div class="summary-metric">
        <span class="metric-value">${formatDuration(summary.timeInHigh)}</span>
        <span class="metric-label">Time Locked In</span>
      </div>
    </div>
  `;
  section.classList.remove('hidden');
}
```

### Removing the Phase 2 Auto-Start Subscriber

```javascript
// js/main.js — replace current auto-start block with this:
subscribe('connected', value => {
  if (value) {
    AppState.connectionUptime = 0;
    startUptimeTimer();
    // Phase 4: do NOT auto-start session — sessions start via explicit user action
  } else {
    stopUptimeTimer();
    // Notify active session controller of disconnect
    DiscoveryController.onDisconnect?.();
    PracticeController.onDisconnect?.();
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Auto-start session on BLE connect | Explicit user-initiated session start | Phase 4 (this phase) | Enables distinct Discovery vs Practice flows |
| Single `startSession()` / `stopSession()` in main.js | Dedicated `DiscoveryController` and `PracticeController` modules | Phase 4 (this phase) | Separates concerns, prevents main.js growth |
| Elapsed timer only (`_sessionDuration = 0`) | Countdown timer for practice, per-block elapsed for discovery | Phase 4 (this phase) | `startRendering()` already supports both modes via `sessionDuration` param |

**Deprecated/outdated in this codebase:**
- `startSession()` / `stopSession()` in `main.js`: These become internal helpers or are absorbed into the controllers. The current implementations are discovery-specific (reference `#tab-discovery` DOM IDs).
- Placeholder practice tab HTML (`session-viz-practice` div with `display:none`): Needs canvases for pacer and a proper layout matching the session design.

---

## Open Questions

1. **DSP calibration during Discovery first block**
   - What we know: `tick()` returns without computing LF power for the first 120 seconds. Block 1 is exactly 120 seconds.
   - What's unclear: Will block 1's LF power snapshot always be 0, or will it have exactly enough data if DSP was initialized at session start?
   - Recommendation: Initialize DSP before the 3-2-1 countdown (not at block start). The ~5 seconds of countdown + 120 seconds of block 1 gives 125 seconds total — just enough for the calibration window. Display block 1's LF power but note it as "early estimate" if calibrating flag is still true.

2. **Practice tab canvas layout**
   - What we know: HTML has `practice-waveform-canvas` and `practice-gauge-canvas` but not a pacer canvas.
   - What's unclear: Whether to add a third canvas for the breathing circle or reuse/overlay.
   - Recommendation: Add `practice-pacer-canvas` to the practice tab. The existing layered layout pattern (pacer-bg + pacer-circle + pacer-gauge) works well — replicate it in the practice tab HTML.

3. **Coherence gauge opacity in practice mode**
   - What we know: CONTEXT.md says "very subtle (small, low opacity)" — Claude's discretion.
   - What's unclear: Whether to pass an opacity parameter to the renderer or just use CSS/globalAlpha.
   - Recommendation: Simplest approach is CSS `opacity: 0.45` on the `pacer-gauge` container in practice mode. No renderer changes needed. The `drawCoherenceGauge()` function already draws at full alpha internally — the container opacity creates the subtle effect.

---

## Integration Checklist for Planner

The planner should ensure the following are addressed across the two plans:

**Plan 04-01 (Discovery):**
- [ ] Remove auto-start on BLE connect from `main.js`
- [ ] Add `AppState.discoveryResults` field to `state.js` (or keep results in module state — fine either way)
- [ ] Add "Start Discovery" button to discovery placeholder
- [ ] 3-2-1 countdown before first block (HTML overlay)
- [ ] 5-block state machine with per-block `setTimeout`
- [ ] Inter-block pause UI (4s countdown, next rate preview)
- [ ] Breathing rate label near circle during each block
- [ ] Per-block RSA + LF power capture at block end
- [ ] Comparison bar chart canvas (clickable)
- [ ] Auto-select best frequency, show "Recommended"
- [ ] Confirm button → `setSetting` + `AppState.savedResonanceFreq`
- [ ] Save discovery session record to IndexedDB

**Plan 04-02 (Practice):**
- [ ] Practice tab HTML — add pacer canvas, frequency display, duration picker, "Start Session" button
- [ ] Load `savedResonanceFreq` on init (already done in `init()` — just need to display it)
- [ ] Duration picker (10/15/20/30 min buttons — Claude's discretion)
- [ ] Session start: `startRendering()` with `sessionDuration` in seconds
- [ ] Coherence trace collection in DSP interval
- [ ] Chime at timer 0:00 via `playChime()` in audio.js
- [ ] Session continues after chime until user clicks "End Session"
- [ ] Session summary DOM section (4 metrics)
- [ ] Save practice session to IndexedDB with full trace
- [ ] BLE disconnect mid-session: pause/resume/save-partial handling

---

## Sources

### Primary (HIGH confidence)
- `js/main.js` (read directly) — session management pattern, existing event wiring, auto-start on connect
- `js/state.js` (read directly) — AppState schema, subscribe/unsubscribe API
- `js/dsp.js` (read directly) — `getHRArray()`, `computeRSAAmplitude()`, `tick()`, calibration gate behavior
- `js/renderer.js` (read directly) — `startRendering()` API, `_sessionDuration` countdown mode, canvas management
- `js/audio.js` (read directly) — `startPacer()`, `stopPacer()`, `_scheduleBowlCue()`, scheduler architecture
- `js/storage.js` (read directly) — `saveSession()`, `getSetting()`, `setSetting()` APIs
- `index.html` (read directly) — existing canvas IDs, tab structure, practice tab placeholder HTML
- `.planning/phases/04-session-modes/04-CONTEXT.md` (read directly) — locked decisions, UX specifications

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — accumulated project decisions cross-referenced with code
- `.planning/phases/03-breathing-pacer/03-02-SUMMARY.md` — confirmed working state of Phase 3 deliverables

### Tertiary (LOW confidence)
- None — all findings verified directly from source code

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all modules read directly; no external libraries needed
- Architecture patterns: HIGH — patterns derived directly from existing code conventions
- Pitfalls: HIGH — identified by reading actual implementation details (buffer mechanics, subscriber pattern, auto-start leftover)
- Integration checklist: HIGH — derived from direct reading of CONTEXT.md and all source files

**Research date:** 2026-03-22
**Valid until:** 2026-04-21 (stable codebase; no external library churn)
