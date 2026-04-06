# Feature Research

**Domain:** HRV biofeedback — session modes extension (pre-sleep, meditation, audio sonification)
**Researched:** 2026-04-06
**Confidence:** MEDIUM — core patterns are well-established from academic literature, competitor app analysis, and Web Audio API documentation; specific UX conventions inferred from multiple sources

---

> **Scope note:** This file covers ONLY the v1.3 milestone features. It supersedes the v1.0–v1.2 section of the original 2026-03-21 FEATURES.md for these three new capability areas. Existing features (breathing pacer, RF tuning, phase lock score, coherence, neural calm, adaptive pace controller, bowl echo subdivisions, session summary, recovery dashboard, discovery mode) are considered stable and are not re-analyzed here.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the minimum behaviors for each new mode to feel complete. Missing any of these makes the mode feel broken or untrustworthy.

#### Pre-Sleep Mode

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Adjustable I:E ratio (default 1:2) | Extended exhale (4:8 seconds or similar) is the defining characteristic of a pre-sleep breathing mode. HRV4Biofeedback already offers 50/50, 40/60, and 1:2 presets. Without ratio control, this is indistinguishable from standard RFB mode. | LOW | Inhale and exhale durations are independently parameterized from the cycle period. At 6 BPM with 1:2, inhale=4s, exhale=8s. At 5 BPM with 1:2, inhale=3.33s, exhale=6.67s. Pacer timing must respect the I:E split, not just the period. |
| Continuous bowl pacer with adjusted echo timing | Audio pacer must work with the asymmetric I:E rhythm. Echo subdivisions (already built) need to reflect the longer exhale section, not assume 50/50 splits. Without this, the bowl echo misaligns with actual breath phase. | MEDIUM | Bowl strikes inhale start; exhale start gets a softer strike. Echo subdivisions fill the inhale and exhale phases proportionally. Implementation: re-compute subdivision timing from I:E ratio at mode start. |
| Mode persists until manually stopped | Pre-sleep sessions have no defined duration. The user breathes until they are ready to sleep, then stops. A forced 20-minute timer is wrong for this use case. | LOW | Mode uses existing pacer loop with no countdown. Show elapsed time only (not a countdown). Session records naturally on stop. |
| Session recorded with mode label | The recovery dashboard must be able to distinguish pre-sleep sessions from standard RFB. Without labeling, trends are meaningless. | LOW | Add `mode: "pre-sleep"` to IndexedDB session record. Dashboard already differentiates by label (precedent from v1.2 legacy labeling). |
| Phase lock and coherence tracked identically | The app already computes phase lock and coherence. Pre-sleep mode should passively track these — they are still clinically meaningful with extended exhale — without requiring the user to actively monitor them. | LOW | No new computation required. Gauges remain visible on screen. Post-session summary uses same graphs. |

#### Meditation Mode

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Audio playback (built-in scripts or user file) | Meditation mode without guided audio is just passive monitoring. Every meditation app (Muse, Headspace, Calm, Insight Timer) pairs audio guidance with monitoring. Without audio playback this is not a meditation mode. | MEDIUM | Built-in scripts stored as recorded audio files (MP3 or WebM). User files loaded via File API, decoded via AudioContext.decodeAudioData(). |
| Passive HRV monitoring during playback | Users come to meditation mode for physiological feedback on their meditation quality. Muse, OptimalHRV, and Elite HRV all show HRV tracking during meditation sessions. Showing nothing physiological during the session would be a dead mode. | LOW | Existing RR streaming and phase lock / coherence computation continue in background. Gauges displayed (possibly smaller or dimmer, since eyes may be closed). |
| Post-session physiological report | After a meditation session, users expect a summary showing what happened to their HRV and neural calm over the session duration. Muse provides a post-session brain state chart; OptimalHRV shows HRV change during mindfulness. Without this, users cannot gauge whether meditation is working. | MEDIUM | Existing session summary graphs (HR, HRV RMSSD, Neural Calm) already built in v1.1. Re-use for meditation mode. Add a "meditation mode" flag in session record. |
| No breathing pacer audio during meditation | The bowl pacer audio should be suppressed during guided meditation audio playback. Two audio sources fighting each other is disruptive. Muse correctly silences its pacer during guided sessions and uses naturalistic audio cues instead. | LOW | Mode flag disables bowl pacer. Sonification (see below) can still overlay if user enables it. |
| Graceful audio context management | Web Audio requires a user gesture before AudioContext starts. Starting meditation audio must be triggered by a button click, not automatically on mode entry. Users who pick a file and then wait will not get silent playback on session start. | LOW | This is already handled for bowl audio (v1.1 pattern). Meditation audio uses the same AudioContext; the session start button serves as the gesture. |

