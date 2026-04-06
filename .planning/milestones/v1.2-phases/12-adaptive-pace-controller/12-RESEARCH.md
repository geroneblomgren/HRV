# Phase 12: Adaptive Pace Controller - Research

**Researched:** 2026-04-04
**Domain:** Real-time closed-loop audio scheduler frequency control + PSD-based user rhythm detection + Canvas badge rendering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Adjustment feel**
- Pace changes should be subtly felt — the bowl echo timing drifts naturally
- A persistent BPM badge sits inside the pacer circle, always visible during practice
- Badge shows current BPM from session start (initially the tuned frequency, updates as controller adjusts)
- Badge is always visible (not just on drift) — gives user confidence the system is tracking their pace

**Trigger behavior**
- Trigger threshold: phase lock below 50 for >10 seconds (per PACE-01 spec)
- Max adjustment rate: ±0.01 Hz per 30 seconds (~±0.6 BPM/min)
- Adjustments happen every DSP tick (1 second) with tiny increments (~0.00033 Hz per tick)
- Pause on uptrend: if phase lock is rising (even if below 50), hold current pace — don't interfere while user is catching up
- Resume adjusting only when lock plateaus or drops again

**Direction intelligence**
- Detect user's actual breathing frequency from the existing PSD peak in the LF band (0.04-0.15 Hz)
- Drift toward the user's detected rhythm, not blind sweep
- PSD peak detection available after 120s coherence calibration gate
- Before 120s: no pace adjustment (controller inactive during calibration)
- If user's detected rhythm is outside ±0.5 BPM bound: drift to the nearest bound edge
- BPM badge turns amber (from teal) when clamped at bound edge and user's rhythm is still further away

**Recovery behavior**
- When phase lock recovers above 50, stay at whatever frequency achieved lock — do NOT creep back to tuned frequency
- The tuned frequency is a starting point, not a fixed target
- On second or subsequent dips: continue adjusting from current position (no reset, no cooldown)
- Cumulative adjustments always within ±0.5 BPM hard bound from tuned frequency

**Session summary and persistence**
- Summary card shows "Pace: tuned X.X → settled X.X" with arrow notation
- IndexedDB stores the full pace trace (frequency per second) for future dashboard visualization
- Session record includes `tunedBPM`, `settledBPM`, and `paceTrace` fields

### Claude's Discretion
- Audio scheduler architecture for mid-session frequency changes (current `startPacer` uses a fixed halfPeriod closure — needs dynamic update path)
- Exact PSD peak detection logic (findPeakBin already exists in dsp.js)
- Smoothing/debouncing of detected user rhythm to avoid chasing noise
- Exact amber color value for the bound-edge warning badge

### Deferred Ideas (OUT OF SCOPE)
- Dashboard visualization of pace trace over sessions — Phase 13 or future
- Continuous background RF tracking during sessions (ATUNE-01) — future requirement
- Adaptive ramp rate (start gentle, accelerate if lock stays low) — could revisit if gentle fixed rate feels too slow
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PACE-01 | When phase lock is below threshold for >10 seconds, pace controller begins micro-adjusting breathing rate | Controller runs in DSP tick; needs 10-second counter that checks phaseLockScore < 50 before activating |
| PACE-02 | Pace adjustments are smooth and imperceptible (max ±0.01 Hz per 30 seconds) | ~0.00033 Hz per 1-second tick; audio.js scheduler must read `AppState.pacingFreq` dynamically each tick loop iteration instead of closing over fixed halfPeriod |
| PACE-03 | Pace never adjusts more than ±0.5 BPM from tuned frequency | Hard clamp: ±0.5/60 Hz from `tunedFreqHz` stored at session start |
| PACE-04 | Bowl echo timing shifts naturally with pace changes | Achieved automatically once scheduler reads `AppState.pacingFreq` dynamically — halfPeriod recalculates every 25ms scheduler tick |
</phase_requirements>

---

## Summary

Phase 12 has two clearly separable sub-problems: (1) modifying the audio scheduler so it reads a dynamic frequency rather than closing over a fixed value, and (2) implementing controller logic that decides when and how much to adjust `AppState.pacingFreq` each DSP tick. Both are straightforward given the codebase's existing architecture.

