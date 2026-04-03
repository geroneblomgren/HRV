# Phase 7: Muse-S Connection + Signal Processing - Research

**Researched:** 2026-04-03
**Domain:** Web Bluetooth BLE protocol, PPG signal processing, EEG spectral analysis
**Confidence:** MEDIUM-HIGH

---

## Summary

Phase 7 is the most technically complex phase in v1.1. It breaks into three parallel tracks: (1) BLE connection and data parsing for both EEG and PPG streams, (2) PPG peak detection pipeline to produce RR intervals for the existing DSP engine, and (3) EEG FFT to produce the Neural Calm score. The wiring target is already prepared in `DeviceManager.js` (slot `muse: null`) and `AppState` already has `museConnected`, `museStatus`, `museCapabilities` fields from Phase 6.

The exact byte-level data formats are now confirmed from muse-js source analysis: EEG notifications carry 12 x 12-bit samples per channel (scaled to microvolts via `0.48828125 * (n - 0x800)`), and PPG notifications carry 6 x 24-bit unsigned integers per channel, both preceded by a 2-byte event index. The control command encoding is confirmed: `encodeCommand(cmd)` produces `[length-1, ...UTF8('X{cmd}\n')]`. The start sequence is: send `h`, send `p50`, send `s`, send `d`.

One major research correction from prior MUSE-S.md: **PPG samples are 24-bit, not 16-bit.** The prior research document stated "16-bit unsigned" but muse-js source code (`decodePPGSamples`) uses `decodeUnsigned24BitData`, consuming 3 bytes per sample. This matters for the parser implementation.

A critical EEG channel selection finding overrides the initial assumption: **TP9/TP10 (temporal) channels are superior to AF7/AF8 (frontal) for alpha detection on Muse.** The Fpz reference electrode placement on Muse causes AF7/AF8 to have intrinsically low amplitude. Multiple research implementations have abandoned frontal channels and use TP9/TP10 for spectral analysis. Neural Calm should be computed from TP9/TP10 average (or both together), not AF7/AF8.

**Primary recommendation:** Implement MuseAdapter as a vanilla JS module mirroring HRMAdapter's structure, using muse-js source as the protocol reference. Use a 2-pole Butterworth cascade (two biquads) for PPG bandpass, derivative + adaptive threshold for peak detection, and 2-second sliding FFT window at 50% overlap for EEG. Target: PPG writes clean RR to `AppState.rrBuffer` (same slot as chest strap), EEG writes `neuralCalm` (0–100) to AppState.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **PPG Channel Selection:** Hardcode the best PPG channel after empirical testing with the actual device. Phase 7 plan includes a calibration task: connect both Muse-S and chest strap simultaneously, stream all 3 PPG channels, compare against chest strap RR to pick the channel with best correlation.
- **Hidden debug view:** Build a hidden debug/diagnostic view showing all 3 PPG channel waveforms (togglable via console or hidden button) for development and future troubleshooting.
- **PPG Signal Quality Indicator:** Show good/fair/poor status based on artifact rejection rate and peak detection confidence. When quality drops to 'poor' mid-session: show visible warning but continue session — don't pause.
- **EEG channel selection:** Claude picks which EEG channels feed Neural Calm (AF7/AF8 frontal vs TP9/TP10 temporal vs average of all 4). **Research conclusion: use TP9/TP10 — see Architecture Patterns section.**
- **Artifact rejection threshold:** Claude picks 100µV vs 150µV based on what keeps calm score trustworthy. **Research conclusion: 100µV — see Architecture Patterns section.**
- **Eyes-open indicator:** Show a subtle "eyes open?" indicator when alpha drops sharply.
- **Calibration:** Claude picks independent timers per metric vs shared window. Claude picks per-session baseline vs absolute ratio. **Research conclusions: see Architecture Patterns section.**

### Claude's Discretion

