# Multi-Device BLE Architecture & Novel Biometrics Research

**Domain:** Web Bluetooth multi-device HRV biofeedback with EEG integration
**Researched:** 2026-04-03
**Overall confidence:** MEDIUM (architecture patterns HIGH, neurocardiac metrics LOW-MEDIUM)

---

## Executive Summary

ResonanceHRV can support multiple BLE device types through an **adapter pattern** where each device class (chest strap, wrist watch, EEG headband) implements a common `DeviceAdapter` interface. Web Bluetooth supports simultaneous connections to multiple devices -- each `requestDevice()` call returns an independent `BluetoothDevice` with its own GATT server. The practical limit is 7 concurrent BLE connections on most platforms before OS-level Bluetooth stacks become unstable.

The Garmin Fenix 8 broadcasts HR over standard BLE Heart Rate Service (0x180D) when "Broadcast Heart Rate" is enabled, making it compatible with the same 0x2A37 parsing code already in `ble.js`. However, **wrist PPG does not reliably provide RR intervals in the BLE broadcast** -- it sends HR only, not beat-to-beat timing. This makes wrist devices unsuitable as a primary HRV data source during movement, though adequate for resting HR biofeedback.

The Muse S headband is accessible via Web Bluetooth through the open-source `muse-js` library (service UUID `0xfe8d`). It provides 5-channel EEG at 256 Hz, 3-channel PPG at 64 Hz, plus accelerometer and gyroscope. This opens the door to a **neurocardiac coherence** metric combining HRV coherence with EEG alpha power -- a genuinely novel biofeedback signal.

Research on combined EEG+HRV biofeedback is sparse but promising. The key finding is that **occipital alpha2 power (10-12 Hz) positively correlates with parasympathetic HRV (nHF)**, and HRV biofeedback training itself shifts frontal alpha asymmetry. A combined metric is feasible but would be a research contribution, not an established protocol.

---

## Part 1: Multi-Device Architecture

### 1.1 Recommended Pattern: Device Adapter with Capability Flags

**Confidence: HIGH** (based on Web Bluetooth API spec + existing codebase analysis)

The cleanest architecture is an **adapter pattern** where each device type implements a common interface, with capability flags declaring what data streams it provides.

```
DeviceManager (orchestrator)
  |
  +-- DeviceAdapter (interface)
  |     .id: string
  |     .name: string
  |     .capabilities: Set<'hr' | 'rr' | 'eeg' | 'ppg' | 'accel' | 'gyro'>
  |     .connect(): Promise<void>
  |     .disconnect(): void
  |     .on(event, callback): void
  |     .connectionStatus: string
  |
  +-- HRMAdapter extends DeviceAdapter       (Garmin HRM 600, Polar H10, etc.)
  |     capabilities: ['hr', 'rr']
  |     service: 'heart_rate' (0x180D)
  |     parses: 0x2A37 characteristic
  |
  +-- WristHRAdapter extends DeviceAdapter   (Garmin Fenix 8, Apple Watch, etc.)
  |     capabilities: ['hr']               // NO reliable RR intervals
  |     service: 'heart_rate' (0x180D)
  |     parses: 0x2A37 characteristic (HR only, RR may be absent/unreliable)
  |
  +-- MuseAdapter extends DeviceAdapter      (Muse 2, Muse S)
        capabilities: ['eeg', 'ppg', 'accel', 'gyro']
        service: 0xfe8d (proprietary)
        parses: custom characteristics per muse-js protocol
```

**Why this pattern:**
- Each adapter encapsulates its own GATT service/characteristic details
- `DeviceManager` doesn't need to know BLE protocol specifics
- Capability flags let the UI and DSP pipeline adapt to available data
- New devices only require a new adapter class, zero changes to existing code

**Integration with existing AppState:**
- `DeviceManager` writes to AppState, replacing direct BLE writes from `ble.js`
- Each adapter emits standardized events (`hr`, `rr`, `eeg`, etc.)
- DeviceManager subscribes to adapter events and routes to appropriate AppState fields
- Add new AppState fields: `eegBuffer`, `ppgBuffer`, `activeDevices`, `deviceCapabilities`

### 1.2 Device Selection UX: Auto-Detect from Scan Results

**Confidence: HIGH** (Web Bluetooth API docs confirm filter-based detection)

**Recommendation: Use BLE service filters to auto-detect device type, not a manual picker.**

