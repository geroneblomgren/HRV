# Phase 2: Signal Processing + Visualization — Research

**Researched:** 2026-03-21
**Domain:** HRV spectral analysis (FFT + resampling vs. Lomb-Scargle), coherence scoring, Canvas 2D real-time waveform and gauge rendering
**Confidence:** MEDIUM-HIGH — core Canvas 2D patterns are HIGH (verified MDN), coherence formula is MEDIUM (sourced from HeartMath docs + literature), Lomb-Scargle browser availability is LOW (no maintained npm port found)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Waveform Appearance**
- Filled area plot: smooth curve with translucent teal/cyan fill below the line
- Dark background (established in Phase 1), teal/cyan line + fill for high contrast
- Fixed Y-axis range (40-120 BPM) — RSA amplitude changes are honest, not auto-scaled
- Waveform renders immediately from session start (even during calibration)

**Coherence Display**
- Number centered inside a progress ring that fills as coherence rises (0-100)
- Ring and number color shifts through zones: red (low) → yellow (medium) → green (high)
- Text label below the ring: "Low" / "Building" / "Locked In"
- Subtle pulse animation on the ring when in high coherence zone — positive reinforcement
- Animated smooth transitions between values (number and ring both animate)

**Spectrum Chart Style**
- Filled area plot (consistent with waveform style)
- LF band (0.04-0.15 Hz) highlighted with background shading — vertical shaded region always visible
- Dominant LF peak marked with a small dot and frequency label (e.g., "0.10 Hz")

**Calibrating State UX**
- During first 90-120s: progress countdown with bar ("Calibrating... 45s remaining")
- HR waveform is visible from the start (it has data immediately)
- Coherence ring and spectrum chart show "Calibrating..." placeholder during countdown
- When calibration completes: coherence ring and spectrum fade in smoothly

### Claude's Discretion
- Time window length for waveform
- Coherence zone thresholds (low/medium/high)
- Spectrum axis labeling
- Calibration ready cue style
- Spectral analysis method decision (Lomb-Scargle vs FFT + cubic spline resampling)
- Exact teal/cyan shade and fill opacity

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DSP-01 | Compute instantaneous heart rate from clean RR intervals for waveform display | Trivial: `HR = 60000 / rrMs`. BLE already writes `currentHR` to AppState; DSPEngine converts the buffer to BPM array for WaveformRenderer. |
| DSP-02 | Spectral analysis on RR-interval data to identify LF power peak (0.04-0.15 Hz) | FFT + cubic spline resampling at 4 Hz using fft.js (already in stack). See Architecture Patterns section for full pipeline. Lomb-Scargle has no viable browser port. |
| DSP-03 | Coherence score = LF peak power / total spectral power (0.04-0.26 Hz), rolling 64s window, updated every 1-2s | HeartMath-derived formula documented below. 64s window is the standard (HeartMath uses exactly 64s). Score mapped to 0-100 via logarithmic coherence ratio. |
| DSP-04 | Display "calibrating" state for first 90-120s while accumulating sufficient data for stable spectral analysis | 120s minimum confirmed by Pitfalls research (Clifford et al.; PMC spectral window study). `AppState.calibrating` field already exists. |
| DSP-05 | RSA amplitude (peak-to-trough HR variation) per frequency block during Discovery mode | Computed as `max(hrArray) - min(hrArray)` over each 2-minute breathing block. Literature confirms this is the standard HR-max minus HR-min approach. |
| VIZ-01 | Scrolling HR waveform on Canvas 2D, requestAnimationFrame at 60fps | Circular buffer + rAF loop pattern confirmed (MDN, ARCHITECTURE.md). Filled area with `lineTo` + `closePath` + vertical gradient fill. |
| VIZ-02 | Power spectrum chart on Canvas, LF band highlighted | Canvas 2D filled area over frequency-axis array. Vertical shaded region for 0.04-0.15 Hz drawn with a semi-transparent fillRect before the spectrum curve. |
| VIZ-03 | Coherence score as large readable number/gauge, updates smoothly | Canvas 2D `arc()` for progress ring + `fillText()` for number. Animated with interpolation toward target value each rAF frame. |
</phase_requirements>

---

## Summary

Phase 2 builds the signal processing core (DSPEngine) and the three Canvas renderers (WaveformRenderer, SpectrumRenderer, CoherenceGauge). The most consequential decision — FFT + cubic spline vs. Lomb-Scargle — is effectively resolved by the browser ecosystem: no maintained JavaScript port of Lomb-Scargle suitable for CDN loading exists as of March 2026. The GLS project (Zechmeister) provides a browser demo but not a packaged library. This means FFT + cubic spline resampling at 4 Hz is the correct implementation choice. The known systematic LF-power overestimation bias is acceptable for this use case because coherence is displayed as a relative 0-100 score, not an absolute ms² value.

