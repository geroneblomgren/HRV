// js/discovery.js — Discovery Mode controller
// Guides user through 5 breathing-rate blocks (6.5→4.5 BPM) to find resonance frequency.
// Captures RSA amplitude per block, displays comparison chart, saves chosen frequency.

import { AppState, subscribe, unsubscribe } from './state.js';
import { initAudio, startPacer, stopPacer, playChime } from './audio.js';
import { initDSP, tick, computeSpectralRSA } from './dsp.js';
import { startRendering, stopRendering } from './renderer.js';
import { saveSession, setSetting, querySessions } from './storage.js';

// ---- Constants ----

export const DISCOVERY_BLOCKS = [
  { bpm: 6.5, hz: 6.5 / 60 },
  { bpm: 6.0, hz: 6.0 / 60 },
  { bpm: 5.5, hz: 5.5 / 60 },
  { bpm: 5.0, hz: 5.0 / 60 },
  { bpm: 4.5, hz: 4.5 / 60 },
];

export const BLOCK_DURATION_MS = 180000;   // 3 minutes per block
const SETTLE_SECONDS = 60;                 // ignore first 60s (ANS entrainment)
const ANALYSIS_SECONDS = 120;              // analyze last 120s of each block
const INTER_BLOCK_PAUSE_MS = 4000;         // 4 seconds between blocks
const COUNTDOWN_SECONDS = 3;               // 3-2-1 before first block

// ---- Module state ----

let _phase = 'idle';          // 'idle' | 'countdown' | 'block' | 'inter-block-pause' | 'comparison'
let _blockIndex = 0;
let _blockTimer = null;
let _blockResults = [];       // [{bpm, hz, rsaAmplitude, lfPower}]
let _blockStartTime = 0;
let _dspInterval = null;
let _sessionStart = 0;
let _pausedForReconnect = false;
let _selectedIndex = 0;
let _activeBlocks = [];       // working copy of DISCOVERY_BLOCKS, may grow by 1 bonus block
let _bonusChecked = false;    // true after we've evaluated whether a bonus block is needed
let _neuralCalmTrace = [];    // array of Neural Calm scores (1 per second, Muse-S only)

// Named references for subscribe/unsubscribe
let _connectedListener = null;

// ---- DOM helpers ----

function _getEl(id) {
  return document.getElementById(id);
}

function _show(el) {
  if (el) el.style.display = '';
}

function _hide(el) {
  if (el) el.style.display = 'none';
}

// ---- Public API ----

/**
 * Load last discovery results from IndexedDB so user can review/change
 * their selection without re-running the protocol. Call during app init.
 */
export async function loadLastDiscoveryResults() {
  try {
    const sessions = await querySessions({ limit: 50 });
    const lastDiscovery = sessions.filter(s => s.mode === 'discovery').pop();
    if (lastDiscovery && lastDiscovery.blocks && lastDiscovery.blocks.length > 0) {
      _blockResults = lastDiscovery.blocks;
      const savedHz = AppState.savedResonanceFreq;
      const matchIdx = _blockResults.findIndex(b => Math.abs(b.hz - savedHz) < 0.001);
      const selectedBpm = matchIdx >= 0
        ? _blockResults[matchIdx].bpm
        : _blockResults.reduce((best, b) => b.rsaAmplitude > best.rsaAmplitude ? b : best).bpm;
      _showCompletePlaceholder(selectedBpm, _blockResults);
    }
  } catch (err) {
    console.error('Failed to load discovery results:', err);
  }
}

/**
 * Manually set a known resonance frequency without running the full protocol.
 * @param {number} bpm - Breathing rate in breaths per minute (e.g., 5.0)
 */
export async function setKnownPace(bpm) {
  const hz = bpm / 60;
  try {
    await setSetting('resonanceFreq', hz);
    AppState.savedResonanceFreq = hz;
  } catch (err) {
    console.error('Failed to save known pace:', err);
  }

  // Update placeholder to reflect the saved pace
  _showKnownPacePlaceholder(bpm);
}