The audio change is the riskier of the two. Currently `_schedulerTick(halfPeriod)` is a recursive `setTimeout` loop where `halfPeriod` is captured in the closure at `startPacer` time. Making it dynamic requires the scheduler to re-derive `halfPeriod` from `AppState.pacingFreq` at the start of each 25ms loop iteration — not from a stored parameter. This is a one-line conceptual change but must be done carefully to avoid drift artifacts (a currently-scheduled cue uses the halfPeriod that was active when it was scheduled, so mid-breath frequency changes must carry through on the *next* scheduled cue, not retroactively adjust a cue already in the pre-schedule window).

The controller logic lives entirely in a new `paceController.js` module, called from `practice.js`'s DSP tick. It tracks how long phase lock has been below 50, detects the user's current breathing rate from the PSD peak (after the 120s coherence calibration gate), applies a per-tick Hz increment toward that detected rhythm bounded by ±0.5 BPM from tuned frequency, and writes the result back to `AppState.pacingFreq`. The BPM badge is a small addition to `drawBreathingCircle()` in `renderer.js` — teal by default, amber when clamped.

The session persistence additions are minimal: store `tunedBPM`, `settledBPM`, and `paceTrace` alongside the existing session fields in `_saveSession()`.

**Primary recommendation:** Make the audio scheduler dynamic first (isolated change, verifiable by ear immediately), then wire in the controller logic, then add the badge.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API | Browser native | Lookahead audio scheduler | Already in use (audio.js) — no additional dependencies |
| Canvas 2D | Browser native | BPM badge rendering inside pacer circle | Already in use (renderer.js drawBreathingCircle) |
| FFT.js | CDN (node_modules/fft.js) | PSD computation for user rhythm detection | Already initialized and used in dsp.js — same instance |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| idb v8 | CDN (storage.js) | Persist paceTrace to IndexedDB | Already used for session persistence — extend existing saveSession call |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dynamic re-read of AppState.pacingFreq in scheduler | Expose `updatePacingFreq(hz)` that restarts scheduler | Restart causes audible gap; dynamic read is seamless |
| New paceController.js module | Inline controller in practice.js | Module is cleaner, testable in isolation |
| PSD peak from spectralBuffer | Re-compute tachogram in controller | spectralBuffer is already computed and stored each tick after 120s — free to read |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure
```
js/
├── audio.js          # MODIFY: scheduler reads pacingFreq dynamically
├── paceController.js # NEW: controller logic (create this module)
├── practice.js       # MODIFY: initialize controller, call tick, save paceTrace
├── renderer.js       # MODIFY: BPM badge in drawBreathingCircle
└── state.js          # MODIFY: add pacingFreqTuned, paceControllerActive fields
```

### Pattern 1: Dynamic halfPeriod in Audio Scheduler

**What:** Change `_schedulerTick(halfPeriod)` from a closure-captured parameter to a live read of `AppState.pacingFreq` each iteration.

**When to use:** Required for PACE-04 — echo timing shifts automatically when pacingFreq changes.

**Current code (audio.js line 99-108):**
```javascript
// BEFORE — halfPeriod is closed over at startPacer() time, never changes
function _schedulerTick(halfPeriod) {
  while (_nextCueTime < _ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    _scheduleCue(_nextCueTime, _nextPhase, halfPeriod);
    AppState.nextCueTime = _nextCueTime;
    AppState.nextCuePhase = _nextPhase;
    _nextCueTime += halfPeriod;
    _nextPhase = _nextPhase === 'inhale' ? 'exhale' : 'inhale';
  }
  _schedulerTimer = setTimeout(() => _schedulerTick(halfPeriod), LOOKAHEAD_MS);
}
```

**After (reads live frequency each tick):**
```javascript
// AFTER — derives halfPeriod from AppState.pacingFreq at each scheduler loop
function _schedulerTick() {
  const halfPeriod = 1 / (AppState.pacingFreq * 2);  // live read
  while (_nextCueTime < _ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    _scheduleCue(_nextCueTime, _nextPhase, halfPeriod);
    AppState.nextCueTime = _nextCueTime;
    AppState.nextCuePhase = _nextPhase;
    _nextCueTime += halfPeriod;
    _nextPhase = _nextPhase === 'inhale' ? 'exhale' : 'inhale';
  }
  _schedulerTimer = setTimeout(_schedulerTick, LOOKAHEAD_MS);
}
```

