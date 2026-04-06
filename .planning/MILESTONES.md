# Milestones: ResonanceHRV

## v1.2 Adaptive Closed-Loop Biofeedback (Shipped: 2026-04-06)

**Delivered:** Converted from open-loop breathing pacer to closed-loop autonomic training system with pre-session resonance frequency tuning, real-time phase lock scoring, and adaptive pace control.

**Phases:** 10-13 (4 phases, 12 plans, 17 tasks)
**Timeline:** 3 days (2026-04-04 → 2026-04-06)
**Files modified:** 19 | Lines changed: +2,511 / -264
**Git range:** feat(10-01) → docs(phase-13)

10. Resonance Tuning + Mapping — 60s pre-session RF tuning, scanning ring animation, RF shift celebration, dashboard RF trend
11. Phase Lock Engine — Hilbert transform FFT bin extraction, 0-100 phase lock score, 25s calibration gate
12. Adaptive Pace Controller — Closed-loop micro-adjustment (±0.01 Hz/30s, bounded ±0.5 BPM), smooth bowl echo drift
13. Dashboard Integration — Three live ring gauges (coherence, phase lock, neural calm), phase lock + coherence trend split, legacy labeling

**Key accomplishments:**

- Pre-session tuning automatically identifies current resonance frequency from live RSA before every session
- Phase lock score measures actual breath-heart phase alignment via Hilbert transform, replacing coherence as primary metric
- Adaptive pace controller smoothly drifts breathing rate toward better phase lock — felt through bowl echo timing, never abrupt
- Coherence restored as secondary live gauge — three ring gauges visible during practice
- Dashboard shows phase lock + coherence as separate trends with legacy session labeling and clickable legend toggles
- RF trend line on dashboard correlates resonance frequency shifts with Oura overnight HRV

**Validated Requirements:** TUNE-01..04, MAP-01..03, LOCK-01..04, PACE-01..04, DASH-06..08 (18/18)

---

## v1.0 — Core HRV Biofeedback (Completed 2026-03-22)

**Goal:** Build a complete resonance frequency breathing trainer with real-time HRV biofeedback via Garmin HRM 600 and Oura overnight recovery tracking.

**Phases:** 1-5 (all complete)

1. Foundation — BLE connection + RR streaming + IndexedDB storage
2. Signal Processing + Visualization — Artifact rejection, spectral analysis, coherence scoring, Canvas rendering
3. Breathing Pacer — Visual circle animation + three audio styles with drift-free scheduler
4. Session Modes — Discovery protocol (5 blocks) + Practice mode (timed guided sessions)
5. Oura + Recovery Dashboard — PAT auth, overnight HRV pull, dual-axis recovery trend chart

**Validated Requirements:**

- BLE-01 through BLE-05: Garmin HRM 600 connection, RR streaming, reconnect
- STOR-01 through STOR-03: IndexedDB session/frequency/Oura persistence
- DSP-01 through DSP-05: Artifact rejection, spectral analysis, coherence scoring
- VIZ-01 through VIZ-03: HR waveform, spectrum chart, coherence gauge
- PAC-01 through PAC-07: Visual + audio pacer with 3 styles
- DISC-01 through DISC-05: Discovery protocol with frequency comparison
- PRAC-01 through PRAC-05: Practice mode with session summary
- OURA-01 through OURA-03: Oura API integration + caching
- DASH-01 through DASH-03: Recovery dashboard with dual-axis chart

## v1.1 — Muse-S Neurocardiac Integration (Completed 2026-04-04)

**Goal:** Add Muse-S headband as second biofeedback device with standalone PPG-derived HRV, live EEG neural calm metrics, and dashboard trends.

**Phases:** 6-9 (all complete)

6. Device Architecture — Adapter pattern, DeviceManager, dual-device UI
7. Muse-S Connection + Signal Processing — MuseAdapter BLE, PPG peak detection, EEG Neural Calm
8. Session Integration — PPG standalone sessions, Neural Calm gauge, alpha bar, bowl echoes, RMSSD graphs
9. Neural Calm Dashboard — Neural Calm trend line, inline legend, tooltips, 7d metric card

**Validated Requirements:**

- DEV-01 through DEV-04: Device adapter pattern, dual-device support
- MUSE-01 through MUSE-05: Muse-S BLE connection, EEG/PPG streaming
- PPG-01 through PPG-04: PPG peak detection, artifact rejection, standalone sessions, confidence marking
- EEG-01 through EEG-03: Alpha/beta power, artifact rejection, Neural Calm score
- SESS-01 through SESS-03: Neural Calm live display, alpha bar, session summary metrics
- DASH-04 through DASH-05: Neural Calm persistence and dashboard trend
