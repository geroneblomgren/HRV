# Feature Research

**Domain:** HRV biofeedback resonance frequency breathing trainer (personal web app)
**Researched:** 2026-03-21
**Confidence:** MEDIUM — core feature set is well-established from academic literature and app analysis; specific UX details inferred from multiple competitor observations

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features present in every serious HRV biofeedback app. Missing any of these means the tool doesn't fulfill its basic contract.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Breathing pacer — visual | All biofeedback apps use an expanding/contracting circle or rising/falling bar to guide inhale/exhale timing. Without it, users cannot breathe at a precise rate. | LOW | Sine-wave driven circle expansion is the universal pattern. 5s inhale / 5s exhale at 6 BPM is the default cadence. |
| Breathing pacer — audio | Audio guidance is expected alongside visual so eyes can close. Loss of visual during a session is common. | LOW | Multiple tone styles preferred (rising pitch, volume swell, chimes). Web Audio API. Requires user gesture before AudioContext starts. |
| Real-time heart rate display | Users must see their HR oscillating to know the sensor is working and that RSA is occurring. Without this, biofeedback becomes blind faith. | LOW | Scrolling waveform with ~60s window. Derived from RR intervals, not a raw ECG — smooth enough for purpose. |
| Live coherence/RSA score | The primary biofeedback signal. Tells users whether breathing is locked to HR oscillation. HeartMath, Elite HRV, HRV4Biofeedback all show this prominently. | MEDIUM | Rolling spectral window (30–64s). Coherence ratio = peak LF power / total spectral power in 0.04–0.26 Hz band. Updating every 1–2s feels live. |
| Session timer | Users need to know how long they have been in a session and how long remains. Standard in every app. | LOW | Simple countdown display. Discovery mode needs per-frequency block timers. |
| BLE heart rate sensor connection | The entire product requires beat-to-beat RR data from a chest strap. Without a reliable connection layer, nothing works. | MEDIUM | Web Bluetooth API, BLE Heart Rate Service 0x180D, characteristic 0x2A37. Garmin HRM 600 uses standard GATT profile. Connection status indicator (connecting / connected / lost) is essential. |
| RR-interval artifact rejection | Raw RR streams contain ectopic beats, motion artifacts, and signal dropouts. Without rejection, coherence scores are garbage and may spike or crash. All serious apps implement this. | MEDIUM | Reject RR < 300ms or > 2000ms. Reject > 20% deviation from 5-beat running median. Do not use general HRV correction (25% threshold) during biofeedback deep breathing — large RSA swings look like artifacts to standard algorithms. |
| Session history storage | Users return daily. They need to see that practice is accumulating and whether coherence is improving over time. Apps without history feel like they reset after every session. | LOW | IndexedDB in browser. Store per-session: date, duration, mode, mean coherence, resonance frequency used, peak RR amplitude. |
| Resonance frequency protocol (Discovery mode) | Without a systematic way to find their personal resonance frequency, users are guessing. The discovery protocol — breathing 2-min blocks at 6.5, 6.0, 5.5, 5.0, 4.5 BPM and identifying which rate maximizes RSA amplitude — is the clinical standard. HRV4Biofeedback, Elite HRV, and RHz all include this. | HIGH | Criterion for selection: largest peak-to-trough HR amplitude, highest LF spectral peak, and smoothest sine-wave HR envelope. Must save the identified frequency for use in Practice mode. |
| Practice mode with saved frequency | After discovery, users need a guided session at their personal frequency. Running generic 6 BPM sessions after identifying 5.5 BPM as resonance frequency wastes training. | MEDIUM | Load saved resonance frequency, run pacer at that exact rate, show coherence in real-time for 15–20 min. |

---

### Differentiators (Competitive Advantage)

