# Muse-S Web Bluetooth Integration Research

**Researched:** 2026-04-03
**Context:** ResonanceHRV web app -- adding Muse-S as a device for HRV biofeedback during breathing exercises
**Overall Confidence:** MEDIUM-HIGH (BLE protocol well-documented via open-source libraries; PPG-to-HRV pipeline is custom work)

---

## Executive Summary

The Muse-S (Gen 2) is fully connectable via Web Bluetooth from Chrome/Edge/Opera. The BLE protocol is reverse-engineered and implemented in multiple open-source JavaScript libraries. The device exposes raw EEG (4+1 channels at 256 Hz), raw PPG (3 channels at 64 Hz), accelerometer, and gyroscope data through a proprietary GATT service with well-documented characteristic UUIDs.

**The critical finding:** The Muse-S does NOT expose heart rate or RR intervals via the standard BLE Heart Rate Service (0x180D). It only provides raw PPG waveform data. To get HR/HRV, you must implement your own PPG peak detection and IBI extraction pipeline in JavaScript. This is the primary engineering challenge.

The EEG data presents an exciting opportunity: real-time frontal alpha power can serve as a "neural calm" metric that complements HRV coherence, creating a dual-modality biofeedback experience (body + brain) that no competitor offers in a browser.

---

## 1. Connectivity

### BLE Service and Characteristics

**Confidence: HIGH** (verified across muse-js source code, web-muse, and MuseJS repos)

**Primary GATT Service:** `0000fe8d-0000-1000-8000-00805f9b34fb` (registered as `MUSE_SERVICE`)

| Characteristic | UUID | Purpose |
|----------------|------|---------|
| Control | `273e0001-4c4d-454d-96be-f03bac821358` | Send commands, receive device info |
| EEG Channel 0 (TP9) | `273e0003-4c4d-454d-96be-f03bac821358` | Left ear EEG |
| EEG Channel 1 (AF7) | `273e0004-4c4d-454d-96be-f03bac821358` | Left forehead EEG |
| EEG Channel 2 (AF8) | `273e0005-4c4d-454d-96be-f03bac821358` | Right forehead EEG |
| EEG Channel 3 (TP10) | `273e0006-4c4d-454d-96be-f03bac821358` | Right ear EEG |
| EEG Channel 4 (AUX) | `273e0007-4c4d-454d-96be-f03bac821358` | Auxiliary (not available on all presets) |
| Gyroscope | `273e0009-4c4d-454d-96be-f03bac821358` | 3-axis rotation |
| Accelerometer | `273e000a-4c4d-454d-96be-f03bac821358` | 3-axis acceleration |
| Telemetry | `273e000b-4c4d-454d-96be-f03bac821358` | Battery, temperature |
| PPG Channel 0 | `273e000f-4c4d-454d-96be-f03bac821358` | Ambient light / Infrared (Muse S) |
| PPG Channel 1 | `273e0010-4c4d-454d-96be-f03bac821358` | Infrared / Green (Muse S) |
| PPG Channel 2 | `273e0011-4c4d-454d-96be-f03bac821358` | Red / Unknown (Muse S) |

**Note on PPG channel mapping:** On the Muse 2, channels are (ambient, infrared, red). On the Muse S, the mapping is believed to be (infrared, green, unknown) but this is unconfirmed. The muse-js library notes this uncertainty.

### Connection Protocol

**Confidence: HIGH** (directly from muse-js source code)

```
1. navigator.bluetooth.requestDevice({ filters: [{ services: [0xfe8d] }] })
2. device.gatt.connect()
3. gattServer.getPrimaryService(0xfe8d)
4. service.getCharacteristic(UUID) -- for each characteristic needed
5. Write command to Control characteristic to select preset
6. Write 's' to Control to start streaming
7. Subscribe to notifications on desired characteristics
```

**Control Commands (text-based, sent via Control characteristic):**

| Command | Effect |
|---------|--------|
| `p21` | Default EEG preset (4 channels, no AUX) |
| `p20` | EEG with auxiliary channel enabled |
| `p50` | **EEG + PPG mode** (required for heart rate data) |
| `s` | Start streaming |
| `h` | Pause streaming |
| `d` | Resume streaming |
| `v1` | Request device info (firmware version, etc.) |

**Critical:** You MUST send preset `p50` to enable PPG data. The default `p21` only streams EEG.

### Pairing / Handshake

No special pairing sequence is needed beyond the standard Web Bluetooth flow. The device does not require a PIN or bonding. The connection is straightforward: request device, connect GATT, subscribe to characteristics. The muse-js library handles reconnection via the `gattserverdisconnected` event.

### Browser Compatibility