**Critical detail:** The `halfPeriod` is sampled once per 25ms scheduler tick and applied uniformly to all cues scheduled in that window. A frequency change during a half-breath silently takes effect on the *next* cue, which is exactly what we want — no retroactive correction of cues already enqueued.

`startPacer` must also be updated to not pass `halfPeriod`:
```javascript
export function startPacer(pacingFreqHz) {
  if (!_ctx) return;
  AppState.pacingFreq = pacingFreqHz;  // set before first tick
  _nextCueTime = _ctx.currentTime + 0.1;
  _nextPhase = 'inhale';
  AppState.pacerEpoch = _nextCueTime;
  _schedulerTick();  // no parameter
}
```

### Pattern 2: Pace Controller Module (paceController.js)

**What:** A stateful module that tracks trigger conditions and computes the next `pacingFreq` each DSP tick.

**When to use:** Called from practice.js DSP tick after `tick()` and after coherence calibration gate (120s).

```javascript
// js/paceController.js
import { AppState } from './state.js';
import { binToHz, hzToBin, integrateBand } from './dsp.js';

const TRIGGER_THRESHOLD = 50;       // phase lock below this triggers adjustment
const TRIGGER_SECONDS = 10;         // seconds below threshold before activating
const MAX_RATE_HZ = 0.01 / 30;     // max Hz change per second (~0.00033 Hz/tick)
const MAX_OFFSET_BPM = 0.5;        // hard bound: ±0.5 BPM from tuned frequency
const SMOOTHING_WINDOW = 5;        // seconds of PSD peak readings to median-smooth

let _tunedFreqHz = 0;              // set at session start, never changes
let _belowThresholdSec = 0;        // counter: consecutive seconds below threshold
let _prevPhaseLockScore = 0;       // for uptrend detection
let _userFreqHistory = [];         // circular buffer for PSD peak smoothing
let _active = false;

export function initPaceController(tunedFreqHz) {
  _tunedFreqHz = tunedFreqHz;
  _belowThresholdSec = 0;
  _prevPhaseLockScore = 0;
  _userFreqHistory = [];
  _active = false;
  AppState.paceControllerActive = false;
}

export function paceControllerTick(sessionElapsedSec) {
  // Guard: inactive before 120s calibration gate
  if (sessionElapsedSec < 120) return;

  const currentScore = AppState.phaseLockScore;
  const isRising = currentScore > _prevPhaseLockScore;
  _prevPhaseLockScore = currentScore;

  if (currentScore >= TRIGGER_THRESHOLD) {
    // Lock recovered — reset trigger counter, keep current frequency
    _belowThresholdSec = 0;
    _active = false;
    AppState.paceControllerActive = false;
    return;
  }

  // Below threshold — but pause if score is rising (user is catching up)
  if (isRising) return;

  _belowThresholdSec++;

  if (_belowThresholdSec < TRIGGER_SECONDS) return;

  // Activated: detect user's breathing rhythm from PSD
  const psd = AppState.spectralBuffer;
  if (!psd) return;

  const peakBin = _findPSDPeak(psd);
  const detectedHz = binToHz(peakBin);

  // Debounce: store reading, use median of last N seconds
  _userFreqHistory.push(detectedHz);
  if (_userFreqHistory.length > SMOOTHING_WINDOW) _userFreqHistory.shift();
  const smoothedUserHz = _median(_userFreqHistory);

  // Current frequency and hard bounds
  const currentHz = AppState.pacingFreq;
  const maxHz = _tunedFreqHz + MAX_OFFSET_BPM / 60;
  const minHz = _tunedFreqHz - MAX_OFFSET_BPM / 60;

  // Direction: toward user's detected rhythm
  let targetHz = smoothedUserHz;
  let clamped = false;
  if (targetHz > maxHz) { targetHz = maxHz; clamped = true; }
  if (targetHz < minHz) { targetHz = minHz; clamped = true; }

  // Step toward target by MAX_RATE_HZ
  const delta = targetHz - currentHz;
  const step = Math.sign(delta) * Math.min(Math.abs(delta), MAX_RATE_HZ);
  const newHz = currentHz + step;

  // Write new frequency (audio scheduler and phaseLock pick it up automatically)
  AppState.pacingFreq = newHz;
  AppState.paceControllerActive = true;
  AppState.pacerAtBound = clamped && Math.abs(smoothedUserHz - newHz) > MAX_RATE_HZ;
}

function _findPSDPeak(psd) {
  const lowBin = hzToBin(0.04);
  const highBin = Math.min(psd.length - 1, hzToBin(0.15));
  let maxVal = -1, maxBin = lowBin;
  for (let i = lowBin; i <= highBin; i++) {
    if (psd[i] > maxVal) { maxVal = psd[i]; maxBin = i; }
  }
  return maxBin;
}

function _median(arr) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
```