These features distinguish ResonanceHRV from existing apps and directly support the project's core value: knowing you are training at your exact resonance frequency, not guessing.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Garmin HRM 600 via Web Bluetooth — no companion app | Existing apps (HRV4Biofeedback, Elite HRV) require iOS/Android. ResonanceHRV runs in a browser tab, no install. Garmin HRM 600 RR data is at 1/1024s precision, superior to most PPG options. | MEDIUM | Web Bluetooth is Chrome/Edge desktop only. Needs HTTPS or localhost origin. Standard GATT Heart Rate profile — well documented. |
| Three selectable audio pacer styles | Most apps offer one generic tone. HRV4Biofeedback offers "background nature sounds" and vibration. Offering rising/falling pitch, volume swell, and soft chimes (sine ~300–400 Hz) lets the user find what feels least intrusive during 20-min sessions. | LOW | Web Audio API oscillators + envelope shaping. No external assets needed. |
| Oura Ring overnight HRV trend overlay | No competing biofeedback app correlates real-time session coherence with longitudinal overnight recovery data in one view. HRV4Biofeedback uses HealthKit (iOS-only). Elite HRV has no Oura integration. This context — "my practice coherence today vs. my overnight HRV this week" — is what makes progress legible. | MEDIUM | Oura API v2 (cloud.ouraring.com/v2/docs). Personal Access Token auth (no OAuth dance needed for personal tool). Endpoints: /v2/usercollection/daily_readiness or /v2/usercollection/sleep for overnight HRV. Pull on app load, cache in IndexedDB. |
| Spectral RSA amplitude display during Discovery mode | Commercial apps show a coherence number. Showing the raw power spectrum alongside the HR waveform during Discovery lets the user see — with scientific transparency — which frequency produces the sharpest LF peak. This is what clinical setups show (Frontiers 2020 practical guide). | HIGH | Lomb-Scargle spectral estimator is preferred over FFT for unevenly-spaced RR intervals (no interpolation artifact). 2-min rolling window during each discovery block. |
| Vanity-free personal tool design | No gamification, no streaks, no notifications, no social features. The design cue is: "the data speaks, you act." Users building a 4–6 week HRV recovery plan value signal-to-noise. | LOW | Deliberate omission. Sparse UI, dark background, waveforms visible at a glance. |
| Combined recovery dashboard: session coherence + Oura overnight HRV | A time-series chart overlaying daily practice coherence (mean, per session) with nightly Oura HRV scores over weeks makes autonomic trend visible. No existing app does this for this hardware combination. | MEDIUM | Client-side chart (Canvas or SVG). X-axis = calendar days. Two Y-axes (coherence 0–100, Oura HRV ms). Simple, no framework. |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Gamification (streaks, badges, points, leaderboards) | Increases habit formation motivation | Encourages shorter sessions or skipping coherence quality to preserve a streak. The biofeedback literature recommends 20-min sessions twice daily — gamification pressure works against session length. | Show cumulative practice minutes and a simple coherence trend chart. Progress is visible without competitive framing. |
| Real-time respiration belt / nose thermistor requirement | More accurate resonance detection | ResonanceHRV uses inferred respiration from the pacer (the user breathes to the pacer, so the pacer IS respiration). Adding a second hardware requirement (chest respiration sensor) blocks adoption. | Trust the pacer signal as the respiration reference. Phase offset between the pacer and the HR oscillation is inferable from the spectral peak timing. |
| PPG camera fallback | Removes hardware dependency | Camera PPG is substantially noisier than ECG-based RR intervals from a chest strap, particularly for HRV/spectral analysis. Adds significant artifact rejection complexity for no gain — the user already owns the HRM 600. | Out of scope in PROJECT.md. Keep chest strap as the only supported input. |
| Cloud sync / user accounts | Access sessions from multiple devices | This is a single-user personal tool. Cloud sync means authentication, a backend, CORS handling, data schema versioning. None of this is necessary. Adds attack surface and maintenance burden. | Browser-local IndexedDB. Explicit export-to-JSON as a future addition if the user ever needs migration. |
| Social sharing / community features | Motivation through community | Misaligned with the personal medical/recovery nature of this tool. HRV data is sensitive (cardiac health indicators). | Not in scope. |
| Guided meditation audio library | Many users associate breathing practice with meditation apps | Meditation guidance adds content management, licensing concerns, and distracts from the biofeedback signal. Users should be watching the waveform, not listening to narration. | Offer ambient sound (brown noise, silence) as a background option if anything. |
| iOS/Safari/mobile support | Reach more devices | Web Bluetooth is not available on iOS/Safari (Apple restriction, confirmed as of 2026). Mobile biofeedback sessions while moving produce motion artifacts that corrupt RR data. This tool is for seated desktop practice. | State clearly: Chrome/Edge desktop only. |
| RMSSD-based "morning readiness" measurements | HRV apps often include a 2-min morning measurement mode | This is out of scope — the Oura Ring already provides overnight HRV via its API. A second morning measurement creates data confusion and adds a second workflow. | Use Oura for baseline; biofeedback for active practice. |
| Export to CSV on every session | Power-user request | Export adds UI complexity. For a personal tool, IndexedDB access via browser devtools or a future one-click export is sufficient. | Out of scope for v1. Add as a one-button JSON dump in v1.x if needed. |