The coherence scoring formula is well-established from HeartMath's published documentation: identify the dominant peak in 0.04-0.26 Hz, compute the integral in a 0.030 Hz window around that peak, divide by total power, and map via a logarithmic coherence ratio to the display scale. A 64-second sliding window updated every 1-2 seconds is the standard.

All three Canvas renderers share the same rAF loop architecture already established in ARCHITECTURE.md: circular buffer read → full `clearRect` + redraw each frame → no DOM churn. The filled area plot style (locked decision) maps directly to Canvas 2D `lineTo` + `closePath` + `fill()` with a vertical linear gradient. The coherence ring uses `arc()` sweeps. No external charting library is needed or appropriate.

**Primary recommendation:** Implement FFT + cubic spline (fft.js 4.0.4, already in the project stack). Build DSPEngine as a module that is tick-driven (called on a 1-second interval by the session controller), not event-driven per RR beat. All three renderers share a single `requestAnimationFrame` loop in `renderer.js`.

---

## Standard Stack

### Core (already committed in Phase 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fft.js (indutny) | 4.0.4 | Radix-4/Radix-2 FFT on the resampled RR tachogram | Already in project stack; fastest pure-JS FFT; CDN-loaded; sufficient for 512-sample HRV analysis |
| Canvas 2D API | Living Standard | WaveformRenderer, SpectrumRenderer, CoherenceGauge | Native browser API; no dependencies; 60fps at target canvas dimensions |

### Supporting (new in Phase 2)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | — | Cubic spline interpolation is ~30 lines of vanilla JS | The cubic spline algorithm for RR tachogram resampling is simple enough to hand-roll; no library justified |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FFT + cubic spline | Lomb-Scargle | LS is more accurate on unevenly-sampled data but has no maintained browser JS port (LOW confidence any npm package is production-ready). GLS browser demo is not packaged for CDN use. |
| Hand-rolled cubic spline | numeric.js (18kB) or math.js (180kB) | Both are massive for what is a 25-line algorithm. Don't add them. |
| Canvas 2D ring | SVG `<circle>` with stroke-dasharray | SVG works fine for a single gauge but is less consistent with the waveform/spectrum Canvas approach; Canvas keeps all rendering in one paradigm |

**Installation:** No new installs. fft.js already loaded via CDN from Phase 1.

---

## Architecture Patterns

### Recommended File Structure (additions to Phase 1)

```
js/
├── state.js        (Phase 1 — unchanged)
├── ble.js          (Phase 1 — unchanged)
├── storage.js      (Phase 1 — unchanged)
├── main.js         (Phase 1 — will wire DSPEngine and renderers)
├── dsp.js          (NEW — DSPEngine: spectral analysis, coherence, RSA)
└── renderer.js     (NEW — WaveformRenderer + SpectrumRenderer + CoherenceGauge)
```

Both new files export named functions/classes; `main.js` wires them to AppState subscriptions.

---

### Pattern 1: DSPEngine — Tick-Driven, Not Event-Driven

**What:** DSPEngine exposes a `tick()` function called on a 1-second interval by the session controller. Each tick reads the current RR buffer from AppState, runs the FFT pipeline if enough data exists, and writes results back to AppState.

**Why tick-driven:** Running FFT per RR beat (every ~800ms) wastes CPU with identical results. Running on a 1-second interval gives the 1-2s update frequency required by DSP-03 while keeping main thread load negligible.

**When to use:** Always. Never subscribe DSPEngine to `rrBuffer` changes directly — the Proxy fires on every write and FFT is too expensive for that.