### Pattern 3: BPM Badge in drawBreathingCircle (renderer.js)

**What:** Always-visible badge inside the pacer circle showing current BPM. Teal when tracking freely, amber when clamped at bound edge.

**When to use:** Added at the bottom of `drawBreathingCircle()`, after the existing Inhale/Exhale label and timer.

```javascript
// Inside drawBreathingCircle(), after the timer text block

// BPM badge — always visible during practice sessions
if (AppState.sessionPhase === 'practice') {
  const bpm = (AppState.pacingFreq * 60).toFixed(1);
  const isAtBound = AppState.pacerAtBound;

  // Badge colors: teal (normal) or amber (clamped at boundary)
  const badgeColor = isAtBound ? '#f59e0b' : '#14b8a6';  // amber : teal
  const badgeFontSize = Math.round(dim * 0.055);

  ctx.font = `bold ${badgeFontSize}px monospace`;
  ctx.fillStyle = badgeColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${bpm}`, cx, cy + dim * 0.13);
}
```

**Note:** The amber hex `#f59e0b` (Tailwind amber-400) harmonizes with the existing zone color palette (`#ef4444` red, `#eab308` yellow, `#22c55e` green). Exact value is Claude's discretion per CONTEXT.md.

### Pattern 4: Pace Trace Collection and Session Persistence

**What:** Collect `AppState.pacingFreq` each DSP tick; extend `_saveSession()` to store trace.

**In practice.js DSP tick interval (line 196+):**
```javascript
// Existing lines...
_phaseLockTrace.push(AppState.phaseLockScore);
// Add:
_paceTrace.push(AppState.pacingFreq);  // Hz per second
```

**In `_computeSummary()`:**
```javascript
const tunedBPM = _tunedFreqHz * 60;
const settledBPM = (_paceTrace.length > 0
  ? _paceTrace[_paceTrace.length - 1]
  : AppState.pacingFreq) * 60;
```

**In `_saveSession()`, add to the session object:**
```javascript
tunedBPM: AppState.tuningSelectedFreqBPM,
settledBPM: (AppState.pacingFreq * 60),
paceTrace: _paceTrace,  // array of Hz values, 1 per second
```

**In `_showSummary()`**, add a pace line to the summary card:
```javascript
// "Pace: 5.0 → 4.8 BPM" (only if pace actually changed)
const paceEl = _getEl('summary-pace');
if (paceEl && Math.abs(summary.settledBPM - summary.tunedBPM) >= 0.05) {
  paceEl.textContent = `Pace: ${summary.tunedBPM.toFixed(1)} → ${summary.settledBPM.toFixed(1)} BPM`;
  _show(paceEl);
}
```

### Pattern 5: AppState Fields to Add (state.js)

The following new fields are needed. Add to the state object:

```javascript
// Adaptive Pace Controller (Phase 12)
pacingFreqTuned: 0,         // Hz — set at session start, never changes during session
paceControllerActive: false, // true when controller is making adjustments
pacerAtBound: false,        // true when clamped at ±0.5 BPM boundary (badge turns amber)
```

**Note:** `pacingFreqTuned` is the ground truth for the ±0.5 BPM hard bound. It must be written once in `startPractice()` immediately after tuning completes, and never touched again during the session.

### Anti-Patterns to Avoid

