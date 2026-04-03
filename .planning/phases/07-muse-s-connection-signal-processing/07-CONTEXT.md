# Phase 7: Muse-S Connection + Signal Processing - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect to the Muse-S headband via Web Bluetooth, stream raw EEG and PPG data, and build the full signal processing pipeline — PPG peak detection extracts RR intervals (fed into existing DSP engine) and EEG alpha/beta FFT computes a Neural Calm score. This phase delivers the data layer only — session UI integration (live displays, session summary) is Phase 8.

</domain>

<decisions>
## Implementation Decisions

### PPG Channel Selection
- Hardcode the best PPG channel after empirical testing with the actual device
- Phase 7 plan should include a built-in calibration task: connect both Muse-S and chest strap simultaneously, stream all 3 PPG channels, compare against chest strap RR to pick the channel with best correlation
- Build a hidden debug/diagnostic view showing all 3 PPG channel waveforms (togglable via console or hidden button) for development and future troubleshooting

### PPG Accuracy & Quality
- Claude picks artifact rejection thresholds that balance signal quality with PPG's inherent 64 Hz limitations — intent: give the user the best chance at improving HRV over time (favor honest data over smooth-looking numbers)
- Show a PPG signal quality indicator (good/fair/poor) based on artifact rejection rate and peak detection confidence — helps user adjust headband fit
- When PPG signal quality drops to 'poor' mid-session: show visible warning but continue session — don't pause. User can adjust headband without stopping practice.

### EEG Channel Selection
- Claude picks which EEG channels feed Neural Calm (AF7/AF8 frontal vs TP9/TP10 temporal vs average of all 4) based on what gives the most reliable calm metric during a breathing session with eyes likely closed
- Claude picks artifact rejection threshold (100µV vs 150µV) based on what keeps the calm score trustworthy during real breathing

### Eyes-Open Detection
- Show a subtle "eyes open?" indicator when alpha drops sharply — helps user maintain eyes-closed state during breathing without being distracting

### Calibration
- Claude picks calibration approach — independent timers per metric (EEG ready first, then PPG HR, then coherence) vs shared window, based on what gives most useful feedback during warmup
- Claude picks whether EEG establishes a per-session baseline (relative calm improvement) vs absolute alpha/beta ratio, based on what gives most actionable feedback during breathing practice

### Claude's Discretion
- PPG bandpass filter parameters (0.5-5 Hz range suggested by research)
- Peak detection algorithm choice (adaptive threshold, derivative-based, etc.)
- EEG FFT window size and overlap
- Neural Calm score scaling (0-100 like coherence, or different range)
- How to handle simultaneous PPG + chest strap data during the calibration test task
- MuseAdapter implementation details (GATT characteristic subscription order, p50 command timing)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/devices/DeviceAdapter.js`: Interface contract (connect, disconnect, getCapabilities, getDeviceType) — MuseAdapter must implement this
- `js/devices/DeviceManager.js`: `_adapters.muse = null` slot ready for wiring; `connectMuse()` stub already opens BLE picker with `optionalServices: [0xfe8d]` and saves device name
- `js/dsp.js`: FFT + cubic spline resampling at 4 Hz, coherence scoring — PPG-derived RR intervals feed directly into AppState.rrBuffer and the existing DSP pipeline handles them
- `js/state.js`: Already has `museConnected`, `museStatus`, `museName`, `museCapabilities` fields from Phase 6
- `js/devices/HRMAdapter.js`: Reference implementation — artifact rejection (300-2000ms + 20% median), circular buffer write, reconnect state machine

### Established Patterns
- Adapters write to device-specific AppState fields (`museConnected`, `museStatus`, etc.)
- DSP engine reads from `AppState.rrBuffer`/`rrHead` — source-agnostic, just needs clean RR intervals written to the buffer
- Tick-driven DSP: session controllers call `tick(elapsed)` once per second, DSP reads the latest buffer state
- Lookahead scheduler pattern from audio.js (25ms setTimeout) could inform real-time EEG processing timing

### Integration Points
- `DeviceManager.js` line 23: `muse: null` — wire MuseAdapter here
- `DeviceManager.js` `connectMuse()`: Replace stub with real GATT connection delegating to MuseAdapter
- `AppState.rrBuffer`: PPG pipeline writes clean RR intervals here (same buffer as chest strap)
- New AppState fields needed: `neuralCalm` (score), `eegBuffer` (for Phase 8 waveform), `ppgSignalQuality` (good/fair/poor)

</code_context>

<specifics>
## Specific Ideas

- Research identified `muse-js` (abandoned but functional, 500+ stars) and `Respiire/MuseJS` (vanilla JS, no RxJS) as protocol references
- Muse BLE protocol: service `0xfe8d`, control characteristic for `p50` preset, individual characteristics per EEG/PPG channel
- PPG channels are at `273e000f`, `273e0010`, `273e0011` — 3 channels at 64 Hz
- EEG channels are at `273e0003`-`273e0006` — 4 channels at 256 Hz
- Data format: 16-bit event index + 12 samples per notification

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-muse-s-connection-signal-processing*
*Context gathered: 2026-04-03*