| Browser | Desktop | Android | iOS |
|---------|---------|---------|-----|
| Chrome | YES | YES | NO |
| Edge | YES | YES | NO |
| Opera | YES | YES | NO |
| Firefox | NO | NO | NO |
| Safari | NO | N/A | NO |

**Web Bluetooth requires:** HTTPS or localhost, user gesture to trigger `requestDevice()`.

**iOS is completely unsupported** -- Web Bluetooth is not available in any iOS browser (WebKit limitation). This is a significant constraint.

---

## 2. Heart Rate / HRV from PPG

### Does the Muse-S Have a PPG Sensor?

**YES.** Confidence: HIGH.

The Muse-S (Gen 2) has a PPG sensor on the forehead, using IR/Red/Green wavelengths at 64 Hz sampling rate with 16-bit resolution (20-bit on the newer Athena model). It provides 6 samples per BLE notification across 3 channels.

### Does It Expose Standard BLE Heart Rate Service?

**NO.** Confidence: HIGH.

The Muse-S does NOT implement the standard BLE Heart Rate Service (UUID 0x180D). It does NOT expose HR, RR intervals, or any derived cardiovascular metric. You get raw PPG waveform data only.

### Can You Derive HR/HRV from Raw PPG?

**YES, but it requires custom signal processing.** Confidence: MEDIUM.

**Required pipeline (all in JavaScript, running in browser):**

1. **Bandpass filter** the raw PPG signal (0.5-5 Hz Butterworth, or similar) to isolate cardiac pulse component
2. **Peak detection** to identify systolic peaks in the filtered waveform
3. **IBI extraction** -- compute inter-beat intervals from peak-to-peak timing
4. **Artifact rejection** -- reject IBIs outside physiological range (e.g., HR 30-200 bpm)
5. **HRV computation** -- RMSSD, SDNN, or spectral analysis from cleaned IBI series

**64 Hz sampling rate implications:**
- Temporal resolution: ~15.6 ms between samples
- For HRV at breathing frequencies (0.04-0.4 Hz), this is adequate
- For beat-to-beat precision, 64 Hz is lower than ideal (clinical PPG uses 100-500 Hz) but research shows PPG-derived PRV correlates r=0.99 with ECG-derived HRV at rest
- During resonance frequency breathing at ~0.1 Hz, the user is seated and still, which is the ideal scenario for PPG accuracy

**Accuracy Compared to Chest Strap:**
- No published validation studies comparing Muse-S PPG to chest strap specifically
- General PPG forehead accuracy: forehead PPG is considered more reliable than wrist PPG due to less motion artifact and better perfusion
- For seated breathing exercises (minimal motion), PPG-derived IBI should be adequate for biofeedback purposes
- NOT suitable for clinical HRV analysis -- but our use case is biofeedback, not diagnosis
- **Recommendation:** If the app already supports Polar H10 or similar chest strap via standard BLE HR Service, keep that as the "gold standard" option and position Muse-S as "good enough + bonus EEG"

---

## 3. EEG Data and Relaxation Metrics

### EEG Channels

**Confidence: HIGH**

| Channel | Position | Location | Role |
|---------|----------|----------|------|
| TP9 | Left ear | Temporal-Parietal | General brain activity, auditory processing |
| AF7 | Left forehead | Anterior-Frontal | Frontal lobe activity (left) |
| AF8 | Right forehead | Anterior-Frontal | Frontal lobe activity (right) |
| TP10 | Right ear | Temporal-Parietal | General brain activity, auditory processing |
| AUX | USB port | External | Optional auxiliary electrode |

**Sampling rate:** 256 Hz, 12 samples per BLE notification, 12-bit resolution.

### Relevant EEG Frequency Bands

| Band | Frequency | Associated State | Relevance to Breathing Exercise |
|------|-----------|-----------------|--------------------------------|
| Delta | 1-4 Hz | Deep sleep | Low (user is awake) |
| Theta | 4-8 Hz | Deep relaxation, drowsiness, meditation | HIGH -- increases during deep relaxation |
| Alpha | 7.5-13 Hz | Calm alertness, relaxed focus | **HIGHEST** -- primary indicator of relaxation |
| Beta | 13-30 Hz | Active thinking, anxiety | Useful as inverse indicator (decreasing = good) |
| Gamma | 30-44 Hz | High-level cognition | Low relevance |

### Deriving a "Calm" Metric from EEG

**Confidence: MEDIUM** (well-established neuroscience, but implementation details vary)

**Recommended approach: Relative Alpha Power**

```
relaxation_index = alpha_power / (alpha_power + beta_power)
```

This is the simplest and most validated approach:
- Ratio ranges from 0 to 1
- Higher = more relaxed
- Computed from AF7 and AF8 (frontal channels) using FFT
- Update every 1-2 seconds using a sliding window (e.g., 2-second window)
- Well-validated: Muse has been peer-reviewed for spectral analysis and frontal alpha asymmetry accuracy comparable to clinical-grade EEG systems