- **Anti-pattern — frequency jump on reconnect:** `onDisconnect()` in practice.js calls `startPacer(AppState.pacingFreq)` on reconnect. Since `pacingFreq` may have drifted, this is correct — it resumes at the current (drifted) frequency. Do NOT reset `pacingFreq` to `pacingFreqTuned` on reconnect.
- **Anti-pattern — adjusting during uptrend:** Controller must pause if `phaseLockScore > prevScore` even if still below 50. A rising score means the user is self-correcting — interference would fight their progress.
- **Anti-pattern — re-computing PSD in controller:** `AppState.spectralBuffer` already holds the freshly computed PSD from `dsp.js tick()`. Reading it in the controller is free. Don't call `computeSpectralRSA()` or `buildEvenlySpacedTachogram()` again.
- **Anti-pattern — restarting the scheduler to change frequency:** Calling `stopPacer()` + `startPacer()` causes a silent gap and resets `pacerEpoch`, which breaks phase lock scoring. The dynamic scheduler read (Pattern 1) avoids this entirely.
- **Anti-pattern — adjusting before 120s calibration gate:** `AppState.spectralBuffer` is null before 120s. Guard: `if (!AppState.spectralBuffer) return;` in controller tick.
- **Anti-pattern — storing paceTrace as Float64Array in IndexedDB:** IndexedDB serializes typed arrays correctly, but Phase 13 will want to iterate them as plain numbers. Store as a plain JS `Array` or convert with `Array.from()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PSD peak detection | Custom peak finder in controller | `findPeakBin` pattern already in dsp.js (copy/inline — it's 10 lines) | Edge cases: multiple peaks, bin boundary, power below noise floor already handled |
| Hz-to-BPM conversion | Custom formula | `hz * 60` / `bpm / 60` | Trivial but must be consistent throughout |
| Median smoothing | Complex rolling average | Simple sort-and-pick-middle on a 5-element array | Median is more robust than mean for outlier PSD peak readings |
| Audio scheduling | New WebAudioAPI setup | Existing `_schedulerTick` modified in-place | AudioContext creation must happen in user gesture; don't create a second one |

**Key insight:** The entire controller is pure arithmetic — no new APIs, no new libraries. The complexity is in getting the integration seams right (scheduler reads live freq, controller reads live PSD, badge reads live AppState).

---

## Common Pitfalls

### Pitfall 1: Phase Lock Score Invalidated by Frequency Change
**What goes wrong:** When `pacingFreq` changes, `computePhaseLockScore()` in phaseLock.js continues to read `AppState.pacingFreq` every tick (line 438 of dsp.js: `computePhaseLockScore(30, AppState.pacingFreq, sessionElapsedSeconds)`). The pacer phase reference in phaseLock.js line 161 is `2 * Math.PI * pacingFreqHz * windowStartSec`. If `pacingFreq` changes mid-window, the reference phase is computed at the *new* frequency but the HR tachogram data spans the *old* frequency. This creates a transient phase error spike for ~30 seconds (the PLV window duration).
**Why it happens:** PLV uses a 30-second window. A frequency change mid-window means the reference phase doesn't match the HR phase from the first portion of the window.
**How to avoid:** Accept the 30-second transient degradation as expected behavior. Alternatively, the controller's "pause on uptrend" logic will help — if PLV temporarily drops after a frequency step, that's a real signal that the step needs time to integrate. The 10-second trigger delay provides natural hysteresis.
**Warning signs:** PLV drops immediately after a frequency step, then recovers. This is correct behavior, not a bug.

### Pitfall 2: Badge Position Conflict with Timer Text
**What goes wrong:** `drawBreathingCircle()` already draws Inhale/Exhale at `cy - dim*0.03` and the countdown timer at `cy + dim*0.04`. A BPM badge naively placed at `cy + dim*0.04` would overlap the timer.
**Why it happens:** The pacer circle has limited vertical space; three text elements need to coexist.
**How to avoid:** Place the BPM badge at `cy + dim * 0.13` (below the timer). At typical canvas sizes (~200px diameter) this positions it near the lower interior of the circle. Verify visually at small canvas sizes (mobile).

### Pitfall 3: Frequency Drift After Session End
**What goes wrong:** `stopPractice()` calls `stopPacer()` but does not reset `AppState.pacingFreq`. If the next session uses the drifted `pacingFreq` as a starting value, the controller bounds check (`_tunedFreqHz ± 0.5 BPM`) will misbehave.
**Why it happens:** `AppState.pacingFreq` is a persistent in-memory value, not reset between sessions.
**How to avoid:** `stopPractice()` does NOT need to reset `pacingFreq` (it's overwritten at the start of every session with the tuning result). But `initPaceController(tunedFreqHz)` must set both `_tunedFreqHz` AND ensure `AppState.pacingFreq` starts at the tuned value before the first controller tick runs. This is already handled by `AppState.pacingFreq = result.freqHz` in `startPractice()` at line 155.

### Pitfall 4: PSD Peak in Wrong Band During Low-Coherence Periods
**What goes wrong:** When phase lock is low (the exact condition that triggers the controller), the LF band peak may not represent the user's actual breathing rate — it may be a noise peak or the dominant peak may have shifted.
**Why it happens:** Low coherence = low RSA power = PSD is noisy. `findPeakBin(psd, 0.04, 0.15)` returns the highest bin regardless of power.
**How to avoid:** Add a power guard: if `integrateBand(psd, detectedHz - 0.01, detectedHz + 0.01)` is below a minimum threshold (e.g., 5% of `integrateBand(psd, 0.04, 0.15)`), skip this tick's detection reading rather than poisoning the median buffer. The 5-sample median smoothing also protects against isolated noise spikes.

### Pitfall 5: _schedulerTick Recursion Depth / Stack Overflow Risk
**What goes wrong:** Making `_schedulerTick` parameter-free and using `setTimeout(_schedulerTick, LOOKAHEAD_MS)` without arguments is correct. The potential issue is if `SCHEDULE_AHEAD_SEC` is large relative to the current `halfPeriod` — the inner `while` loop schedules many cues. At very low BPMs (near 4.5 BPM, halfPeriod ~6.7s) with SCHEDULE_AHEAD_SEC=0.1, only 0-1 cues are scheduled per tick. No stack risk.
**How to avoid:** No change needed — existing constants are safe.

---

## Code Examples

Verified patterns from existing codebase:

### Finding PSD Peak (from dsp.js findPeakBin — private function, same logic to use in controller)
```javascript
// Source: js/dsp.js lines 218-230
function findPeakBin(psd, lowHz, highHz) {
  const lowBin = Math.max(0, hzToBin(lowHz));
  const highBin = Math.min(psd.length - 1, hzToBin(highHz));
  let maxVal = -1;
  let maxBin = lowBin;
  for (let i = lowBin; i <= highBin; i++) {
    if (psd[i] > maxVal) {
      maxVal = psd[i];
      maxBin = i;
    }
  }
  return maxBin;
}
```
**Note:** `findPeakBin` is currently a private (unexported) function. Either export it from dsp.js or copy the logic directly into paceController.js. Given the module is small, copying is simpler and avoids widening dsp.js's public API.

### Writing AppState.pacingFreq (triggers audio scheduler dynamically)
```javascript
// Source: js/state.js — Proxy set trap notifies all subscribers
// Writing pacingFreq triggers any subscribe('pacingFreq', fn) listeners.
// The audio scheduler reads it on the NEXT 25ms setTimeout tick — no listeners needed.
AppState.pacingFreq = newHz;
// Effect: next _schedulerTick() will derive halfPeriod = 1 / (newHz * 2)
// Result: echo spacing changes on next scheduled cue
```

### Existing Badge Pattern (PPG badge in renderer.js lines 520-549)
The existing PPG confidence badge uses rounded rect + centered text. The BPM badge can follow the exact same structure:
```javascript
// Source: js/renderer.js lines 520-549 — reference pattern for badge rendering
// Rounded rect background: ctx.fillStyle = 'rgba(255,255,255,0.1)'; + arcTo path
// Badge text: ctx.fillStyle = badgeColor; ctx.fillText(text, cx, badgeY + badgeH / 2);
```
For the BPM badge, a simpler approach (no rounded rect background) is appropriate — just colored text — since it's informational, not a warning pill.

### DSP Tick Integration Point (practice.js line 196)
```javascript
// Source: js/practice.js lines 196-211
_dspInterval = setInterval(() => {
  const elapsed = (Date.now() - _sessionStart) / 1000;
  tick(elapsed);
  // ADD: paceControllerTick(elapsed);  ← insert here, AFTER tick()
  _phaseLockTrace.push(AppState.phaseLockScore);
  // ADD: _paceTrace.push(AppState.pacingFreq);
  ...
}, 1000);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed halfPeriod closure in scheduler | Dynamic live read of AppState.pacingFreq | Phase 12 (this phase) | Enables smooth mid-session pace changes without scheduler restart |
| No pace controller | Closed-loop controller checking PLV and PSD | Phase 12 (this phase) | App actively adapts to user's natural rhythm |

