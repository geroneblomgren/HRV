# v1.2 Design: Adaptive Closed-Loop Biofeedback

**Date:** 2026-04-04
**Milestone:** v1.2 — Resonance Mapping + Phase-Locked Breathing

## What This Is

Two features that convert ResonanceHRV from an open-loop breathing pacer into a closed-loop autonomic training system. The app finds your current resonance frequency before each session (it drifts) and then micro-adjusts the breathing pace in real-time to maximize the phase alignment between your breath and heart rate oscillation.

**Why it matters:** Right frequency + right phase = maximum vagal stimulation per breath. This is what separates casual relaxation breathing from clinical-grade autonomic training that measurably reduces cortisol, lowers RHR, and increases HRV.

## Core Value Change

v1.0-1.1: "See your biofeedback while breathing at a fixed pace."
v1.2: "The app actively optimizes your breathing to maximize autonomic training."

## Feature 1: Vagal Tone Resonance Mapping (Phase 10)

### What It Does

Before each practice session, a 60-second "tuning" phase where the user breathes freely while the app sweeps candidate frequencies and identifies the current peak RSA frequency. The session then runs at that frequency, not the stored one from weeks ago.

### UX Flow

1. User clicks "Start Session"
2. **Tuning phase** (60s): Breathing circle pulses at a slow exploratory pace. App cycles through 3-5 candidate frequencies centered on the last known RF (±0.5 BPM). Live RSA amplitude computed at each candidate.
3. Brief result: "Today's resonance: 4.7 BPM" (with comparison to stored frequency if different)
4. **If RF has shifted significantly (>0.3 BPM):** Celebrate it — "Your resonance shifted from 5.0 to 4.7 BPM — this suggests improved vagal tone ↑" with a trend sparkline showing RF over sessions
5. Session begins at the tuned frequency

### Resonance Map (Dashboard)

- New chart or overlay on existing dashboard showing RF over time (BPM on Y-axis, date on X-axis)
- Correlate with Oura HRV recovery — show both on same time axis
- Downward RF trend = improving vagal tone (literature-supported interpretation)

### Data Model

- Each session record adds: `tuningFreqHz` (the frequency selected by tuning), `tuningRsaAmplitude` (peak RSA at that frequency)
- Dashboard queries these to build the RF trend line

### Key Technical Details

- Tuning uses the existing FFT-based spectral analysis from dsp.js
- Candidate frequencies: stored RF ± 0.5 BPM in 0.25 BPM steps (typically 5 candidates)
- Each candidate gets ~12 seconds of breathing (60s / 5 candidates)
- RSA amplitude = peak power in LF band centered on the candidate frequency
- Winner = candidate with highest RSA amplitude

## Feature 2: Phase-Locked Breathing (Phase 11)

### What It Does

During practice sessions, the app continuously computes the instantaneous phase angle between the breathing pacer signal and the heart rate oscillation. It shows a "phase lock" score (replacing coherence) and smoothly micro-adjusts the breathing pace to maximize phase alignment.

### Phase Lock Score

- **Replaces coherence everywhere** — live gauge, session summary, dashboard trend
- Computed via Hilbert transform of the RR interval time series
- Measures the instantaneous phase difference between the breathing pacer's expected HR effect and the actual HR oscillation
- 0-100 scale: 100 = perfect phase lock (HR oscillation peak aligns exactly with inhale-exhale transition), 0 = no relationship
- Old sessions retain their coherence scores labeled as "(legacy)" in the dashboard

### Adaptive Pace Control

- When phase lock is below threshold for >10 seconds, the controller begins micro-adjusting pace
- Adjustment rate: max ±0.01 Hz per 30 seconds (~0.6 BPM per minute) — imperceptible drift
- Direction determined by comparing phase lead/lag: if HR oscillation leads the pacer → slow down, if it lags → speed up
- Bounded: never adjusts more than ±0.5 BPM from the tuned frequency
- The bowl echo timing naturally shifts with the pace — user feels the change through audio, not visual cues

### Session Summary Changes

- Phase lock replaces coherence in the 4-metric summary: Duration, Mean Phase Lock, Peak Phase Lock, Time Locked In (≥66)
- Session summary graph: HR, HRV (RMSSD), Phase Lock (replacing coherence), Neural Calm (if Muse)

### Dashboard Changes

- Phase lock trend line replaces coherence trend on recovery dashboard
- Old coherence data points labeled "(legacy)" or shown in a different style
- RF trend line from Feature 1 added as additional series

## Architecture

### New Modules

- `js/tuning.js` — Tuning phase controller: candidate generation, mini-block timing, RSA comparison, frequency selection
- `js/phaseLock.js` — Hilbert transform, instantaneous phase computation, phase lock score, adaptive pace controller

### Modified Modules

- `js/dsp.js` — Add Hilbert transform utility (or inline in phaseLock.js if cleaner)
- `js/practice.js` — Insert tuning phase before session start, replace coherence trace with phase lock trace, connect adaptive pace controller
- `js/renderer.js` — Replace coherence gauge with phase lock gauge (same arc style, different label/color)
- `js/audio.js` — Accept dynamic pace updates from adaptive controller (already supports any frequency via `startPacer()`, but may need a `setPace()` for mid-session changes)
- `js/dashboard.js` — Replace coherence trend with phase lock trend, add RF trend line
- `js/storage.js` — Add tuningFreqHz and phaseLock fields to session schema
- `js/discovery.js` — Tuning phase integration (optional — discovery already finds RF, but could use tuning as a faster alternative)

### Data Flow

```
Tuning Phase:
  Audio pacer (candidate freq) → User breathes → HRM RR intervals → FFT → RSA amplitude per candidate → Select peak → Store tuned frequency

Session with Phase Lock:
  Audio pacer (tuned freq) → User breathes → HRM RR intervals → Hilbert transform → Instantaneous phase angle → Phase lock score → Display
                                                                                    ↓
                                                              Phase lead/lag → Adaptive pace controller → Update pacer frequency (smooth drift)
```

## What NOT to Build

- **HEP neurofeedback** — HRM 600 lacks R-peak timestamps, Muse SNR insufficient
- **BRS training** — Requires blood pressure data we don't have
- **Polyvagal state classification** — Contested science, repackages existing metrics
- **Complex tuning algorithms** — Simple RSA peak comparison is sufficient; no ML needed

## Testing Strategy

- **Tuning phase:** Verify RSA amplitude differs across candidate frequencies using real HRM data. Compare selected frequency to full Discovery result.
- **Phase lock score:** During a practice session, score should rise as user settles into rhythm and fall when they pause or shift attention.
- **Adaptive pace:** When manually breathing slightly off-pace, the controller should drift toward the user's actual rhythm within 60 seconds.
- **Dashboard:** Old sessions show "(legacy)" coherence, new sessions show phase lock. Both render on the same chart without breaking.

## Success Criteria

1. User starts a session → 60s tuning identifies current RF → session begins at that frequency
2. RF trend on dashboard shows frequency over weeks, correlated with Oura HRV
3. Phase lock score replaces coherence — visible during session, in summary, on dashboard
4. When user is breathing in sync, phase lock is high (>70). When distracted, it drops.
5. Adaptive pace smoothly adjusts without user noticing (no jarring changes to echo timing)
6. Old coherence-based sessions still visible on dashboard with legacy labeling