The `requestDevice()` API accepts multiple filter objects with OR logic between them. The device the user selects from the browser picker already tells you which services it advertises:

```javascript
// Single picker that shows ALL compatible devices
const device = await navigator.bluetooth.requestDevice({
  filters: [
    { services: ['heart_rate'] },                    // HRM chest straps + watches
    { services: [0xfe8d] },                          // Muse headbands
    // { services: ['battery_service'] },             // future devices
  ],
  optionalServices: ['battery_service', 'device_information']
});
```

After the user picks a device, detect type by:
1. **Attempt to get primary service** -- try `heart_rate` first, then `0xfe8d`
2. **Check device name** -- Garmin HRM names contain "HRM", Fenix contains "fenix", Muse contains "Muse"
3. **Instantiate the correct adapter** based on detection

This avoids forcing users through a "what type of device?" question they may not know the answer to.

**Alternative considered:** User picks device type first, then we filter the scan. Rejected because it adds an unnecessary step and users may not know whether their device is "chest strap" vs "watch" in BLE terms.

### 1.3 Simultaneous Multi-Device Connections

**Confidence: HIGH** (Web Bluetooth spec + issue tracker confirmation)

**Yes, Web Bluetooth supports multiple simultaneous connections.** Each `requestDevice()` call is independent, returns a separate `BluetoothDevice`, and establishes its own GATT connection.

**Practical considerations:**
- Each connection requires a separate user gesture (button click) for the browser picker
- Platform BLE connection limits: ~7 on Android, higher on desktop (OS-dependent)
- No Chrome-specific limit -- the bottleneck is the OS Bluetooth stack
- Each device maintains its own GATT server, notifications, and disconnect events

**For ResonanceHRV's use case (chest strap + Muse):**
- 2 simultaneous connections is well within all platform limits
- User clicks "Connect HRM" and "Connect Muse" as separate actions
- DeviceManager tracks all active connections
- If both provide HR (e.g., Muse PPG + chest strap RR), prefer chest strap for HRV calculation

### 1.4 Handling Different Capability Sets

**Confidence: HIGH** (architectural pattern, not API-dependent)

The capability flag system drives UI and processing decisions:

```javascript
// DSP pipeline checks capabilities before processing
if (deviceManager.hasCapability('rr')) {
  // Full HRV analysis with RR intervals
  runCoherenceAnalysis(rrBuffer);
} else if (deviceManager.hasCapability('hr')) {
  // HR-only mode: show HR trend, disable coherence score
  showHROnly(currentHR);
}

if (deviceManager.hasCapability('eeg')) {
  // Enable neurocardiac panel
  runAlphaPowerAnalysis(eegBuffer);
}
```

**UI adaptation rules:**
| Capabilities Available | UI Mode |
|----------------------|---------|
| `rr` only (chest strap) | Full HRV coherence -- current behavior |
| `hr` only (wrist watch) | HR display + breathing pacer, coherence disabled with explanation |
| `rr` + `eeg` (chest + Muse) | Full neurocardiac mode -- HRV coherence + alpha power + combined metric |
| `eeg` only (Muse alone) | Alpha power biofeedback only, no HRV |
| `hr` + `eeg` (watch + Muse) | Alpha power + HR trend, coherence disabled |

---

## Part 2: Novel Biometrics -- EEG + HRV Integration

### 2.1 EEG Markers Correlating with Autonomic State

**Confidence: MEDIUM** (multiple peer-reviewed sources, but correlations are moderate)

Key findings from the literature:

**Alpha2 power (10-12 Hz) positively correlates with parasympathetic HRV (nHF).**
- Source: PLOS ONE (2024) -- "positive partial correlation between occipital alpha2 power and nHF...under both music and rest conditions"
- This is the strongest and most replicated finding
- Alpha2 is the "relaxed but alert" band -- exactly the state HRV biofeedback aims to produce

**Frontal alpha asymmetry shifts with HRV biofeedback training.**
- Source: Applied Psychophysiology and Biofeedback (2015) -- Athletes in HRV biofeedback groups showed changes in alpha asymmetry alongside HRV improvements
- Left > Right frontal alpha is associated with approach motivation and positive affect
- HRV biofeedback appears to shift this ratio

**Alpha coherence increases during "heart coherent" states.**
- Source: Frontiers in Integrative Neuroscience (2013) -- "significant increases in alpha band coherence during heart coherent meditation"
- This suggests EEG inter-electrode coherence (not just power) tracks cardiac coherence

