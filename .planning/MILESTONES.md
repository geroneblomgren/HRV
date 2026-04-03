# Milestones: ResonanceHRV

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