function _showKnownPacePlaceholder(selectedBpm) {
  const placeholder = _getEl('discovery-placeholder');
  if (!placeholder) return;

  placeholder.innerHTML = `
    <h2>Pace Set</h2>
    <p>Resonance frequency set: <strong style="color:var(--accent-action)">${selectedBpm} breaths/min</strong></p>
    <p class="hint">Navigate to Practice tab to begin a session.</p>
    <button id="discovery-start-btn" class="connect-button discovery-start-btn" style="margin-top:12px;" disabled>Run Full Discovery Protocol</button>
    <div class="pace-picker" id="pace-picker">
      <p class="pace-picker-label">Or change your pace:</p>
      <div class="pace-picker-options" id="pace-picker-options">
        <button class="pace-option${selectedBpm === 6.5 ? ' selected' : ''}" data-bpm="6.5">6.5</button>
        <button class="pace-option${selectedBpm === 6.0 ? ' selected' : ''}" data-bpm="6.0">6.0</button>
        <button class="pace-option${selectedBpm === 5.5 ? ' selected' : ''}" data-bpm="5.5">5.5</button>
        <button class="pace-option${selectedBpm === 5.0 ? ' selected' : ''}" data-bpm="5.0">5.0</button>
        <button class="pace-option${selectedBpm === 4.5 ? ' selected' : ''}" data-bpm="4.5">4.5</button>
      </div>
      <p class="pace-picker-unit">breaths/min</p>
    </div>
  `;
  placeholder.style.display = '';

  // Re-wire start button
  const newStartBtn = _getEl('discovery-start-btn');
  if (newStartBtn) {
    newStartBtn.addEventListener('click', () => startDiscovery());
    _wireStartBtn(newStartBtn);
  }

  // Re-wire pace picker
  initPacePicker();
}

/**
 * Wire up click handlers on pace picker buttons.
 * Call after DOM is ready or after placeholder innerHTML is replaced.
 */
export function initPacePicker() {
  const container = _getEl('pace-picker-options');
  if (!container) return;

  // Highlight currently saved pace
  const savedHz = AppState.savedResonanceFreq;
  if (savedHz) {
    const savedBpm = Math.round(savedHz * 60 * 10) / 10; // round to 1 decimal
    container.querySelectorAll('.pace-option').forEach(btn => {
      if (parseFloat(btn.dataset.bpm) === savedBpm) {
        btn.classList.add('selected');
      }
    });
  }

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.pace-option');
    if (!btn) return;

    const bpm = parseFloat(btn.dataset.bpm);

    // Update visual selection
    container.querySelectorAll('.pace-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    // Save immediately
    setKnownPace(bpm);
  });
}

/**
 * Entry point. Call from a user gesture (button click) so AudioContext can init.
 * Sets up DSP, starts countdown, then runs 5 block protocol.
 */
export function startDiscovery() {
  if (_phase !== 'idle') return;

  // Reset state
  _blockResults = [];
  _blockIndex = 0;
  _pausedForReconnect = false;
  _bonusChecked = false;
  _activeBlocks = [...DISCOVERY_BLOCKS];
  _neuralCalmTrace = [];
  _phase = 'countdown';
  _sessionStart = Date.now();

  AppState.sessionPhase = 'discovery';
  AppState.sessionStartTime = _sessionStart;

  // Show session viz, hide placeholder
  const viz = document.querySelector('#tab-discovery .session-viz');
  if (viz) viz.classList.add('active');
  _hide(_getEl('discovery-placeholder'));

  // Show rate label and progress, hide comparison
  _show(_getEl('discovery-rate-label'));
  _show(_getEl('discovery-progress'));
  _hide(_getEl('discovery-comparison'));
  _hide(_getEl('discovery-pause-overlay'));
  _hide(_getEl('discovery-countdown'));

  // Init audio (must be in user gesture chain)
  initAudio();

  // Init DSP BEFORE countdown so calibration window starts accumulating
  try {
    initDSP();
  } catch (err) {
    console.error('DSP init failed:', err);
  }

  // Start DSP tick interval (keep running across all blocks)
  if (_dspInterval) clearInterval(_dspInterval);
  _dspInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - _sessionStart) / 1000);
    try {
      tick(elapsed);
    } catch (err) {
      console.error('DSP tick error:', err);
    }
    if (AppState.museConnected) _neuralCalmTrace.push(AppState.neuralCalm);
  }, 1000);

  // Subscribe to connected for disconnect handling
  _connectedListener = _onConnectedChange;
  subscribe('connected', _connectedListener);

  // Show 3-2-1 countdown, then start block 0
  _showCountdown(COUNTDOWN_SECONDS, () => startBlock(0));
}

/**
 * Stop discovery and clean up all timers/state.
 * Can be called mid-session (e.g., BLE permanent fail) or after completion.
 */