**What this means for ResonanceHRV:** The Muse S has electrodes at TP9, AF7, AF8, TP10 -- frontal and temporal positions. AF7/AF8 can measure frontal alpha asymmetry. TP9/TP10 capture temporal alpha power. Both are relevant biomarkers.

### 2.2 Combined EEG + HRV Biofeedback Effectiveness

**Confidence: LOW** (very sparse direct research)

**There is almost no published research on simultaneous dual-modality EEG+HRV biofeedback.** The literature treats these as separate modalities:

- HRV biofeedback: robust evidence base, multiple meta-analyses, clear protocols (Lehrer resonance frequency breathing)
- EEG neurofeedback: established field, but primarily for ADHD, depression, anxiety -- not typically combined with HRV
- Combined protocols: One clinical trial (NCT06695715) is currently registered examining "HRV Biofeedback, Interoceptive Training" but results are not yet published

**However, indirect evidence supports the combination:**
- HRV biofeedback changes EEG alpha patterns (bidirectional coupling exists)
- Multimodal biofeedback generally outperforms single-modality in pilot studies
- The autonomic nervous system and central nervous system are bidirectionally coupled via the vagus nerve

**Implication:** ResonanceHRV would be breaking genuinely new ground by offering combined feedback. This is both an opportunity (novel differentiator, potential research collaboration) and a risk (no established protocol to follow, harder to validate claims).

### 2.3 Proposed "Neurocardiac Coherence" Metric

**Confidence: LOW** (novel construction based on established components)

A neurocardiac coherence score could combine:

**Component 1: HRV Coherence Ratio (existing)**
- Already implemented in ResonanceHRV's DSP pipeline
- Peak power at resonance frequency / total spectral power
- Range: 0-100 (normalized)

**Component 2: Alpha Relaxation Index (new)**
- Relative alpha2 power (10-12 Hz) at AF7/AF8 electrodes
- Computed as: alpha2_power / total_power (1-40 Hz)
- Normalized to 0-100 scale based on individual baseline

**Component 3: Frontal Alpha Asymmetry (new, optional)**
- (Right alpha - Left alpha) / (Right alpha + Left alpha) at AF7/AF8
- Positive values = left-dominant = approach/positive state
- Could serve as a "valence" overlay

**Combined Formula (proposed):**
```
NeurocardiacCoherence = (w1 * HRV_Coherence) + (w2 * Alpha_Relaxation_Index)
```
Where w1=0.6, w2=0.4 (HRV-weighted because it has stronger evidence base)

**Important caveats:**
- This metric has NOT been validated in published research
- Weights are arbitrary starting points that would need empirical tuning
- Individual baseline calibration is essential for both components
- Should be presented as "experimental" in the UI, not as an established measure

### 2.4 Published Protocols for Combined Biofeedback

**Confidence: LOW** (no standardized protocols found)

No published standardized protocol exists for simultaneous EEG+HRV biofeedback. The closest approaches are:

1. **Sequential protocols:** HRV biofeedback session followed by EEG neurofeedback session (separate)
2. **HeartMath + neurofeedback clinics:** Some practitioners combine Inner Balance (HRV) with separate neurofeedback sessions, but not simultaneous
3. **Research protocols:** The Lehrer resonance frequency protocol (HRV) and SMR/alpha neurofeedback protocols exist independently

**Recommended approach for ResonanceHRV:**
- Use the established Lehrer protocol for the breathing/HRV component (this is your core)
- Add EEG as a passive "second screen" initially -- show alpha power without feeding it back
- Graduate to combined feedback once you have user data showing the relationship
- This avoids making unvalidated training claims while still providing novel data

---

## Part 3: Pitfalls

### 3.1 Multi-Device BLE Browser Issues

**Confidence: HIGH** (well-documented in Web Bluetooth issue tracker and forums)

**Connection stability:**
- Disconnection events may lag by ~200ms on some platforms
- If you disconnect one device and immediately try to connect another, the Bluetooth stack may hang
- Mitigation: Add 200-500ms delay between disconnect/reconnect cycles; use exponential backoff (already in your codebase)

**Battery drain:**
- BLE is low-power by design, but maintaining 2+ active GATT connections with high-frequency notifications (especially EEG at 256 Hz) will drain both the phone/laptop battery and the peripheral batteries faster
- Muse S battery life is ~5 hours with active streaming
- Garmin HRM 600 battery (CR2032) lasts months with standard use but may drain faster with continuous broadcast

