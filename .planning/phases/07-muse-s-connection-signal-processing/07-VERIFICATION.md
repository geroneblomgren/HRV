---
phase: 07-muse-s-connection-signal-processing
verified: 2026-04-03T12:00:00Z
status: gaps_found
score: 12/13 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 10/13
  gaps_closed:
    - "AppState.bpm replaced with AppState.currentHR in museSignalProcessing.js _ingestIBI() — live HR panel now wired to PPG data"
    - "MUSE-03 in REQUIREMENTS.md updated to '4-channel EEG (TP9, AF7, AF8, TP10)' — requirement matches implementation"
    - "MuseAdapter.js line 23 comment updated to explicitly state '4 channels used'"
    - "Constant block at museSignalProcessing.js line 291-296 explains MAX_DEVIATION=0.35 as deliberate relaxation vs HRMAdapter 0.20"
  gaps_remaining:
    - "Two inline comments still reference '20%' deviation threshold rather than the actual 35%: module header line 278 and _rejectArtifact() JSDoc line 607"
  regressions: []
gaps:
  - truth: "Artifact rejection drops physiologically implausible beats (outside 300-2000ms or >20% deviation from median)"
    status: partial
    reason: "MAX_DEVIATION = 0.35 is the authoritative threshold (deliberate calibration for forehead PPG, documented in constant-block comment). However two prose comments still say '20%': the module-level pipeline description at line 278 ('Two-tier artifact rejection (absolute bounds 300–2000 ms + 20% median deviation)') and the _rejectArtifact() JSDoc at line 607 ('reject if IBI deviates >20% from 5-beat rolling median'). The constant block header at lines 291-293 correctly documents the relaxation from HRMAdapter's 0.20, but the prose descriptions still quote the old value. The 07-02-PLAN.md must_have truth also still says '>20%'. The implementation is correct; documentation is inconsistent."
    artifacts:
      - path: "js/museSignalProcessing.js"
        issue: "Line 278 module header says '20% median deviation'. Line 607 _rejectArtifact() JSDoc says 'deviates >20% from 5-beat rolling median'. Both should say 35% to match MAX_DEVIATION = 0.35."
    missing:
      - "Update line 278 to '35% median deviation' (or '>35%')"
      - "Update line 607 _rejectArtifact() JSDoc to say 'deviates >35% from 5-beat rolling median'"
      - "Optional: update 07-02-PLAN.md must_have truth from '>20%' to '>35%' to align plan with implementation"
human_verification:
  - test: "Verify live HR display updates when using Muse-S PPG without chest strap"
    expected: "The BPM readout in the live data panel should update in real time from PPG peak detection. The fix changed AppState.bpm to AppState.currentHR (line 600) — main.js subscribes to 'currentHR' and should now receive PPG-derived HR."
    why_human: "Requires physical Muse-S hardware to confirm the currentHR fix closes the display gap. The code path is now correct but runtime confirmation was blocked in the original verification by the same hardware test that missed the bug."
---

# Phase 7: Muse-S Connection and Signal Processing — Re-Verification Report

**Phase Goal:** The app connects to the Muse-S headband, receives live EEG and PPG data streams, and runs the full signal processing pipeline — PPG peak detection extracts RR intervals and the EEG alpha/beta FFT computes a Neural Calm score — all in real-time in the browser.
**Verified:** 2026-04-03
**Status:** gaps_found (1 remaining minor gap — documentation only)
**Re-verification:** Yes — after gap closure (previous score: 10/13)

## Re-Verification Summary

Three gaps were identified in the initial verification. Two were fully closed; one was partially closed.