#### Phase Lock Audio Sonification

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Eyes-closed biofeedback signal | Bowl echo subdivisions already provide eyes-closed pace tracking. What's missing is a signal that tells the user whether phase lock is improving or degrading — without looking at the gauges. This is the core purpose of sonification in biofeedback. Academic literature (NIME 2015, Audio Mostly 2024, Unwind 2018) consistently shows audio is the most effective eyes-closed biofeedback channel. | MEDIUM | Continuous or periodic audio cue that encodes phase lock score. See design options below. |
| Distinct from pacer audio | Sonification must not be confused with the breathing pacer. They serve different functions. If users cannot tell whether a tone is telling them "breathe now" or "you're doing well," the feedback is unusable. | LOW | Use a different timbre, register, or spatial position (stereo pan) for sonification vs. pacer. |
| On/off toggle per session | Some users prefer no additional audio during meditation audio playback. Sonification should be opt-in each session, not forced on. | LOW | Simple toggle in session controls. State persists for session duration only. |

---

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Pre-sleep mode with adaptive pace drift at extended I:E ratio | No existing HRV biofeedback app combines adaptive pace control (the v1.2 controller) with extended exhale I:E ratios. HRV4Biofeedback offers fixed I:E ratios with no adaptation. This combination — the pace drifts to maximize phase lock while honoring the 1:2 ratio — is unique. | MEDIUM | Adaptive controller already built. Extension: when computing new breathing period, preserve the I:E ratio when translating period to inhale/exhale durations. E.g., period=10s with 1:2 → inhale=3.33s, exhale=6.67s. |
| Muse-S EEG + HRV passive monitoring during meditation | Muse's own app does EEG monitoring during meditation but shows it only as brain-state cartoons, not raw alpha/beta ratios or HRV metrics. ResonanceHRV already computes both Neural Calm (alpha/beta) and phase lock alongside HRV. Running these in meditation mode provides a more transparent and complete picture than any consumer meditation app. | LOW | No new computation. Mode flag enables passive tracking. |
| Phase lock sonification for real-time closed-loop eyes-closed biofeedback | Trend-based sonification (Audio Mostly 2024 research) — where the audio reflects both current score and direction of change — is more effective than direct mapping for HRV biofeedback. No consumer app implements trend-aware sonification. Building it here using Web Audio API with a pitch-rise on improving phase lock and pitch-fall on degrading phase lock would be a clinically-informed differentiator. | MEDIUM | Map phase lock delta (current minus 10s prior) to pitch direction. Neutral = no tone or very soft drone. Improving = rising arpeggio or brightening tone. Degrading = descending tone or increasing noise ratio. |
| User-uploaded audio meditation support | Most apps sell a content library (Calm, Headspace) or lock users to pre-built scripts (Muse). Allowing the user to upload a custom meditation audio file (from a therapist, a clinical recording, or their own content) is rare in biofeedback apps and aligns with the personal-tool philosophy. | MEDIUM | File API + AudioContext.decodeAudioData(). No server required — file loaded into browser memory. IndexedDB can cache the ArrayBuffer if needed for repeat use (watch for memory limits on long files). |
| Yoga nidra / body scan for sleep-specific recovery | Yoga nidra is a structured NSDR (Non-Sleep Deep Rest) protocol with documented HRV improvement. Including a purpose-built yoga nidra script (30–40 minutes) designed specifically for injury recovery and sleep difficulty — rather than a generic mindfulness script — would be unique in the consumer space and directly relevant to the user's clinical context. | MEDIUM | Content creation, not engineering complexity. Audio asset must be recorded and stored. See script length notes in Pitfalls. |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Continuous drone sonification of raw phase lock value | Intuitive mapping: higher score = higher pitch. Simple to implement. | Constant audio feedback of a noisy, fast-changing metric produces a fluctuating tone that users describe as anxiety-inducing (Audio Mostly 2024 research: "increased psychological burden due to fast changes in musical rhythm"). Phase lock oscillates naturally with each breath cycle, making raw mapping perceptually chaotic. | Use trend-based or interval-based sonification (update every 5–10s), mapping the direction of change rather than the raw value. Or use a gentle envelope that smoothly rises/falls over 10–15 seconds. |
| Separate audio context for meditation audio and sonification | Seems architecturally clean to isolate audio streams. | Multiple AudioContext instances in a single page are memory-intensive and can produce clock drift between streams. Chrome limits concurrent AudioContexts. | Single AudioContext with a gain node per audio stream (guided audio, pacer, sonification). Route all through one context. |
| Breathing pacer active during guided meditation audio | Some apps (Welltory) overlay a pacer on guided audio. | Audio collision — bowl pacer and voice narration play simultaneously. The pacer loses its cue function when masked by speech. The narration is disrupted by percussive sounds. | Suppress pacer during meditation audio. If pacing guidance is needed, use the narration itself (many body scan and yoga nidra scripts inherently pace breath). |
| Session duration timer forcing a fixed length in meditation mode | Consistency with standard mode UX. | Meditation sessions are highly variable in length (20–60 minutes for yoga nidra). Forcing 20 minutes cuts sessions short; forcing the user to configure a timer is friction. | Elapsed timer only. User stops the session when finished. Post-session report generates from actual elapsed time. |
| Loading meditation audio from a URL | Allows linking to external content (YouTube, podcast, etc.) without file management. | CORS restrictions block cross-origin audio loading via Web Audio API fetch. Requires a CORS proxy or backend, which contradicts the local-only architecture. External URLs also create reliability dependency. | File upload only. User downloads audio first, then uploads to the app. Files cached in IndexedDB ArrayBuffer for repeat use. |
| Displaying coherence score prominently during guided meditation | Keeps the biofeedback signal in focus. | During meditation mode, the user's attention should be on the meditation practice, not on optimizing a number. Prominent gauge display creates the same "score pressure" effect documented in mindfulness research (reduces absorption in practice). | Gauges visible but secondary — smaller, lower on screen. Post-session report is the primary feedback delivery mechanism. |
| Storing raw audio files in IndexedDB for user-uploaded content | Simplest approach for persistence. | Large audio files (30–40 minute WAV = 300MB+) will exceed IndexedDB storage budgets and cause quota errors silently in Chrome. MP3 at 128kbps = ~30MB for 30 min — marginally acceptable. | Do not auto-cache user-uploaded audio in IndexedDB. Load from file on each session. Alternatively, store only smaller built-in script assets as base64 in IndexedDB. |