export function stopDiscovery() {
  _phase = 'idle';

  if (_blockTimer) { clearTimeout(_blockTimer); _blockTimer = null; }
  if (_dspInterval) { clearInterval(_dspInterval); _dspInterval = null; }

  stopPacer();
  stopRendering();

  AppState.sessionPhase = 'idle';
  AppState.sessionStartTime = null;

  if (_connectedListener) {
    unsubscribe('connected', _connectedListener);
    _connectedListener = null;
  }

  // Hide session viz, show placeholder
  const viz = document.querySelector('#tab-discovery .session-viz');
  if (viz) viz.classList.remove('active');

  _hide(_getEl('discovery-rate-label'));
  _hide(_getEl('discovery-progress'));
  _hide(_getEl('discovery-countdown'));
  _hide(_getEl('discovery-pause-overlay'));
  _hide(_getEl('discovery-comparison'));
  _show(_getEl('discovery-placeholder'));

  // Remove any bonus progress dot (restore to 5 dots)
  const progressContainer = _getEl('discovery-progress');
  if (progressContainer) {
    while (progressContainer.children.length > DISCOVERY_BLOCKS.length) {
      progressContainer.removeChild(progressContainer.lastChild);
    }
  }

  _pausedForReconnect = false;
}

/**
 * Called by main.js when BLE disconnects.
 * If a session is active, pauses pacer and waits for reconnect.
 */
export function onDisconnect() {
  if (_phase === 'idle') return;
  stopPacer();
  _pausedForReconnect = true;
  // Banner shown by connectionStatus subscription in main.js
}

// ---- Internal: Countdown ----

function _showCountdown(seconds, onDone) {
  const overlay = _getEl('discovery-countdown');
  const numEl = _getEl('discovery-countdown-number');
  if (!overlay || !numEl) { onDone(); return; }

  overlay.style.display = 'flex';
  numEl.textContent = seconds;

  let remaining = seconds - 1;
  const interval = setInterval(() => {
    if (remaining <= 0) {
      clearInterval(interval);
      overlay.style.display = 'none';
      onDone();
      return;
    }
    numEl.textContent = remaining;
    remaining--;
  }, 1000);
}

// ---- Internal: Block lifecycle ----

/**
 * Start block at given index.
 * Resets per-block rendering in countdown mode (120s per block).
 */
export function startBlock(index) {
  _blockIndex = index;
  _phase = 'block';
  _pausedForReconnect = false;

  const block = _activeBlocks[index];
  _blockStartTime = Date.now();

  AppState.pacingFreq = block.hz;
  AppState.sessionStartTime = _blockStartTime;

  startPacer(block.hz);

  // Update rate label
  const rateLabel = _getEl('discovery-rate-label');
  if (rateLabel) rateLabel.textContent = `${block.bpm} breaths/min`;

  // Update progress dots
  _updateProgressDots(index);

  // Start rendering in countdown mode (120s)
  const waveformCanvas = _getEl('waveform-canvas');
  const spectrumCanvas = _getEl('spectrum-canvas');
  const gaugeCanvas = _getEl('gauge-canvas');
  const pacerCanvas = _getEl('pacer-canvas');
  const neuralCalmCanvas = _getEl('neural-calm-gauge-canvas');

  startRendering(
    waveformCanvas, spectrumCanvas, gaugeCanvas, pacerCanvas,
    _blockStartTime, BLOCK_DURATION_MS / 1000, neuralCalmCanvas
  );

  // Schedule end of this block
  _blockTimer = setTimeout(() => endBlock(index), BLOCK_DURATION_MS);
}

/**
 * Capture metrics at end of block, transition to inter-block pause or comparison.
 */
