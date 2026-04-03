# Garmin Fenix 8 Web Bluetooth Heart Rate Research

**Researched:** 2026-04-03
**Overall Confidence:** HIGH (well-documented limitations)
**Verdict:** The Fenix 8 CAN broadcast HR over BLE, but does NOT transmit RR intervals. It is NOT usable for HRV biofeedback via Web Bluetooth. Keep using the HRM 600 chest strap.

---

## Executive Summary

The Garmin Fenix 8 supports BLE heart rate broadcasting using the standard Bluetooth Heart Rate Service (0x180D), and a browser running Web Bluetooth can discover and connect to it. However, the watch broadcasts **heart rate (bpm) only -- it does not populate the RR-interval field** in the 0x2A37 characteristic. This is a deliberate Garmin limitation across all their watches and most of their chest straps when broadcasting over BLE. Combined with the fundamental inaccuracy of wrist-based PPG sensors for beat-to-beat timing, the Fenix 8 is unsuitable for the HRV spectral analysis that ResonanceHRV requires.

---

## Question-by-Question Findings

### 1. Does the Fenix 8 expose the standard BLE Heart Rate Service (0x180D)?

**YES** -- with caveats. Confidence: HIGH.

The Fenix 8 has a "Broadcast Heart Rate" feature accessible at:
**Watch Settings > Health & Wellness > Wrist Heart Rate > Broadcast Heart Rate**

When enabled, the watch advertises as a standard BLE Heart Rate sensor. DC Rainmaker confirmed that Garmin uses "standard Bluetooth Smart device protocols/standards" and "the standard BLE HR profile" for this broadcast. Third-party apps like Zwift, TrainerRoad, and Peloton successfully receive HR data from Garmin watches over BLE.

The feature originally required starting a "Virtual Run" activity profile (added to Fenix 6, FR245, FR945 in 2020), but newer watches including the Fenix 8 support BLE broadcast as a standalone setting without needing a specific activity profile.