**Example:**
```javascript
// js/dsp.js
import { AppState } from './state.js';

const SAMPLE_RATE_HZ = 4;          // standard HRV resampling rate
const MIN_WINDOW_SECONDS = 120;    // must fill before coherence is valid
const FFT_SIZE = 512;              // next power of 2 >= 4 Hz * 120s = 480
const COHERENCE_WINDOW_SECONDS = 64; // HeartMath standard: 64s sliding window
const LF_LOW_HZ = 0.04;
const LF_HIGH_HZ = 0.15;
const TOTAL_HIGH_HZ = 0.26;
const PEAK_WINDOW_HZ = 0.030;     // HeartMath: integrate ±0.015 Hz around peak

let _fft = null;  // initialized on first call after fft.js loads

export function initDSP() {
  _fft = new FFT(FFT_SIZE);
}

/**
 * Called once per second by session controller.
 * Reads AppState.rrBuffer, computes coherence and spectral data,
 * writes back to AppState.coherenceScore, AppState.lfPower, AppState.spectralBuffer.
 */
export function tick(sessionElapsedSeconds) {
  const stillCalibrating = sessionElapsedSeconds < MIN_WINDOW_SECONDS;
  AppState.calibrating = stillCalibrating;

  if (stillCalibrating) return;  // renderers show calibrating state

  const tachogram = buildEvenlySpacedTachogram(AppState.rrBuffer, AppState.rrHead, AppState.rrCount);
  if (!tachogram) return;

  applyHannWindow(tachogram);
  const psd = computePSD(tachogram);

  AppState.spectralBuffer = psd;           // SpectrumRenderer reads this
  AppState.lfPower = integrateBand(psd, LF_LOW_HZ, LF_HIGH_HZ);
  AppState.coherenceScore = computeCoherenceScore(psd);
}
```

---

### Pattern 2: Cubic Spline RR Tachogram Resampling

**What:** Convert the unevenly-spaced RR circular buffer into an evenly-sampled 4 Hz time series before FFT. The tachogram is the instantaneous HR (or RR interval) plotted against cumulative time.

**Why cubic spline, not linear:** Kubios HRV (gold standard) uses cubic spline. Linear interpolation underestimates HF power. The algorithm is ~25 lines of code.

**Implementation approach:**
```javascript
// Reconstruct time axis from RR buffer
// rrBuffer entries are in ms — cumulative sum gives beat timestamps
function buildEvenlySpacedTachogram(rrBuffer, rrHead, rrCount) {
  const count = Math.min(rrCount, 512);
  if (count < 10) return null;

  // Read buffer in chronological order (oldest first)
  const rr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    rr[i] = rrBuffer[(rrHead - count + i + 512) % 512];
  }

  // Build timestamp array (cumulative sum, in seconds)
  const times = new Float32Array(count);
  let t = 0;
  for (let i = 0; i < count; i++) {
    times[i] = t;
    t += rr[i] / 1000;
  }

  // Resample to SAMPLE_RATE_HZ using cubic spline
  const duration = times[count - 1];
  const nSamples = Math.min(FFT_SIZE, Math.floor(duration * SAMPLE_RATE_HZ));
  const output = new Float32Array(FFT_SIZE);  // zero-padded to FFT_SIZE

  for (let i = 0; i < nSamples; i++) {
    const queryTime = i / SAMPLE_RATE_HZ;
    output[i] = cubicSplineInterpolate(times, rr, queryTime);
  }

  return output;
}
```

---

### Pattern 3: Coherence Score Formula (HeartMath-derived)

**What:** A logarithmic ratio of LF peak power to surrounding spectral power, mapped to a 0-100 display score.

**Formula (sourced from HeartMath published documentation and PMC literature):**

```javascript
function computeCoherenceScore(psd) {
  // 1. Find dominant peak in 0.04-0.26 Hz
  const peakBin = findPeakBin(psd, LF_LOW_HZ, TOTAL_HIGH_HZ);
  const peakFreq = binToHz(peakBin);

  // 2. Integrate ±0.015 Hz window around peak (HeartMath: 0.030 Hz wide window)
  const peakPower = integrateBand(psd, peakFreq - 0.015, peakFreq + 0.015);

  // 3. Total power 0.04-0.26 Hz
  const totalPower = integrateBand(psd, LF_LOW_HZ, TOTAL_HIGH_HZ);

  if (totalPower === 0) return 0;

  // 4. Coherence Ratio (CR): ratio of peak prominence
  // Based on HeartMath: CR = (peak/below) * (peak/above)
  const powerBelow = integrateBand(psd, LF_LOW_HZ, peakFreq - 0.015);
  const powerAbove = integrateBand(psd, peakFreq + 0.015, TOTAL_HIGH_HZ);
  const cr = (peakPower / Math.max(powerBelow, 0.001)) *
             (peakPower / Math.max(powerAbove, 0.001));

  // 5. Coherence Score (CS): natural log transform
  const cs = Math.log(cr + 1);

  // 6. Map to 0-100: cs typically ranges 0-3 for physiological signals
  //    Clamp at 3.0 = 100; scale linearly below.
  //    This is approximate — calibrate against known coherence sessions.
  return Math.min(100, Math.round((cs / 3.0) * 100));
}
```

