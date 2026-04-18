// js/storage.js — IndexedDB StorageService via idb v8
// Wraps IndexedDB with typed async methods for sessions, settings, and Oura cache.

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8.0.3/+esm';
import { normalizeMode } from './sessionMode.js';

const DB_NAME = 'resonancehrv';
const DB_VERSION = 1;

let _db = null;

/**
 * Initialize the IndexedDB database with all three object stores.
 * Must be called once on app start before any other storage operations.
 */
export async function initStorage() {
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { autoIncrement: true, keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');  // out-of-line keys (string key names)
      }
      if (!db.objectStoreNames.contains('oura')) {
        db.createObjectStore('oura');      // out-of-line keys (key = 'cache')
      }
    }
  });
}

/**
 * Save a session record to IndexedDB.
 * @param {Object} sessionData - Session data including:
 *   - mode, date, durationSeconds, frequencyHz, meanCoherence, peakCoherence,
 *     timeInHighSeconds, coherenceTrace, hrSource
 *   - Optional Muse-S: meanNeuralCalm, peakNeuralCalm, timeInHighCalmSeconds, neuralCalmTrace
 *   - Optional tuning (v1.2): tuningFreqHz, tuningRsaAmplitude
 * @returns {Promise<number>} The auto-generated session ID
 */
export async function saveSession(sessionData) {
  return _db.put('sessions', { ...sessionData, timestamp: Date.now() });
}

/**
 * Retrieve a setting value by key.
 * @param {string} key - Setting name (e.g., 'resonanceFreq', 'deviceName')
 * @returns {Promise<*>} The stored value, or undefined if not set
 */
export async function getSetting(key) {
  return _db.get('settings', key);
}

/**
 * Store a setting value by key.
 * @param {string} key - Setting name
 * @param {*} value - Value to store
 */
export async function setSetting(key, value) {
  return _db.put('settings', value, key);
}

/**
 * Retrieve cached Oura data.
 * @returns {Promise<{data: *, fetchedAt: number}|undefined>} Cached Oura data with timestamp
 */
export async function getOuraCache() {
  return _db.get('oura', 'cache');
}

/**
 * Store Oura data with a freshness timestamp.
 * @param {*} data - Oura API response data to cache
 */
export async function setOuraCache(data) {
  return _db.put('oura', { data, fetchedAt: Date.now() }, 'cache');
}

/**
 * Query session records, ordered by timestamp.
 * @param {Object} options
 * @param {number} [options.limit=30] - Maximum number of sessions to return
 * @returns {Promise<Array>} Array of session records (most recent last)
 */
export async function querySessions({ limit = 30 } = {}) {
  const all = await _db.getAllFromIndex('sessions', 'timestamp');
  // Phase 14 (D-11): normalize legacy mode === 'practice' records to 'standard' at read time.
  // No DB rewrite — full schema migration is deferred to Phase 17 (IDB v1→v2).
  return all.slice(-limit).map(normalizeMode);
}