---

## Feature Dependencies

```
[Session mode selector]
    └──controls──> [Pre-sleep mode]
    └──controls──> [Meditation mode]
    └──controls──> [Standard mode (existing)]

[Pre-sleep mode]
    └──requires──> [Breathing pacer (existing)]
    └──requires──> [I:E ratio parameter]
                      └──requires──> [Pacer duration computation refactor]
                                        (inhale + exhale durations derived from period × ratio)
    └──requires──> [Adaptive pace controller (existing v1.2)]
                      └──extends──> [Preserve I:E ratio during adaptation]
    └──reuses──> [Phase lock / coherence computation (existing)]
    └──reuses──> [Session storage with mode label]
    └──reuses──> [Bowl echo subdivisions (existing, refactored for I:E)]

[Meditation mode]
    └──requires──> [Audio playback engine]
                      └──requires──> [Single AudioContext (existing, extend)]
                      └──requires──> [File API for user upload]
                      └──requires──> [Built-in script audio assets]
    └──requires──> [Passive HRV monitoring]
                      └──reuses──> [RR streaming + artifact rejection (existing)]
                      └──reuses──> [Phase lock / coherence computation (existing)]
    └──reuses──> [Neural Calm computation (existing v1.1)]
    └──reuses──> [Session summary graphs (existing v1.1)]
    └──suppresses──> [Bowl pacer audio (mode-aware mute)]

[Phase lock sonification]
    └──requires──> [Phase lock score (existing v1.2)]
    └──requires──> [Web Audio API tone generation (existing, extend)]
    └──requires──> [Sonification layer separate from pacer gain node]
    └──enhances──> [Pre-sleep mode] (eyes-closed feedback during extended exhale)
    └──enhances──> [Standard mode] (eyes-closed biofeedback for all sessions)
    └──optional in──> [Meditation mode] (toggled off during guided audio by default)
```

### Dependency Notes

- **I:E ratio requires pacer refactor.** The current pacer computes inhale and exhale as equal halves of the period. Introducing a ratio parameter means inhale duration and exhale duration become derived values: `inhale = period / (1 + ratio)`, `exhale = period × ratio / (1 + ratio)`. Bowl echo subdivisions use these durations — they must be recomputed when I:E changes.
- **Adaptive controller must preserve I:E during adaptation.** The v1.2 controller adjusts the breathing period (in Hz). When pre-sleep mode is active, the I:E ratio must remain fixed while the period changes. Verify the controller only modifies the period, not the individual phase durations.
- **Meditation audio and sonification share one AudioContext.** Routing both through a single context with separate GainNodes is required. Do not create a second AudioContext.
- **Bowl pacer muting in meditation mode is a mode-aware concern.** The pacer should not be destroyed — just muted (GainNode set to 0). The user may need to resume standard mode after a meditation session without re-initializing audio.
- **Phase lock sonification is decoupled from all modes.** It can run during standard, pre-sleep, or meditation mode. Its on/off state is independent of mode selection.
- **Session mode selector must exist before any mode-specific features ship.** Users cannot access pre-sleep or meditation modes without a way to select them. Mode selector is a P1 prerequisite.

