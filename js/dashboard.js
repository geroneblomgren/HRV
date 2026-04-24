// js/dashboard.js — Recovery Dashboard: Oura HRV trend + session coherence chart
// ES module — no build tools, no external libraries

import { getHrvData, getStoredToken, storeToken, tryPatAuth } from './oura.js';
import { querySessions } from './storage.js';
import { AppState } from './state.js';
import { normalizeMode } from './sessionMode.js';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _initialized  = false;
let _canvas       = null;
let _ctx          = null;
let _canvasW      = 0;   // logical width (CSS px)
let _canvasH      = 0;   // logical height (CSS px)
let _hrvData      = [];  // [{day: 'YYYY-MM-DD', hrv: number}]
let _sessionData  = [];  // [{day: 'YYYY-MM-DD', meanCoherence: number|null, meanPhaseLock: number|null, durationSeconds: number, meanNeuralCalm: number|null, meanRfBPM: number|null}]
let _rangeDays    = 30;  // currently selected range
let _hitTargets   = [];  // [{x, y, type: 'hrv'|'coherence'|'coherence-legacy'|'phaseLock'|'calm'|'rf', data: {...}}] for tooltip hit detection
const _seriesVisible = { hrv: true, coherence: true, phaseLock: true, calm: true, rf: true };
let _legendBounds = [];  // [{key, x, y, w, h}] for legend click hit detection

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el(id) { return document.getElementById(id); }

function show(id) {
  const node = el(id);
  if (node) node.classList.remove('hidden');
}

function hide(id) {
  const node = el(id);
  if (node) node.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Exported entry point — called on Dashboard tab click (idempotent)
// ---------------------------------------------------------------------------

/**
 * Initialize the dashboard. If already initialized with fresh data, returns early.
 * Checks for stored Oura token; shows connect prompt or loads data accordingly.
 */
export async function initDashboard() {
  if (_initialized && _hrvData.length > 0) {
    // Already loaded — just ensure chart fits current size
    _setupChart();
    _drawChart();
    return;
  }

  // Wire connect button (safe to re-wire; handler checks for existing state)
  _wireConnectButton();

  const token = await getStoredToken();

  if (!token) {
    // No token — show connect prompt
    show('dashboard-connect');
    hide('dashboard-loading');
    hide('dashboard-content');
    _initialized = true;
    return;
  }

  // Token exists — fetch data
  hide('dashboard-connect');
  show('dashboard-loading');
  hide('dashboard-content');

  try {
    const hrv = await getHrvData();
    if (!hrv) {
      // Auth failure — show reconnect prompt
      _showError('oura-connect-error', 'Session expired. Please re-enter your Oura key.');
      show('dashboard-connect');
      hide('dashboard-loading');
      return;
    }

    _hrvData = hrv;
    _sessionData = await _getSessionsByDay(_rangeDays);

    _initialized = true;
    await _renderDashboard();
  } catch (err) {
    console.error('[dashboard] Error loading data:', err);
    _showError('oura-connect-error', 'Failed to load Oura data. Make sure the app was started with ResonanceHRV.bat.');
    show('dashboard-connect');
    hide('dashboard-loading');
  }
}

// ---------------------------------------------------------------------------
// Connect button wiring
// ---------------------------------------------------------------------------

let _connectWired = false;

function _wireConnectButton() {
  if (_connectWired) return;
  _connectWired = true;

  const btn   = el('oura-connect-btn');
  const input = el('oura-key-input');
  if (!btn || !input) return;

  btn.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) {
      _showError('oura-connect-error', 'Please enter your Oura Personal Access Token.');
      return;
    }

    _hideError('oura-connect-error');
    btn.textContent = 'Connecting…';
    btn.disabled    = true;

    try {
      const ok = await tryPatAuth(key);
      if (ok) {
        // PAT worked — fetch data
        hide('dashboard-connect');
        show('dashboard-loading');
        const hrv = await getHrvData();
        if (!hrv) throw new Error('Failed to fetch HRV data after auth');

        _hrvData     = hrv;
        _sessionData = await _getSessionsByDay(_rangeDays);
        _initialized = true;
        await _renderDashboard();
      } else {
        // PAT failed — the key might be a client_id requiring PKCE
        _showError('oura-connect-error',
          'Key not recognized as a Personal Access Token. ' +
          'Retrieve your PAT at cloud.ouraring.com/personal-access-tokens.');
      }
    } catch (err) {
      console.error('[dashboard] Connect error:', err);
      _showError('oura-connect-error', 'Connection failed. Make sure proxy.js is running on port 5001.');
    } finally {
      btn.textContent = 'Connect Oura';
      btn.disabled    = false;
    }
  });
}