**Confidence:** MEDIUM. The peak integral + log transform formula is confirmed from HeartMath documentation (help.heartmath.com). The 0-100 mapping upper bound (cs=3.0 → 100) is an informed estimate, not documented publicly by HeartMath. Will need empirical calibration against real sessions.

---

### Pattern 4: Coherence Zone Thresholds (Claude's Discretion — Recommended Values)

Based on the log-coherence scale and literature on typical coherence distributions:

| Zone | Score Range | Display Label | Ring Color | Rationale |
|------|-------------|---------------|------------|-----------|
| Low | 0-30 | "Low" | `#ef4444` (red) | Below resonance; scattered spectrum |
| Building | 31-65 | "Building" | `#eab308` (yellow) | Partial coherence; single LF peak emerging |
| High | 66-100 | "Locked In" | `#22c55e` (green) | Strong single peak; full RSA |

These thresholds are modeled on HeartMath's three-zone system (their exact thresholds scale with "Challenge Level" and are proprietary). The 66% upper threshold is consistent with literature showing clear coherence typically produces CR values corresponding to CS > 2.0.

---

### Pattern 5: WaveformRenderer — Filled Area Scrolling Chart

**What:** rAF loop reads `AppState.rrBuffer` and `AppState.currentHR`, converts RR intervals to BPM, draws a filled area plot on a Canvas element.

**Key implementation details:**

```javascript
// js/renderer.js — WaveformRenderer section
const HR_MIN = 40;
const HR_MAX = 120;
const WAVEFORM_WINDOW_SECONDS = 60;  // 60s visible window (Claude's discretion)
// At ~75 bpm average, 60s shows ~75 beats — smooth enough to see RSA oscillation
// At resonance (~5 bpm breathing), full 10s RSA cycle visible ~6 times

function drawWaveform(ctx, canvas, hrBuffer) {
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Vertical gradient fill: teal at top fading to transparent at bottom
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, 'rgba(20, 184, 166, 0.5)');   // --accent-teal at 50%
  gradient.addColorStop(1, 'rgba(20, 184, 166, 0.02)');

  ctx.beginPath();
  // Plot each HR sample; map BPM to Y pixel
  for (let i = 0; i < hrBuffer.length; i++) {
    const x = (i / hrBuffer.length) * W;
    const clamped = Math.min(HR_MAX, Math.max(HR_MIN, hrBuffer[i]));
    const y = H - ((clamped - HR_MIN) / (HR_MAX - HR_MIN)) * H;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  // Close the path down to the baseline to create the filled area
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();

  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw the line on top (solid teal)
  ctx.beginPath();
  // ... same loop, stroke only
  ctx.strokeStyle = '#14b8a6';  // --accent-teal
  ctx.lineWidth = 2;
  ctx.stroke();
}
```

**Waveform window — recommended 60 seconds:** At resonance breathing (5 bpm = 10s cycle), 60 seconds shows 6 complete RSA oscillations — enough to assess regularity without the chart looking too zoomed out. 30 seconds shows 3 cycles (adequate). 120 seconds is too compressed. Lock at 60s.

---

### Pattern 6: SpectrumRenderer — Filled Area Frequency Chart

**What:** Reads `AppState.spectralBuffer` (PSD array indexed by frequency bin), draws LF band background shading, then the filled spectrum curve, then marks the peak.

```javascript
function drawSpectrum(ctx, canvas, psd) {
  const W = canvas.width;
  const H = canvas.height;
  const MAX_FREQ_HZ = 0.5;  // display 0–0.5 Hz
  const freqToX = (hz) => (hz / MAX_FREQ_HZ) * W;

  ctx.clearRect(0, 0, W, H);

  // 1. Draw LF band background shading (always visible, even during calibrating)
  ctx.fillStyle = 'rgba(20, 184, 166, 0.07)';
  ctx.fillRect(
    freqToX(0.04), 0,
    freqToX(0.15) - freqToX(0.04), H
  );

  if (!psd) return;  // calibrating — just show the band shading

  // 2. Normalize PSD for display (peak = 80% of canvas height)
  const maxPower = Math.max(...psd);

  ctx.beginPath();
  for (let bin = 0; bin < psd.length; bin++) {
    const hz = binToHz(bin);
    if (hz > MAX_FREQ_HZ) break;
    const x = freqToX(hz);
    const y = H - (psd[bin] / maxPower) * H * 0.8;
    bin === 0 ? ctx.moveTo(x, H) : undefined;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, 'rgba(20, 184, 166, 0.6)');
  gradient.addColorStop(1, 'rgba(20, 184, 166, 0.05)');
  ctx.fillStyle = gradient;
  ctx.fill();

  // 3. Mark dominant LF peak with dot + frequency label
  const peakBin = findPeakBin(psd, 0.04, 0.15);
  const peakHz = binToHz(peakBin);
  const peakX = freqToX(peakHz);
  const peakY = H - (psd[peakBin] / maxPower) * H * 0.8;

  ctx.beginPath();
  ctx.arc(peakX, peakY, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#14b8a6';
  ctx.fill();

  ctx.fillStyle = '#ccfbf1';
  ctx.font = '11px monospace';
  ctx.fillText(`${peakHz.toFixed(2)} Hz`, peakX + 6, peakY - 4);
}
```