| Gap | Previous Status | Current Status |
|-----|----------------|----------------|
| AppState.bpm → AppState.currentHR | Blocker (NOT WIRED) | CLOSED — line 600 writes AppState.currentHR |
| MUSE-03 5-channel → 4-channel | Failed | CLOSED — REQUIREMENTS.md and MuseAdapter.js comment updated |
| Artifact rejection 35% vs 20% comment | Partial | PARTIAL — constant block comment explains 35%, but two prose comments still say 20% |

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User clicks Connect Muse-S, selects headband in browser picker, and sees status transition to 'streaming' within 5 seconds | VERIFIED | MuseAdapter.connect() calls requestDevice(), sets museStatus='connecting' then 'streaming'. main.js subscribes to museStatus. Hardware verified. |
| 2 | Raw EEG data at 256 Hz (4 channels: TP9, AF7, AF8, TP10) is parsed into microvolt values and written to AppState | VERIFIED | parseEEGNotification() decodes 12-bit packed data, applies 0.48828125*(n-0x800), writes to AppState.eegBuffers[channelIndex]. |
| 3 | Raw PPG data at 64 Hz (3 channels) is parsed into unsigned 24-bit values and written to AppState debug buffers | VERIFIED | parsePPGNotification() parses 6x3-byte big-endian samples, writes to AppState.ppgDebugBuffers. |
| 4 | Connection status chip updates through connecting -> streaming states in real-time | VERIFIED | main.js subscribe('museStatus') calls updateDeviceChipUI(). eegCalibrating subscription updates text. |
| 5 | On BLE disconnect, adapter cleans up listeners and sets museStatus to 'disconnected' | VERIFIED | _onDisconnected() calls _cleanupListeners(), stopPPGPipeline(), stopEEGPipeline(), _resetAppState(). |
| 6 | PPG bandpass filter removes baseline wander and high-frequency noise | VERIFIED | 4th-order Butterworth bandpass as cascaded 2-biquad sections (HP at 0.5 Hz + LP at 3.0 Hz). Verified coefficients: -3.01 dB at cutoffs. |
| 7 | Peak detection identifies systolic peaks with refractory period | VERIFIED | Derivative zero-crossing detection, REFRACTORY=300ms, REFRACTORY_SAMPLES=20 at 64 Hz. 4-second warmup. Adaptive threshold with THRESHOLD_DECAY=0.997. |
| 8 | PPG-derived RR intervals are written to AppState.rrBuffer and DSP engine processes them | VERIFIED | rrBuffer/rrHead writes correct at lines 598-599. AppState.currentHR written at line 600 (fixed from bpm). rrCount incremented. main.js subscribes to 'currentHR'. |
| 9 | Artifact rejection drops physiologically implausible beats | PARTIAL | Absolute bounds (300-2000ms) correct. MAX_DEVIATION=0.35 is correct constant. Two prose comments (lines 278, 607) still say '20%' rather than '35%'. Implementation is correct; documentation is inconsistent. |
| 10 | PPG signal quality indicator updates to good/fair/poor | VERIFIED | _updateSignalQuality() tracks rolling 30s window. AppState.ppgSignalQuality updated every 5s. main.js subscribe('ppgSignalQuality') updates colored dot. |
| 11 | Neural Calm score (0-100) updates every 0.5 seconds based on alpha/beta power ratio from TP9/TP10 | VERIFIED | EEG_UPDATE_INTERVAL=128 samples at 256 Hz = 0.5s. _computeNeuralCalm() runs FFT on TP9+TP10. Hardware verified. |
| 12 | EEG artifact rejection discards epochs where peak-to-peak amplitude exceeds 100 microvolts | VERIFIED | ARTIFACT_THRESHOLD_UV=100. Epoch rejected if EITHER TP9 or TP10 exceeds threshold. Carries forward _lastValidNeuralCalm. |
| 13 | Per-session baseline collected from first 20 seconds; eyes-open indicator appears on >40% alpha drop | VERIFIED | BASELINE_EPOCHS_NEEDED=10 epochs x 2s = 20s. AppState.eegCalibrating=false when complete. _checkEyesOpen() uses ALPHA_DROP_THRESHOLD=0.40, 3-second auto-reset timer. |