**Additional metrics to consider:**

1. **Frontal Alpha Asymmetry (FAA):** `(AF8_alpha - AF7_alpha) / (AF8_alpha + AF7_alpha)` -- positive values associated with approach motivation and positive affect
2. **Theta/Beta Ratio:** Higher ratio = more relaxed, less anxious
3. **Alpha Peak Frequency:** Individual alpha frequency shifts with relaxation state

**Correlation with HRV coherence:**
- Alpha power and HRV coherence both increase during slow, paced breathing
- They reflect different limbs of the same relaxation response (central vs. autonomic)
- Showing both metrics simultaneously creates a compelling "whole body + mind" biofeedback display
- This is a genuine differentiator -- no browser-based HRV app currently combines real-time EEG relaxation with HRV coherence

### Breath Detection from Accelerometer

**Confidence: MEDIUM**

The Muse-S sits on the forehead. During breathing, subtle head movements (especially during deep diaphragmatic breathing) are detectable via the accelerometer. The Muse app itself uses this for breath-focused meditation.

**Practical value for ResonanceHRV:** Limited. The app already guides breathing pace, so detecting breath timing from the accelerometer is redundant. However, it could be useful for:
- Verifying the user is actually following the breathing guide
- Detecting if the user has fallen asleep (no movement + increased theta)
- Detecting restlessness or fidgeting

---

## 4. Existing Libraries

### Library Comparison