export function endBlock(index) {
  if (_phase !== 'block') return;

  // Use spectral RSA: analyze last ANALYSIS_SECONDS of block data,
  // measuring power specifically at the pacing frequency.
  // The first SETTLE_SECONDS are implicitly excluded because the block
  // ran for BLOCK_DURATION_MS (180s) but we only read the last 120s.
  const block = _activeBlocks[index];
  let rsaAmplitude = 0;
  try {
    rsaAmplitude = computeSpectralRSA(ANALYSIS_SECONDS, block.hz);
  } catch (err) {
    console.error('RSA capture error:', err);
  }

  const lfPower = AppState.lfPower;

  _blockResults.push({
    bpm: block.bpm,
    hz: block.hz,
    rsaAmplitude,
    lfPower,
  });

  stopRendering();
  stopPacer();
  playChime();

  if (index < _activeBlocks.length - 1) {
    _showInterBlockPause(index);
  } else if (!_bonusChecked) {
    // Standard blocks done — check if best is at an extreme
    _bonusChecked = true;
    const bonusBlock = _checkForBonusBlock();
    if (bonusBlock) {
      _activeBlocks.push(bonusBlock);
      _addProgressDot();
      _showInterBlockPause(index);
    } else {
      if (_dspInterval) { clearInterval(_dspInterval); _dspInterval = null; }
      _showComparison(_blockResults);
    }
  } else {
    // Bonus block finished — show comparison
    if (_dspInterval) { clearInterval(_dspInterval); _dspInterval = null; }
    _showComparison(_blockResults);
  }
}

// ---- Internal: Bonus block detection ----

/**
 * After the standard 5 blocks, check if the best RSA landed on an extreme
 * (first or last block). If so, return a bonus block 0.5 BPM further out
 * so we can confirm the edge isn't masking a better frequency beyond the range.
 * @returns {{ bpm: number, hz: number } | null}
 */
function _checkForBonusBlock() {
  if (_blockResults.length === 0) return null;

  let bestIdx = 0;
  let bestAmp = -Infinity;
  for (let i = 0; i < _blockResults.length; i++) {
    if (_blockResults[i].rsaAmplitude > bestAmp) {
      bestAmp = _blockResults[i].rsaAmplitude;
      bestIdx = i;
    }
  }

  const firstIdx = 0;
  const lastIdx = _blockResults.length - 1;

  if (bestIdx === firstIdx) {
    // Best was at the high-BPM extreme — test 0.5 BPM higher
    const bonusBpm = _blockResults[firstIdx].bpm + 0.5;
    return { bpm: bonusBpm, hz: bonusBpm / 60 };
  }
  if (bestIdx === lastIdx) {
    // Best was at the low-BPM extreme — test 0.5 BPM lower
    const bonusBpm = _blockResults[lastIdx].bpm - 0.5;
    return { bpm: bonusBpm, hz: bonusBpm / 60 };
  }

  return null;
}

/**
 * Append a 6th progress dot to the progress container for the bonus block.
 */
function _addProgressDot() {
  const container = _getEl('discovery-progress');
  if (!container) return;
  const dot = document.createElement('span');
  dot.className = 'discovery-dot upcoming';
  container.appendChild(dot);
}

// ---- Internal: Inter-block pause ----

function _showInterBlockPause(completedIndex) {
  _phase = 'inter-block-pause';

  const nextBlock = _activeBlocks[completedIndex + 1];
  const overlay = _getEl('discovery-pause-overlay');
  const blockNumEl = _getEl('pause-block-num');
  const nextRateEl = _getEl('pause-next-rate');
  const pauseCountEl = _getEl('pause-countdown-number');

  if (!overlay) {
    // Fallback: skip directly to next block
    setTimeout(() => startBlock(completedIndex + 1), INTER_BLOCK_PAUSE_MS);
    return;
  }

  if (blockNumEl) blockNumEl.textContent = `${completedIndex + 1}/${_activeBlocks.length}`;
  if (nextRateEl) nextRateEl.textContent = `Next: ${nextBlock.bpm} breaths/min`;
  overlay.style.display = 'flex';

  const pauseSeconds = Math.round(INTER_BLOCK_PAUSE_MS / 1000);
  if (pauseCountEl) pauseCountEl.textContent = pauseSeconds;

  let remaining = pauseSeconds - 1;
  const interval = setInterval(() => {
    if (remaining <= 0) {
      clearInterval(interval);
      overlay.style.display = 'none';
      startBlock(completedIndex + 1);
      return;
    }
    if (pauseCountEl) pauseCountEl.textContent = remaining;
    remaining--;
  }, 1000);
}

// ---- Internal: Comparison chart ----

