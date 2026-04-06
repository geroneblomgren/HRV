# Phase 12: Adaptive Pace Controller - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

When phase lock alignment falls below threshold, the app smoothly micro-adjusts the breathing pace toward the user's detected rhythm. The adjustment is felt through natural shifts in bowl echo timing and acknowledged via a persistent BPM badge inside the pacer circle. The pace never moves more than ±0.5 BPM from the tuned frequency.

</domain>

<decisions>
## Implementation Decisions

### Adjustment feel
- Pace changes should be subtly felt — the bowl echo timing drifts naturally
- A persistent BPM badge sits inside the pacer circle, always visible during practice
- Badge shows current BPM from session start (initially the tuned frequency, updates as controller adjusts)
- Badge is always visible (not just on drift) — gives user confidence the system is tracking their pace

### Trigger behavior
- Trigger threshold: phase lock below 50 for >10 seconds (per PACE-01 spec)
- Max adjustment rate: ±0.01 Hz per 30 seconds (~±0.6 BPM/min)
- Adjustments happen every DSP tick (1 second) with tiny increments (~0.00033 Hz per tick)
- Pause on uptrend: if phase lock is rising (even if below 50), hold current pace — don't interfere while user is catching up
- Resume adjusting only when lock plateaus or drops again

### Direction intelligence
- Detect user's actual breathing frequency from the existing PSD peak in the LF band (0.04-0.15 Hz)
- Drift toward the user's detected rhythm, not blind sweep
- PSD peak detection available after 120s coherence calibration gate
- Before 120s: no pace adjustment (controller inactive during calibration)
- If user's detected rhythm is outside ±0.5 BPM bound: drift to the nearest bound edge
- BPM badge turns amber (from teal) when clamped at bound edge and user's rhythm is still further away

### Recovery behavior
- When phase lock recovers above 50, stay at whatever frequency achieved lock — do NOT creep back to tuned frequency
- The tuned frequency is a starting point, not a fixed target
- On second or subsequent dips: continue adjusting from current position (no reset, no cooldown)
- Cumulative adjustments always within ±0.5 BPM hard bound from tuned frequency

### Session summary and persistence
- Summary card shows "Pace: tuned X.X → settled X.X" with arrow notation
- IndexedDB stores the full pace trace (frequency per second) for future dashboard visualization
- Session record includes `tunedBPM`, `settledBPM`, and `paceTrace` fields

### Claude's Discretion
- Audio scheduler architecture for mid-session frequency changes (current `startPacer` uses a fixed halfPeriod closure — needs dynamic update path)
- Exact PSD peak detection logic (findPeakBin already exists in dsp.js)
- Smoothing/debouncing of detected user rhythm to avoid chasing noise
- Exact amber color value for the bound-edge warning badge

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `dsp.js findPeakBin(psd, lowHz, highHz)` — finds dominant PSD peak in a frequency range, directly usable for detecting user's breathing rate
- `dsp.js integrateBand(psd, lowHz, highHz)` — can validate peak has meaningful power before using it as direction signal
- `dsp.js computePhaseLockScore()` — already reads `AppState.pacingFreq` every tick, so frequency changes are automatically picked up by phase lock
- `AppState.pacingFreq` — writable Hz value, read by dsp.js and phaseLock.js

### Established Patterns
- DSP tick runs every 1 second (practice.js setInterval) — controller can piggyback on this
- `AppState` is a reactive Proxy — writing `pacingFreq` triggers any subscribers
- Bowl echo timing is derived from `halfPeriod = 1 / (pacingFreqHz * 2)` in audio.js scheduler

### Integration Points
- `audio.js _schedulerTick(halfPeriod)` — currently a closure over fixed halfPeriod. Needs modification to read dynamic frequency. The scheduler loop runs on 25ms setTimeout with 100ms pre-schedule window.
- `practice.js` DSP tick interval (line 196) — where controller logic would be called each second
- `renderer.js` pacer canvas — where BPM badge would be drawn
- `practice.js _saveSession()` — where pace trace would be persisted

</code_context>

<specifics>
## Specific Ideas

- The controller should feel like it's "finding you" — not fighting or correcting, but gently meeting the user where they are
- Bowl echo spacing is the primary sensory channel — echoes shift from 4 equal subdivisions at one tempo to 4 equal subdivisions at a slightly different tempo
- The amber badge color change is the only warning — no text, no popups, no interruption to the meditative flow

</specifics>

<deferred>
## Deferred Ideas

- Dashboard visualization of pace trace over sessions — Phase 13 or future
- Continuous background RF tracking during sessions (ATUNE-01) — future requirement
- Adaptive ramp rate (start gentle, accelerate if lock stays low) — could revisit if gentle fixed rate feels too slow

</deferred>

---

*Phase: 12-adaptive-pace-controller*
*Context gathered: 2026-04-04*
