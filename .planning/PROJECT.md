# ResonanceHRV

## What This Is

A personal web-based adaptive resonance frequency breathing trainer with closed-loop HRV biofeedback and neural calm monitoring. Connects to a Garmin HRM 600 chest strap and/or Muse-S headband via Web Bluetooth. The app automatically tunes to the user's current resonance frequency before each session and micro-adjusts breathing pace in real-time to maximize cardiorespiratory phase alignment — converting casual breathing practice into clinical-grade autonomic training. Oura Ring integration tracks overnight recovery to measure long-term impact.

## Current Milestone: v1.2 Adaptive Closed-Loop Biofeedback

**Goal:** Convert from open-loop breathing pacer to closed-loop autonomic training system. Auto-tune resonance frequency before each session and optimize breath-heart phase alignment in real-time.

**Target features:**
- 60-second pre-session tuning phase to find current resonance frequency (RF drifts in 67% of people)
- Resonance frequency trend tracking on dashboard correlated with Oura recovery
- Phase lock score replacing coherence (Hilbert transform measures actual breath-heart synchronization)
- Adaptive pace controller that micro-adjusts breathing rate to maximize phase alignment
- Smooth audio drift so pace changes are felt, not seen (bowl echo timing shifts naturally)

## Core Value

Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency, not guessing.

## Requirements

### Validated

- ✓ Connect to Garmin HRM 600 via Web Bluetooth and stream RR intervals in real-time — v1.0
- ✓ Discovery mode: guide user through breathing at multiple candidate frequencies with 2-min blocks — v1.0
- ✓ Compute RSA amplitude and spectral analysis on live RR-interval data to identify resonance frequency — v1.0
- ✓ Practice mode: guided breathing sessions at the user's identified resonance frequency — v1.0
- ✓ Audio breathing pacer with three selectable styles — v1.0
- ✓ Visual breathing pacer with expanding/contracting circle animation — v1.0
- ✓ Real-time scrolling HR waveform — v1.0
- ✓ Live coherence score — v1.0
- ✓ Basic RR-interval artifact rejection — v1.0
- ✓ Session history stored in IndexedDB — v1.0
- ✓ Oura Ring API integration for overnight HRV trends — v1.0
- ✓ Recovery dashboard with session coherence + Oura overnight HRV trends — v1.0
- ✓ Device adapter pattern for multi-device BLE connections — v1.1
- ✓ Muse-S headband BLE connection with EEG + PPG streaming — v1.1
- ✓ PPG peak detection for standalone Muse-S HR/HRV sessions — v1.1
- ✓ Neural Calm metric (alpha/beta ratio) with live gauge during sessions — v1.1
- ✓ Alpha power bar replacing raw EEG waveform — v1.1
- ✓ Neural Calm trend on recovery dashboard — v1.1
- ✓ Bowl echo subdivisions for eyes-closed pace tracking — v1.1
- ✓ Session summary with HR, HRV (RMSSD), and Neural Calm line graphs — v1.1

### Active

- [ ] Pre-session tuning phase identifies current resonance frequency from live RSA analysis
- [ ] Resonance frequency trend tracked over sessions and displayed on dashboard
- [ ] Phase lock score (Hilbert transform) replaces coherence as primary biofeedback metric
- [ ] Adaptive pace controller micro-adjusts breathing rate to maximize phase alignment
- [ ] Session summary and dashboard use phase lock instead of coherence (legacy labeling for old data)

### Out of Scope

- Mobile/responsive design — desktop Chrome only, seated breathing sessions
- User accounts or cloud backend — personal tool, local storage only
- iOS/Safari support — Web Bluetooth not available on those platforms
- Camera PPG fallback — dedicated sensors provide superior data
- Export to CSV/JSON — can add later if needed
- Multi-user support — built for one person
- Garmin Fenix 8 wrist HR — cannot transmit RR intervals over BLE, wrist PPG too noisy for HRV
- Combined neurocardiac feedback signal — EEG calm displayed alongside HRV, not merged into single metric (no validated protocol exists)
- HEP neurofeedback — HRM 600 lacks R-peak timestamps, Muse SNR insufficient for 1-3µV signals
- Baroreflex sensitivity training — requires beat-by-beat blood pressure data we don't have
- Polyvagal state classification — contested science (Grossman 2023), would relabel existing metrics

## Context

- User is a high-volume athlete 5 weeks into a broken ankle recovery
- HRV has declined from high 80s to low 60s (Oura scores) over 6 weeks due to detraining
- Sleep efficiency has been chronically poor (avg ~60 on Oura) even pre-injury — classic conditioned arousal/insomnia pattern
- One week into CBT-I therapy; RFB is being added as a complementary intervention to address the autonomic crisis that CBT-I alone doesn't target
- Goal: stabilize HRV back above 75 (Oura score) within 4-6 weeks of daily RFB practice, supporting both sleep efficiency improvement and autonomic recovery during injury rehabilitation
- Garmin HRM 600 supports BLE Heart Rate Service (0x180D) with RR-interval data at 1/1024 second resolution via characteristic 0x2A37
- Web Bluetooth API available in Chrome/Edge on desktop
- Oura API v2 provides session HR/HRV at 5-second intervals and overnight HRV data; no real-time streaming

## Constraints

- **Platform**: Desktop Chrome only (Web Bluetooth requirement)
- **Hardware**: Garmin HRM 600 chest strap (BLE), Oura Ring (API)
- **Storage**: Browser-local only (localStorage/IndexedDB)
- **HTTPS**: Web Bluetooth requires secure origin (HTTPS or localhost)
- **No framework**: Vanilla HTML/CSS/JS — keep it simple, no build tools
- **Audio**: Web Audio API requires user gesture before AudioContext can start

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Garmin HRM 600 over Oura for real-time | Oura has no real-time data; HRM 600 provides beat-to-beat RR intervals via standard BLE | ✓ Good |
| Vanilla JS over React/framework | Personal tool, under 1000 lines expected, no build complexity needed | ✓ Good |
| Web Bluetooth over native app | No app store, no SDK, browser is sufficient for desktop use | ✓ Good |
| Three audio styles | User wants to experiment with rising/falling pitch, volume swell, and soft chimes to find what feels best | ✓ Good |
| Local storage over cloud | Personal tool, no need for accounts or sync | ✓ Good |
| Muse-S over Fenix 8 for v1.1 | Fenix 8 can't transmit RR intervals over BLE; Muse-S provides EEG + PPG — genuinely novel biofeedback | ✓ Good |
| PPG standalone HRV attempt | Muse PPG at 64 Hz provides usable RR intervals; IR channel best; chest strap remains gold standard | ✓ Good |
| EEG calm as parallel metric | Alpha/beta ratio from TP9/TP10 validated empirically; displayed alongside HRV | ✓ Good |
| Bowl-only audio with echo subdivisions | Quarter-beat echoes for eyes-closed pace tracking; removed unused pitch/swell styles | ✓ Good |
| Phase lock replacing coherence | Hilbert transform measures actual breath-heart phase alignment; coherence is an indirect proxy | — Pending |
| Pre-session RF tuning | RF drifts in 67% of people; 60s tuning ensures every session uses current optimal frequency | — Pending |
| Adaptive pace control | Smooth drift ±0.01 Hz/30s bounded to ±0.5 BPM from tuned frequency | — Pending |

---
*Last updated: 2026-04-04 after v1.2 milestone start*