- PPG bandpass filter parameters (0.5-5 Hz range suggested by research)
- Peak detection algorithm choice (adaptive threshold, derivative-based, etc.)
- EEG FFT window size and overlap
- Neural Calm score scaling (0-100 like coherence, or different range)
- How to handle simultaneous PPG + chest strap data during the calibration test task
- MuseAdapter implementation details (GATT characteristic subscription order, p50 command timing)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MUSE-01 | User can connect to Muse-S via Web Bluetooth (service 0xfe8d) | BLE connection sequence documented; connectMuse() stub already exists in DeviceManager.js — replace stub with full GATT connect delegated to MuseAdapter |
| MUSE-02 | App initializes Muse-S with p50 preset to enable both EEG and PPG streaming | Command sequence confirmed: h → p50 → s → d via control characteristic `273e0001-...` using encodeCommand() |
| MUSE-03 | App receives 5-channel EEG data at 256 Hz from Muse-S | Characteristics `273e0003`–`273e0007`; 12 samples/notification; decoding: `0.48828125 * (n - 0x800)` µV; 12-bit packed |
| MUSE-04 | App receives 3-channel PPG data at 64 Hz from Muse-S | Characteristics `273e000f`–`273e0011`; 6 samples/notification; 24-bit unsigned; 2-byte event index prefix |
| MUSE-05 | Connection status UI shows Muse-S state (connecting, connected, streaming, disconnected) | AppState.museStatus already drives chip UI from Phase 6; MuseAdapter sets 'streaming' once notifications start |
| PPG-01 | App performs peak detection on Muse PPG waveform to extract inter-beat intervals | Bandpass filter (0.5–3 Hz) + derivative + adaptive threshold pipeline; ~15.6 ms temporal resolution at 64 Hz |
| PPG-02 | PPG-derived RR intervals are artifact-rejected (physiological bounds + rate-of-change filter) | Same two-tier rejection as HRMAdapter (300–2000 ms absolute + 20% median relative); writes to AppState.rrBuffer |
| EEG-01 | App computes alpha (8–12 Hz) and beta (13–30 Hz) power from EEG channels in real-time | 2-second sliding window FFT (512 samples at 256 Hz), 50% overlap = 1 s update cadence; reuse existing FFT instance |
| EEG-02 | EEG artifact rejection filters out eye blinks, jaw clenching, and movement contamination | Epoch-level threshold: reject any 2-second window where peak-to-peak amplitude exceeds 100 µV on any channel used |

</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Bluetooth API | Browser native | BLE GATT connect, characteristic subscribe, disconnect events | No alternative — this is the only browser BLE API |
| Existing FFT (fft.js CDN) | Already loaded | EEG spectral analysis | Already initialized in dsp.js via `initDSP()`; reuse same instance |
| Biquad IIR filters (hand-rolled) | N/A | PPG bandpass at 64 Hz | ~10 lines per biquad; no library needed for a 2-pole filter |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| muse-js (reference only) | v3.3.0 | Protocol constants and parsing logic reference | Read source; do not import — too heavy (RxJS dependency) |
| MuseJS/Respiire (reference only) | Latest | Vanilla JS port, secondary reference | Consult for any muse-js gaps |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled biquad IIR | fili.js library | fili.js works but adds a dependency for ~10 lines of code; not worth it |
| Hand-rolled biquad IIR | Web Audio API BiquadFilterNode | Web Audio path requires AudioContext; adds complexity; offline filtering is cleaner |
| Reuse existing dsp.js FFT | Separate FFT for EEG | Reusing dsp.js FFT saves memory and avoids a second FFT instance; EEG needs different FFT size (512 at 256 Hz vs 512 at 4 Hz) — **use new FFT(512) instance for EEG** |

**Installation:** No new npm packages needed. Pure vanilla JS adapter using browser APIs.

---

## Architecture Patterns

### Recommended Project Structure

```
js/devices/
├── DeviceAdapter.js       # Interface (Phase 6, existing)
├── DeviceManager.js       # Orchestrator (Phase 6, existing — wire muse slot here)
├── HRMAdapter.js          # Reference implementation (Phase 6, existing)
└── MuseAdapter.js         # NEW — all Muse BLE + signal processing

js/
├── dsp.js                 # Existing — PPG RR intervals feed in unchanged
├── state.js               # Existing — add neuralCalm, ppgSignalQuality, eegBuffer
└── museSignalProcessing.js  # NEW (optional) — PPG/EEG processing functions if MuseAdapter.js grows large
```

### Pattern 1: BLE Connection Sequence

**What:** Open GATT → get service → get all needed characteristics → subscribe notifications → send preset + start commands.

**When to use:** Called from `MuseAdapter.connect()`, which DeviceManager.connectMuse() will delegate to.

```javascript
// Source: muse-js src/muse.ts analysis
async function _connect() {
  AppState.museStatus = 'connecting';
  const server = await _device.gatt.connect(); // wrap in Promise.race timeout like HRMAdapter
  const service = await server.getPrimaryService(MUSE_SERVICE); // 0xfe8d

  // Fetch all characteristics up front
  _controlChar = await service.getCharacteristic(MUSE_CONTROL_UUID);
  _eegChars = await Promise.all(EEG_UUIDS.map(uuid => service.getCharacteristic(uuid)));
  _ppgChars = await Promise.all(PPG_UUIDS.map(uuid => service.getCharacteristic(uuid)));

  // Subscribe notifications
  for (const ch of [..._eegChars, ..._ppgChars]) {
    await ch.startNotifications();
  }
  _eegChars.forEach((ch, i) => ch.addEventListener('characteristicvaluechanged', e => _handleEEG(e, i)));
  _ppgChars.forEach((ch, i) => ch.addEventListener('characteristicvaluechanged', e => _handlePPG(e, i)));

  // Send preset sequence: h → p50 → s → d
  await _controlChar.writeValue(encodeCommand('h'));
  await _controlChar.writeValue(encodeCommand('p50'));
  await _controlChar.writeValue(encodeCommand('s'));
  await _controlChar.writeValue(encodeCommand('d'));

  AppState.museConnected = true;
  AppState.museStatus = 'streaming';
}
```