**Sources:**
- [Fenix 8 Owner's Manual - Broadcasting Heart Rate Data](https://www8.garmin.com/manuals/webhelp/GUID-EECCAC99-90D6-4AB1-9A3A-EC433D3365E2/EN-US/GUID-D8D363C2-0690-48D4-95E2-A3557E7D53C2.html)
- [DC Rainmaker: Garmin Adds Bluetooth Heart Rate Broadcasting](https://www.dcrainmaker.com/2020/01/bluetooth-running-broadcasting.html)

### 2. Can the Fenix 8 be discovered via Web Bluetooth `navigator.bluetooth.requestDevice()`?

**YES** -- it should appear in the browser picker. Confidence: MEDIUM.

Since the Fenix 8 advertises the standard Heart Rate Service (UUID `0x180D`), the existing ResonanceHRV code would discover it:

```javascript
navigator.bluetooth.requestDevice({
  filters: [{ services: ['heart_rate'] }]
});
```

The watch would appear in the picker alongside the HRM 600 chest strap. The connection flow (`getPrimaryService('heart_rate')`, `getCharacteristic('heart_rate_measurement')`, `startNotifications()`) should all work identically.

**Caveat:** I found no reports of anyone specifically testing Web Bluetooth with a Garmin watch. The evidence is inferred from: (a) Garmin uses the standard BLE HR profile, (b) Web Bluetooth works with any device advertising standard GATT services. This is MEDIUM confidence because it has not been directly verified, but the technical chain is sound.

### 3. Does the Fenix 8 transmit RR intervals via BLE?

**NO.** Confidence: HIGH.

This is the critical blocker. Multiple sources confirm that **Garmin watches do not populate the RR-interval field** in the 0x2A37 Heart Rate Measurement characteristic when broadcasting over BLE.

A DC Rainmaker commenter explicitly stated: "I hoped this would give HRV data... Sadly it doesn't transmit R-R intervals. This is a shame, since Garmin collects this data for itself... but doesn't release it for anyone else."

Garmin forum users with a Forerunner 745 confirmed: the watch broadcasts HR bpm only, no RR/IBI data. Apps like Elite HRV, HRV4Training, and HRV4Biofeedback all fail to get RR intervals from Garmin watch broadcasts.

In the 0x2A37 characteristic, the flags byte bit 4 (`0x10`) indicates RR-interval data is present. Garmin watches simply never set this bit during broadcast. The `rrPresent` check in the existing `parseHRMNotification()` function would return `false`, and the `rrValues` array would always be empty.

**Sources:**
- [Garmin Forums: Broadcast Heart Rate R-R intervals?](https://forums.garmin.com/sports-fitness/running-multisport/f/forerunner-745/243411/broadcast-heart-rate-r-r-intervals)
- [DC Rainmaker comments on BLE broadcasting article](https://www.dcrainmaker.com/2020/01/bluetooth-running-broadcasting.html)

### 4. Are there settings to enable BLE HR broadcasting?

**YES.** Confidence: HIGH.

Two methods to enable:

1. **Persistent setting:** Hold MENU > Watch Settings > Health & Wellness > Wrist Heart Rate > Broadcast Heart Rate (toggle ON)
2. **Controls menu shortcut:** The Broadcast Heart Rate widget can be added to the controls menu for quick toggling

Additionally, you can configure activity profiles to automatically begin broadcasting when an activity starts:
- Open activity settings for any activity profile
- Enable "Broadcast Heart Rate During Activity"

**Limitations:**
- Broadcasting is NOT available during dive activities
- Broadcasting decreases battery life
- The watch must not be in a dive activity mode

**Source:** [Fenix 8 Owner's Manual - Wrist Heart Rate Monitor Settings](https://www8.garmin.com/manuals/webhelp/GUID-EECCAC99-90D6-4AB1-9A3A-EC433D3365E2/EN-US/GUID-7134309B-1DB6-4EFA-972F-B518E5AFF501.html)

### 5. Wrist-based optical HR accuracy for RR intervals

**Poor -- unsuitable for HRV spectral analysis.** Confidence: HIGH.

Even if Garmin did transmit RR intervals from the wrist sensor, the data quality would be inadequate for HRV biofeedback:

**PPG Fundamental Limitations:**
- Optical PPG sensors detect pulse waves at the wrist, not the electrical R-wave peak that ECG/chest straps detect
- The pulse transit time from heart to wrist adds variable latency that corrupts beat-to-beat timing
- Motion artifacts are severe and frequent at the wrist
- Blood perfusion changes (cold weather, exercise onset) cause signal dropouts

**Validation Data:**
- A 2025 validation study found Garmin HRV measurements showed "poor agreement (CCC = 0.87, MAPE = 10.52 +/- 8.63%)" compared to ECG reference
- Elite HRV explicitly states: "Most watches and wrist HR monitors do not accurately measure R-R intervals"
- Garmin's own Enhanced BBI feature only claims "near-EKG quality" during sleep with minimal movement -- not during waking/active use

**Garmin Enhanced BBI:**
Garmin has developed "Enhanced Beat-to-Beat Interval" (BBI) technology that improves PPG-based IBI accuracy during sleep. However:
- It is only available through the **Garmin Health SDK** (commercial license required)
- It is NOT exposed via BLE broadcast
- It is NOT available in real-time -- it's a post-processing feature for logged data
- It only works well during sleep (low movement, good perfusion)

**Bottom line:** Wrist PPG cannot deliver the 1/1024s RR interval resolution needed for spectral HRV analysis during a waking biofeedback session. The HRM 600 chest strap's electrical sensing is fundamentally superior for this use case.

**Sources:**
- [Elite HRV: Why Watches Don't Work for HRV](https://help.elitehrv.com/article/119-why-can-t-i-use-my-wrist-hr-monitor-or-led-pulse-oximetry-monitors-like-fitbit)
- [Labfront: Garmin Enhanced BBI](https://www.labfront.com/blog/the-latest-breakthrough-in-hrv-data-collection-garmins-enhanced-bbi-on-labfront)
- [Garmin Enhanced BBI Whitepaper (PDF)](https://www8.garmin.com/garminhealth/news/Garmin-Enhanced-BBI_Final.pdf)
- [PMC: Validation of nocturnal HR/HRV in consumer wearables](https://pmc.ncbi.nlm.nih.gov/articles/PMC12367097/)

### 6. Alternative approaches

#### Option A: Garmin HRM-Dual chest strap (RECOMMENDED if second strap needed)

The Garmin HRM-Dual is confirmed to transmit RR intervals over BLE via the standard 0x2A37 characteristic. One developer documented receiving flags byte `0x10` (RR intervals present) from the HRM-Dual. However, some users reported spurious extra bytes on Windows 11 Bluetooth stacks, so testing is essential.

The HRM-Dual uses the standard Heart Rate Service and would work with the existing `ble.js` code with zero modifications.

**Caveat:** The HRM Pro Plus (newer model) has user reports of NOT sending RR intervals over BLE, despite being advertised as having the same firmware as the original HRM Pro which DID send them. This is an unresolved issue on Garmin forums. Confidence: LOW -- contradictory reports.

#### Option B: ANT+ to BLE bridge hardware

If the Fenix 8 watch broadcasts HR+RR over ANT+ (unconfirmed), a hardware bridge could convert it to BLE:

- **NPE CORD** (~$50): Standalone ANT+ to BLE converter, USB powered
- **4iiii Viiiiva**: Chest strap that also bridges ANT+ sensors to BLE
- **CABLE (Convert ANT to BLE)**: Standalone converter dongle

However, this approach has multiple problems:
1. Garmin watches likely don't send RR intervals over ANT+ either (same limitation as BLE)
2. The bridge adds another device and failure point
3. You already have a working chest strap solution

**Verdict: Not recommended.**

#### Option C: Garmin Connect IQ app on the watch

The Connect IQ BLE API is **client-only** -- it can connect to external BLE sensors but cannot act as a BLE peripheral. A Garmin developer stated: "You can connect to a BLE HRM and get data from it, but you can't advertise you are a HRM and let others connect to you."

Even if a Connect IQ app could access the raw PPG/BBI data, it could not broadcast it over standard BLE Heart Rate Service. Dead end.

**Source:** [Garmin Forums: Broadcast Heart Rate by BLE](https://forums.garmin.com/developer/connect-iq/f/app-ideas/224447/broadcast-heart-rate-by-ble)

#### Option D: Garmin Health SDK

The Garmin Health SDK provides access to Enhanced BBI data with confidence metrics. However:
- Requires a **commercial license** with Garmin
- Data is logged, not real-time streamed to browser
- SDK is Android/iOS only, not web
- Designed for research/clinical partners, not consumer apps

**Not viable for a browser-based biofeedback app.**

---

## Recommendation

**Keep using the Garmin HRM 600 chest strap.** It is the correct tool for this job.

The Fenix 8 watch cannot replace the chest strap for HRV biofeedback because:
1. It does not transmit RR intervals over BLE (only HR bpm)
2. Even if it did, wrist PPG accuracy is insufficient for spectral HRV analysis
3. No alternative pathway (Connect IQ, Health SDK, ANT+ bridge) solves both problems for a browser app

If you want to support the Fenix 8 as a **secondary HR display** (bpm only, no HRV), the existing `ble.js` code would connect to it without modification -- but the `rrValues` array would always be empty, making the biofeedback features non-functional.

### If you need a backup/second chest strap

The **Garmin HRM-Dual** is the safest bet for BLE RR interval transmission. The **Polar H10** is the gold standard for BLE HRV and is confirmed to send RR intervals via 0x2A37 with excellent accuracy. Either would work with the existing `ble.js` code unchanged.

---

## BLE Technical Reference

| Detail | Value |
|--------|-------|
| Heart Rate Service UUID | `0x180D` |
| HR Measurement Characteristic | `0x2A37` |
| RR Interval Flag (bit 4) | `0x10` in flags byte |
| RR Resolution | 1/1024 second (standard BLE spec) |
| Fenix 8 sets RR flag? | **NO** |
| Fenix 8 BLE advertising? | Yes, standard HR service |
| Web Bluetooth filter | `{ services: ['heart_rate'] }` |
| HRM 600 sends RR? | **YES** (confirmed working) |
| HRM-Dual sends RR? | **YES** (confirmed by developer testing) |
| HRM Pro Plus sends RR? | **Uncertain** (contradictory reports) |

---

## Confidence Assessment

| Finding | Confidence | Basis |
|---------|------------|-------|
| Fenix 8 has BLE HR broadcast | HIGH | Official Garmin manual |
| Uses standard 0x180D service | HIGH | DC Rainmaker + third-party app compatibility |
| Web Bluetooth can discover it | MEDIUM | Inferred from standard service, not directly tested |
| No RR intervals in broadcast | HIGH | Multiple forum confirmations, DC Rainmaker comments |
| Wrist PPG inadequate for HRV | HIGH | Validation studies, Elite HRV documentation |
| Enhanced BBI not available via BLE | HIGH | Garmin Health SDK documentation |
| Connect IQ cannot act as BLE peripheral | HIGH | Garmin developer confirmation |
| HRM-Dual sends RR over BLE | MEDIUM | Developer testing, but spurious byte reports |