**Score:** 12/13 truths verified (1 partial — documentation only, implementation correct)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/devices/MuseAdapter.js` | Full Muse-S BLE adapter with GATT connect, p50 preset, EEG/PPG data parsing | VERIFIED | All required exports present. Line 23 comment correctly states '4 channels used'. |
| `js/state.js` | New AppState fields: ppgSignalQuality, neuralCalm, rawNeuralCalmRatio, eegCalibrating, eyesOpenWarning, ppgDebugBuffers, ppgDebugHead, eegBuffers, eegHead | VERIFIED | All 9 fields present. rrCount and currentHR both declared (lines 19, 21). |
| `js/devices/DeviceManager.js` | MuseAdapter wired into _adapters.muse slot, connectMuse() delegates to adapter | VERIFIED | Fully wired. No old requestDevice stub. |
| `js/museSignalProcessing.js` | PPG bandpass filter, peak detection, artifact rejection, signal quality, IBI extraction; EEG FFT pipeline, Neural Calm computation | VERIFIED | 718 lines. Both pipelines present. AppState.currentHR written at line 600. No TODOs or placeholders. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `js/devices/MuseAdapter.js` | `js/state.js` | AppState field writes on notification events | VERIFIED | parseEEGNotification writes AppState.eegBuffers/eegHead. parsePPGNotification writes AppState.ppgDebugBuffers/ppgDebugHead. _connectGATT writes museStatus, museConnected, museName, museCapabilities. |
| `js/devices/DeviceManager.js` | `js/devices/MuseAdapter.js` | _adapters.muse slot | VERIFIED | Import from './MuseAdapter.js'. _adapters.muse slot populated. connectMuse() calls _adapters.muse.connect(). |
| `js/museSignalProcessing.js` | `js/state.js` via AppState.rrBuffer | Writes clean RR intervals | VERIFIED | AppState.rrBuffer[AppState.rrHead % 512] = ibi; AppState.rrHead++ at lines 598-599. |
| `js/museSignalProcessing.js` | `js/state.js` via AppState.currentHR | Main panel HR display | VERIFIED | Line 600: AppState.currentHR = Math.round(60000 / ibi). Gap closed. currentHR declared in state.js line 21. |
| `js/devices/MuseAdapter.js` | `js/museSignalProcessing.js` via setPPGCallback | Routes PPG samples to pipeline | VERIFIED | initPPGPipeline() calls setPPGCallback(_handlePPGSamples). Wired in _connectGATT(). stopPPGPipeline() deregisters on disconnect. |
| `js/devices/MuseAdapter.js` | `js/museSignalProcessing.js` via setEEGCallback | Routes EEG samples to pipeline | VERIFIED | initEEGPipeline() calls setEEGCallback(handleEEGSamples). stopEEGPipeline() deregisters on disconnect. |
| `js/museSignalProcessing.js` | `js/state.js` via AppState.neuralCalm | Writes Neural Calm score | VERIFIED | AppState.neuralCalm = Math.round(normalized * 100) in _computeNeuralCalm(). AppState.eegCalibrating toggled at baseline boundary. AppState.eyesOpenWarning set in _checkEyesOpen(). |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| MUSE-01 | 07-01 | User can connect to Muse-S via Web Bluetooth (service 0xfe8d) | SATISFIED | MuseAdapter.connect() uses requestDevice with optionalServices:[0xfe8d]. Verified on hardware. |
| MUSE-02 | 07-01 | App initializes Muse-S with p50 preset to enable EEG and PPG streaming | SATISFIED | encodeCommand('p50') sent after ALL characteristics subscribed. Command sequence: h -> p50 -> s -> d. |
| MUSE-03 | 07-01 | App receives 4-channel EEG data (TP9, AF7, AF8, TP10) at 256 Hz from Muse-S | SATISFIED | REQUIREMENTS.md updated to 4-channel. MuseAdapter subscribes all 4 EEG UUIDs. Comment at line 23 explicitly states '4 channels used'. |
| MUSE-04 | 07-01 | App receives 3-channel PPG data at 64 Hz from Muse-S | SATISFIED | All 3 PPG UUIDs subscribed. 6 samples per notification at 64 Hz. Verified on hardware. |
| MUSE-05 | 07-01 | Connection status UI shows Muse-S state (connecting, connected, streaming, disconnected) | SATISFIED | main.js subscribe('museStatus') updates Muse chip. EEG calibrating state also shown. |
| PPG-01 | 07-02 | App performs peak detection on Muse PPG waveform to extract inter-beat intervals | SATISFIED | Peak detection functional. IBIs written to rrBuffer. AppState.currentHR updated from PPG (fix confirmed). |
| PPG-02 | 07-02 | PPG-derived RR intervals are artifact-rejected (physiological bounds + rate-of-change filter) | SATISFIED | Two-tier rejection: 300-2000ms bounds + 35% median deviation (MAX_DEVIATION=0.35). REQUIREMENTS.md PPG-02 wording ('rate-of-change filter') is vague enough to accommodate this. |
| EEG-01 | 07-03 | App computes alpha (8-12 Hz) and beta (13-30 Hz) power from EEG channels in real-time | SATISFIED | _integrateBand() extracts ALPHA_LOW=8/ALPHA_HIGH=12 and BETA_LOW=13/BETA_HIGH=30. Updates every 0.5 seconds. Verified on hardware. |
| EEG-02 | 07-03 | EEG artifact rejection filters out eye blinks, jaw clenching, and movement contamination | SATISFIED | 100 µV peak-to-peak threshold on EITHER TP9 or TP10 rejects entire epoch. Verified stable during deliberate blinks on hardware. |

**Note on EEG-03:** REQUIREMENTS.md marks EEG-03 ("App computes Neural Calm score updating every 1-2 seconds") as Phase 8 Pending. Phase 7 Plan 03 implements this at 0.5-second updates. Phase 8 only needs to expose this in the session UI (SESS-01).

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `js/museSignalProcessing.js` | 278 | Module header says "20% median deviation" but MAX_DEVIATION=0.35 | Warning | Documentation mismatch — implementation is correct but comment misleads readers |
| `js/museSignalProcessing.js` | 607 | _rejectArtifact() JSDoc says "deviates >20% from 5-beat rolling median" | Warning | Same documentation mismatch — actual threshold is 35% |

No TODO/FIXME/placeholder comments found. No empty implementations. AppState.bpm and AppState.beats no longer written anywhere in museSignalProcessing.js. All verified clean.

---

### Human Verification Required

#### 1. Live HR Display During Muse-Only Session

**Test:** Connect only the Muse-S headband (no chest strap). Wait for PPG warmup (~4 seconds). Check whether the BPM readout in the live data panel updates with your heart rate.
**Expected:** BPM should update approximately every 1 second in the main panel, matching the PPG debug panel reading (accessible via `togglePPGDebug()` in the browser console).
**Why human:** The code fix is confirmed correct — AppState.currentHR is now written at line 600 of museSignalProcessing.js, and main.js subscribes to 'currentHR'. However this specific code path was never confirmed on hardware (the original hardware test used the debug panel which reads currentHR directly in its rAF loop). Physical hardware is required to close this verification.

---

### Gaps Summary

One minor documentation gap remains. The two previously blocking gaps (HR field mismatch, 5-channel requirement) are fully closed.

**Gap 3 (Documentation) — Artifact rejection threshold inconsistency in prose comments:**
`MAX_DEVIATION = 0.35` is correct and has an explanatory comment block at lines 291-293 stating it is "relaxed vs HRMAdapter (0.20) because... forehead PPG has more natural timing variability." However, two prose descriptions were not updated: the module-level pipeline overview at line 278 still says "(absolute bounds 300–2000 ms + 20% median deviation)" and the `_rejectArtifact()` JSDoc at line 607 still says "reject if IBI deviates >20% from 5-beat rolling median." These are documentation-only errors — the actual rejection logic at line 620 uses `MAX_DEVIATION` (0.35) correctly. This is a warning-level issue, not a blocker. Fix is a 2-line comment update.

---

_Verified: 2026-04-03_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — after gap closure_
