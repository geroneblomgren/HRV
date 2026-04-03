# ResonanceHRV

## What This Is

A personal web-based resonance frequency breathing trainer with real-time HRV biofeedback and neural calm monitoring. Connects to a Garmin HRM 600 chest strap or Muse-S headband via Web Bluetooth for beat-to-beat HRV analysis. The Muse-S additionally provides live EEG-derived relaxation metrics during sessions. It identifies the user's personal resonance frequency through spectral analysis of RR intervals, then guides daily practice sessions at that frequency with audio and visual pacing. Oura Ring integration provides longitudinal overnight HRV tracking to measure autonomic recovery over weeks.

## Current Milestone: v1.1 Muse-S Neurocardiac Integration

**Goal:** Add Muse-S headband as a second biofeedback device, providing standalone PPG-derived HRV plus live EEG neural calm metrics during sessions, with trends tracked on the recovery dashboard.

**Target features:**
- Refactor BLE into device adapter pattern (HRM 600 + Muse-S)
- Muse-S BLE connection with EEG + PPG streaming
- PPG peak detection pipeline for standalone RR interval extraction
- Neural Calm metric (alpha/beta power ratio) displayed during sessions
- Live scrolling EEG waveform during sessions
- Neural calm session averages tracked on recovery dashboard

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

### Active

- [ ] Device adapter pattern abstracting BLE connections for multiple device types
- [ ] Muse-S headband connection via Web Bluetooth (service 0xfe8d)
- [ ] Muse-S EEG streaming (5 channels at 256 Hz) with alpha/beta spectral analysis
- [ ] Muse-S PPG streaming (3 channels at 64 Hz) with peak detection for RR interval extraction
- [ ] Neural Calm metric (alpha/beta power ratio) displayed as live score during sessions
- [ ] Live scrolling EEG waveform during sessions
- [ ] Neural calm session averages tracked on recovery dashboard over time

### Out of Scope

- Mobile/responsive design — desktop Chrome only, seated breathing sessions
- User accounts or cloud backend — personal tool, local storage only
- iOS/Safari support — Web Bluetooth not available on those platforms
- Camera PPG fallback — dedicated sensors provide superior data
- Export to CSV/JSON — can add later if needed
- Multi-user support — built for one person
- Garmin Fenix 8 wrist HR — cannot transmit RR intervals over BLE, wrist PPG too noisy for HRV
- Combined neurocardiac feedback signal — EEG calm displayed alongside HRV, not merged into single metric (no validated protocol exists)

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
| Muse-S over Fenix 8 for v1.1 | Fenix 8 can't transmit RR intervals over BLE; Muse-S provides EEG + PPG — genuinely novel biofeedback | — Pending |
| PPG standalone HRV attempt | Muse PPG at 64 Hz may provide usable RR intervals; chest strap stays as gold standard fallback | — Pending |
| EEG calm as parallel metric | No validated combined EEG+HRV metric exists; display separately rather than merge | — Pending |

---
*Last updated: 2026-04-03 after v1.1 milestone start*