---

## MVP Definition

### Launch With (v1.3)

Minimum viable implementation that validates all three new mode concepts.

- [ ] Session mode selector UI (standard / pre-sleep / meditation) — prerequisite for everything else
- [ ] Pre-sleep mode: I:E ratio parameter (default 1:2), adjustable to at least 1:1 and 1:2 — pacer and bowl echo refactored to respect ratio
- [ ] Pre-sleep mode: elapsed timer only (no countdown), session recorded with `mode: "pre-sleep"` label
- [ ] Meditation mode: built-in audio playback for at least one script (body scan recommended — clearest clinical relevance to injury recovery + insomnia)
- [ ] Meditation mode: passive HRV + neural calm monitoring during playback (gauges visible, secondary)
- [ ] Meditation mode: post-session physiological report (reuse existing session summary)
- [ ] Phase lock sonification: trend-based tone (pitch direction encodes improving vs. degrading phase lock, updated every 5–10s), on/off toggle per session
- [ ] User-uploaded audio for meditation mode (File API, load-from-file, no caching required for MVP)

### Add After Validation (v1.3.x)

- [ ] Additional built-in meditation scripts (yoga nidra, loving-kindness) — trigger: first body scan script validated to work with existing monitoring
- [ ] Pre-sleep mode: dashboard differentiation (filter trends by mode) — trigger: enough pre-sleep sessions accumulated to make mode-filtered trends meaningful
- [ ] Sonification volume control — trigger: user finds default sonification level intrusive during meditation

### Future Consideration (v2+)

- [ ] Persistent user-uploaded audio via IndexedDB ArrayBuffer caching (only for files under ~50MB) — trigger: user re-uploads the same file repeatedly
- [ ] Multiple I:E ratio presets (4:6 cyclic sigh, 4:7:8 with pause) — trigger: CBT-I protocol explicitly recommends a specific ratio not covered by 1:2

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Session mode selector | HIGH | LOW | P1 |
| Pre-sleep I:E ratio control + pacer refactor | HIGH | MEDIUM | P1 |
| Pre-sleep elapsed timer + mode label in session | MEDIUM | LOW | P1 |
| Meditation mode: built-in script audio playback | HIGH | MEDIUM | P1 |
| Meditation mode: passive HRV monitoring | HIGH | LOW | P1 |
| Meditation mode: post-session report (reuse existing) | HIGH | LOW | P1 |
| Phase lock sonification (trend-based, toggle) | HIGH | MEDIUM | P1 |
| User-uploaded audio for meditation | MEDIUM | MEDIUM | P2 |
| Additional built-in scripts (yoga nidra, loving-kindness) | MEDIUM | MEDIUM | P2 |
| Pre-sleep adaptive controller preserves I:E ratio | MEDIUM | LOW | P1 |
| Bowl echo refactor for asymmetric I:E | MEDIUM | MEDIUM | P1 |
| Sonification volume control | LOW | LOW | P3 |
| Dashboard mode-filtered trend view | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Required for v1.3 milestone — core behavior of each new mode
- P2: Adds meaningful depth; ship when P1 stable
- P3: Nice to have; defer until v1.3 is in daily use

---

## Competitor Feature Analysis

| Feature | Muse App | Elite HRV | HRV4Biofeedback | Headspace/Calm | ResonanceHRV v1.3 |
|---------|----------|-----------|-----------------|----------------|-------------------|
| Extended exhale I:E ratio | No | No | Yes (fixed presets: 40/60, 1:2) | No | Yes (configurable, default 1:2) |
| Adaptive pace control with I:E | No | No | No | No | Yes (v1.2 controller extended) |
| Pre-sleep dedicated mode | Sleep tracking, not breathing mode | No | No | Sleep meditations | Yes (RFB mode, extended exhale) |
| Guided audio meditation | Yes — large library, paywall | 10-week program (paywall) | No | Yes — large library, paywall | Yes — built-in scripts, no paywall |
| Passive HRV during meditation | Yes — PPG only | No | No | No | Yes — Garmin chest strap HRV |
| Passive EEG during meditation | Yes — EEG via Muse headband | No | No | No | Yes — Muse-S EEG (Neural Calm) |
| User-uploaded audio | No | No | No | No | Yes — File API |
| Phase lock sonification | No | No | No | No | Yes — trend-based audio biofeedback |
| Post-session physiology report | Yes — brain state chart | Yes — HRV chart | Yes — biofeedback score | No | Yes — HR, HRV RMSSD, Neural Calm |
| No subscription / paywall | No (subscription) | No (subscription) | No (one-time purchase) | No (subscription) | Yes — personal tool |