**Axis labeling (Claude's discretion — recommended):** Label only 0.04, 0.10, 0.15, 0.25 Hz on the X-axis in small monospace text. No Y-axis labels (normalized display, not absolute power). This keeps the chart uncluttered and medically legible.

---

### Pattern 7: CoherenceGauge — Progress Ring + Animated Transitions

**What:** Canvas 2D `arc()` for the ring sweep, `fillText()` for the number, smooth value interpolation each rAF frame.

**Interpolation:** Use exponential easing toward target: `displayed = displayed + (target - displayed) * 0.08` each frame. This produces a ~0.5 second smooth transition at 60fps without overshooting.

```javascript
// js/renderer.js — CoherenceGauge section
let _displayedScore = 0;
let _pulsePhase = 0;

function drawCoherenceGauge(ctx, canvas, targetScore, zone) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(cx, cy) * 0.75;

  // Smooth interpolation toward target
  _displayedScore += (targetScore - _displayedScore) * 0.08;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Zone color
  const color = zone === 'high' ? '#22c55e' : zone === 'building' ? '#eab308' : '#ef4444';

  // Background ring (dim)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 12;
  ctx.stroke();

  // Filled arc proportional to score
  const endAngle = -Math.PI / 2 + ((_displayedScore / 100) * Math.PI * 2);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, endAngle);

  // Pulse in high zone: modulate lineWidth slightly
  let lineWidth = 12;
  if (zone === 'high') {
    _pulsePhase += 0.05;
    lineWidth = 12 + Math.sin(_pulsePhase) * 2.5;
  } else {
    _pulsePhase = 0;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Number centered
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(radius * 0.55)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(_displayedScore).toString(), cx, cy - 8);

  // Zone label below number
  const label = zone === 'high' ? 'Locked In' : zone === 'building' ? 'Building' : 'Low';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `13px system-ui`;
  ctx.fillText(label, cx, cy + radius * 0.4);
}
```

---

### Pattern 8: Calibrating State Rendering

**What:** During first 120 seconds, the waveform renders normally (it has data), but the coherence ring and spectrum chart show a "Calibrating" placeholder with a countdown progress bar.

**Implementation approach:**
- `AppState.calibrating = true` until 120s elapsed
- WaveformRenderer: renders normally regardless of `calibrating`
- CoherenceGauge: when `calibrating`, draws a grey ring at 0 with "Calibrating..." text and a small progress bar filling over 120s
- SpectrumRenderer: when `calibrating`, draws only the LF band shading + "Calibrating..." centered text
- Fade-in on transition: when `calibrating` flips to `false`, use a CSS opacity transition or a canvas alpha ramp over ~0.5s

**Countdown display:**
```javascript
// In the gauge draw call when calibrating:
const secondsRemaining = Math.max(0, 120 - sessionElapsedSeconds);
const barFill = (120 - secondsRemaining) / 120;

ctx.fillStyle = 'rgba(255,255,255,0.5)';
ctx.font = '14px system-ui';
ctx.textAlign = 'center';
ctx.fillText(`Calibrating... ${secondsRemaining}s`, cx, cy);

// Draw progress bar
const barW = radius * 1.5;
const barH = 6;
const barX = cx - barW / 2;
const barY = cy + 30;
ctx.fillStyle = 'rgba(255,255,255,0.15)';
ctx.fillRect(barX, barY, barW, barH);
ctx.fillStyle = '#14b8a6';
ctx.fillRect(barX, barY, barW * barFill, barH);
```

---

### Pattern 9: RSA Amplitude Per Breathing Block (DSP-05)

**What:** For Discovery mode, compute the peak-to-trough HR variation across each 2-minute breathing block.

**Formula (confirmed from literature):** `RSA_amplitude = max(HR) - min(HR)` over the block's HR sample array. This is HR Max minus HR Min, the standard clinical definition used in resonance frequency assessment papers.

```javascript
/**
 * Compute RSA amplitude for a completed breathing block.
 * @param {number[]} hrSamples - Array of instantaneous HR values (bpm) for the block
 * @returns {number} Peak-to-trough amplitude in bpm
 */
export function computeRSAAmplitude(hrSamples) {
  if (hrSamples.length === 0) return 0;
  const maxHR = Math.max(...hrSamples);
  const minHR = Math.min(...hrSamples);
  return Math.round((maxHR - minHR) * 10) / 10;  // one decimal place
}
```

DSPEngine should accumulate an `hrSamplesThisBlock` array during Discovery mode, cleared when each block transitions. The Discovery session controller (Phase 4) calls `computeRSAAmplitude()` at block end.

---

### Anti-Patterns to Avoid

- **Running FFT on every RR beat:** DSPEngine must be tick-driven (1s interval), not subscribed to `rrBuffer` changes. FFT on every beat wastes CPU and produces no additional resolution.
- **Using `AppState.rrCount` as the tachogram size directly:** `rrCount` is the total clean beats across the session; the circular buffer wraps at 512. Use `Math.min(rrCount, 512)` to know how many buffer slots are valid.
- **Applying FFT before 120s elapsed:** The 120-second minimum is hard — not advisory. Assert `calibrating = true` until `sessionElapsed >= 120`.
- **Skipping the Hann window:** Applying FFT directly to the resampled tachogram without windowing causes spectral leakage; the LF peak will appear smeared and the coherence score will be lower than true coherence. Hann window is mandatory.
- **Running all three renderers in separate rAF loops:** One shared rAF loop in `renderer.js` calling all three draw functions is more efficient and avoids frame-doubling. The loop reads AppState fields each frame.
- **Using `setInterval` for the DSPEngine tick:** Use a session-owned `setInterval` started when the session begins, cleared when it ends. Do NOT use rAF for the DSP tick (rAF pauses on tab hide; DSP should keep accumulating even if the tab is backgrounded).
- **Not clamping the coherence score upper bound:** The log transform can produce values above 3.0 for unusually clean signals. Clamp at 100 display units.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FFT computation | Custom DFT loop | fft.js 4.0.4 (already in stack) | The indutny fft.js is 35k ops/sec at 512 samples; hand-rolled DFT is O(n²) and 1000x slower |
| Cubic spline | Import a math library | 25-line cubic spline function | math.js is 180kB; numeric.js is 18kB; both are overkill for a single interpolation call. Hand-roll the Catmull-Rom or natural cubic spline. |
| Canvas 2D | External charting lib (Chart.js, D3) | Vanilla Canvas 2D | Chart.js is 160kB; D3 is 85kB; both fight against the custom filled-area style locked in CONTEXT.md. Vanilla is 5 lines per draw call. |
| Smooth value animation | CSS transitions or Tween.js | Exponential easing in rAF | `displayed += (target - displayed) * 0.08` per frame is 1 line and produces identical-quality animation. |

**Key insight:** Every "don't hand-roll" in this phase is actually the opposite — the phase is one of the few where hand-rolling the math is explicitly correct because the algorithms are simple, well-specified, and don't have the hidden edge-case complexity that justifies a library.

---

## Common Pitfalls

### Pitfall 1: FFT Applied to Unevenly-Sampled RR Intervals Without Resampling
**What goes wrong:** Direct FFT on the raw RR ms array (treating each beat as a uniform time step) produces spectral smearing and inflated LF power.
**Why it happens:** The RR circular buffer looks like a uniform array.
**How to avoid:** Always build the evenly-spaced tachogram first (cubic spline at 4 Hz). The buffer holds ms values, not evenly-spaced samples.
**Warning signs:** Coherence score is high from the first 10 beats. LF peak appears at the wrong frequency.

### Pitfall 2: 120-Second Calibration Window Not Enforced
**What goes wrong:** Coherence score displayed before buffer fills produces wildly unstable values.
**Why it happens:** DSP-04 is treated as a UI concern ("just show a loading spinner") rather than a hard algorithmic gate.
**How to avoid:** DSPEngine's `tick()` must return early (write nothing to `spectralBuffer` or `coherenceScore`) until `sessionElapsed >= 120`. AppState keeps `calibrating: true`. Renderers read that flag.
**Warning signs:** Score oscillates between 0 and 100 in the first 30 seconds.

### Pitfall 3: `rrHead` Wrap-Around Not Handled When Reading Buffer
**What goes wrong:** Reading rrBuffer[0..511] directly in array order gives chronologically scrambled data if the write pointer has wrapped.
**Why it happens:** The buffer is circular — `rrHead` is the next write position, so the oldest data is at `rrHead` and newest at `rrHead - 1` (mod 512).
**How to avoid:** Always reconstruct in chronological order: `for i in 0..count: rr[i] = rrBuffer[(rrHead - count + i + 512) % 512]`.
**Warning signs:** Spectral peaks at wrong frequencies; RSA waveform shows sudden discontinuity when the session reaches 512 beats.

### Pitfall 4: Canvas devicePixelRatio Not Applied
**What goes wrong:** Waveform and spectrum look blurry on Retina/HiDPI displays.
**Why it happens:** Canvas `width`/`height` attributes default to CSS pixel dimensions, not physical pixels.
**How to avoid:**
```javascript
const dpr = window.devicePixelRatio || 1;
canvas.width = canvas.clientWidth * dpr;
canvas.height = canvas.clientHeight * dpr;
ctx.scale(dpr, dpr);
```
Apply once after canvas element is mounted.
**Warning signs:** Charts look fine on 1x monitor, blurry on laptop screen.

### Pitfall 5: rAF Loop Not Cancelled on Session End
**What goes wrong:** Renderer continues drawing after session ends, consuming GPU and potentially reading stale AppState.
**Why it happens:** rAF is self-scheduling; it must be explicitly cancelled.
**How to avoid:** Track the rAF ID (`rafId = requestAnimationFrame(draw)`). Export a `stopRenderers()` function that calls `cancelAnimationFrame(rafId)`. Call it when `AppState.sessionPhase` transitions to `'idle'`.
**Warning signs:** DevTools shows continuous GPU/CPU usage after session ends. Console errors from drawing to a cleaned-up canvas.

### Pitfall 6: DSPEngine setInterval Not Cleared on Session End
**What goes wrong:** DSP continues running after session ends, writing to AppState and consuming CPU.
**How to avoid:** DSPEngine.start() returns a cleanup function or stores the interval ID. Session controller calls DSPEngine.stop() on session end.

---

## Code Examples

### Verified Canvas Patterns (MDN / Architecture Research)

#### devicePixelRatio Setup
```javascript
// Source: MDN Canvas API — Optimizing canvas
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}
```

#### Linear Gradient Fill (Waveform / Spectrum)
```javascript
// Source: MDN CanvasRenderingContext2D.createLinearGradient()
const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
gradient.addColorStop(0, 'rgba(20, 184, 166, 0.5)');
gradient.addColorStop(1, 'rgba(20, 184, 166, 0.02)');
ctx.fillStyle = gradient;
// ... build path, then:
ctx.fill();
```

#### Arc-Based Progress Ring
```javascript
// Source: MDN CanvasRenderingContext2D.arc()
// Ring starts at top (12 o'clock = -PI/2), sweeps clockwise
const startAngle = -Math.PI / 2;
const endAngle = startAngle + (score / 100) * Math.PI * 2;
ctx.beginPath();
ctx.arc(cx, cy, radius, startAngle, endAngle);
ctx.strokeStyle = ringColor;
ctx.lineWidth = 12;
ctx.stroke();
```

#### Hann Window Application
```javascript
// Source: Signal processing standard — verified against MDN AudioBuffer patterns
function applyHannWindow(samples) {
  const N = samples.length;
  for (let n = 0; n < N; n++) {
    samples[n] *= 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  }
}
```

#### fft.js PSD Computation
```javascript
// Source: github.com/indutny/fft.js README
const fft = new FFT(512);
const out = fft.createComplexArray();
fft.realTransform(out, windowedSamples);  // windowedSamples: Float32Array(512)
fft.completeSpectrum(out);

// Convert complex output to power spectrum (magnitude squared)
const psd = new Float32Array(512 / 2);
for (let i = 0; i < psd.length; i++) {
  const re = out[2 * i];
  const im = out[2 * i + 1];
  psd[i] = (re * re + im * im);
}
// Frequency resolution: SAMPLE_RATE_HZ / FFT_SIZE = 4 / 512 = 0.0078125 Hz/bin
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Linear interpolation before FFT | Cubic spline interpolation before FFT | Less HF-power underestimation; Kubios standard since ~2010 |
| Fixed-threshold coherence zones | Challenge-level-adaptive thresholds (HeartMath) | For a personal tool, fixed thresholds are appropriate — no user-configurable levels needed |
| requestAnimationFrame not universally supported | rAF is fully supported in all target browsers (Chrome desktop) | No polyfill needed; use directly |
| Separate draw calls per component | Shared rAF loop calling all renderers | Better GPU frame pacing; simpler cancellation logic |

**Deprecated/outdated:**
- Welch method (overlapping FFT windows): overkill for 512-sample HRV analysis; adds code complexity with marginal benefit for a 1-2s update interval
- HF band analysis for real-time feedback: confirmed in PITFALLS.md — RMSSD and HF power are wrong metrics for slow breathing sessions

---

## Open Questions

1. **Coherence Score Calibration**
   - What we know: The log(CR + 1) formula is confirmed. The mapping cs=3.0 → 100 is an estimate.
   - What's unclear: The right upper bound of the CR-to-score mapping will only be known after testing with real session data.
   - Recommendation: Start with cs=3.0 → 100 (log scale). After first 3-5 real sessions, check if scores are clustering at either extreme and adjust the divisor. Store the raw CR value in AppState alongside the 0-100 display score so it can be recalibrated without losing session data.

2. **Cubic Spline Algorithm Choice**
   - What we know: Natural cubic spline and Catmull-Rom both work. Kubios uses natural cubic spline.
   - What's unclear: The exact implementation complexity of natural cubic spline vs. the simpler Catmull-Rom for this use case.
   - Recommendation: Use natural cubic spline (tridiagonal matrix solver, ~25 lines). It matches Kubios's approach and handles the boundary conditions at session start/end more cleanly than Catmull-Rom.

3. **Waveform HR Buffer vs. RR Buffer**
   - What we know: `AppState.rrBuffer` holds RR intervals in ms. The waveform needs BPM values.
   - What's unclear: Whether DSPEngine should maintain a separate `hrBuffer` in AppState, or whether WaveformRenderer converts RR→BPM on the fly each rAF frame.
   - Recommendation: DSPEngine maintains a separate `AppState.hrBuffer` (Float32Array(512)) that mirrors the RR buffer but stores `60000/rrMs` values. WaveformRenderer reads `hrBuffer` directly. This avoids per-frame division inside the rAF loop.

---

## Sources

### Primary (HIGH confidence)
- MDN Canvas API — Basic Animations: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_animations
- MDN Canvas API — Optimizing canvas: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- MDN CanvasRenderingContext2D.arc(): https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arc
- MDN CanvasRenderingContext2D.createLinearGradient(): https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/createLinearGradient
- github.com/indutny/fft.js — API reference: realTransform, completeSpectrum, createComplexArray
- ARCHITECTURE.md (Phase 1 research) — Circular buffer + rAF waveform pattern

### Secondary (MEDIUM confidence)
- HeartMath: How coherence is determined — https://help.heartmath.com/emwave-pro/how-is-coherence-determined-by-heartmath-programs/ (64s window, coherence ratio formula, log transform)
- Frontiers: A Practical Guide to Resonance Frequency Assessment — https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2020.570400/full (RSA amplitude = HR max - HR min per block, window requirements)
- PITFALLS.md (Phase 1 research) — Clifford et al. FFT+resampling errors, 120s window minimum, Lomb-Scargle superiority for unevenly-sampled data

### Tertiary (LOW confidence)
- WebSearch: No maintained npm Lomb-Scargle port for browser JS found (March 2026 search). GLS GitHub project exists but is an astronomy demo, not a packaged library. — Confirms FFT+cubic spline as the correct implementation path.
- WebSearch: als-fft 3.4.1 (npm) — Has STFT and Hann windowing built-in. Alternative to fft.js if STFT is needed later. Not needed for Phase 2's rolling-window approach. — LOW confidence on API stability vs. fft.js.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fft.js and Canvas 2D are established and verified in Phase 1 research
- Architecture: HIGH — all patterns follow MDN-verified Canvas 2D APIs and existing ARCHITECTURE.md patterns
- Coherence formula: MEDIUM — HeartMath documented the CR structure; 0-100 mapping upper bound is estimated
- Pitfalls: HIGH — most pitfalls carried from verified PITFALLS.md research + circular buffer edge case confirmed from code inspection
- Lomb-Scargle availability: LOW — absence of a browser-ready port confirmed by search but absence of evidence ≠ evidence of absence

**Research date:** 2026-03-21
**Valid until:** 2026-06-01 (stable APIs; coherence calibration constants may need updating after first real sessions)