| Library | Repo | Last Update | Muse S Support | PPG | Stars | Status |
|---------|------|-------------|----------------|-----|-------|--------|
| **muse-js** | [urish/muse-js](https://github.com/urish/muse-js) | 2021 (v3.3.0) | Yes | Yes | ~500 | Abandoned but functional |
| **web-muse** | [itayinbarr/web-muse](https://github.com/itayinbarr/web-muse) | Feb 2025 | Yes (tested) | Yes | 17 | Active, maintained |
| **MuseJS** | [Respiire/MuseJS](https://github.com/Respiire/MuseJS) | June 2022 | Yes | Yes | Low | Abandoned (5 commits) |

### Recommendation: Use muse-js as Reference, Build Custom

**Rationale:**

1. **muse-js** is the most battle-tested and well-understood. Its source code is the definitive reference for the BLE protocol. However, it's abandoned (last release 4 years ago), uses RxJS extensively, and would need patching for modern firmware.

2. **web-muse** is more recent and has React hooks, but has only 17 stars, no npm release, and limited community validation. The React hooks are nice but might not fit our architecture.

3. **MuseJS** is essentially dead.

**Recommended approach:** Write a thin custom Muse BLE client for ResonanceHRV, using muse-js source as the protocol reference. The BLE protocol itself is straightforward (connect, send preset command, parse notifications). The heavy lifting is in PPG signal processing, not BLE communication.

Alternatively, use muse-js directly as a dependency -- it still works with current firmware per community reports, and the RxJS Observables are a reasonable fit for streaming data. Pin to v3.3.0.

---

## 5. Data Stream Specifications Summary

| Stream | Sampling Rate | Samples/Notification | Channels | Preset Required | Data Format |
|--------|--------------|---------------------|----------|----------------|-------------|
| EEG | 256 Hz | 12 | 5 (4 standard + AUX) | p21 (default) | 12-bit unsigned, microvolts |
| PPG | 64 Hz | 6 | 3 (IR, Green/Red, Unknown) | **p50** | 16-bit unsigned |
| Accelerometer | ~52 Hz | 3 (XYZ) | 1 | Any | g-force units |
| Gyroscope | ~52 Hz | 3 (XYZ) | 1 | Any | degrees/second |
| Telemetry | ~0.1 Hz | 1 | 1 | Any | Battery %, temperature |

**Data packet structure:** First 2 bytes = 16-bit event index (for ordering/timestamp reconstruction), followed by encoded samples. Index wraps at 65535.

---

## 6. Implementation Architecture Sketch

```
[Muse-S BLE] 
    |
    | Web Bluetooth GATT notifications
    |
[BLE Connection Layer]
    |-- Control: send preset commands (p50), start/stop
    |-- Subscribe to: PPG (3 chars), EEG (4 chars), Accelerometer, Telemetry
    |
    v
[Raw Data Parser]
    |-- PPG: decode 6 samples x 3 channels per notification
    |-- EEG: decode 12 samples x 4 channels per notification  
    |-- IMU: decode accelerometer/gyro
    |
    v
[Signal Processing Pipeline]
    |
    |-- [PPG Branch]
    |   |-- Bandpass filter (0.5-5 Hz)
    |   |-- Peak detection (systolic peaks)
    |   |-- IBI extraction
    |   |-- Artifact rejection
    |   |-- HR calculation (windowed)
    |   |-- HRV metrics (RMSSD, coherence)
    |   --> Feed into existing HRV visualization
    |
    |-- [EEG Branch]
    |   |-- Bandpass filter per band
    |   |-- FFT (sliding 2-sec window)
    |   |-- Alpha power extraction (AF7, AF8)
    |   |-- Beta power extraction (AF7, AF8)
    |   |-- Relaxation index = alpha / (alpha + beta)
    |   --> New "Neural Calm" visualization
    |
    v
[Biofeedback Display]
    |-- HRV coherence (from PPG or existing chest strap)
    |-- Neural calm index (from EEG) -- NEW
    |-- Dual-metric feedback during breathing exercises
```

---

## 7. Key Risks and Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| PPG peak detection quality at 64 Hz | Medium | Use Infrared channel (best SNR), test with real device, compare against Polar H10 |
| PPG channel mapping on Muse S is uncertain | Low | Test empirically -- one channel will have strongest cardiac pulse |
| iOS completely unsupported (Web Bluetooth) | High | Document clearly; this is a Chrome/Edge desktop + Android feature only |
| muse-js compatibility with latest firmware | Low | Community reports it works; test early |
| EEG signal quality varies with headband fit | Medium | Show signal quality indicator, guide user on fit |
| Muse S Athena (newest model) may have different UUIDs | Low | Same BLE protocol per Muse documentation; Athena adds fNIRS but keeps existing sensors |
| Computational load of real-time FFT + PPG processing | Low | 256 Hz EEG FFT and 64 Hz PPG filtering are trivial for modern browsers |

---

## 8. Sources

### Primary (HIGH confidence)
- [muse-js source code (muse.ts)](https://github.com/urish/muse-js/blob/master/src/muse.ts) -- BLE UUIDs, protocol, data parsing
- [muse-js README](https://github.com/urish/muse-js/blob/master/README.md) -- PPG channel descriptions, preset commands
- [Mind Monitor Technical Manual](https://www.musemonitor.com/Technical_Manual.php) -- EEG bands, sensor positions, data formats
- [Web Bluetooth API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) -- browser compatibility

### Secondary (MEDIUM confidence)
- [web-muse library](https://github.com/itayinbarr/web-muse) -- modern alternative, React hooks
- [MuseJS (Respiire)](https://github.com/Respiire/MuseJS) -- vanilla JS implementation
- [Muse Research page](https://choosemuse.com/pages/muse-research) -- validation studies
- [IEEE: Validating Muse for EEG spectral analysis and FAA](https://ieeexplore.ieee.org/document/9669778) -- clinical accuracy validation
- [Alexandre Barachant: Reverse-Engineering Muse BLE Protocol](https://alexandre.barachant.org/blog/2017/01/27/reverse-engineering-muse-eeg-headband-bluetooth-protocol.html) -- original protocol RE

### Tertiary (LOW confidence -- needs validation)
- PPG channel mapping on Muse S specifically (IR/Green/Unknown vs Muse 2's Ambient/IR/Red)
- Muse S PPG accuracy for HRV compared to chest strap (no published validation found)
- Accelerometer breath detection feasibility from forehead position

---

## 9. Recommendations for Roadmap

### Phase 1: BLE Connection + Raw Data Display
- Implement Muse-S Web Bluetooth connection
- Send `p50` preset, start streaming
- Display raw PPG waveform and EEG channel quality indicators
- Verify which PPG channel has strongest cardiac pulse signal
- **Risk:** Low. Protocol is well-documented.

### Phase 2: PPG-to-HRV Pipeline
- Implement bandpass filter for PPG
- Implement peak detection algorithm
- Extract IBIs and compute HR
- Feed IBI data into existing HRV coherence engine
- Validate against Polar H10 (dual-wear test)
- **Risk:** Medium. Signal processing quality determines usefulness. This phase needs the most iteration.

### Phase 3: EEG Relaxation Index
- Implement real-time FFT on AF7/AF8 channels
- Compute alpha/beta power ratio as "Neural Calm" metric
- Design visualization that complements existing HRV coherence display
- **Risk:** Low for computation. Medium for UX (making dual-metric display intuitive).

### Phase 4: Integrated Dual-Modality Biofeedback
- Combined breathing exercise view showing HRV coherence + Neural Calm
- Historical tracking of both metrics
- Session summary with correlation analysis
- **Risk:** Low. This is UI/UX work building on phases 2-3.

### What to Defer
- Accelerometer breath detection (redundant with existing breathing guide)
- Frontal alpha asymmetry (interesting but complex to interpret for users)
- Muse S Athena fNIRS support (too new, no open-source protocol documentation)
