// js/devices/DeviceAdapter.js — JSDoc interface contract for all device adapters
// This file is documentation only. All adapters must satisfy this interface.

/**
 * @interface DeviceAdapter
 * Contract that every hardware adapter must satisfy.
 * DeviceManager holds one slot per device type and calls these methods.
 */

/**
 * Open BLE picker or attempt quick reconnect, then establish GATT connection.
 * Must be called from a user gesture (button click) — required by Web Bluetooth API.
 * Must write device-specific status to AppState before resolving
 * (e.g. AppState.chestStrapStatus = 'connected').
 *
 * @async
 * @function connect
 * @returns {Promise<void>} Resolves on successful GATT connection, rejects on failure.
 */

/**
 * Cancel any pending reconnect timers and cleanly disconnect GATT.
 * Must update the device-specific AppState connected field to false.
 * Synchronous — no BLE round-trips needed.
 *
 * @function disconnect
 * @returns {void}
 */

/**
 * Return the static capability set for this adapter.
 * Flags reflect what the hardware can provide, not its current connection state.
 *
 * @function getCapabilities
 * @returns {{ hr: boolean, rr: boolean, eeg: boolean, ppg: boolean }}
 *   hr  — provides beat-per-minute values
 *   rr  — provides RR interval data suitable for HRV analysis
 *   eeg — provides raw EEG channel data
 *   ppg — provides PPG signal for optical heart rate / HRV
 */

/**
 * Return the stable string identifier used as the adapter slot key in DeviceManager.
 *
 * @function getDeviceType
 * @returns {'chestStrap' | 'muse'} Slot key matching _adapters keys in DeviceManager.
 */