**Key gaps filled by v1.3:**
- Pre-sleep extended-exhale RFB with adaptive pace control is not offered by any existing consumer or clinical app.
- HRV + EEG passive monitoring during guided meditation in a single browser-based app is unique.
- Trend-based phase lock sonification as an eyes-closed training aid does not exist in any consumer product.

---

## Sonification Design Reference

Based on academic research (Audio Mostly 2024, Unwind 2018, HRV sonification literature):

**Recommended mapping for phase lock score:**

| Signal Condition | Audio Behavior | Rationale |
|-----------------|----------------|-----------|
| Phase lock improving (delta > +3 over 10s) | Gentle pitch rise (+2–3 semitones) or brightening timbre | Positive reinforcement of correct direction |
| Phase lock stable (delta within ±3) | Soft neutral drone or silence | No reward/punishment for maintenance |
| Phase lock degrading (delta < -3 over 10s) | Gentle pitch fall (−2–3 semitones) or softening timbre | Prompt awareness without inducing anxiety |
| Phase lock very high (>80) | Optional brief chime or bell — then silence | One-time positive cue at threshold crossing |

**Implementation notes:**
- Update interval: 5–10 seconds. Faster updates produce perceptually chaotic output that increases anxiety (Audio Mostly 2024).
- Tone frequency: 300–500 Hz. Bowl-like timbre (existing oscillator style) distinguishes from pacer bowl.
- Amplitude: 50–70% of pacer bowl volume. Sonification is secondary; pacer remains the primary audio cue.
- Avoid: continuous MIDI-style note sequences. These produce "boredom and tiredness" in repeated sessions (ibid).

---

## Sources

- [HRV4Biofeedback — The App (official product page)](https://www.hrv4biofeedback.com/the-app.html) — MEDIUM confidence
- [Elite HRV — Pre-Set Guided Breathing Paces](https://help.elitehrv.com/article/393-pre-set-guided-breathing-paces-in-biofeedback-section) — MEDIUM confidence
- [Muse — How It Works](https://choosemuse.com/pages/how-it-works) — MEDIUM confidence
- [Muse — App features](https://choosemuse.com/pages/app) — MEDIUM confidence
- [Unwind: A Musical Biofeedback for Relaxation Assistance (2018)](https://www.tandfonline.com/doi/full/10.1080/0144929X.2018.1484515) — HIGH confidence (peer-reviewed)
- [Comparing Trend-Based and Direct HRV Biofeedback in an Adaptive Game Environment — Audio Mostly 2024](https://dl.acm.org/doi/10.1145/3771594.3771636) — HIGH confidence (peer-reviewed)
- [Sonification of Autonomic Rhythms in the Frequency Spectrum of HRV](https://www.academia.edu/68951529/Sonification_of_Autonomic_Rhythms_in_the_Frequency_Spectrum_of_Heart_Rate_Variability) — MEDIUM confidence
- [The Relaxation Effect of Prolonged Expiratory Breathing — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6037091/) — HIGH confidence (peer-reviewed)
- [Do Longer Exhalations Increase HRV During Slow-Paced Breathing? — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11310264/) — HIGH confidence (peer-reviewed; findings are mixed — see Pitfalls)
- [Web Audio API Best Practices — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) — HIGH confidence (official documentation)
- [OptimalHRV — HRV-Guided Mindfulness](https://www.optimalhrv.com/) — MEDIUM confidence (product page)
- [Welltory — Long Exhale for Parasympathetic Activation](https://help.welltory.com/en/articles/3973614-long-exhale-for-parasympathetic-nervous-system-activation) — MEDIUM confidence (help documentation)
- [Yoga Nidra Script Length and Structure — Elephant Journal](https://www.elephantjournal.com/2021/10/yoga-nidra-body-scan-script-30-40-min/) — LOW confidence (reference only for content planning)

---
*Feature research for: ResonanceHRV v1.3 — Session Modes and Eyes-Closed Training*
*Researched: 2026-04-06*