**Interference:**
- Multiple BLE devices in the 2.4 GHz band can interfere with each other and with WiFi
- Practical impact is minimal for 2 devices, but worth monitoring for dropouts
- If artifacts spike when both devices are active, suspect RF interference

**Browser-specific issues:**
- Web Bluetooth is Chrome/Edge only (no Firefox, no Safari)
- Each `requestDevice()` requires a fresh user gesture -- you cannot programmatically initiate scans
- `getDevices()` for reconnection is still gated behind a Chrome flag in some versions
- No background BLE -- if the tab loses focus, notifications may be throttled

### 3.2 Wrist Optical HR (PPG) Accuracy for HRV

**Confidence: HIGH** (extensive published research)

**Critical finding: Wrist PPG is NOT suitable for real-time HRV biofeedback during a breathing exercise.**

Reasons:
1. **No RR intervals in BLE broadcast.** The Garmin Fenix 8 broadcasts HR via 0x180D but typically does NOT include RR interval fields in the 0x2A37 characteristic when broadcasting from wrist PPG. The Enhanced BBI system Garmin developed stores beat-to-beat data on-device for later sync, but does not broadcast it over BLE to third parties.

2. **Motion artifacts during breathing.** Even slow diaphragmatic breathing causes subtle wrist movement. PPG is extremely sensitive to motion -- Garmin marks beats as "low confidence" when accelerometer detects motion above threshold.

3. **Latency in pulse wave.** PPG measures pulse pressure waves at the wrist, not electrical cardiac events. The pulse transit time adds ~100-200ms latency and the waveform morphology differs from ECG R-peaks, making beat detection less precise. Error is typically +/-20ms at rest (Garmin Enhanced BBI data), which compounds when computing RMSSD or spectral HRV.

4. **When PPG is "good enough":**
   - Resting HR display (not HRV): fine
   - Long-term HRV trends (RMSSD averaged over 5+ minutes at rest): acceptable
   - Real-time coherence biofeedback with 5-second update windows: NOT reliable

**Recommendation:** If a Fenix 8 connects, show HR as a secondary metric but explicitly disable HRV coherence scoring and display a message: "Wrist HR detected -- for HRV biofeedback, connect a chest strap." This is honest and protects the user from misleading data.

### 3.3 EEG Artifact Rejection

**Confidence: MEDIUM** (well-studied domain, but browser-based real-time processing is novel territory)

**Major artifact sources during breathing biofeedback:**

| Artifact | Cause | Frequency Range | Impact on Alpha |
|----------|-------|----------------|-----------------|
| Eye blinks | Involuntary | 0-12 Hz | HIGH -- directly contaminates alpha band |
| Jaw clenching (EMG) | Tension | 20-300 Hz | LOW -- above alpha band, but broadband |
| Eye movement (EOG) | Looking at screen | 0-8 Hz | MODERATE -- contaminates low alpha/theta |
| Head/body movement | Breathing motion | Broadband | MODERATE -- especially during deep breaths |
| Electrode impedance drift | Sweat, movement | DC drift | LOW -- affects baseline, not alpha power |

**Practical approaches for real-time browser processing:**

1. **Threshold-based rejection (simplest, recommended to start):**
   - Reject any epoch where peak-to-peak amplitude exceeds a threshold (e.g., 100 uV on frontal channels)
   - Eye blinks produce 50-200 uV spikes vs 10-50 uV for alpha
   - Fast to compute, no ML needed, works in real-time

2. **Moving median filter on alpha power:**
   - Compute alpha power per 1-second epoch
   - Reject epochs where alpha power deviates > 3 SD from running median
   - Similar to your existing RR artifact rejection logic