---

## Feature Dependencies

```
[Web Bluetooth sensor connection]
    └──required by──> [RR-interval artifact rejection]
                          └──required by──> [Real-time HR waveform]
                          └──required by──> [Live coherence score]
                          └──required by──> [Discovery mode — resonance frequency detection]
                                                └──produces──> [Saved resonance frequency]
                                                                   └──required by──> [Practice mode]

[Breathing pacer — visual]
    └──required by──> [Discovery mode] (paces the user at each test frequency)
    └──required by──> [Practice mode]

[Breathing pacer — audio]
    └──enhances──> [Practice mode] (allows eyes-closed practice)
    └──depends on──> [Web Audio API user gesture]

[Session history storage]
    └──required by──> [Recovery dashboard — session coherence trend]

[Oura API integration]
    └──required by──> [Recovery dashboard — overnight HRV trend]

[Recovery dashboard]
    └──requires──> [Session history storage] + [Oura API integration]

[Spectral RSA display during Discovery]
    └──requires──> [RR-interval artifact rejection]
    └──enhances──> [Discovery mode] (makes frequency selection visible, not just computed)
```

### Dependency Notes

- **Web Bluetooth connection is the critical path root.** Every data-dependent feature fails without it. Get this right before building any analysis layer.
- **Artifact rejection must precede coherence scoring.** During biofeedback deep breathing, HR swings of 15–20 BPM are normal. Standard 25% ectopic-rejection thresholds will false-positive these as artifacts. Use the biofeedback-specific rejection criteria (300ms / 2000ms bounds + 20% running-median filter only).
- **Discovery mode produces saved resonance frequency.** Practice mode is a dead feature until Discovery is complete and a frequency is stored. Ship Discovery before Practice.
- **Oura API integration and session storage are independent.** They converge only in the recovery dashboard. Both can be built in parallel.
- **Audio pacer requires user gesture.** The Web Audio API's AudioContext cannot be started without a prior user interaction (button click or keypress). Design the session start flow around this constraint — do not try to auto-start audio on page load.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — validates the core value: real-time HRV biofeedback at confirmed resonance frequency.

- [ ] Web Bluetooth connection to Garmin HRM 600 — streaming RR intervals with status indicator
- [ ] RR-interval artifact rejection (biofeedback-safe thresholds)
- [ ] Real-time scrolling HR waveform
- [ ] Visual breathing pacer (expanding circle, sine-wave animation)
- [ ] Audio breathing pacer with at least one style (rising/falling pitch) — others can follow in v1.x
- [ ] Discovery mode: 5 frequency blocks (6.5, 6.0, 5.5, 5.0, 4.5 BPM), 2 min each, with live HR display and post-block RSA amplitude comparison
- [ ] Resonance frequency selection and save to localStorage
- [ ] Practice mode: guided 20-min session at saved frequency with live coherence score
- [ ] Basic session history: date, mode, duration, mean coherence stored in IndexedDB