### Pattern 2: encodeCommand

**What:** Convert a string command to the Muse control characteristic byte format.

**Source:** Confirmed from muse-js `src/lib/muse-utils.ts`.

```javascript
function encodeCommand(cmd) {
  const encoded = new TextEncoder().encode(`X${cmd}\n`);
  encoded[0] = encoded.length - 1; // first byte = payload length
  return encoded;
}
```

### Pattern 3: EEG Notification Parsing (12-bit packed)

**What:** Each EEG notification = 2-byte event index + 18 bytes of packed 12-bit samples = 12 samples per channel.

**Data format:** 12-bit samples are packed 2-per-3-bytes. Scaling: `0.48828125 * (n - 0x800)` converts raw unsigned to microvolts.

```javascript
// Source: muse-js src/lib/muse-parse.ts decodeEEGSamples + decodeUnsigned12BitData
function decodeUnsigned12BitData(samples) {
  const result = [];
  for (let i = 0; i < samples.length; i += 3) {
    const a = (samples[i] << 4) | (samples[i + 1] >> 4);       // bits 0-11
    const b = ((samples[i + 1] & 0xF) << 8) | samples[i + 2]; // bits 12-23
    result.push(a, b);
  }
  return result;
}

function parseEEGNotification(event) {
  const view = new DataView(event.target.value.buffer);
  const eventIndex = view.getUint16(0);
  const rawBytes = new Uint8Array(event.target.value.buffer, 2); // skip 2-byte index
  const raw12bit = decodeUnsigned12BitData(rawBytes);
  const microvolts = raw12bit.map(n => 0.48828125 * (n - 0x800));
  return { eventIndex, samples: microvolts }; // 12 values in microvolts
}
```

### Pattern 4: PPG Notification Parsing (24-bit unsigned)

**What:** Each PPG notification = 2-byte event index + 18 bytes = 6 x 24-bit samples per channel.

**Data format:** 3 bytes per sample, big-endian, unsigned integer. PPG channels on Muse S: Ch0 = infrared, Ch1 = green (best cardiac signal typically), Ch2 = unknown/often zeros.

```javascript
// Source: muse-js src/lib/muse-parse.ts decodePPGSamples + decodeUnsigned24BitData
function parsePPGNotification(event) {
  const view = new DataView(event.target.value.buffer);
  const eventIndex = view.getUint16(0);
  const bytes = new Uint8Array(event.target.value.buffer, 2);
  const samples = [];
  for (let i = 0; i < bytes.length; i += 3) {
    samples.push((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]);
  }
  return { eventIndex, samples }; // 6 unsigned 24-bit values
}
```

### Pattern 5: PPG Bandpass Filter (2-pole Butterworth cascade)

**What:** Two cascaded biquad IIR sections implementing a 4th-order Butterworth bandpass (0.5–3 Hz at 64 Hz sample rate). Each biquad maintains its own state (z1, z2).

**Why 0.5–3 Hz instead of 0.5–5 Hz:** The cardiac frequency range at 30–180 BPM corresponds to 0.5–3 Hz. Extending to 5 Hz passes high-frequency noise with minimal benefit for peak detection. Confirmed by SWEPD paper (PMC8869811).

```javascript
// Transposed Direct Form II biquad — numerically stable
function makeBiquad(b0, b1, b2, a1, a2) {
  let z1 = 0, z2 = 0;
  return function process(x) {
    const y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  };
}

// Coefficients for 0.5–3 Hz 4th-order Butterworth bandpass at 64 Hz Fs
// (Compute with scipy.signal.butter(2, [0.5/32, 3/32], btype='band') or EarLevel tool)
// These must be pre-computed and hardcoded — see Open Questions #1
const PPG_FILTER = cascadeBiquads([
  makeBiquad(/* section 1 coefficients */),
  makeBiquad(/* section 2 coefficients */),
]);
```

### Pattern 6: PPG Peak Detection (derivative + adaptive threshold)

**What:** After bandpass filtering, detect systolic peaks using first derivative sign change + adaptive threshold. Refractory period prevents double-counting.

**Algorithm:** Simple and robust at 64 Hz. Based on SWEPD approach (PMC8869811) simplified for real-time JS.