function _showError(id, msg) {
  const node = el(id);
  if (!node) return;
  node.textContent = msg;
  node.classList.remove('hidden');
}

function _hideError(id) {
  const node = el(id);
  if (!node) return;
  node.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Main render pipeline
// ---------------------------------------------------------------------------

async function _renderDashboard() {
  hide('dashboard-connect');
  hide('dashboard-loading');
  show('dashboard-content');

  _computeMetrics();
  _wireRangeButtons();
  _wireResize();

  // Defer chart setup briefly so the DOM has painted and has layout dimensions
  requestAnimationFrame(() => {
    _setupChart();
    _drawChart();
  });
}

// ---------------------------------------------------------------------------
// Metric card computation
// ---------------------------------------------------------------------------

function _computeMetrics() {
  // ---- Tonight HRV ----
  const hrv    = _hrvData;
  const latest = hrv.length ? hrv[hrv.length - 1].hrv : null;

  if (latest !== null) {
    const avg7  = _avgHrv(hrv, 7);
    let arrowClass = 'trend-flat';
    let arrowChar  = '→';
    if (avg7 && latest > avg7 * 1.05) { arrowClass = 'trend-up';   arrowChar = '↑'; }
    else if (avg7 && latest < avg7 * 0.95) { arrowClass = 'trend-down'; arrowChar = '↓'; }

    const nowEl    = el('dash-hrv-now');
    const arrowEl  = el('dash-hrv-arrow');
    if (nowEl) {
      // Set text node directly to avoid clobbering the child arrow span
      nowEl.firstChild.textContent = Math.round(latest);
    }
    if (arrowEl) {
      arrowEl.textContent  = arrowChar;
      arrowEl.className    = 'trend-arrow ' + arrowClass;
    }
  } else {
    const nowEl = el('dash-hrv-now');
    if (nowEl) nowEl.firstChild.textContent = '--';
  }

  // ---- Practice Streak ----
  const streakEl = el('dash-streak');
  if (streakEl) {
    streakEl.textContent = _computeStreak() + 'd';
  }

  // ---- Avg Coherence 7d ----
  const coh7dEl = el('dash-coh-7d');
  if (coh7dEl) {
    const coh7 = _avgCoherence7d();
    coh7dEl.textContent = coh7 !== null ? coh7.toFixed(1) : '--';
  }

  // ---- HRV Trend ----
  const trendEl = el('dash-hrv-trend');
  if (trendEl) {
    const avg7d  = _avgHrv(hrv, 7);
    const avg30d = _avgHrv(hrv, 30);
    let label = 'Stable';
    if (avg7d !== null && avg30d !== null) {
      if (avg7d > avg30d * 1.05)      label = 'Improving';
      else if (avg7d < avg30d * 0.95) label = 'Declining';
    }
    trendEl.textContent = label;
  }

  // ---- Avg Neural Calm 7d ----
  const calm7dEl = el('dash-calm-7d');
  if (calm7dEl) {
    const cutoff7 = _daysAgoIso(7);
    const calmSessions = _sessionData.filter(s => s.day >= cutoff7 && s.meanNeuralCalm !== null);
    if (calmSessions.length > 0) {
      const avg = calmSessions.reduce((sum, s) => sum + s.meanNeuralCalm, 0) / calmSessions.length;
      calm7dEl.textContent = avg.toFixed(1);
    } else {
      calm7dEl.textContent = '--';
    }
  }

  // ---- Avg Phase Lock 7d ----
  const pl7dEl = el('dash-pl-7d');
  if (pl7dEl) {
    const cutoff7 = _daysAgoIso(7);
    const plSessions = _sessionData.filter(s => s.day >= cutoff7 && s.meanPhaseLock !== null);
    if (plSessions.length > 0) {
      const avg = plSessions.reduce((sum, s) => sum + s.meanPhaseLock, 0) / plSessions.length;
      pl7dEl.textContent = avg.toFixed(1);
    } else {
      pl7dEl.textContent = '--';
    }
  }
}

/** Average HRV over the last N days. Returns null if no data. */
function _avgHrv(data, days) {
  if (!data.length) return null;
  const cutoff = _daysAgoIso(days);
  const slice  = data.filter(d => d.day >= cutoff);
  if (!slice.length) return null;
  return slice.reduce((s, d) => s + d.hrv, 0) / slice.length;
}

/** Average meanCoherence over the last 7 days of sessions. Returns null if no sessions with valid coherence. */
function _avgCoherence7d() {
  const cutoff   = _daysAgoIso(7);
  const sessions = _sessionData.filter(s => s.day >= cutoff && s.meanCoherence !== null);
  if (!sessions.length) return null;
  return sessions.reduce((s, d) => s + d.meanCoherence, 0) / sessions.length;
}

/** Count consecutive days backward from today that have at least one practice session. */
function _computeStreak() {
  const daySet = new Set(_sessionData.map(s => s.day));
  let streak = 0;
  let date   = new Date();
  for (let i = 0; i < 365; i++) {
    const iso = date.toISOString().slice(0, 10);
    if (daySet.has(iso)) {
      streak++;
    } else if (i > 0) {
      // Allow today to be missing (session not done yet)
      break;
    }
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

/** ISO date string for N days ago. */
function _daysAgoIso(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Session data aggregation
// ---------------------------------------------------------------------------

/**
 * Fetch sessions for the given range and group by day, averaging coherence.
 * @param {number} rangeDays
 * @returns {Promise<Array<{day: string, meanCoherence: number, durationSeconds: number}>>}
 */
async function _getSessionsByDay(rangeDays) {
  const raw = await querySessions({ limit: rangeDays * 3 });
  const cutoff = _daysAgoIso(rangeDays);

  /** @type {Object.<string, {cohTotal: number, cohCount: number, durationSeconds: number, calmTotal: number, calmCount: number, rfTotal: number, rfCount: number, plTotal: number, plCount: number}>} */
  const byDay = {};

  for (const rawSession of raw) {
    const s = normalizeMode(rawSession);
    // s.date is an ISO string from practice.js
    const day = typeof s.date === 'string' ? s.date.slice(0, 10) : new Date(s.timestamp).toISOString().slice(0, 10);
    if (day < cutoff) continue;

    if (!byDay[day]) byDay[day] = { cohTotal: 0, cohCount: 0, durationSeconds: 0, calmTotal: 0, calmCount: 0, rfTotal: 0, rfCount: 0, plTotal: 0, plCount: 0 };
    byDay[day].durationSeconds += s.durationSeconds ?? 0;

    // Coherence — only accumulate when a valid number is present
    if (typeof s.meanCoherence === 'number' && !isNaN(s.meanCoherence)) {
      byDay[day].cohTotal += s.meanCoherence;
      byDay[day].cohCount += 1;
    }

    // Neural Calm — only accumulate when a valid Muse-S value is present
    if (typeof s.meanNeuralCalm === 'number' && !isNaN(s.meanNeuralCalm)) {
      byDay[day].calmTotal += s.meanNeuralCalm;
      byDay[day].calmCount += 1;
    }

    // Resonance Frequency — only accumulate when tuningFreqHz is present (v1.2+)
    if (typeof s.tuningFreqHz === 'number' && !isNaN(s.tuningFreqHz)) {
      byDay[day].rfTotal += s.tuningFreqHz * 60; // convert Hz to BPM for display
      byDay[day].rfCount += 1;
    }

    // Phase Lock — only accumulate when a valid v1.2 value is present
    if (typeof s.meanPhaseLock === 'number' && !isNaN(s.meanPhaseLock)) {
      byDay[day].plTotal += s.meanPhaseLock;
      byDay[day].plCount += 1;
    }
  }

  return Object.entries(byDay).map(([day, v]) => ({
    day,
    meanCoherence: v.cohCount ? v.cohTotal / v.cohCount : null,
    durationSeconds: v.durationSeconds,
    meanNeuralCalm: v.calmCount ? v.calmTotal / v.calmCount : null,
    meanRfBPM: v.rfCount ? v.rfTotal / v.rfCount : null,
    meanPhaseLock: v.plCount ? v.plTotal / v.plCount : null,
  })).sort((a, b) => a.day.localeCompare(b.day));
}

// ---------------------------------------------------------------------------
// Canvas chart: setup
// ---------------------------------------------------------------------------

function _setupChart() {
  _canvas = el('dashboard-chart');
  if (!_canvas) return;

  const dpr    = window.devicePixelRatio || 1;
  const parent = _canvas.parentElement;
  const w      = parent.clientWidth;
  const h      = parent.clientHeight;

  _canvas.style.width  = w + 'px';
  _canvas.style.height = h + 'px';
  _canvas.width        = w * dpr;
  _canvas.height       = h * dpr;

  _ctx = _canvas.getContext('2d');
  _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  _canvasW = w;
  _canvasH = h;
}

// ---------------------------------------------------------------------------
// Canvas chart: draw
// ---------------------------------------------------------------------------

const PAD = { top: 30, bottom: 50, left: 60, right: 110 };

function _drawChart() {
  if (!_ctx || !_canvas) return;
  _ctx.clearRect(0, 0, _canvasW, _canvasH);

  const cutoff = _daysAgoIso(_rangeDays);
  const now    = new Date().toISOString().slice(0, 10);

  // Slice HRV data to range
  const hrvSlice  = _hrvData.filter(d => d.day >= cutoff);
  // Session data already filtered by range when fetched, but re-filter for safety
  const sessSlice = _sessionData.filter(s => s.day >= cutoff);

  if (!hrvSlice.length && !sessSlice.length) {
    _ctx.fillStyle    = '#666';
    _ctx.font         = '14px system-ui, sans-serif';
    _ctx.textAlign    = 'center';
    _ctx.fillText('No data available for this range', _canvasW / 2, _canvasH / 2);
    return;
  }

  // ---- X scale: map date string to pixel ----
  const chartLeft  = PAD.left;
  const chartRight = _canvasW - PAD.right;
  const chartTop   = PAD.top;
  const chartBot   = _canvasH - PAD.bottom;
  const chartW     = chartRight - chartLeft;
  const chartH     = chartBot - chartTop;

  const startMs = new Date(cutoff).getTime();
  const endMs   = new Date(now).getTime() + 24 * 60 * 60 * 1000; // include today
  const spanMs  = endMs - startMs;

  function xPx(dayStr) {
    const ms = new Date(dayStr).getTime();
    return chartLeft + ((ms - startMs) / spanMs) * chartW;
  }

  // ---- Y scales ----
  // HRV: auto-range from data with 10% padding
  const hrvValues = hrvSlice.map(d => d.hrv);
  let hrvMin = Math.min(...hrvValues);
  let hrvMax = Math.max(...hrvValues);
  if (hrvValues.length === 0) { hrvMin = 20; hrvMax = 80; }
  else if (hrvMin === hrvMax) { hrvMin -= 5; hrvMax += 5; }
  const pad10 = (hrvMax - hrvMin) * 0.1;
  hrvMin = Math.max(0, hrvMin - pad10);
  hrvMax = hrvMax + pad10;

  function hrvYPx(v) {
    return chartBot - ((v - hrvMin) / (hrvMax - hrvMin)) * chartH;
  }

  // Coherence: fixed 0-100
  function cohYPx(v) {
    return chartBot - (v / 100) * chartH;
  }

  // ---- Grid lines ----
  _ctx.strokeStyle = '#2a2a2a';
  _ctx.lineWidth   = 1;
  _ctx.setLineDash([3, 4]);

  // Horizontal grid (5 lines for HRV axis)
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = chartTop + (i / yTicks) * chartH;
    _ctx.beginPath();
    _ctx.moveTo(chartLeft, y);
    _ctx.lineTo(chartRight, y);
    _ctx.stroke();
  }

  // Vertical grid: every 7 days (or adaptive)
  const tickInterval = _rangeDays <= 14 ? 3 : _rangeDays <= 30 ? 7 : 14;
  _ctx.setLineDash([2, 4]);
  const gridStart = new Date(cutoff);
  for (let d = 0; d < _rangeDays; d += tickInterval) {
    const tickDate = new Date(gridStart.getTime() + d * 24 * 60 * 60 * 1000);
    const x = xPx(tickDate.toISOString().slice(0, 10));
    _ctx.beginPath();
    _ctx.moveTo(x, chartTop);
    _ctx.lineTo(x, chartBot);
    _ctx.stroke();
  }

  _ctx.setLineDash([]);

  // ---- Date labels (bottom) ----
  _ctx.fillStyle  = '#888';
  _ctx.font       = '11px system-ui, sans-serif';
  _ctx.textAlign  = 'center';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let d = 0; d < _rangeDays; d += tickInterval) {
    const tickDate = new Date(gridStart.getTime() + d * 24 * 60 * 60 * 1000);
    const x = xPx(tickDate.toISOString().slice(0, 10));
    const label = months[tickDate.getMonth()] + ' ' + tickDate.getDate();
    _ctx.fillText(label, x, chartBot + 18);
  }

  // ---- Left axis labels (HRV, teal) ----
  _ctx.fillStyle = '#14b8a6';
  _ctx.textAlign = 'right';
  _ctx.font      = '11px system-ui, sans-serif';
  for (let i = 0; i <= yTicks; i++) {
    const v   = hrvMin + (i / yTicks) * (hrvMax - hrvMin);
    const y   = chartBot - (i / yTicks) * chartH;
    _ctx.fillText(Math.round(v), chartLeft - 6, y + 4);
  }

  // ---- Right axis labels (Coherence 0-100, orange) ----
  _ctx.fillStyle = '#fb923c';
  _ctx.textAlign = 'left';
  const cohTicks = [0, 25, 50, 75, 100];
  for (const v of cohTicks) {
    const y = cohYPx(v);
    _ctx.fillText(v, chartRight + 6, y + 4);
  }

  // ---- Axis titles (rotated) ----
  _ctx.save();
  _ctx.fillStyle = '#14b8a6';
  _ctx.font      = '11px system-ui, sans-serif';
  _ctx.textAlign = 'center';
  _ctx.translate(14, chartTop + chartH / 2);
  _ctx.rotate(-Math.PI / 2);
  _ctx.fillText('HRV (ms)', 0, 0);
  _ctx.restore();

  _ctx.save();
  _ctx.fillStyle = '#aaa';
  _ctx.font      = '11px system-ui, sans-serif';
  _ctx.textAlign = 'center';
  _ctx.translate(_canvasW - 35, chartTop + chartH / 2);
  _ctx.rotate(Math.PI / 2);
  _ctx.fillText('Score (0-100)', 0, 0);
  _ctx.restore();

  // ---- Inline legend (top of chart area, centered) ----
  _hitTargets = [];

  {
    const legendItems = [
      { color: '#14b8a6', label: 'HRV',           key: 'hrv' },
      { color: '#fb923c', label: 'Coherence',      key: 'coherence' },
      { color: '#22c55e', label: 'Phase Lock',     key: 'phaseLock' },
      { color: '#3b82f6', label: 'Neural Calm',    key: 'calm' },
      { color: '#a855f7', label: 'Resonance Freq', key: 'rf' }
    ];
    const squareSize = 8;
    const gapSq      = 4;   // gap between square and label
    const gapItem    = 20;  // gap between items

    _ctx.font     = '11px system-ui, sans-serif';
    _ctx.textAlign = 'left';

    // Measure total width
    let totalW = 0;
    for (let i = 0; i < legendItems.length; i++) {
      const tw = _ctx.measureText(legendItems[i].label).width;
      totalW += squareSize + gapSq + tw;
      if (i < legendItems.length - 1) totalW += gapItem;
    }

    let lx = (chartLeft + chartRight) / 2 - totalW / 2;
    const ly = PAD.top - 10;

    _legendBounds = [];
    for (const item of legendItems) {
      const itemStartX = lx;
      const alpha = _seriesVisible[item.key] ? 1.0 : 0.35;
      _ctx.globalAlpha = alpha;
      _ctx.fillStyle = item.color;
      _ctx.fillRect(lx, ly - squareSize + 1, squareSize, squareSize);
      lx += squareSize + gapSq;
      _ctx.fillStyle = '#ccc';
      const labelW = _ctx.measureText(item.label).width;
      _ctx.fillText(item.label, lx, ly);
      _ctx.globalAlpha = 1.0;
      const itemW = squareSize + gapSq + labelW;
      _legendBounds.push({ key: item.key, x: itemStartX, y: ly - squareSize, w: itemW, h: squareSize + 4 });
      lx += labelW + gapItem;
    }
  }

  // ---- HRV teal line (smooth via quadratic curves through midpoints) ----

  if (_seriesVisible.hrv && hrvSlice.length > 0) {
    _ctx.strokeStyle = '#14b8a6';
    _ctx.lineWidth   = 2;
    _ctx.lineJoin    = 'round';
    _ctx.beginPath();

    const pts = hrvSlice.map(d => ({ x: xPx(d.day), y: hrvYPx(d.hrv), data: d }));

    _ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const mx   = (prev.x + curr.x) / 2;
      const my   = (prev.y + curr.y) / 2;
      _ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    // Draw to last point
    const last = pts[pts.length - 1];
    _ctx.lineTo(last.x, last.y);
    _ctx.stroke();

    // Store hit targets for HRV points
    for (const pt of pts) {
      _hitTargets.push({ x: pt.x, y: pt.y, type: 'hrv', data: pt.data });
    }
  }

  // ---- Coherence dots: two-pass legacy/v1.2 split ----
  if (_seriesVisible.coherence) {
    // Pass 1 — Legacy sessions (no meanPhaseLock): hollow dimmed circles
    const legacySess = sessSlice.filter(s => s.meanPhaseLock === null && s.meanCoherence !== null);
    _ctx.globalAlpha = 0.45;
    for (const s of legacySess) {
      const x = xPx(s.day);
      const y = cohYPx(s.meanCoherence);
      if (x < chartLeft || x > chartRight) continue;
      _ctx.beginPath();
      _ctx.arc(x, y, 5, 0, Math.PI * 2);
      _ctx.strokeStyle = '#fb923c';
      _ctx.lineWidth = 1.5;
      _ctx.stroke();  // hollow — no fill
      _hitTargets.push({ x, y, type: 'coherence-legacy', data: s });
    }
    _ctx.globalAlpha = 1.0;

    // Pass 2 — v1.2 sessions (has meanPhaseLock): solid filled circles
    const v12Sess = sessSlice.filter(s => s.meanPhaseLock !== null && s.meanCoherence !== null);
    for (const s of v12Sess) {
      const x = xPx(s.day);
      const y = cohYPx(s.meanCoherence);
      if (x < chartLeft || x > chartRight) continue;
      _ctx.beginPath();
      _ctx.fillStyle = '#fb923c';
      _ctx.arc(x, y, 5, 0, Math.PI * 2);
      _ctx.fill();
      _ctx.strokeStyle = '#ea580c';
      _ctx.lineWidth = 1;
      _ctx.stroke();
      _hitTargets.push({ x, y, type: 'coherence', data: s });
    }
  }

  // ---- Neural Calm blue trend line (broken where no Muse-S data) ----
  if (_seriesVisible.calm) {
    const calmSlice = sessSlice.filter(s => s.meanNeuralCalm !== null);

    if (calmSlice.length > 0) {
      _ctx.globalAlpha = 0.85;
      _ctx.strokeStyle = '#3b82f6';
      _ctx.lineWidth   = 1.5;
      _ctx.lineJoin    = 'round';

      const calmPts = calmSlice.map(s => ({
        x: xPx(s.day),
        y: cohYPx(s.meanNeuralCalm),
        data: s
      }));

      // Draw broken line: start new sub-path whenever there is a gap between days
      _ctx.beginPath();
      let pathOpen = false;
      for (let i = 0; i < calmPts.length; i++) {
        const pt = calmPts[i];
        if (!pathOpen) {
          _ctx.moveTo(pt.x, pt.y);
          pathOpen = true;
        } else {
          const prev = calmPts[i - 1];
          // Check for a day gap between consecutive calm points
          const prevDay = new Date(prev.data.day).getTime();
          const currDay = new Date(pt.data.day).getTime();
          const dayGap  = (currDay - prevDay) / (24 * 60 * 60 * 1000);
          if (dayGap > 1) {
            // Gap — start new sub-path
            _ctx.stroke();
            _ctx.beginPath();
            _ctx.moveTo(pt.x, pt.y);
          } else {
            // Consecutive — smooth quadratic through midpoint
            const mx = (prev.x + pt.x) / 2;
            const my = (prev.y + pt.y) / 2;
            _ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
          }
        }
      }
      // Draw to last point
      const lastCalm = calmPts[calmPts.length - 1];
      _ctx.lineTo(lastCalm.x, lastCalm.y);
      _ctx.stroke();

      _ctx.globalAlpha = 1.0;

      // Small circle markers + hit targets
      for (const pt of calmPts) {
        if (pt.x < chartLeft || pt.x > chartRight) continue;
        _ctx.beginPath();
        _ctx.fillStyle = '#3b82f6';
        _ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        _ctx.fill();
        _hitTargets.push({ x: pt.x, y: pt.y, type: 'calm', data: pt.data });
      }
    }
  }

  // ---- Phase Lock green trend line (broken where no v1.2 data) ----
  if (_seriesVisible.phaseLock) {
    const plSlice = sessSlice.filter(s => s.meanPhaseLock !== null);

    if (plSlice.length > 0) {
      _ctx.globalAlpha = 0.9;
      _ctx.strokeStyle = '#22c55e';
      _ctx.lineWidth   = 2;
      _ctx.lineJoin    = 'round';

      const plPts = plSlice.map(s => ({
        x: xPx(s.day),
        y: cohYPx(s.meanPhaseLock),
        data: s
      }));

      // Draw broken line: start new sub-path whenever there is a gap > 1 day
      _ctx.beginPath();
      let plPathOpen = false;
      for (let i = 0; i < plPts.length; i++) {
        const pt = plPts[i];
        if (!plPathOpen) {
          _ctx.moveTo(pt.x, pt.y);
          plPathOpen = true;
        } else {
          const prev = plPts[i - 1];
          const prevDay = new Date(prev.data.day).getTime();
          const currDay = new Date(pt.data.day).getTime();
          const dayGap  = (currDay - prevDay) / (24 * 60 * 60 * 1000);
          if (dayGap > 1) {
            _ctx.stroke();
            _ctx.beginPath();
            _ctx.moveTo(pt.x, pt.y);
          } else {
            const mx = (prev.x + pt.x) / 2;
            const my = (prev.y + pt.y) / 2;
            _ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
          }
        }
      }
      // Draw to last point
      const lastPl = plPts[plPts.length - 1];
      _ctx.lineTo(lastPl.x, lastPl.y);
      _ctx.stroke();

      _ctx.globalAlpha = 1.0;

      // Small circle markers + hit targets
      for (const pt of plPts) {
        if (pt.x < chartLeft || pt.x > chartRight) continue;
        _ctx.beginPath();
        _ctx.fillStyle = '#22c55e';
        _ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        _ctx.fill();
        _hitTargets.push({ x: pt.x, y: pt.y, type: 'phaseLock', data: pt.data });
      }
    }
  }

  // ---- RF (Resonance Frequency) purple dashed trend line ----
  const rfSlice = sessSlice.filter(s => s.meanRfBPM !== null);

  if (_seriesVisible.rf && rfSlice.length > 0) {
    // Compute RF Y-axis range
    const rfValues = rfSlice.map(s => s.meanRfBPM);
    let rfMin = Math.min(...rfValues);
    let rfMax = Math.max(...rfValues);
    const rfPad = Math.max((rfMax - rfMin) * 0.2, 0.5); // at least 0.5 BPM padding
    rfMin = Math.max(3, rfMin - rfPad);
    rfMax = Math.min(8, rfMax + rfPad);

    function rfYPx(v) {
      return chartBot - ((v - rfMin) / (rfMax - rfMin)) * chartH;
    }

    // Draw RF axis labels (purple, far right)
    _ctx.fillStyle = '#a855f7';
    _ctx.textAlign = 'left';
    _ctx.font      = '11px system-ui, sans-serif';
    const rfAxisX  = chartRight + 52; // offset beyond coherence axis labels (~+6 from chartRight)
    for (let i = 0; i <= 4; i++) {
      const v = rfMin + (i / 4) * (rfMax - rfMin);
      const y = chartBot - (i / 4) * chartH;
      _ctx.fillText(v.toFixed(1), rfAxisX, y + 4);
    }

    // Draw RF axis title (rotated, purple, far right)
    _ctx.save();
    _ctx.fillStyle = '#a855f7';
    _ctx.font      = '11px system-ui, sans-serif';
    _ctx.textAlign = 'center';
    _ctx.translate(_canvasW - 12, chartTop + chartH / 2);
    _ctx.rotate(Math.PI / 2);
    _ctx.fillText('RF (BPM)', 0, 0);
    _ctx.restore();

    // Draw RF trend line (dashed, purple)
    _ctx.strokeStyle = '#a855f7';
    _ctx.lineWidth   = 2;
    _ctx.lineJoin    = 'round';
    _ctx.setLineDash([6, 3]);

    const rfPts = rfSlice.map(s => ({
      x: xPx(s.day),
      y: rfYPx(s.meanRfBPM),
      data: s
    }));

    _ctx.beginPath();
    let rfPathOpen = false;
    for (let i = 0; i < rfPts.length; i++) {
      const pt = rfPts[i];
      if (!rfPathOpen) {
        _ctx.moveTo(pt.x, pt.y);
        rfPathOpen = true;
      } else {
        const prev    = rfPts[i - 1];
        const prevDay = new Date(prev.data.day).getTime();
        const currDay = new Date(pt.data.day).getTime();
        const dayGap  = (currDay - prevDay) / (24 * 60 * 60 * 1000);
        if (dayGap > 2) {
          _ctx.stroke();
          _ctx.beginPath();
          _ctx.moveTo(pt.x, pt.y);
        } else {
          const mx = (prev.x + pt.x) / 2;
          const my = (prev.y + pt.y) / 2;
          _ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
        }
      }
    }
    const lastRf = rfPts[rfPts.length - 1];
    _ctx.lineTo(lastRf.x, lastRf.y);
    _ctx.stroke();
    _ctx.setLineDash([]);

    // Diamond markers + hit targets for RF points
    for (const pt of rfPts) {
      if (pt.x < chartLeft || pt.x > chartRight) continue;
      _ctx.save();
      _ctx.translate(pt.x, pt.y);
      _ctx.rotate(Math.PI / 4);
      _ctx.fillStyle = '#a855f7';
      _ctx.fillRect(-3, -3, 6, 6);
      _ctx.restore();
      _hitTargets.push({ x: pt.x, y: pt.y, type: 'rf', data: pt.data });
    }
  }

  // ---- Wire tooltip and legend (only once each) ----
  _wireTooltip();
  _wireLegend();
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

let _tooltipWired = false;

function _wireTooltip() {
  if (_tooltipWired || !_canvas) return;
  _tooltipWired = true;

  const tooltip = el('dashboard-tooltip');
  if (!tooltip) return;

  _canvas.addEventListener('mousemove', (e) => {
    const rect = _canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    // Check if hovering over legend item — change cursor to pointer
    const overLegend = _legendBounds.some(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
    _canvas.style.cursor = overLegend ? 'pointer' : 'default';

    const hit = _findNearest(mx, my, 15);
    if (hit) {
      tooltip.style.display = 'block';
      tooltip.style.left    = (e.clientX + 12) + 'px';
      tooltip.style.top     = (e.clientY - 10) + 'px';
      tooltip.innerHTML     = _tooltipHtml(hit);
    } else {
      tooltip.style.display = 'none';
    }
  });

  _canvas.addEventListener('mouseleave', () => {
    if (tooltip) tooltip.style.display = 'none';
    _canvas.style.cursor = 'default';
  });
}

// ---------------------------------------------------------------------------
// Legend click toggle
// ---------------------------------------------------------------------------

let _legendWired = false;

function _wireLegend() {
  if (_legendWired || !_canvas) return;
  _legendWired = true;

  _canvas.addEventListener('click', (e) => {
    const rect = _canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const b of _legendBounds) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        _seriesVisible[b.key] = !_seriesVisible[b.key];
        _drawChart();
        break;
      }
    }
  });
}

function _findNearest(mx, my, radius) {
  let best = null;
  let bestDist = radius * radius;
  for (const t of _hitTargets) {
    const dx   = t.x - mx;
    const dy   = t.y - my;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best     = t;
    }
  }
  return best;
}