---

## Open Questions

1. **PSD peak reliability during low-coherence periods**
   - What we know: `spectralBuffer` is computed once per second after 120s gate; `findPeakBin` returns the highest bin unconditionally
   - What's unclear: At what power threshold is the PSD peak "trustworthy"? Unclear without testing on real session data
   - Recommendation: Implement the 5% relative power guard as described in Pitfall 4; tune the threshold after first real-world test

2. **Summary UI — where to place "Pace: X.X → X.X BPM" line**
   - What we know: The summary card currently has 4 metric tiles (Duration, Mean, Peak, Locked In)
   - What's unclear: Whether pace summary deserves a tile or a text line below the tiles
   - Recommendation: Simple text line below the existing tiles (no new tile) — matches the "always visible but not prominent" principle from the UX intent

3. **Phase lock transient after frequency step (Pitfall 1)**
   - What we know: PLV window is 30s; a mid-window frequency change will create up to 30s of degraded PLV
   - What's unclear: Whether this self-reinforcing loop (low lock → step → lower lock → more steps) causes the controller to over-adjust
   - Recommendation: The trigger delay (10s) + uptrend pause + ±0.5 BPM bound together should prevent runaway. If testing shows oscillation, reduce MAX_RATE_HZ from 0.01/30 to 0.005/30 as a fallback.