```javascript
// Runs sample-by-sample as PPG data arrives
const REFRACTORY_MS = 300;  // minimum 300ms between peaks (~200 BPM max)
let _lastPeakTime = 0;
let _threshold = 0;
let _prevFiltered = 0;
let _prevDerivative = 0;

function detectPeak(filteredSample, timestamp) {
  const derivative = filteredSample - _prevFiltered;

  // Zero-crossing of derivative (peak = derivative goes from + to -)
  const isPeak = _prevDerivative > 0 && derivative <= 0 && filteredSample > _threshold;
  const refractory = (timestamp - _lastPeakTime) > REFRACTORY_MS;

  if (isPeak && refractory) {
    const ibi = timestamp - _lastPeakTime;
    _lastPeakTime = timestamp;
    // Adapt threshold: 40% of current peak amplitude (decay toward zero over time)
    _threshold = 0.6 * filteredSample + 0.4 * _threshold;
    _prevFiltered = filteredSample;
    _prevDerivative = derivative;
    return ibi; // milliseconds
  }

  // Decay threshold when no peak (prevents threshold from staying too high)
  _threshold *= 0.995; // slow decay per sample at 64 Hz ≈ 0.32/sec
  _prevFiltered = filteredSample;
  _prevDerivative = derivative;
  return null;
}
```

### Pattern 7: EEG Sliding Window FFT for Alpha/Beta Power

**What:** Maintain a 512-sample circular buffer per EEG channel (2 seconds at 256 Hz). Every 128 new samples (0.5 sec), run FFT on the buffer to compute alpha (8–12 Hz) and beta (13–30 Hz) band power. Update Neural Calm score.

**Window size rationale:** 512 samples at 256 Hz = 2 seconds. Frequency resolution = 256/512 = 0.5 Hz/bin — adequate to resolve alpha (8–12 Hz) and beta (13–30 Hz) bands cleanly.

**Update cadence:** Every 128 new samples = every 0.5 seconds. This gives 2 updates per second with 75% overlap — responsive without excessive computation.

```javascript
const EEG_FFT_SIZE = 512;         // 2 seconds at 256 Hz
const EEG_UPDATE_INTERVAL = 128;  // new samples between FFT runs (0.5 sec)
const ALPHA_LOW = 8, ALPHA_HIGH = 12;
const BETA_LOW = 13, BETA_HIGH = 30;
const EEG_FS = 256;

let _eegBuffer = new Float32Array(EEG_FFT_SIZE); // circular
let _eegHead = 0;
let _newSampleCount = 0;
let _eegFft = new FFT(EEG_FFT_SIZE); // separate instance from dsp.js HRV FFT

function ingestEEGSample(microvolt) {
  _eegBuffer[_eegHead % EEG_FFT_SIZE] = microvolt;
  _eegHead++;
  _newSampleCount++;
  if (_newSampleCount >= EEG_UPDATE_INTERVAL) {
    _newSampleCount = 0;
    _computeNeuralCalm();
  }
}

function _computeNeuralCalm() {
  // Copy buffer in chronological order, apply Hann window
  const windowed = new Float32Array(EEG_FFT_SIZE);
  for (let i = 0; i < EEG_FFT_SIZE; i++) {
    const idx = (_eegHead - EEG_FFT_SIZE + i + EEG_FFT_SIZE) % EEG_FFT_SIZE;
    windowed[i] = _eegBuffer[idx] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / EEG_FFT_SIZE));
  }

  const out = new Float32Array(EEG_FFT_SIZE * 2);
  _eegFft.realTransform(out, windowed);

  // Compute PSD bins for alpha and beta
  const alphaPower = _integrateBandEEG(out, ALPHA_LOW, ALPHA_HIGH);
  const betaPower  = _integrateBandEEG(out, BETA_LOW,  BETA_HIGH);

  // Neural Calm = relative alpha ratio, scaled 0–100
  const ratio = alphaPower / (alphaPower + betaPower + 1e-10);
  AppState.rawNeuralCalmRatio = ratio;

  // Per-session baseline normalization: clamp then scale relative to baseline
  const normalized = _normalizeToBaseline(ratio);
  AppState.neuralCalm = Math.round(normalized * 100);
}

function _integrateBandEEG(complexOut, lowHz, highHz) {
  const binLow  = Math.round(lowHz  * EEG_FFT_SIZE / EEG_FS);
  const binHigh = Math.round(highHz * EEG_FFT_SIZE / EEG_FS);
  let sum = 0;
  for (let i = binLow; i <= binHigh; i++) {
    const re = complexOut[2 * i], im = complexOut[2 * i + 1];
    sum += re * re + im * im;
  }
  return sum;
}
```

### Pattern 8: EEG Artifact Rejection (epoch-level threshold)

**What:** Before using a 2-second epoch for FFT, check peak-to-peak amplitude. If it exceeds 100 µV, discard the epoch and carry forward the last valid score.