function _tooltipHtml(hit) {
  const dateLabel = _formatDate(hit.data.day);
  if (hit.type === 'hrv') {
    return `<strong>${dateLabel}</strong><br>HRV: ${Math.round(hit.data.hrv)} ms`;
  }
  if (hit.type === 'calm') {
    return `<strong>${dateLabel}</strong><br>Neural Calm: ${hit.data.meanNeuralCalm.toFixed(1)}`;
  }
  if (hit.type === 'rf') {
    return `<strong>${dateLabel}</strong><br>Resonance Freq: ${hit.data.meanRfBPM.toFixed(1)} BPM`;
  }
  if (hit.type === 'phaseLock') {
    return `<strong>${dateLabel}</strong><br>Phase Lock: ${hit.data.meanPhaseLock.toFixed(1)}`;
  }
  if (hit.type === 'coherence-legacy') {
    const mins = hit.data.durationSeconds > 0
      ? ` &bull; ${Math.round(hit.data.durationSeconds / 60)} min`
      : '';
    return `<strong>${dateLabel}</strong><br>Coherence (legacy): ${hit.data.meanCoherence.toFixed(1)}${mins}`;
  }
  // v1.2 coherence tooltip
  const mins = hit.data.durationSeconds > 0
    ? ` &bull; ${Math.round(hit.data.durationSeconds / 60)} min`
    : '';
  let html = `<strong>${dateLabel}</strong><br>Coherence: ${hit.data.meanCoherence.toFixed(1)}${mins}`;
  if (hit.data.meanPhaseLock !== null) {
    html += `<br>Phase Lock: ${hit.data.meanPhaseLock.toFixed(1)}`;
  }
  if (hit.data.meanNeuralCalm !== null) {
    html += `<br>Neural Calm: ${hit.data.meanNeuralCalm.toFixed(1)}`;
  }
  if (hit.data.meanRfBPM !== null) {
    html += `<br>RF: ${hit.data.meanRfBPM.toFixed(1)} BPM`;
  }
  return html;
}

function _formatDate(iso) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(iso + 'T12:00:00'); // noon to avoid DST issues
  return months[d.getMonth()] + ' ' + d.getDate();
}

// ---------------------------------------------------------------------------
// Range buttons
// ---------------------------------------------------------------------------

let _rangeBtnsWired = false;

function _wireRangeButtons() {
  if (_rangeBtnsWired) return;
  _rangeBtnsWired = true;

  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const range = parseInt(btn.dataset.range, 10);
      if (range === _rangeDays) return;

      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      _rangeDays   = range;
      _sessionData = await _getSessionsByDay(range);
      _computeMetrics();
      _drawChart();
    });
  });
}

// ---------------------------------------------------------------------------
// Window resize
// ---------------------------------------------------------------------------

let _resizeWired = false;

function _wireResize() {
  if (_resizeWired) return;
  _resizeWired = true;

  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      // Only redraw if dashboard tab is visible
      const dashTab = el('tab-dashboard');
      if (dashTab && dashTab.classList.contains('active')) {
        _setupChart();
        _drawChart();
      }
    }, 150);
  });
}