---

## Validation Architecture

> workflow.nyquist_validation not present in config.json — skipping formal test framework section.

**Manual verification approach (aligned with project pattern):**

| Req ID | How to Verify |
|--------|--------------|
| PACE-01 | Open DevTools, watch `AppState.paceControllerActive` and `AppState.pacingFreq` in console. Confirm no changes within first 120s. Confirm changes begin when phase lock drops below 50 for >10s. |
| PACE-02 | Log `AppState.pacingFreq` every second. Confirm delta per tick is ≤ 0.00033 Hz. Check that 30 seconds of adjustments never exceed 0.01 Hz total movement. |
| PACE-03 | Run a full session. Confirm `AppState.pacingFreq` never exceeds `tunedFreqHz ± 0.5/60`. |
| PACE-04 | Listen with headphones. Echo spacing should shift gradually. No click, pop, or abrupt interval jump. |

---

## Sources

### Primary (HIGH confidence)
- Direct codebase reads — js/audio.js, js/practice.js, js/dsp.js, js/phaseLock.js, js/renderer.js, js/state.js, js/storage.js — all integration points verified from source
- .planning/phases/12-adaptive-pace-controller/12-CONTEXT.md — locked decisions and discretion areas

### Secondary (MEDIUM confidence)
- Web Audio API spec (MDN) — behavior of scheduled audio events: cues already in the `SCHEDULE_AHEAD_SEC` window are committed to the audio timeline and cannot be retroactively changed. This confirms the "next cue picks up new halfPeriod" behavior described in Pattern 1.

### Tertiary (LOW confidence)
- General PLV literature on phase tracking stability with non-stationary signals — supports the 30-second transient degradation estimate in Pitfall 1, but exact duration depends on real user data.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all integrations directly read from source
- Architecture: HIGH — patterns derived from direct code inspection; audio scheduler behavior verified by reading the actual closure structure
- Pitfalls: MEDIUM — PLV transient (Pitfall 1) and PSD peak reliability (Pitfall 4) are theoretical risks not yet verified on live data; all others are verified from code

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable codebase — no fast-moving dependencies)