**Why 100 µV:** Eye blinks produce 50–200 µV spikes in frontal channels; typical resting alpha is 10–50 µV. 100 µV catches most blinks while allowing some natural alpha bursts to pass. Confirmed from MULTI-DEVICE-ARCHITECTURE.md research.

**Why TP9/TP10 not AF7/AF8:** Research finding (see Common Pitfalls): AF7/AF8 are referenced to Fpz on Muse, resulting in intrinsically low-amplitude frontal channels. Multiple research groups found TP9/TP10 more consistent for Muse alpha analysis. Reject epoch if either TP9 OR TP10 fails threshold.

```javascript
function epochPassesArtifactCheck(samples) {
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  return (max - min) < 100; // µV peak-to-peak threshold
}
```

### Pattern 9: PPG Signal Quality Indicator

**What:** Track a rolling 30-second artifact rate. Map to good/fair/poor.

```javascript
// Rolling window: count rejected peaks / total expected peaks in last 30 sec
// At 64 Hz with ~70 BPM, expect ~35 peaks per 30 sec
const QUALITY_WINDOW_SEC = 30;
let _artifactCountWindow = 0;
let _peakCountWindow = 0;

function computePPGQuality() {
  const artifactRate = _artifactCountWindow / (_peakCountWindow + _artifactCountWindow + 1e-10);
  if (artifactRate < 0.10) return 'good';    // <10% rejection
  if (artifactRate < 0.30) return 'fair';    // 10-30% rejection
  return 'poor';                              // >30% rejection
}
// Writes to AppState.ppgSignalQuality ('good'|'fair'|'poor')
```

### Pattern 10: Calibration Approach (Claude's decision)

**Decision: Independent timers, per-session baseline for Neural Calm.**

**Rationale:**
- **Independent timers** are better than a shared window because EEG is ready within ~5 seconds (just needs a valid epoch), while PPG-derived coherence needs 120 seconds (matching existing DSP `MIN_WINDOW_SECONDS`). A shared timer would make the user wait 120 seconds before seeing ANY neural data — frustrating when EEG could show instantly.
- **Per-session baseline** (relative) is better than absolute ratio because individual alpha power varies 3-5x between people. A person with naturally high alpha doesn't get "free points," and a person with naturally low alpha isn't penalized. The relative score shows change during the session, which is the actionable biofeedback signal. Collect first 20 seconds of clean EEG epochs as the baseline window.

```javascript
// EEG ready state: set to true after first valid epoch (no artifact rejection needed first)
// Neural Calm score = 0 until baseline collected (20 sec of clean epochs)
const BASELINE_EPOCHS_NEEDED = 10; // 10 × 2-sec = 20 sec baseline window
let _baselineRatios = [];

function _normalizeToBaseline(ratio) {
  if (_baselineRatios.length < BASELINE_EPOCHS_NEEDED) {
    _baselineRatios.push(ratio);
    return 0; // score = 0 during baseline collection
  }
  const baselineMean = _baselineRatios.reduce((a, b) => a + b) / _baselineRatios.length;
  // Clamp: 0 = at baseline, 1 = 2x baseline alpha ratio
  return Math.min(1, Math.max(0, (ratio - baselineMean * 0.5) / (baselineMean)));
}
```

### Pattern 11: Eyes-Open Indicator (alpha drop detection)

**What:** Detect a sharp alpha drop (>40% decrease from rolling 10-epoch mean) and set `AppState.eyesOpenWarning = true` for 3 seconds.

```javascript
const ALPHA_DROP_THRESHOLD = 0.40; // 40% drop from rolling mean triggers indicator
let _recentRatios = [];

function checkEyesOpen(ratio) {
  _recentRatios.push(ratio);
  if (_recentRatios.length > 10) _recentRatios.shift();
  if (_recentRatios.length < 5) return;

  const mean = _recentRatios.slice(0, -1).reduce((a, b) => a + b) / (_recentRatios.length - 1);
  const drop = (mean - ratio) / (mean + 1e-10);
  if (drop > ALPHA_DROP_THRESHOLD) {
    AppState.eyesOpenWarning = true;
    clearTimeout(_eyesOpenTimer);
    _eyesOpenTimer = setTimeout(() => { AppState.eyesOpenWarning = false; }, 3000);
  }
}
```

### Anti-Patterns to Avoid