3. **NOT recommended for browser:**
   - ICA (too computationally expensive for real-time JS)
   - Deep learning artifact removal (needs trained model, adds latency)
   - Regression-based EOG correction (requires dedicated EOG channels the Muse doesn't have)

**Muse-specific considerations:**
- The Muse S has only 4 EEG channels (no dedicated EOG channel)
- AF7/AF8 (forehead) are the most contaminated by eye blinks
- TP9/TP10 (behind ears) are less affected by eye artifacts but more affected by jaw EMG
- For alpha power estimation, TP9/TP10 may be more reliable during breathing exercises where users blink normally

---

## Part 4: Muse S Integration Details

### 4.1 BLE Protocol (from muse-js source analysis)

**Confidence: HIGH** (verified against muse-js source code)

| Component | UUID |
|-----------|------|
| Service | `0xfe8d` |
| Control | `273e0001-4c4d-454d-96be-f03bac821358` |
| Telemetry | `273e000b-...` |
| Gyroscope | `273e0009-...` |
| Accelerometer | `273e000a-...` |
| EEG Ch 0 (TP9) | `273e0003-...` |
| EEG Ch 1 (AF7) | `273e0004-...` |
| EEG Ch 2 (AF8) | `273e0005-...` |
| EEG Ch 3 (TP10) | `273e0006-...` |
| EEG Ch 4 (AUX) | `273e0007-...` |
| PPG Ch 0 | `273e000f-...` |
| PPG Ch 1 | `273e0010-...` |
| PPG Ch 2 | `273e0011-...` |

**Data rates:**
- EEG: 256 Hz, 12 samples per notification packet per channel
- PPG: 64 Hz, 6 samples per notification packet per channel
- Accelerometer: variable rate
- Gyroscope: variable rate

**Data format:** Each notification contains a 16-bit event index followed by sample data. The muse-js library uses RxJS observables to parse and distribute these streams.

### 4.2 Vanilla JS Integration Strategy

The existing muse-js library uses RxJS (heavy dependency). For ResonanceHRV's vanilla JS approach:

**Option A: Use muse-js as-is** (adds RxJS dependency ~45KB gzipped)
- Pro: Battle-tested parsing code, handles all the BLE protocol details
- Con: Heavy dependency for a vanilla JS app, RxJS paradigm mismatch with AppState

**Option B: Port muse-js parsing to vanilla JS** (recommended)
- Extract the characteristic UUID constants and parsing functions
- Replace RxJS observables with `characteristicvaluechanged` event listeners (same pattern as current `ble.js`)
- Write parsed data directly to AppState circular buffers
- ~200 lines of code, no external dependency

**Option C: Respiire/MuseJS** (vanilla JS fork exists)
- GitHub: `Respiire/MuseJS` -- a vanilla JS port of muse-js without RxJS dependency
- This is the ideal starting point -- examine its source and potentially vendor it

---

## Part 5: Recommended Implementation Phases

### Phase 1: Refactor ble.js into Device Adapter Architecture
- Extract current HRM logic into `HRMAdapter`
- Create `DeviceManager` orchestrator
- Create `DeviceAdapter` base interface
- Modify `initiateConnection()` to use multi-filter `requestDevice()`
- Auto-detect device type from GATT services
- **No new devices yet** -- just the refactor with HRM 600 still working

### Phase 2: Add Garmin Fenix 8 Support (WristHRAdapter)
- Implement `WristHRAdapter` -- same 0x180D service, HR-only mode
- Add UI degradation: "Wrist HR -- coherence unavailable" messaging
- Handle the case where 0x2A37 includes no RR intervals gracefully
- Test with actual Fenix 8 in broadcast mode

### Phase 3: Add Muse S Support (MuseAdapter)
- Port muse-js parsing (or vendor Respiire/MuseJS)
- Implement EEG circular buffer in AppState (5 channels x 256 Hz)
- Add basic EEG visualization (raw waveform or spectrogram)
- Add alpha power computation to DSP pipeline
- Implement threshold-based artifact rejection

### Phase 4: Neurocardiac Coherence (experimental)
- Implement Alpha Relaxation Index
- Implement frontal alpha asymmetry (AF7 vs AF8)
- Create combined neurocardiac coherence metric
- Add combined visualization panel
- Label clearly as "experimental"
- Collect user data to validate/tune the metric

### Phase Ordering Rationale
- Phase 1 must come first (architectural foundation)
- Phase 2 is low-risk, validates the adapter pattern works
- Phase 3 is the highest-value addition (new modality)
- Phase 4 depends on both Phase 1 (HRV) and Phase 3 (EEG) working

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Multi-device architecture pattern | HIGH | Standard software pattern, Web Bluetooth API well-documented |
| Simultaneous BLE connections | HIGH | Confirmed in spec and issue tracker, 2 devices is safe |
| Garmin Fenix 8 BLE broadcast | MEDIUM | Confirmed it broadcasts 0x180D, but RR interval availability unverified without physical device testing |
| Wrist PPG HRV limitations | HIGH | Extensive peer-reviewed literature, Garmin's own Enhanced BBI whitepaper |
| Muse S BLE protocol | HIGH | Open-source muse-js library, verified against source code |
| Alpha-HRV correlation | MEDIUM | Peer-reviewed (PLOS ONE 2024), but effect sizes are moderate and variable |
| Combined EEG+HRV biofeedback | LOW | Almost no published protocols; this would be novel territory |
| Neurocardiac coherence metric | LOW | Proposed construction, not validated; weights are arbitrary starting points |
| EEG artifact rejection in browser | MEDIUM | Well-known problem, but JS real-time implementations are uncommon |

## Gaps to Address

- **Fenix 8 RR interval test:** Need to physically connect a Fenix 8 and inspect the 0x2A37 notification bytes to confirm whether RR intervals are present in BLE broadcast mode
- **Muse S PPG for HRV:** The Muse S has PPG sensors -- could these provide beat-to-beat intervals as an alternative to a chest strap? Needs investigation of PPG signal quality and IBI extraction feasibility
- **Alpha power individual calibration:** What baseline period is needed? 30 seconds? 2 minutes? No standard exists for real-time alpha biofeedback calibration
- **Combined metric validation:** The proposed neurocardiac coherence formula needs user testing to determine if it provides meaningful, actionable feedback

## Sources

### Architecture & Web Bluetooth
- [Web Bluetooth API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Web Bluetooth Spec (Sept 2025)](https://webbluetoothcg.github.io/web-bluetooth/)
- [Bluetooth.requestDevice() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/requestDevice)
- [Connection limits issue #342](https://github.com/WebBluetoothCG/web-bluetooth/issues/342)
- [Chrome Web Bluetooth guide](https://developer.chrome.com/docs/capabilities/bluetooth)

### Muse Integration
- [muse-js (urish)](https://github.com/urish/muse-js) -- original RxJS library
- [MuseJS (Respiire)](https://github.com/Respiire/MuseJS) -- vanilla JS fork
- [Muse BLE reverse engineering](https://alexandre.barachant.org/blog/2017/01/27/reverse-engineering-muse-eeg-headband-bluetooth-protocol.html)

### Garmin Broadcast
- [Fenix 8 broadcast manual](https://www8.garmin.com/manuals/webhelp/GUID-EECCAC99-90D6-4AB1-9A3A-EC433D3365E2/EN-US/GUID-D8D363C2-0690-48D4-95E2-A3557E7D53C2.html)
- [DC Rainmaker: Garmin broadcast guide](https://www.dcrainmaker.com/2020/04/garmin-wearable-broadcasting.html)
- [Garmin Enhanced BBI whitepaper (PDF)](https://www8.garmin.com/garminhealth/news/Garmin-Enhanced-BBI_Final.pdf)

### EEG-HRV Research
- [Alpha2 and nHF correlation - PLOS ONE 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10906897/)
- [HRV biofeedback and EEG alpha asymmetry in athletes](https://link.springer.com/article/10.1007/s10484-015-9319-4)
- [Brain-heart reorganization during meditation](https://www.frontiersin.org/articles/10.3389/fnint.2013.00109/full)
- [HRV-EEG connectivity and cognitive flexibility](https://pmc.ncbi.nlm.nih.gov/articles/PMC6397840/)
- [HeartMath coherence scoring](https://help.heartmath.com/science/heart-rate-variability-in-relation-to-coherence-scores/)

### PPG/Wrist HR Accuracy
- [Elite HRV: Why wrist monitors don't work for HRV](https://help.elitehrv.com/article/119-why-can-t-i-use-my-wrist-hr-monitor-or-led-pulse-oximetry-monitors-like-fitbit)
- [ECG vs PPG comparative study - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12473955/)
- [PPG device validity concerns - JMIR Cardio 2025](https://cardio.jmir.org/2025/1/e67110)
- [HRV4Training sensor recommendations](https://marcoaltini.substack.com/p/recommended-sensors-for-heart-rate)

### EEG Artifact Rejection
- [EEG artifact removal review - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6427454/)
- [Eye blink removal with k-means and SSA](https://www.nature.com/articles/s41598-021-90437-7)
- [EEG artifact types and handling](https://www.bitbrain.com/blog/eeg-artifacts)
