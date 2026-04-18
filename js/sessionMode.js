// js/sessionMode.js — Session mode persistence, enum, and legacy-record normalization.
// Canonical home for the Phase 14 mode-selector state primitives (D-04, D-09, D-11).

export const SELECTED_MODE_KEY = 'resonanceHRV.selectedMode';

/** All valid session mode values. Frozen so accidental mutations throw in strict mode. */
export const VALID_MODES = Object.freeze(['standard', 'pre-sleep', 'meditation']);

/**
 * Read the persisted selected mode from sessionStorage (D-09).
 * @returns {'standard'|'pre-sleep'|'meditation'} Always a valid mode; defaults to 'standard'.
 */
export function loadSelectedMode() {
  try {
    const raw = sessionStorage.getItem(SELECTED_MODE_KEY);
    if (raw && VALID_MODES.includes(raw)) return raw;
  } catch (err) {
    // sessionStorage may throw in private-browsing edge cases — never fatal
    console.warn('[sessionMode] loadSelectedMode failed:', err);
  }
  return 'standard';
}

/**
 * Write the selected mode to sessionStorage (D-09).
 * Invalid values are rejected with a console warning — storage is never corrupted.
 * @param {string} mode
 */
export function saveSelectedMode(mode) {
  if (!VALID_MODES.includes(mode)) {
    console.warn(`[sessionMode] saveSelectedMode: invalid mode "${mode}"; expected one of ${VALID_MODES.join(', ')}`);
    return;
  }
  try {
    sessionStorage.setItem(SELECTED_MODE_KEY, mode);
  } catch (err) {
    console.warn('[sessionMode] saveSelectedMode failed:', err);
  }
}

/**
 * Normalize a session record so legacy mode === 'practice' is returned as 'standard' (D-11).
 * Non-destructive: returns a shallow copy with the mode field rewritten only when it equals 'practice'.
 * @param {Object} record - A session record (from querySessions) — may or may not have a .mode field.
 * @returns {Object} A new record with .mode normalized, or the original record if no rewrite was needed.
 */
export function normalizeMode(record) {
  if (!record || typeof record !== 'object') return record;
  if (record.mode === 'practice') {
    return { ...record, mode: 'standard' };
  }
  return record;
}