function _showComparison(results) {
  _phase = 'comparison';

  // Sort by BPM descending so chart always reads high→low left-to-right
  // (bonus blocks may have been appended out of order)
  results.sort((a, b) => b.bpm - a.bpm);

  // Hide session viz, show comparison section
  const viz = document.querySelector('#tab-discovery .session-viz');
  if (viz) viz.classList.remove('active');

  _hide(_getEl('discovery-rate-label'));
  _hide(_getEl('discovery-progress'));

  const compSection = _getEl('discovery-comparison');
  if (!compSection) return;
  compSection.style.display = 'flex';

  // Find best index (max RSA amplitude)
  let bestIndex = 0;
  let bestAmp = -Infinity;
  results.forEach((r, i) => {
    if (r.rsaAmplitude > bestAmp) {
      bestAmp = r.rsaAmplitude;
      bestIndex = i;
    }
  });
  _selectedIndex = bestIndex;

  // Draw chart
  const canvas = _getEl('comparison-chart-canvas');
  if (canvas) {
    _drawComparisonChart(canvas, results, _selectedIndex);

    // Click to override selection
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const barWidth = canvas.width / results.length;
      const clickedIndex = Math.floor(x / barWidth);
      if (clickedIndex >= 0 && clickedIndex < results.length) {
        _selectedIndex = clickedIndex;
        _drawComparisonChart(canvas, results, _selectedIndex);
      }
    };
  }

  // Wire confirm button
  const confirmBtn = _getEl('discovery-confirm-btn');
  if (confirmBtn) {
    confirmBtn.onclick = () => _onConfirm(results);
  }
}