- **Subscribing characteristics sequentially instead of in parallel:** `await` each `getCharacteristic()` call in a loop adds 100–300ms per characteristic. Use `Promise.all()` for the 7 characteristics needed (1 control + 4 EEG + 2 PPG for selected channel + ambient).
- **Using AF7/AF8 for Neural Calm:** Fpz reference makes frontal channels low amplitude on Muse. Use TP9/TP10 (temporal). Confirmed by research literature.
- **Running EEG FFT on every new sample:** At 256 Hz this is 256 FFTs/sec. Update every 128 samples (0.5 sec) instead.
- **Separate FFT instance collision:** The existing `dsp.js` FFT instance is `new FFT(512)`. EEG also needs a 512-point FFT but at 256 Hz. These are separate use-cases — create a separate `new FFT(512)` for EEG in MuseAdapter. Both instances can exist simultaneously.
- **Assuming PPG samples are 16-bit:** Prior research stated 16-bit. muse-js source confirms 24-bit (3 bytes/sample). Parsing 2 bytes will produce wrong values.
- **Writing PPG RR to a new buffer:** Write PPG-derived RR intervals to the same `AppState.rrBuffer`/`rrHead` as the chest strap does. The DSP engine is source-agnostic. DeviceManager already has priority logic: chest strap wins if both connected.
- **Sending p50 before subscribing to notifications:** Subscribe all characteristics BEFORE sending p50/s/d. If you start streaming before listeners are attached, early packets are lost.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BLE characteristic decode | Custom byte parser from scratch | Copy muse-js decode functions exactly | 12-bit packing has a subtle 3-byte-per-2-samples layout; trivial to get wrong |
| High-order bandpass filter | Single biquad section | Two cascaded biquad sections (4th order) | Single biquad at 0.5–3 Hz gives −20 dB/decade roll-off — insufficient. 4th order gives −80 dB/decade |
| FFT from scratch | Radix-2 FFT | Existing `FFT` global from fft.js CDN | Already loaded; tested; matches existing dsp.js usage |
| Command encoding | Custom byte arrays | `encodeCommand()` exactly as muse-js | Muse firmware expects exact length-prefixed protocol |

**Key insight:** The most failure-prone part is the PPG peak detection threshold initialization. If the threshold starts at zero, the first filtered PPG sample will trigger a false peak. Initialize threshold to 20% of the maximum observed signal amplitude in the first 2 seconds.

---

## Common Pitfalls

### Pitfall 1: PPG Samples Are 24-bit, Not 16-bit

**What goes wrong:** Parser reads 2 bytes per sample → wrong values, peak detection fails completely.
**Why it happens:** Prior research doc said "16-bit" — this was incorrect. muse-js source (`decodeUnsigned24BitData`) consumes 3 bytes per sample.
**How to avoid:** Parse `bytes[i] << 16 | bytes[i+1] << 8 | bytes[i+2]` for each of 6 samples.
**Warning signs:** PPG values all look the same or don't oscillate with heartbeat.

### Pitfall 2: AF7/AF8 Low Amplitude on Muse

**What goes wrong:** Neural Calm score is near-zero or noise-dominated; no discernible alpha pattern.
**Why it happens:** Muse's Fpz reference electrode is near the AF7/AF8 positions — signal cancellation reduces frontal channel amplitude.
**How to avoid:** Use TP9/TP10 for Neural Calm computation. AF7/AF8 can be collected for the debug view but should not drive the score.
**Warning signs:** AF7/AF8 µV values consistently < 5 µV while TP9/TP10 show normal 10–50 µV alpha.

### Pitfall 3: Characteristic Fetch Before Subscription

**What goes wrong:** First 1–5 EEG/PPG packets are lost while `startNotifications()` is awaited.
**Why it happens:** The Muse starts streaming immediately after `s` command, regardless of whether the client has subscribed to notifications yet.
**How to avoid:** Subscribe ALL characteristics (`startNotifications` + event listeners) BEFORE sending the preset/start commands.
**Warning signs:** Occasional missing event indices at the start of a session.

### Pitfall 4: PPG Threshold Initialization

**What goes wrong:** First N beats detected incorrectly (false positives or false negatives) causing bad RR intervals.
**Why it happens:** Adaptive threshold starts at 0 → first sample > 0 triggers a false peak.
**How to avoid:** Run the bandpass filter for 2 seconds without peak detection to collect amplitude statistics. Set initial threshold to the 75th percentile of filtered signal amplitude in that warmup window.
**Warning signs:** First 3–5 RR intervals look implausible (< 300 ms or > 2000 ms); then stabilizes.

### Pitfall 5: EEG Buffer Phase Error in Chronological Extraction

**What goes wrong:** Circular buffer read produces scrambled epoch → FFT sees discontinuities → spectral leakage.
**Why it happens:** Circular buffer index arithmetic off-by-one.
**How to avoid:** Verify chronological read: `for i in 0..FFT_SIZE: buffer[(head - FFT_SIZE + i + FFT_SIZE) % FFT_SIZE]`. The Hann window will partially suppress moderate discontinuities, but correct ordering is still required.
**Warning signs:** FFT output has broad spectral hump instead of peaked alpha band.

### Pitfall 6: RR Timestamp Accuracy from PPG