### Add After Validation (v1.x)

Features to add once the core biofeedback loop is confirmed working.

- [ ] Remaining audio pacer styles (volume swell, soft chimes) — trigger: user wants to experiment with different cues during practice
- [ ] Spectral RSA display (power spectrum chart) during Discovery mode — trigger: user wants to see raw spectral evidence for frequency choice
- [ ] Oura Ring API integration for overnight HRV data pull
- [ ] Recovery dashboard: session coherence trend + Oura overnight HRV overlay
- [ ] Session history view with coherence time-series chart

### Future Consideration (v2+)

- [ ] Export session data to JSON — trigger: need to migrate to a new device or share with clinician
- [ ] Multiple resonance frequency profiles — trigger: if research shows RF drifts over weeks and needs periodic re-testing
- [ ] Adjustable inhale/exhale ratio (current: 1:1) — trigger: if user's CBT-I protocol or clinician recommends 4:6 ratio work

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Web Bluetooth + RR streaming | HIGH | MEDIUM | P1 |
| RR artifact rejection | HIGH | MEDIUM | P1 |
| Visual breathing pacer | HIGH | LOW | P1 |
| Real-time HR waveform | HIGH | LOW | P1 |
| Discovery mode (resonance detection) | HIGH | HIGH | P1 |
| Live coherence score | HIGH | MEDIUM | P1 |
| Practice mode | HIGH | MEDIUM | P1 |
| Session storage (IndexedDB) | HIGH | LOW | P1 |
| Audio pacer — rising/falling pitch | MEDIUM | LOW | P1 |
| Audio pacer — volume swell + chimes | MEDIUM | LOW | P2 |
| Spectral RSA display (Discovery) | MEDIUM | HIGH | P2 |
| Oura Ring API integration | MEDIUM | MEDIUM | P2 |
| Recovery dashboard (trend chart) | MEDIUM | MEDIUM | P2 |
| Session history view | MEDIUM | LOW | P2 |
| JSON data export | LOW | LOW | P3 |
| Adjustable inhale/exhale ratio | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch — the biofeedback loop fails without these
- P2: Should have — adds context and long-term value; build after P1 is stable
- P3: Nice to have — defer until core is validated

---

## Competitor Feature Analysis

| Feature | HRV4Biofeedback | Elite HRV | HeartMath Inner Balance | RHz | ResonanceHRV (this project) |
|---------|-----------------|-----------|------------------------|-----|----------------------------|
| Resonance frequency detection | Yes — 6-min sweep, 7.5 to 5 BPM | Yes — manual + guided | Fixed at ~0.1 Hz (6 BPM), no individual assessment | Yes — 20-min resonance sweep, Lomb-Scargle, 0.1 BPM precision | Yes — 5-block protocol, 6.5 to 4.5 BPM, spectral peak |
| Live coherence score | Yes — biofeedback score (amplitude + duration) | Yes — coherence with real-time HRV chart | Yes — heart coherence (0–100, proprietary) | Not detailed | Yes — LF spectral ratio, rolling 64s window |
| Real-time HR waveform | Yes — camera signal quality + HR oscillation view | Yes | Yes | Not detailed | Yes — scrolling RR-derived waveform |
| Visual breathing pacer | Yes — expanding circle | Yes | Yes — animated ball | Yes | Yes — expanding circle, sine-wave timing |
| Audio breathing pacer | Yes — vibration + nature sounds | Yes | Yes | Not detailed | Yes — 3 styles (pitch, swell, chimes) |
| Garmin HRM 600 / Web Bluetooth | No — camera PPG or Bluetooth (mobile only) | No — mobile Bluetooth only | No — proprietary sensor | Yes — Polar H10 via BLE | Yes — Garmin HRM 600 via Web Bluetooth |
| Browser-based (no install) | No — iOS/Android app | No — iOS/Android app | No — iOS app + hardware | No — iOS app | Yes — Chrome desktop |
| Oura Ring integration | No — HealthKit only (iOS) | No | No | No | Yes — Oura API v2, overnight HRV |
| Session history + trends | Yes — history, summaries, correlations | Yes — HRV trends, training log | Yes — coherence trends | Basic — CSV/JSON export | Yes — IndexedDB, coherence + Oura overlay |
| Cloud/accounts | Yes | Yes | Yes | No (local-only) | No (local-only) |
| Platform | iOS/Android | iOS/Android | iOS + proprietary hardware | iOS | Desktop Chrome/Edge only |

