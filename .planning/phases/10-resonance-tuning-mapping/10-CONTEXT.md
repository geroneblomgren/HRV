# Phase 10: Resonance Tuning + Mapping - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Every practice session begins with a mandatory 60-second tuning phase that identifies the user's current resonance frequency from live RSA analysis. The result is displayed briefly, then the session starts at the tuned frequency. Session records store the tuned frequency for dashboard trending. The recovery dashboard shows an RF trend line alongside existing metrics.

</domain>

<decisions>
## Implementation Decisions

### Tuning Experience
- Tuning is mandatory before every session — no skip option
- Claude picks whether guided breathing (pacer at candidate frequencies) or free breathing produces more reliable RSA measurement — likely guided since controlled breathing gives cleaner RSA data
- Bowl echoes play during tuning so the user naturally breathes along at each candidate frequency
- Visual: a distinct "scanning" animation (not the breathing circle) — progress bar or ring filling over 60 seconds. Makes tuning feel like a separate, intentional diagnostic step
- A countdown or progress indicator shows time remaining

### Result Display
- After tuning: show "Today: 4.7 BPM" with comparison to stored frequency
- 3-second auto-start — result flashes briefly then session begins automatically
- When RF shifts >0.3 BPM: simple text celebration — "Your resonance shifted from 5.0 to 4.7 BPM — improved vagal tone ↑" (no sparkline — that lives on the dashboard)
- Celebration text shows within the same 3-second window (may extend slightly for readability)

### RF Trend on Dashboard
- Claude decides placement: fourth line on existing chart (with separate BPM Y-axis) vs dedicated small chart below (BPM range 3-7 is very different from HRV 10-30ms)
- Claude decides tooltip integration based on existing pattern
- Color should be distinct from HRV (teal), phase lock (orange), and Neural Calm (blue)

### Claude's Discretion
- Scanning animation design (ring fill, progress bar, pulse, etc.)
- Whether guided or free breathing during tuning (lean toward guided for data quality)
- Candidate frequency selection: how many candidates, spacing, duration per candidate
- Dashboard RF trend placement and Y-axis handling
- RF tooltip integration
- RF trend line color
- How to handle first-ever session (no stored RF yet — use Discovery result or run extended tuning)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/dsp.js`: FFT + spectral analysis already computes RSA amplitude and LF peak power — core of tuning measurement
- `js/audio.js`: `startPacer(freqHz)` / `stopPacer()` — can drive bowl echoes during tuning candidates
- `js/practice.js`: `startPractice()` is the entry point — tuning phase inserts before the main session
- `js/renderer.js`: Breathing circle, gauge renderers — scanning animation is new but same Canvas pattern
- `js/storage.js`: `saveSession()` already saves session records — add tuningFreqHz field
- `js/dashboard.js`: Canvas chart with multiple data series — add RF trend line

### Established Patterns
- Session controllers own their DOM, timers, rendering, DSP
- DSP tick runs 1/second via setInterval
- AppState as central bus for all inter-module communication
- Dashboard uses `querySessions()` to build data series

### Integration Points
- `js/practice.js` `startPractice()`: Insert tuning phase before session pacer starts
- `js/practice.js` `_saveSession()`: Add tuningFreqHz and tuningRsaAmplitude to session record
- `js/dashboard.js` `_getSessionsByDay()`: Aggregate tuningFreqHz per day
- `js/dashboard.js` `_drawChart()`: Add RF trend line
- `AppState.savedResonanceFreq`: Currently set once by Discovery — tuning updates it each session
- `AppState.pacingFreq`: Set from savedResonanceFreq at session start — tuning sets this from live result instead

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the scanning animation and RF trend visualization.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-resonance-tuning-mapping*
*Context gathered: 2026-04-04*