function _drawComparisonChart(canvas, results, selectedIndex) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  // Background
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, W, H);

  const n = results.length;
  const padX = 32;
  const padTop = 40;
  const padBottom = 36;
  const chartW = W - padX * 2;
  const chartH = H - padTop - padBottom;
  const barW = (chartW / n) * 0.6;
  const gap = chartW / n;

  const maxAmp = Math.max(...results.map(r => r.rsaAmplitude), 0.1);

  results.forEach((r, i) => {
    const barH = (r.rsaAmplitude / maxAmp) * chartH;
    const x = padX + gap * i + (gap - barW) / 2;
    const y = padTop + chartH - barH;

    // Bar fill: selected = teal, others = dimmed
    if (i === selectedIndex) {
      ctx.fillStyle = '#14b8a6';
    } else {
      ctx.fillStyle = '#2a4a47';
    }
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 4);
    ctx.fill();

    // "Recommended" label above best bar (use first block matching max RSA)
    const bestIndex = results.reduce((bi, cur, ci) =>
      cur.rsaAmplitude > results[bi].rsaAmplitude ? ci : bi, 0);
    if (i === bestIndex) {
      ctx.fillStyle = '#14b8a6';
      ctx.font = `10px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText('Recommended', x + barW / 2, y - 6);
    }

    // BPM label below bar
    ctx.fillStyle = i === selectedIndex ? '#e8e8e8' : '#888';
    ctx.font = `11px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(`${r.bpm}`, x + barW / 2, padTop + chartH + 16);
    ctx.font = `9px system-ui`;
    ctx.fillStyle = '#555';
    ctx.fillText('BPM', x + barW / 2, padTop + chartH + 28);

    // RSA value label on bar if tall enough
    if (barH > 20) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `10px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(r.rsaAmplitude.toFixed(1), x + barW / 2, y + 14);
    }
  });

  // Y-axis label
  ctx.save();
  ctx.translate(12, padTop + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#555';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('RSA (BPM)', 0, 0);
  ctx.restore();

  // Selection indicator
  if (selectedIndex >= 0) {
    const selResult = results[selectedIndex];
    const selX = padX + gap * selectedIndex + (gap - barW) / 2;
    const selBarH = (selResult.rsaAmplitude / maxAmp) * chartH;
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(selX - 2, padTop + chartH - selBarH - 2, barW + 4, selBarH + 4, 5);
    ctx.stroke();
  }
}

// ---- Internal: Confirm selection ----

async function _onConfirm(results) {
  const selected = results[_selectedIndex];
  const selectedHz = selected.hz;
  const selectedBpm = selected.bpm;

  try {
    await setSetting('resonanceFreq', selectedHz);
    AppState.savedResonanceFreq = selectedHz;

    await saveSession({
      mode: 'discovery',
      date: new Date().toISOString(),
      selectedFreqHz: selectedHz,
      blocks: results,
      hrSource: AppState.hrSourceLabel || 'unknown',
      ...(_neuralCalmTrace.length > 0 ? {
        meanNeuralCalm: Math.round(_neuralCalmTrace.reduce((a, v) => a + v, 0) / _neuralCalmTrace.length),
      } : {}),
    });
  } catch (err) {
    console.error('Failed to save discovery results:', err);
  }

  _phase = 'idle';
  AppState.sessionPhase = 'idle';

  if (_connectedListener) {
    unsubscribe('connected', _connectedListener);
    _connectedListener = null;
  }

  // Hide comparison, show placeholder with success message + review button
  _hide(_getEl('discovery-comparison'));
  _showCompletePlaceholder(selectedBpm, results);
}

function _showCompletePlaceholder(selectedBpm, results) {
  const placeholder = _getEl('discovery-placeholder');
  if (!placeholder) return;

  const savedHz = AppState.savedResonanceFreq;
  const savedBpm = savedHz ? Math.round(savedHz * 60 * 10) / 10 : null;

  placeholder.innerHTML = `
    <h2>Discovery Complete</h2>
    <p>Resonance frequency set: <strong style="color:var(--accent-action)">${selectedBpm} breaths/min</strong></p>
    <p class="hint">Navigate to Practice tab to begin a session.</p>
    <button id="discovery-review-btn" class="connect-button" style="margin-top:12px;">Review Results</button>
    <button id="discovery-start-btn" class="connect-button discovery-start-btn" style="margin-top:8px;" disabled>Redo Discovery Protocol</button>
    <div class="pace-picker" id="pace-picker">
      <p class="pace-picker-label">Or set a different pace:</p>
      <div class="pace-picker-options" id="pace-picker-options">
        <button class="pace-option${savedBpm === 6.5 ? ' selected' : ''}" data-bpm="6.5">6.5</button>
        <button class="pace-option${savedBpm === 6.0 ? ' selected' : ''}" data-bpm="6.0">6.0</button>
        <button class="pace-option${savedBpm === 5.5 ? ' selected' : ''}" data-bpm="5.5">5.5</button>
        <button class="pace-option${savedBpm === 5.0 ? ' selected' : ''}" data-bpm="5.0">5.0</button>
        <button class="pace-option${savedBpm === 4.5 ? ' selected' : ''}" data-bpm="4.5">4.5</button>
      </div>
      <p class="pace-picker-unit">breaths/min</p>
    </div>
  `;
  placeholder.style.display = '';

  // Wire review button to reopen comparison chart
  const reviewBtn = _getEl('discovery-review-btn');
  if (reviewBtn) {
    reviewBtn.addEventListener('click', () => {
      _hide(placeholder);
      _showComparison(results);
    });
  }

  // Re-wire new start button (click handler + enable/disable)
  const newStartBtn = _getEl('discovery-start-btn');
  if (newStartBtn) {
    newStartBtn.addEventListener('click', () => startDiscovery());
    _wireStartBtn(newStartBtn);
  }

  // Wire pace picker
  initPacePicker();
}

// ---- Internal: Progress dots ----

function _updateProgressDots(activeIndex) {
  const container = _getEl('discovery-progress');
  if (!container) return;

  const dots = container.querySelectorAll('.discovery-dot');
  dots.forEach((dot, i) => {
    dot.classList.remove('complete', 'active', 'upcoming');
    if (i < activeIndex) dot.classList.add('complete');
    else if (i === activeIndex) dot.classList.add('active');
    else dot.classList.add('upcoming');
  });
}

// ---- Internal: BLE disconnect/reconnect handling ----

function _onConnectedChange(value) {
  if (!value && _phase !== 'idle') {
    // Disconnected mid-session
    stopPacer();
    _pausedForReconnect = true;
    if (_blockTimer) { clearTimeout(_blockTimer); _blockTimer = null; }
    // Connection banner shown by main.js connectionStatus subscription
  } else if (value && _pausedForReconnect) {
    // Reconnected — resume current block
    _pausedForReconnect = false;
    // Restart block from current position (block timer already cleared — restart full block)
    startBlock(_blockIndex);
  } else if (AppState.showManualReconnect && _phase !== 'idle') {
    // Permanent fail — save partial results and stop
    stopDiscovery();
  }
}

// ---- Wire start button enable/disable ----

/**
 * Set up enable/disable on a start button based on AppState.connected.
 * Called from main.js after DOM is ready.
 */
export function _wireStartBtn(btn) {
  if (!btn) return;
  btn.disabled = !AppState.connected;

  const listener = (value) => {
    if (btn.isConnected) {
      btn.disabled = !value;
    } else {
      unsubscribe('connected', listener);
    }
  };
  subscribe('connected', listener);
}