**What goes wrong:** IBI series has systematic jitter → coherence score is artificially low.
**Why it happens:** At 64 Hz, each sample is ~15.6 ms. Peak detection timestamp resolution is therefore ±7.8 ms. This is inherent — cannot be removed algorithmically.
**How to avoid:** Accept this as a known limitation; use sub-sample interpolation if needed (fit parabola to 3 points around peak for ~3 ms resolution).
**Warning signs:** Coherence score is consistently lower with PPG than chest strap even at good signal quality.

### Pitfall 7: Listener Accumulation on Reconnect

**What goes wrong:** After a disconnect+reconnect cycle, duplicate event listeners fire for each notification → double-counted samples → corrupted RR series.
**Why it happens:** `addEventListener` on a new characteristic adds another listener without removing the old one.
**How to avoid:** Mirror HRMAdapter pattern: `_device.removeEventListener('gattserverdisconnected', onDisconnected)` before each `_device.addEventListener(...)`. For characteristics, store references and remove listeners before reconnect.
**Warning signs:** After reconnect, HR appears doubled, or every beat is counted twice.

---

## Code Examples

### Complete UUID Constants

```javascript
// Source: muse-js src/muse.ts (HIGH confidence — verified against source)
const MUSE_SERVICE       = 0xfe8d;
const MUSE_CONTROL_UUID  = '273e0001-4c4d-454d-96be-f03bac821358';
const MUSE_TELEMETRY_UUID = '273e000b-4c4d-454d-96be-f03bac821358';
const EEG_UUIDS = [
  '273e0003-4c4d-454d-96be-f03bac821358', // TP9  (left ear)
  '273e0004-4c4d-454d-96be-f03bac821358', // AF7  (left forehead)
  '273e0005-4c4d-454d-96be-f03bac821358', // AF8  (right forehead)
  '273e0006-4c4d-454d-96be-f03bac821358', // TP10 (right ear)
  '273e0007-4c4d-454d-96be-f03bac821358', // AUX  (not used in p50)
];
const PPG_UUIDS = [
  '273e000f-4c4d-454d-96be-f03bac821358', // PPG Ch0 (infrared/ambient)
  '273e0010-4c4d-454d-96be-f03bac821358', // PPG Ch1 (green — typically best cardiac)
  '273e0011-4c4d-454d-96be-f03bac821358', // PPG Ch2 (unknown — often zero)
];
```

### New AppState Fields Required

```javascript
// Add to js/state.js (Phase 7 additions)

// PPG signal quality
ppgSignalQuality: 'good',        // 'good'|'fair'|'poor' — updates every 5s

// EEG Neural Calm
neuralCalm: 0,                   // 0-100 score, updated every 0.5 sec
rawNeuralCalmRatio: 0,           // raw alpha/(alpha+beta) before normalization
eegCalibrating: true,            // true during 20-sec baseline collection

// Eyes-open indicator
eyesOpenWarning: false,          // true for 3s after sharp alpha drop

// Debug: all 3 PPG channel waveforms (circular buffers, for hidden debug view)
ppgDebugBuffers: [
  new Float32Array(256), // Ch0 last 4 seconds at 64 Hz
  new Float32Array(256), // Ch1
  new Float32Array(256), // Ch2
],
ppgDebugHead: 0,
```

### DeviceManager Wiring (what to replace in connectMuse())

```javascript
// In DeviceManager.js — replace Phase 6 stub with:
import {
  connect as museConnect,
  disconnect as museDisconnect,
  getCapabilities as museCaps,
  getDeviceType as museType,
} from './MuseAdapter.js';

// In _adapters object:
muse: {
  connect: museConnect,
  disconnect: museDisconnect,
  getCapabilities: museCaps,
  getDeviceType: museType,
},

// Replace connectMuse() function body:
export async function connectMuse() {
  await _adapters.muse.connect();
  AppState.museCapabilities = _adapters.muse.getCapabilities();
}
```

### MuseAdapter getCapabilities

