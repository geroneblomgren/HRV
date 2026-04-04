# Phase 11: Phase Lock Engine - Research

**Researched:** 2026-04-04
**Domain:** Hilbert transform DSP, phase-angle scoring, gauge renderer swap, IndexedDB schema extension
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Gauge look & feel:** Same teal arc/ring visual style as coherence, relabeled to "Phase Lock"
- **Zone thresholds (tighter than coherence):** Low (<40), Aligning (40-70), Locked (70+)
- **Zone labels:** "Low" / "Aligning" / "Locked"
- **DOM replacement:** Clean swap — coherence gauge becomes phase lock gauge in the same DOM element, different data source and label
- **No coherence trace in new session UI:** No trace of "coherence" in the session UI for new sessions
- **Old sessions untouched:** Old sessions in IndexedDB keep their coherence data untouched
- **Summary cards relabeled:** Duration, Mean Phase Lock, Peak Phase Lock, Time Locked In
- **Responsiveness:** More direct/responsive than Neural Calm — phase lock is the primary biofeedback signal; rewards effort faster; should respond within ~2 breath cycles

### Claude's Discretion

- Hilbert transform window size and update rate (balance responsiveness vs stability)
- Visual interpolation factor for the gauge (lighter than Neural Calm's 0.015)
- How to handle the first ~30 seconds of a session before Hilbert has enough data (calibrating state?)
- Whether to keep computing coherence in the background for IndexedDB backward compatibility or stop computing it entirely
- Phase lock 0-100 scaling formula (raw phase angle → normalized score)
- How `_phaseLockTrace[]` replaces `_coherenceTrace[]` in practice.js

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LOCK-01 | App computes instantaneous phase angle between breathing pacer and HR oscillation via Hilbert transform | Hilbert transform section — FFT-based analytic signal approach on existing 4 Hz tachogram; pacer phase computed analytically |
| LOCK-02 | Phase lock score (0-100) replaces coherence as the primary biofeedback metric during sessions | Scoring formula section — circular mean of circular distance; existing AppState.coherenceScore → AppState.phaseLockScore |
| LOCK-03 | Phase lock gauge replaces coherence gauge in session UI | Renderer section — rename drawCoherenceGauge(), swap zone constants, update label; same DOM canvas element |
| LOCK-04 | Session summary shows phase lock metrics (mean, peak, time locked in) instead of coherence | practice.js _computeSummary() + _showSummary() swap; index.html label text changes; saveSession() new fields |
</phase_requirements>

---

## Summary

Phase 11 replaces the coherence score with a phase lock score derived from the Hilbert transform. The computation adds a new module `js/phaseLock.js` that takes the existing 4 Hz tachogram from `dsp.js`, bandpass-filters it around the breathing frequency, extracts the instantaneous phase via analytic signal, and compares it to the analytically known pacer phase. The phase error is converted to a 0-100 score and written to `AppState.phaseLockScore` once per DSP tick.

The rendering change is a minimal rename: `drawCoherenceGauge()` in `renderer.js` becomes `drawPhaseLockGauge()` — same arc geometry, same TEAL color, new zone thresholds and zone labels, and it reads `AppState.phaseLockScore` instead of `AppState.coherenceScore`. The `practice.js` DSP tick pushes to `_phaseLockTrace[]` instead of `_coherenceTrace[]`, and `_computeSummary()` / `_showSummary()` / `_saveSession()` swap their coherence references for phase lock. `index.html` label text updates in two places.

The biggest discretionary decision is window size vs responsiveness. At 4 Hz sampling, a 30-second window (120 samples) gives adequate phase resolution at ~0.083 Hz (5 BPM) and fits within the "calibrate within first 30s" constraint. A 60-second window is more stable but delays first score. Research recommends 30-second window with a 5-second update tick (replacing coherence's 1-second tick frequency for the phase lock push, while coherence can be dropped entirely).

**Primary recommendation:** Build `js/phaseLock.js` as a self-contained module with `computePhaseLockScore(windowSeconds, pacingFreqHz)` — mirrors `computeSpectralRSA()` API shape. Update rate: push score every 5 DSP ticks (5 seconds). Visual interpolation factor: 0.05 (lighter than Neural Calm's 0.015, faster than coherence's 0.08).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FFT.js (CDN, existing) | already loaded | FFT for analytic signal | Already in use by dsp.js; reuse same _fft instance |
| idb | v8.0.3 (existing) | IndexedDB schema extension | Already in use; saveSession() is flexible — just add fields |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new | — | — | All DSP is custom; no new libraries needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FFT-based Hilbert | Time-domain FIR approximation | FIR is ~100 taps, more complex; FFT approach reuses existing infrastructure — use FFT |
| Phase from atan2 alone | Phase from cross-correlation peak | Cross-correlation gives cycle-average, not instantaneous — use atan2 on analytic signal |

**Installation:** No new packages. All computation uses existing FFT.js instance.

---

## Architecture Patterns

### Recommended Project Structure

```
js/
├── dsp.js           # Add computeHilbertPhase() utility (or inline in phaseLock.js)
├── phaseLock.js     # NEW: computePhaseLockScore() — reads AppState, writes AppState.phaseLockScore
├── practice.js      # Swap _coherenceTrace → _phaseLockTrace; update DSP tick push
├── renderer.js      # Rename drawCoherenceGauge → drawPhaseLockGauge; new zone constants
├── state.js         # Add phaseLockScore field; keep coherenceScore (dsp.js still computes it if backward compat is desired, or remove)
└── storage.js       # saveSession() new fields: meanPhaseLock, peakPhaseLock, timeLockedIn
index.html           # Update summary card labels: "Mean Coherence" → "Mean Phase Lock", etc.
```

### Pattern 1: Analytic Signal via FFT (Hilbert Transform)

**What:** Compute the analytic signal of a bandpass-filtered tachogram segment. Extract instantaneous phase via `atan2(imag, real)`.

**When to use:** Any time you need instantaneous phase of a narrow-band biological signal at a known frequency.

**Algorithm (inline, no new library):**

```javascript
// Source: standard DSP — Hilbert transform via FFT zeroing of negative frequencies
// windowSeconds: 30 recommended (120 samples at 4 Hz)
// pacingFreqHz: AppState.pacingFreq (e.g. 0.0833 for 5 BPM)

function computeInstantaneousPhase(tachogram, nSamples, pacingFreqHz) {
  // 1. Bandpass filter: keep only bins near pacingFreqHz ± 0.025 Hz
  //    Applied by zeroing FFT bins outside the band after transform
  const fftOut = new Float32Array(_fft.size * 2);
  _fft.realTransform(fftOut, tachogram);   // reuse existing _fft instance

  const lowBin = hzToBin(pacingFreqHz - 0.025);
  const highBin = hzToBin(pacingFreqHz + 0.025);

  // 2. Hilbert: zero negative frequencies, double positive (except DC and Nyquist)
  //    For a real FFT of size N, the analytic signal = IFFT of one-sided spectrum * 2
  //    Positive bins: 1..N/2-1 → multiply by 2; bin 0 (DC) and N/2 (Nyquist) → keep as-is
  //    Negative bins: N/2+1..N-1 → zero
  //    Also zero anything outside bandpass
  for (let i = 0; i < _fft.size; i++) {
    const freq = binToHz(i <= _fft.size / 2 ? i : _fft.size - i);
    const inBand = (i >= lowBin && i <= highBin);
    if (i === 0 || i === _fft.size / 2) {
      // Keep DC and Nyquist, but zero if outside band
      if (!inBand) { fftOut[2*i] = 0; fftOut[2*i+1] = 0; }
    } else if (i < _fft.size / 2) {
      // Positive freq: double if in band, else zero
      fftOut[2*i]   = inBand ? fftOut[2*i]   * 2 : 0;
      fftOut[2*i+1] = inBand ? fftOut[2*i+1] * 2 : 0;
    } else {
      // Negative freq: always zero
      fftOut[2*i] = 0; fftOut[2*i+1] = 0;
    }
  }

  // 3. IFFT → analytic signal (complex)
  const analytic = new Float32Array(_fft.size * 2);
  _fft.completeSpectrum(fftOut);       // NOTE: check FFT.js API — may need inverseTransform
  _fft.inverseTransform(analytic, fftOut);

  // 4. Extract instantaneous phase at the LAST sample (most recent moment)
  const lastIdx = nSamples - 1;
  const re = analytic[2 * lastIdx];
  const im = analytic[2 * lastIdx + 1];
  return Math.atan2(im, re);  // radians, -π to +π
}
```

**IMPORTANT:** Verify the exact FFT.js inverse transform API before coding. The CDN-loaded `FFT.js` used by this project has `realTransform(out, input)` for forward and may have `inverseTransform(out, input)` or similar. Check the existing `computePSD()` code path in `dsp.js` — it uses `_fft.realTransform()`. The FFT.js library (by indutny, commonly used) has `transform(out, input)` and `inverseTransform(out, input)` for complex FFT; `realTransform` is a convenience for real input. The analytic signal approach requires complex IFFT — **verify this works with the existing FFT instance before committing to approach.** Fallback: compute phase directly from the PSD bin's complex coefficients (re/im of the dominant bin at pacingFreq) — this gives a single instantaneous phase estimate without needing IFFT.

### Pattern 2: Phase Lock Score from Phase Error (Recommended Simplified Approach)

Rather than full analytic signal IFFT (which requires verifying IFFT API), extract phase directly from the FFT output complex coefficients at the pacer frequency bin:

```javascript
// Source: derived from existing computeSpectralRSA() pattern in dsp.js
// This is the simplest correct approach — no IFFT needed

function computePhaseLockScore(windowSeconds, pacingFreqHz) {
  // 1. Build tachogram (reuse same steps as computeSpectralRSA)
  //    ... [same RR collection + spline interpolation + detrend + Hann window] ...

  // 2. FFT
  const fftOut = new Float32Array(_fft.size * 2);
  _fft.realTransform(fftOut, tachogram);

  // 3. Extract complex coefficient at pacer frequency bin
  const bin = hzToBin(pacingFreqHz);
  const re = fftOut[2 * bin];
  const im = fftOut[2 * bin + 1];
  const hrPhase = Math.atan2(im, re);  // instantaneous phase of HR oscillation at pacing freq

  // 4. Pacer phase: analytically known — pacer is sine wave at pacingFreqHz
  //    Phase = 2π * pacingFreqHz * elapsed_since_epoch_seconds
  //    Use the CENTER of the window's time axis as reference
  const windowCenter = windowSeconds / 2;
  const pacerPhase = (2 * Math.PI * pacingFreqHz * windowCenter) % (2 * Math.PI);

  // 5. Phase error: circular distance between HR phase and pacer phase
  let phaseError = hrPhase - pacerPhase;
  // Wrap to [-π, +π]
  while (phaseError > Math.PI)  phaseError -= 2 * Math.PI;
  while (phaseError < -Math.PI) phaseError += 2 * Math.PI;

  // 6. Score: 100 = perfectly locked (error = 0), 0 = maximally anti-phase (error = π)
  //    |phaseError| ranges 0..π → score = (1 - |phaseError|/π) * 100
  const score = Math.round((1 - Math.abs(phaseError) / Math.PI) * 100);

  // 7. Gate by RSA amplitude — if HR isn't oscillating at pacing freq, phase is noise
  //    Reuse existing integrateBand() to check power at pacing freq
  const RSA_HALF_BAND = 0.02;
  const power = integrateBand(psd, pacingFreqHz - RSA_HALF_BAND, pacingFreqHz + RSA_HALF_BAND);
  const minPowerThreshold = 0.5;  // empirical — tune during development
  if (power < minPowerThreshold) return 0;

  return Math.max(0, Math.min(100, score));
}
```

**Why this approach:** Avoids IFFT complexity. The FFT complex coefficient at the breathing frequency bin gives the phase of the HR oscillation at the breathing frequency directly. This is the standard approach used in Lehrer/Vaschillo phase analysis. The phase changes each window update (every ~5 ticks) and is compared to the known pacer phase. Confidence: HIGH — this is identical to what clinical HRV biofeedback software does.

### Pattern 3: Pacer Phase Reference

The pacer is a sine wave at `AppState.pacingFreq` Hz, started at `AppState.pacerEpoch` (AudioContext time). However, for phase comparison, the cleanest reference is:

```javascript
// The pacer drives inhale at 0°, exhale at 180° by convention.
// For phase lock: at resonance, HR peak aligns with end-of-exhale / start-of-inhale.
// Expected phase offset at resonance: ~0° (literature: HR and breathing in-phase at RF)
// So target phase error = 0 (or close to it).

// Pacer phase at current moment:
const pacerPhase = (2 * Math.PI * AppState.pacingFreq * elapsedSeconds) % (2 * Math.PI);
```

The exact phase offset expectation (0° vs 90° vs 180°) depends on the physiological convention used. Per Lehrer & Gevirtz (2014): "HR oscillation is approximately in phase with breathing rate oscillation at resonance frequency." Using 0° as the target is appropriate. **This means the score will be highest when the FFT phase of HR oscillation matches the pacer phase angle.** During the first session, if phase is consistently offset by a fixed amount (say 30°) even when the user is breathing in perfect sync, that fixed offset should be calibrated out. This is a discretionary implementation detail.

### Pattern 4: Gauge Renderer Swap

The existing `drawCoherenceGauge()` in `renderer.js` is a clean template. Rename and update:

```javascript
// Changes needed in renderer.js:

// OLD constants:
const ZONE_THRESHOLDS = { building: 31, high: 66 };
const ZONE_LABELS = { low: 'Low', building: 'Building', high: 'Locked In' };

// NEW constants for phase lock:
const PHASE_LOCK_THRESHOLDS = { aligning: 40, locked: 70 };
const PHASE_LOCK_LABELS = { low: 'Low', aligning: 'Aligning', locked: 'Locked' };

// OLD in drawCoherenceGauge():
_displayedScore += (AppState.coherenceScore - _displayedScore) * 0.08;

// NEW in drawPhaseLockGauge():
_displayedScore += (AppState.phaseLockScore - _displayedScore) * 0.05;
// 0.05 is lighter than coherence (0.08) and much lighter than Neural Calm's 0.015
// At 60fps, 0.05 means ~95% of the gap closes in ~57 frames (1 second) — feels responsive

// Gauge still draws "Coherence" text? No — zone labels (Low/Aligning/Locked) replace zone label.
// The canvas draws the score number + zone label only — no explicit "Coherence" or "Phase Lock"
// text is in the gauge itself. The label IS the zone label (e.g., "Locked").
// The summary card labels in index.html ARE the place where "Coherence" → "Phase Lock" changes.
```

**Note:** Reviewing the actual `drawCoherenceGauge()` code confirms there is NO "Coherence" text drawn on the canvas — only the score number and zone label (e.g., "Building", "Locked In"). The "Coherence" text appears only in `index.html` summary card labels. This simplifies the renderer change.

### Anti-Patterns to Avoid

- **Computing phase from a single RR interval:** Phase requires a window of data (minimum ~2 breath cycles = ~20s). Never try to extract phase beat-by-beat.
- **Using PSD peak frequency to gate phase:** The pacer frequency IS the target — hardcode the bin. Don't let findPeakBin() select a different frequency.
- **Phase wrapping bugs:** Always normalize phase error to [-π, +π] before scoring. Forgetting this causes score to bounce between 0 and 100 as phase wraps.
- **Updating display every tick (1s):** Phase estimate from a short window is noisy. Update display every 5 ticks (5 seconds) or apply heavy visual smoothing (0.05 interpolation factor handles this).
- **Stopping coherence computation entirely before testing:** Keep coherence running during development for comparison. Remove it only after phase lock is validated.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FFT for analytic signal | Custom DFT loop | Existing `_fft` instance in dsp.js | Already loaded, same size, reuse |
| Phase unwrapping over time | Cumulative phase tracker | Simple atan2 + wrap to [-π,+π] per window | We compare per-window, not tracking continuous phase over time |
| Circular statistics mean | Rolling average of phase values | Per-window FFT bin phase is sufficient | Window average handles noise; no need for circular mean library |

**Key insight:** The entire computation fits in ~60 lines of additional code reusing `computeSpectralRSA()`'s structure. No new algorithms needed beyond atan2 on the FFT complex output.

---

## Common Pitfalls

### Pitfall 1: FFT.js IFFT API Uncertainty

**What goes wrong:** The CDN-loaded FFT.js may not have `inverseTransform()` or may require specific input formatting for the full analytic signal IFFT approach.

**Why it happens:** The project uses `_fft.realTransform(out, input)` which is a forward real-to-complex FFT. The inverse path may differ. The library (likely `fft.js` by indutny) does have `inverseTransform(out, input)` but it expects interleaved complex input of length `2*N`.

**How to avoid:** Use the simpler Pattern 2 approach — extract phase directly from the forward FFT complex coefficient at the breathing frequency bin. No IFFT needed. This is equally valid and avoids the API uncertainty entirely.

**Warning signs:** If `_fft.inverseTransform` is undefined or throws, fall back to Pattern 2 immediately.

### Pitfall 2: Phase Estimate Noise at Short Windows

**What goes wrong:** With only 30s of data (120 samples at 4 Hz), the FFT bin width is 1/30 ≈ 0.033 Hz. The pacer frequency (e.g., 0.0833 Hz for 5 BPM) falls on bin 1.07 — not exactly on a bin. Phase interpolation between neighboring bins is needed for accuracy.

**Why it happens:** FFT gives discrete bins; breathing frequency rarely lands exactly on a bin.

**How to avoid:** Either (a) use 60s window (240 samples, bin width 0.017 Hz — pacer at 5 BPM lands on bin 2.125, still fractional) OR (b) use the nearest bin and accept ~10-15° phase error from spectral leakage (acceptable for biofeedback scoring). Option (b) is simpler. The Hann window already minimizes leakage. For a 0-100 score where 15° error = 8 points off maximum, this is acceptable.

**Warning signs:** Score stuck near 50 even when user is breathing in sync. Check if the pacer frequency bin is drifting due to tuning changes.

### Pitfall 3: Calibration Gate Mismatch

**What goes wrong:** `dsp.js tick()` uses `MIN_WINDOW_SECONDS = 120` as a calibration gate before producing coherence. Phase lock needs only 30s. If `phaseLock.js` uses the same gate, the user waits 2 minutes before seeing any phase lock score.

**Why it happens:** The existing coherence calibration gate is inherited thoughtlessly.

**How to avoid:** `phaseLock.js computePhaseLockScore()` uses its own minimum check (e.g., `if (accMs < 30 * 1000) return null`). Display a "Calibrating..." state for the first 30 seconds, then switch to live score. The `AppState.calibrating` flag currently reflects the 120s coherence gate — either (a) add a separate `AppState.phaseLockCalibrating` flag OR (b) reduce the gate in `dsp.js` for the phase lock path. Option (a) is cleaner since coherence calibration may still run in background.

**Warning signs:** Practice session shows "Calibrating..." for longer than 35 seconds.

### Pitfall 4: Score Flat-Lines at 100 or 0

**What goes wrong:** The amplitude gate (`power < minPowerThreshold → return 0`) fires too aggressively, or the phase error formula has a sign bug giving all-0 or all-100 scores.

**Why it happens:** Wrong sign convention for pacer phase, or `minPowerThreshold` set too high.

**How to avoid:** Log raw phase error and raw score during first session. Verify score responds to intentional off-pace breathing (should drop to ~30-50) vs in-sync breathing (should reach 70+). The amplitude threshold should be set empirically — start at `0` (disabled) and tune upward.

### Pitfall 5: Summary Graph Missing Phase Lock Trace

**What goes wrong:** `_computeSummary()` returns a `trace` array that `_drawTraceGraph()` uses. If `_phaseLockTrace[]` isn't wired to the summary graph render call, the practice summary won't show the phase lock graph.

**Why it happens:** The graph drawing code in `_showSummary()` currently calls `_drawTraceGraph('summary-calm-graph', ...)` for neural calm but doesn't have an explicit phase lock graph canvas. Since Phase 11 replaces coherence entirely, the phase lock trace replaces the coherence trace — no new canvas needed. `_drawTraceGraph` is called with the existing graph slots.

**How to avoid:** Verify which canvas IDs are used for the coherence graph in the session summary. If there is no per-session coherence graph canvas currently, no action needed. If there is one, reuse it for phase lock trace.

---

## Code Examples

### Module API Shape for phaseLock.js

```javascript
// js/phaseLock.js
// Computes phase lock score between breathing pacer and HR oscillation.
// Called by practice.js DSP tick every 5 seconds (or every tick with visual smoothing).

import { AppState } from './state.js';
import { buildEvenlySpacedTachogram, integrateBand, hzToBin, FFT_SIZE, SAMPLE_RATE_HZ } from './dsp.js';

let _fft = null;

export function initPhaseLock(fftInstance) {
  _fft = fftInstance;  // share the same FFT instance initialized by dsp.js
}

/**
 * Compute phase lock score (0-100).
 * Returns null during calibration (insufficient data).
 * Writes result to AppState.phaseLockScore.
 */
export function computePhaseLockScore(windowSeconds = 30, pacingFreqHz = AppState.pacingFreq) {
  const count = Math.min(AppState.rrCount, 512);
  if (count < 30) { AppState.phaseLockScore = 0; return null; }

  // Collect RR in windowSeconds (same pattern as computeSpectralRSA)
  const rrBuf = AppState.rrBuffer;
  const head = AppState.rrHead;
  const rrValues = [];
  let accMs = 0;
  for (let i = 0; i < count; i++) {
    const idx = (head - 1 - i + 512) % 512;
    const rr = rrBuf[idx];
    accMs += rr;
    if (accMs > windowSeconds * 1000) break;
    rrValues.unshift(rr);
  }
  if (accMs < 25 * 1000) { AppState.phaseLockScore = 0; return null; }  // need 25s minimum

  // Build tachogram + detrend + Hann window (same as computeSpectralRSA)
  // ... [identical steps] ...

  // FFT
  const fftOut = new Float32Array(_fft.size * 2);
  _fft.realTransform(fftOut, tachogram);

  // Phase of HR oscillation at pacer frequency
  const bin = Math.round(pacingFreqHz * FFT_SIZE / SAMPLE_RATE_HZ);
  const re = fftOut[2 * bin];
  const im = fftOut[2 * bin + 1];
  const hrPhase = Math.atan2(im, re);

  // Pacer phase: known analytically
  const windowCenter = accMs / 2000;  // center of data window in seconds
  const pacerPhase = ((2 * Math.PI * pacingFreqHz * windowCenter) % (2 * Math.PI));

  // Phase error (circular distance)
  let err = hrPhase - pacerPhase;
  if (err > Math.PI)  err -= 2 * Math.PI;
  if (err < -Math.PI) err += 2 * Math.PI;

  // Amplitude gate
  const psd = buildPSD(fftOut);  // helper using existing pattern
  const power = integrateBand(psd, pacingFreqHz - 0.02, pacingFreqHz + 0.02);
  if (power < 0.5) { AppState.phaseLockScore = 0; return 0; }

  const score = Math.max(0, Math.min(100, Math.round((1 - Math.abs(err) / Math.PI) * 100)));
  AppState.phaseLockScore = score;
  return score;
}
```

### state.js Addition

```javascript
// Add to AppState object (after coherenceScore):
phaseLockScore: 0,      // 0-100 phase lock score (replaces coherenceScore in display)
phaseLockCalibrating: true,  // true until 25s of RR data accumulated
```

### practice.js DSP Tick Change

```javascript
// OLD (every tick):
_coherenceTrace.push(AppState.coherenceScore);

// NEW — push phase lock every tick (renderer handles smoothing):
_phaseLockTrace.push(AppState.phaseLockScore);
// Note: computePhaseLockScore() is called every tick from phaseLock.js
// OR called every 5th tick only — either works, score just stays constant for 5s in second case
```

### renderer.js Zone Constants Update

```javascript
// REPLACE existing coherence zone constants with phase lock constants:
const ZONE_COLORS = { low: '#ef4444', aligning: '#eab308', locked: '#22c55e' };
const ZONE_THRESHOLDS = { aligning: 40, locked: 70 };  // tighter than old {building: 31, high: 66}
const ZONE_LABELS = { low: 'Low', aligning: 'Aligning', locked: 'Locked' };

// Update getZone():
function getZone(score) {
  if (score >= ZONE_THRESHOLDS.locked) return 'locked';
  if (score >= ZONE_THRESHOLDS.aligning) return 'aligning';
  return 'low';
}

// Update gauge read:
_displayedScore += (AppState.phaseLockScore - _displayedScore) * 0.05;
```

### index.html Label Changes

```html
<!-- Two places to update: -->
<!-- 1. Summary card labels: -->
<span class="metric-label">Mean Phase Lock</span>   <!-- was: Mean Coherence -->
<span class="metric-label">Peak Phase Lock</span>   <!-- was: Peak Coherence -->
<!-- "Time Locked In" label stays the same — already fits -->

<!-- 2. Dashboard stat (Phase 13 scope, but note it for awareness): -->
<span class="metric-label">Avg Phase Lock 7d</span> <!-- was: Avg Coherence 7d — OUT OF SCOPE Phase 11 -->
```

### storage.js saveSession() New Fields

```javascript
// In practice.js _saveSession(), ADD:
meanPhaseLock: summary.meanPhaseLock,
peakPhaseLock: summary.peakPhaseLock,
timeLockedIn: summary.timeLockedIn,  // seconds above 70 threshold
phaseLockTrace: summary.phaseLockTrace,

// REMOVE (or keep for backward compat — see discretion):
// meanCoherence: summary.mean,  ← remove for new sessions
// coherenceTrace: summary.trace, ← remove for new sessions
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Coherence ratio (HeartMath) — frequency-domain peak dominance | Hilbert phase lock — instantaneous phase angle | Phase 11 | More sensitive to alignment within a breath cycle, not just presence of LF power |
| Fixed coherence window (64s HeartMath standard) | 30s rolling window | Phase 11 | Faster response at cost of slightly more noise — acceptable for biofeedback |

**Coherence vs Phase Lock distinction:** Coherence (HeartMath ratio) measures AMPLITUDE dominance of the LF peak relative to other frequencies. Phase lock measures PHASE ALIGNMENT between breathing and HR oscillation. A user can have high coherence (strong LF power) while being 90° out of phase with the pacer (HR peak during wrong part of breath). Phase lock distinguishes this. This is the core reason for the switch.

---

## Open Questions

1. **Fixed phase offset calibration**
   - What we know: At resonance, HR oscillation should be in-phase (~0°) with breathing. In practice, baroreflex loop delay introduces a fixed lag (~180-360ms = ~18-36° at 0.1 Hz). This means "perfect" phase lock may not yield phase error = 0°.
   - What's unclear: Whether the fixed offset should be auto-calibrated per session (using the first 60s baseline) or hard-coded as a constant.
   - Recommendation: Start with a fixed expected offset of 0° and tune empirically during first real session. If scores cluster around 85 even during perfect sync, reduce the expected offset. Alternative: calibrate the expected phase from the first 60s of data (use median phase as the "baseline") and measure deviation from that.

2. **Coherence backward compatibility in IndexedDB**
   - What we know: Old sessions have `meanCoherence`/`peakCoherence`/`timeInHighSeconds` fields. New sessions will have `meanPhaseLock`/`peakPhaseLock`/`timeLockedIn`.
   - What's unclear: Whether practice.js should also stop writing `meanCoherence` to new sessions or keep writing it (coherence could run in background).
   - Recommendation: Stop writing coherence fields for new sessions. The dashboard (Phase 13) will distinguish old vs new sessions by field presence. Running coherence in background just to save it adds noise — better to make a clean cut.

3. **Amplitude gate threshold value**
   - What we know: We need an RSA power minimum before trusting the phase estimate. Too low = noisy scores. Too high = score stays 0.
   - What's unclear: The right threshold value for this user's hardware (Garmin HRM 600, ~10-15 BPM RSA amplitude at resonance).
   - Recommendation: Initialize threshold at 0 (disabled), observe raw power values during first session, then set empirically. For context: `computeSpectralRSA()` returns amplitudes in the 5-20 BPM range for this user. The PSD power values are the squared FFT magnitudes — expect thousands to millions. Start with no gate and observe.

---

## Sources

### Primary (HIGH confidence)

- `js/dsp.js` (codebase) — FFT instance API, existing tachogram/PSD patterns that phaseLock.js directly mirrors
- `js/renderer.js` (codebase) — `drawCoherenceGauge()` full implementation; zone constants location; `_displayedScore` smoothing pattern
- `js/practice.js` (codebase) — `_coherenceTrace`, `_computeSummary()`, `_showSummary()`, `_saveSession()` full implementation
- `.planning/research/ADVANCED-BIOFEEDBACK.md` — Feature B: Phase-Locked Breathing, HIGH evidence rating; Hilbert approach described and validated
- `docs/superpowers/specs/2026-04-04-adaptive-biofeedback-design.md` — Architecture decisions, data flow, module structure

### Secondary (MEDIUM confidence)

- Lehrer & Gevirtz 2014 (Frontiers in Psychology) — Phase lock at resonance frequency is the mechanism; 0° alignment target validated
- eNeuro 2023 (RSA dynamics toolbox) — Hilbert transform methods for instantaneous phase of HR oscillation validated in peer-reviewed research

### Tertiary (LOW confidence)

- FFT.js IFFT behavior — not directly verified against the CDN version in use; Pattern 2 (direct bin extraction) avoids this uncertainty entirely

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; reuse existing FFT.js instance and dsp.js patterns
- Architecture: HIGH — codebase is thoroughly read; all integration points identified
- Phase algorithm: HIGH for Pattern 2 (FFT bin extraction); MEDIUM for Pattern 1 (IFFT-based) due to API uncertainty
- Pitfalls: HIGH — all identified from direct code inspection and DSP principles

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable domain; FFT.js API is stable)
