# ResonanceHRV

## What This Is

A personal web-based resonance frequency breathing trainer that connects to a Garmin HRM 600 chest strap via Web Bluetooth for real-time beat-to-beat HRV biofeedback. It identifies the user's personal resonance frequency through live spectral analysis of RR intervals, then guides daily practice sessions at that frequency with audio and visual pacing. Oura Ring integration provides longitudinal overnight HRV tracking to measure autonomic recovery over weeks.

## Core Value

Real-time HRV biofeedback during breathing sessions — seeing your heart rate oscillate in sync with your breath and knowing you're training at your exact resonance frequency, not guessing.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Connect to Garmin HRM 600 via Web Bluetooth and stream RR intervals in real-time
- [ ] Discovery mode: guide user through breathing at multiple candidate frequencies (6.0, 5.5, 5.0, 4.5 breaths/min) with 2-min blocks
- [ ] Compute RSA amplitude and spectral analysis on live RR-interval data to identify resonance frequency
- [ ] Practice mode: guided breathing sessions at the user's identified resonance frequency (15-20 min)
- [ ] Audio breathing pacer with three selectable styles: rising/falling pitch, volume swell, and soft chimes (sine wave ~300-400 Hz)
- [ ] Visual breathing pacer with expanding/contracting circle animation
- [ ] Real-time scrolling HR waveform showing heart rate oscillating with each breath
- [ ] Live coherence score showing how locked-in HR oscillation is to breathing pace
- [ ] Basic RR-interval artifact rejection (reject <300ms or >2000ms, reject >20% change from running median)
- [ ] Session history stored in browser localStorage/IndexedDB (RR intervals, coherence scores, frequency results)
- [ ] Oura Ring API integration to pull overnight HRV trends (via OAuth2/Personal Access Token)
- [ ] Dashboard showing autonomic recovery trajectory: session coherence trends + Oura overnight HRV trends over days/weeks

### Out of Scope

- Mobile/responsive design — desktop Chrome only, seated breathing sessions
- User accounts or cloud backend — personal tool, local storage only
- iOS/Safari support — Web Bluetooth not available on those platforms
- Camera PPG fallback — HRM 600 provides superior data
- Export to CSV/JSON — can add later if needed
- Multi-user support — built for one person

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
| Garmin HRM 600 over Oura for real-time | Oura has no real-time data; HRM 600 provides beat-to-beat RR intervals via standard BLE | — Pending |
| Vanilla JS over React/framework | Personal tool, under 1000 lines expected, no build complexity needed | — Pending |
| Web Bluetooth over native app | No app store, no SDK, browser is sufficient for desktop use | — Pending |
| Three audio styles | User wants to experiment with rising/falling pitch, volume swell, and soft chimes to find what feels best | — Pending |
| Local storage over cloud | Personal tool, no need for accounts or sync | — Pending |

---
*Last updated: 2026-03-21 after initialization*
