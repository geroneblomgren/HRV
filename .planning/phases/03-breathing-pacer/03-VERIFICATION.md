---
phase: 03-breathing-pacer
verified: 2026-03-21T00:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Connect HRM and run a 2+ minute session. Switch audio styles mid-session."
    expected: "Circle expands/contracts smoothly with teal glow. Inhale/Exhale label fades on transition. Timer counts up. Switching Pitch/Swell/Bowl takes effect immediately without any restart or glitch. Volume slider adjusts gain smoothly. End Session returns to idle."
    why_human: "Audio synthesis quality, visual smoothness, and style-switch imperceptibility cannot be verified programmatically."
  - test: "Let a session run for 20 minutes without interaction."
    expected: "Circle and audio cues stay in sync — no perceptible drift between visual circle phase and bowl/pitch/swell audio cues."
    why_human: "Drift over extended sessions requires live observation; AudioContext.currentTime drift cannot be simulated via grep."
---

# Phase 3: Breathing Pacer Verification Report

**Phase Goal:** The app can guide a breathing session with precise, drift-free audio and visual cues at any configurable breathing rate, with all three audio styles switchable mid-session.
**Verified:** 2026-03-21
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Pitch style: sine wave rising 220-350 Hz on inhale, falling on exhale, smooth gain envelopes | VERIFIED | `js/audio.js` lines 115-137: `startFreq`/`endFreq` per phase, `linearRampToValueAtTime` gain envelope |
| 2  | Swell style: constant pitch (240 Hz) with volume swelling on inhale, fading on exhale | VERIFIED | `js/audio.js` lines 141-162: `peak` varies by phase (0.8 inhale, 0.5 exhale), linearRamp up/down |
| 3  | Bowl style: warm strike tone with fast attack and long decay at each half-cycle transition | VERIFIED | `js/audio.js` lines 166-193: two detuned oscillators (freq*1.005), 30ms strike + `setTargetAtTime(0.001, t+0.03, 1.0)` decay |
| 4  | Switching style mid-session takes effect on next cue without restarting scheduler | VERIFIED | `js/audio.js` line 65-67: `setStyle()` sets `_currentStyle`; `_scheduleCue()` dispatches on `_currentStyle` each call |
| 5  | Lookahead scheduler is drift-free (25ms setTimeout + 100ms ahead on AudioContext.currentTime) | VERIFIED | `js/audio.js` lines 16-17: `LOOKAHEAD_MS=25`, `SCHEDULE_AHEAD_SEC=0.1`; scheduler loop at lines 88-97 |
| 6  | Visual circle expands on inhale, contracts on exhale, timed to breathing rate | VERIFIED | `js/renderer.js` lines 480-491: cosine-driven `expansion = (1-cos(phase*2π))/2` on `audioTime % fullPeriod` |
| 7  | Circle uses smooth (non-linear) easing | VERIFIED | `js/renderer.js` line 485: `Math.cos` produces smooth sinusoidal motion (deviation from plan's smoothstep — documented intentional change) |
| 8  | Inhale/Exhale label displays inside circle with opacity fade on phase change | VERIFIED | `js/renderer.js` lines 508-519: `_labelOpacity` set to 0.3 on phase change, lerped to 1.0 at +0.04/frame |
| 9  | Session timer in mm:ss inside circle | VERIFIED | `js/renderer.js` lines 522-541: elapsed timer (sessionDuration=0 → elapsed mode) formatted as `${mins}:${secs}` |
| 10 | Three audio style buttons (Pitch/Swell/Bowl) and volume slider visible in UI | VERIFIED | `index.html` lines 53-62: three `.style-btn` elements with `data-style`; `#volume-slider` present |
| 11 | Style buttons and volume slider wired to AudioEngine | VERIFIED | `js/main.js` lines 262-272: `setStyle(btn.dataset.style)` and `setVolume(e.target.value / 100)` |
| 12 | End Session button stops pacer and returns to idle | VERIFIED | `js/main.js` lines 274-278: `end-session-btn` calls `stopSession()` which calls `stopPacer()` + `stopRendering()` |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/audio.js` | AudioEngine with lookahead scheduler and three tone synthesizers | VERIFIED | 194 lines; all 6 exports present: `initAudio`, `startPacer`, `stopPacer`, `setStyle`, `setVolume`, `getAudioTime` |
| `js/main.js` | AudioEngine wiring into startSession/stopSession | VERIFIED | Line 7: `import { initAudio, startPacer, stopPacer, setStyle, setVolume } from './audio.js'`; calls in `startSession()` (lines 54-55) and `stopSession()` (line 74) |
| `js/renderer.js` | `drawBreathingCircle()` integrated into rAF loop | VERIFIED | Function at line 463; called first in `renderLoop()` at line 548 |
| `index.html` | Pacer canvas, style buttons, volume slider, end session button | VERIFIED | `#pacer-canvas` (line 45), `.style-btn` x3 (lines 54-56), `#volume-slider` (line 60), `#end-session-btn` (line 62) |
| `styles.css` | Session-pacer layout styles | VERIFIED | `.session-pacer` at line 329, `.pacer-bg` at 338, `.pacer-circle` at 351, `.pacer-gauge` at 364, `.pacer-controls` at 381, `.style-btn` at 396, `.volume-control` at 418, `.end-session-btn` at 435 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `js/audio.js` | `js/state.js` | `AppState.nextCueTime` and `AppState.nextCuePhase` writes | VERIFIED | `js/audio.js` lines 91-92: writes on every scheduler tick |
| `js/main.js` | `js/audio.js` | `import` and calls to `initAudio`/`startPacer`/`stopPacer` | VERIFIED | Line 7: import; lines 54-55: init+start in `startSession`; line 74: stop in `stopSession` |
| `js/renderer.js` | `js/audio.js` | `getAudioTime()` import for AudioContext.currentTime sync | VERIFIED | Line 7: `import { getAudioTime } from './audio.js'`; used at line 475 inside `drawBreathingCircle()` |
| `js/renderer.js` | `js/state.js` | reads `AppState.nextCueTime` and `AppState.nextCuePhase` each frame | DEVIATION — NOT WIRED AS SPECIFIED | Renderer does NOT read these fields. Instead it computes `audioTime % fullPeriod` on `AppState.pacingFreq` directly. This achieves the same visual sync goal via a simpler continuous cosine approach. The `AppState.nextCueTime/nextCuePhase` fields are written by audio.js but reserved for Phase 4 use. **This is a documented intentional deviation in 03-02-SUMMARY.md, not a gap.** Goal is met. |
| `js/main.js` | `index.html` | DOM event listeners for style buttons, volume slider, end session | VERIFIED | Lines 262-278 confirm all three listeners attached |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PAC-01 | 03-02 | Visual pacer: expanding/contracting circle at configurable breathing rate | SATISFIED | `drawBreathingCircle()` in renderer.js, cosine-driven on AudioContext.currentTime |
| PAC-02 | 03-01 | Audio style 1: sine pitch rising on inhale, falling on exhale | SATISFIED | `_schedulePitchCue()` in audio.js lines 115-137 |
| PAC-03 | 03-01 | Audio style 2: constant pitch with volume swell on inhale/exhale | SATISFIED | `_scheduleSwellCue()` in audio.js lines 141-162 |
| PAC-04 | 03-01 | Audio style 3: soft chime tones at inhale/exhale transition points | SATISFIED | `_scheduleBowlCue()` in audio.js lines 166-193: strike at each half-cycle transition point, two detuned oscillators with exponential decay |
| PAC-05 | 03-01 | User can switch audio styles without restarting the session | SATISFIED | `setStyle()` updates module variable; takes effect on next scheduled cue without scheduler restart |
| PAC-06 | 03-01 | Lookahead scheduler (25ms + 100ms) for drift-free timing | SATISFIED | Constants at audio.js lines 16-17; scheduler loop lines 88-97 |
| PAC-07 | 03-02 | Session timer (countdown for practice, per-block for discovery) | SATISFIED | Timer logic at renderer.js lines 522-541: countdown mode when `_sessionDuration > 0`, elapsed mode otherwise |

**No orphaned requirements.** All 7 IDs (PAC-01 through PAC-07) mapped to Phase 3 in REQUIREMENTS.md are accounted for in plans 03-01 and 03-02.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `js/renderer.js` | 480 | Uses `AppState.pacingFreq` directly rather than `AppState.nextCueTime` | Info | The circle animation phase is computed from `audioTime % (1/pacingFreq)`, which can drift slightly relative to the actual scheduler's half-cycle boundaries if `pacingFreq` changes mid-session. In practice, `pacingFreq` is not changed mid-session in Phase 3, so this is not a current issue. Phase 4 should verify if rate changes need circle re-sync. |

No TODO/FIXME/placeholder comments found in modified files. No stub implementations. No console-log-only handlers.

---

## Notable Implementation Deviations (Non-Blocking)

**1. Cosine animation instead of smoothstep**
The plan specified smoothstep easing `t*t*(3-2*t)` for the breathing circle. The implementation uses `(1-cos(phase*2π))/2`, which is mathematically equivalent in smoothness at endpoints. Documented intentionally in 03-02-SUMMARY.md.

**2. Renderer reads `AppState.pacingFreq` directly, not `AppState.nextCueTime`**
The plan specified the renderer should sync to `AppState.nextCueTime` (set by the audio scheduler) to stay locked to discrete cue boundaries. The actual implementation computes phase continuously from `audioTime % fullPeriod`. This achieves drift-free visual sync since both the scheduler and the renderer use `AudioContext.currentTime`, but the visual phase is not locked to the scheduler's discrete half-cycle boundaries — it runs continuously. In practice, this produces smoother animation and was approved during the human-verify checkpoint.

**3. Bowl frequencies changed (280/220 Hz instead of 220/174 Hz)**
Plan specified inhale 220 Hz, exhale 174 Hz. Implementation uses 280 Hz (inhale) and 220 Hz (exhale) with a 0.5% detune on a second oscillator. This was a deliberate fix to make the bowl tone "richer and more clearly audible" (fix commit db40dc0). PAC-04 goal met.

---

## Human Verification Required

### 1. Audio Style Quality and Mid-Session Switching

**Test:** Connect HRM, start a session (or mock `AppState.connected = true` in DevTools console), then click through Pitch, Swell, and Bowl style buttons while the session is running.
**Expected:** Each style produces clearly distinct audio. Pitch: rising/falling sine pitch. Swell: volume rises and falls on constant pitch. Bowl: a warm struck-bell sound at each breath transition. Switching feels instant — no dropout, restart, or silence gap.
**Why human:** Audio synthesis quality and perceptual smoothness of style transitions cannot be verified by static code analysis.

### 2. Drift Verification Over Extended Session

**Test:** Start a session and observe the circle animation and audio cues for at least 2 minutes at the default 5 bpm rate (12-second breath cycle).
**Expected:** The circle's expansion phase matches the audio inhale cue with no accumulating offset. After 10+ cycles, the circle and audio remain perceptually in sync.
**Why human:** Drift accumulation requires live temporal observation and cannot be measured by grep.

### 3. End Session Cleanup

**Test:** Click End Session while audio and animation are running.
**Expected:** Audio stops immediately (no lingering oscillator tones), circle canvas clears, session viz hides, placeholder message appears.
**Why human:** Audio node cleanup and canvas clear behavior requires a running browser environment.

---

## Gaps Summary

No gaps found. All 12 observable truths verified, all 5 artifacts verified at levels 1-3, all critical key links wired. All 7 phase requirements (PAC-01 through PAC-07) satisfied with direct code evidence.

The one unimplemented key link (`AppState.nextCueTime` reads in renderer.js) is a documented intentional deviation — the goal of drift-free visual sync is achieved by an equivalent and simpler continuous cosine approach using the same AudioContext clock.

---

_Verified: 2026-03-21_
_Verifier: Claude (gsd-verifier)_