**Key gap filled by this project:** No existing app combines Web Bluetooth chest-strap biofeedback with Oura API overnight HRV in a browser-based, no-install, desktop tool with multi-style audio pacers and resonance frequency discovery.

---

## Sources

- [HRV4Biofeedback — App Features](https://www.hrv4biofeedback.com/the-app.html) — MEDIUM confidence (official product page)
- [Elite HRV — What is HRV Biofeedback?](https://help.elitehrv.com/article/357-what-is-hrv-biofeedback) — MEDIUM confidence (official knowledge base)
- [Elite HRV — How to Find Resonance Breathing Pace](https://help.elitehrv.com/article/394-how-can-i-find-my-resonance-breathing-pace) — MEDIUM confidence
- [HeartMath Inner Balance Coherence Plus](https://www.heartmath.com/coherenceplus/) — MEDIUM confidence (official product page)
- [HeartMath — Resonant Frequency](https://help.heartmath.com/science/resonant-frequency/) — MEDIUM confidence (official help)
- [RHz HRV Biofeedback App](https://rhz.logic-and-light.com/) — LOW confidence (marketing page, limited detail)
- [A Practical Guide to Resonance Frequency Assessment for HRVB — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7578229/) — HIGH confidence (peer-reviewed, Lehrer & Gevirtz group)
- [Methods for HRVB: Systematic Review and Guidelines — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10412682/) — HIGH confidence (peer-reviewed systematic review)
- [Heart Rate Variability Biofeedback in a Global Study — Scientific Reports 2025](https://www.nature.com/articles/s41598-025-87729-7) — HIGH confidence (2025 peer-reviewed, 1.8M sessions dataset)
- [Guide to Measuring Heart Coherence in Biofeedback Software — MBTT](https://mbttbiofeedback.co.uk/mbtt/ug/about-heart-coherence-measures) — MEDIUM confidence (practitioner documentation)
- [Guiding Breathing at Resonance Frequency with Haptic Sensors — MDPI 2023](https://www.mdpi.com/1424-8220/23/9/4494) — HIGH confidence (peer-reviewed)
- [Oura API v2 Documentation](https://cloud.ouraring.com/v2/docs) — HIGH confidence (official API docs)
- [HRV Preprocessing — Kubios](https://www.kubios.com/blog/preprocessing-of-hrv-data/) — MEDIUM confidence (authoritative HRV software vendor)
- [Artifact Removal for PPG-based HRV — Marco Altini / Medium](https://medium.com/swlh/artifact-removal-for-ppg-based-heart-rate-variability-hrv-analysis-5c7d08b6523a) — MEDIUM confidence (author is HRV4Training creator, domain expert)
- [Validity and Efficacy of Elite HRV App during Slow-Paced Breathing — PMC 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10708620/) — HIGH confidence (peer-reviewed validation study)

---
*Feature research for: HRV biofeedback resonance frequency breathing trainer (ResonanceHRV)*
*Researched: 2026-03-21*