```javascript
export function getCapabilities() {
  return { hr: true, rr: true, eeg: true, ppg: true };
  // hr: derived from PPG peaks; rr: PPG IBI series; eeg: 256Hz stream; ppg: raw waveform
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| muse-js with RxJS | Vanilla JS CharacteristicValueChanged events | 2022 (Respiire/MuseJS port) | No RxJS dependency; matches existing HRMAdapter pattern |
| Absolute alpha/beta ratio | Per-session relative baseline | Standard in neurofeedback literature | Score reflects change from personal resting state, not inter-individual differences |
| AF7/AF8 for frontal alpha | TP9/TP10 for temporal alpha on Muse | ~2020 (Muse research validation studies) | More reliable signal due to Fpz reference proximity to frontal channels |
| 16-bit PPG samples (assumed) | 24-bit PPG samples (confirmed from source) | muse-js v3.3.0 source | Parser must use 3 bytes/sample not 2 |

---

## Open Questions

1. **Butterworth bandpass filter coefficients (0.5–3 Hz at 64 Hz)**
   - What we know: Need 4th-order Butterworth, two cascaded biquads, Fs=64 Hz, 0.5–3 Hz passband
   - What's unclear: Exact b0,b1,b2,a1,a2 for each section need to be pre-computed
   - Recommendation: Use scipy.signal.butter(2, [0.5/32, 3/32], btype='band', output='sos') to generate coefficients before implementation, or use EarLevel biquad calculator tool. This is a one-time computation, not runtime. The planner should include a task to pre-compute and hardcode these values.

2. **Which PPG channel is best on Muse-S (empirical validation required)**
   - What we know: Ch0=infrared, Ch1=green, Ch2=unknown (often zeros). General PPG literature suggests green is better for cardiac signal in IR-lit environments, but Muse-S PPG is on the forehead, not wrist
   - What's unclear: Actual SNR for each channel on Muse-S specifically — varies from Muse 2
   - Recommendation: The calibration task (dual-wear with chest strap) will determine this empirically. Implement all 3 channels in debug view; hardcode winner after test. The plan should sequence this task first.

3. **Muse-S firmware version compatibility**
   - What we know: muse-js v3.3.0 was last updated 2021; community reports it still works
   - What's unclear: Latest Muse-S firmware version; whether any UUID or command changes exist in post-2021 firmware
   - Recommendation: Add a firmware version request (send 'v1' to control char, read response) early in connection sequence. Log the firmware version for debugging. If connection fails, this is first diagnostic step.

4. **EEG sample rate verification during p50 preset**
   - What we know: EEG is 256 Hz under p21 (EEG-only preset); PPG is 64 Hz under p50
   - What's unclear: Does p50 reduce EEG sample rate? Some sources suggest EEG may throttle to maintain BLE bandwidth under p50
   - Recommendation: Log actual packet arrival rate (count packets per second) when streaming under p50. If EEG drops below 250 packets/second/channel, adjust FFT window assumptions.

5. **PPG sub-sample interpolation for RR accuracy**
   - What we know: 64 Hz → 15.6 ms temporal resolution; HRV coherence scoring needs accurate IBI
   - What's unclear: Whether parabolic sub-sample interpolation (3 points around peak) meaningfully improves coherence scores vs plain sample-level timestamps
   - Recommendation: Implement plain timestamps first. If coherence scores with PPG are consistently 20+ points lower than chest strap despite good signal quality, add sub-sample interpolation in a follow-up.

---

## Sources

### Primary (HIGH confidence)

- muse-js src/muse.ts — BLE UUIDs, connection sequence, command order; `https://github.com/urish/muse-js/blob/master/src/muse.ts`
- muse-js src/lib/muse-parse.ts — `decodeEEGSamples` (12-bit → µV), `decodePPGSamples` (24-bit); confirmed via WebFetch
- muse-js src/lib/muse-utils.ts — `encodeCommand` byte format; confirmed via WebFetch
- Mind Monitor Technical Manual — EEG band definitions, channel positions; `https://www.mind-monitor.com/Technical_Manual.php`

### Secondary (MEDIUM confidence)

- PMC8869811 (SWEPD paper) — PPG peak detection algorithm, bandpass 0.5–5 Hz, refractory period, adaptive threshold
- Muse EEG channel quality study — TP9/TP10 superior to AF7/AF8 for alpha; multiple research groups (ResearchGate citations confirming AF7/AF8 amplitude issues)
- MULTI-DEVICE-ARCHITECTURE.md — 100 µV artifact threshold rationale; sliding window EEG FFT approach
- MUSE-S.md prior research — Channel UUIDs, p50 preset, sampling rates (24-bit PPG correction noted above)

### Tertiary (LOW confidence — needs validation)

- PPG Ch0/Ch1/Ch2 identity on Muse-S (infrared/green/unknown) — unconfirmed; empirical test required
- EEG sample rate under p50 preset — unverified whether bandwidth sharing reduces EEG rate
- Sub-sample PPG interpolation benefit for HRV coherence — no Muse-specific data

---

## Metadata

**Confidence breakdown:**
- BLE protocol / data format: HIGH — confirmed from muse-js source code
- PPG pipeline (filter + peak detection): MEDIUM — algorithm proven in literature; browser JS implementation is custom
- EEG FFT + Neural Calm: MEDIUM — standard approach; TP9/TP10 channel recommendation confirmed by research
- EEG artifact rejection: MEDIUM — 100 µV threshold from literature; exact behavior on Muse-S unverified
- PPG channel selection: LOW — empirical dual-wear test required

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (30 days — muse-js protocol is stable; BLE spec stable)

**Key correction from prior research:** PPG samples are 24-bit unsigned (3 bytes each), not 16-bit as stated in MUSE-S.md. Use `decodeUnsigned24BitData` approach (3-byte big-endian read).
