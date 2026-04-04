// js/renderer.js — Canvas 2D renderers: Waveform, Spectrum, PhaseLockGauge
// All three share a single requestAnimationFrame loop at 60fps.
// Reads from AppState for live data; imports getHRArray from dsp.js.

import { AppState } from './state.js';
import { getHRArray } from './dsp.js';
import { getAudioTime } from './audio.js';

// ---- Constants ----
const HR_MIN = 40;
const HR_MAX = 120;
const WAVEFORM_WINDOW_SECONDS = 60;
const MAX_FREQ_HZ = 0.5;
const LF_LOW = 0.04;
const LF_HIGH = 0.15;
const SAMPLE_RATE = 4;
const FFT_SIZE = 512;

const TEAL = '#14b8a6';
const TEAL_FILL_TOP = 'rgba(20, 184, 166, 0.5)';
const TEAL_FILL_BOTTOM = 'rgba(20, 184, 166, 0.02)';

const ZONE_COLORS = { low: '#ef4444', aligning: '#eab308', locked: '#22c55e' };
const ZONE_THRESHOLDS = { aligning: 40, locked: 70 };
const ZONE_LABELS = { low: 'Low', aligning: 'Aligning', locked: 'Locked' };

// Neural Calm gauge constants
const NEURAL_CALM_COLOR = '#3b82f6';
const NEURAL_CALM_DIM = 'rgba(59, 130, 246, 0.15)';
const CALM_THRESHOLDS = { building: 30, high: 75 };
const CALM_LABELS = { low: 'Restless', building: 'Settling', high: 'Deep Calm' };

// EEG waveform constants
const EEG_SAMPLE_RATE = 256;
const EEG_DISPLAY_SECONDS = 2;
const EEG_DISPLAY_SAMPLES = EEG_SAMPLE_RATE * EEG_DISPLAY_SECONDS; // 512
const EEG_UV_RANGE = 100;  // display range: -100 to +100 µV
const TP9_COLOR = '#3b82f6';   // blue — matches Neural Calm
const TP10_COLOR = '#8b5cf6';  // purple — distinct from TP9

// ---- Module state ----
let _rAF = null;
let _waveformCanvas = null, _waveformCtx = null;
let _spectrumCanvas = null, _spectrumCtx = null;

// Waveform smoothing: maintain a high-res buffer updated via interpolation
const WAVEFORM_BUFFER_SIZE = 300; // 5 points per second * 60 seconds
let _waveformBuffer = new Float32Array(WAVEFORM_BUFFER_SIZE);
let _waveformHead = 0;
let _waveformFilled = 0;
let _lastHR = 0;
let _targetHR = 0;
let _smoothHR = 0;
let _lastWaveformTime = 0;
let _gaugeCanvas = null, _gaugeCtx = null;
let _pacerCanvas = null, _pacerCtx = null;
let _neuralCalmCanvas = null, _neuralCalmCtx = null;
let _eegCanvas = null, _eegCtx = null;
let _displayedScore = 0;
let _displayedCalm = 0;
let _calmHistory = [];          // rolling window for Neural Calm smoothing
const CALM_SMOOTH_WINDOW = 12;  // average last 12 raw values (~12 seconds at 1 update/sec)
let _pulsePhase = 0;
let _sessionStartTime = null;
let _calibrationFadeAlpha = 0;
let _prevPhase = 'inhale';
let _labelOpacity = 1.0;
let _sessionDuration = 0;

// ---- Helpers ----

function binToHz(bin) {
  return bin * SAMPLE_RATE / FFT_SIZE;
}

function getZone(score) {
  if (score >= ZONE_THRESHOLDS.locked) return 'locked';
  if (score >= ZONE_THRESHOLDS.aligning) return 'aligning';
  return 'low';
}

/**
 * Set up a canvas for crisp rendering at the device pixel ratio.
 * Sizes the canvas to fill its parent container.
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D}
 */
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ---- Waveform Renderer ----

// Update the high-res waveform buffer by interpolating toward current HR
let _lastWriteTime = 0;

function _updateWaveformBuffer() {
  const now = performance.now();

  // Update target from AppState (changes once per heartbeat)
  const currentHR = AppState.currentHR;
  if (currentHR > 0 && currentHR !== _targetHR) {
    _targetHR = currentHR;
  }
  if (_targetHR === 0) return;

  // Initialize smooth value on first valid reading
  if (_smoothHR === 0) _smoothHR = _targetHR;

  // Exponential interpolation toward target every frame (slower = smoother)
  const frameDt = now - _lastWaveformTime;
  _lastWaveformTime = now;
  const alpha = 1 - Math.exp(-frameDt / 600);
  _smoothHR += (_targetHR - _smoothHR) * alpha;

  // Write to circular buffer at ~5 samples/sec (every ~200ms)
  if (now - _lastWriteTime < 200) return;
  _lastWriteTime = now;

  _waveformBuffer[_waveformHead] = _smoothHR;
  _waveformHead = (_waveformHead + 1) % WAVEFORM_BUFFER_SIZE;
  if (_waveformFilled < WAVEFORM_BUFFER_SIZE) _waveformFilled++;
}

function drawWaveform() {
  if (!_waveformCtx) return;

  _updateWaveformBuffer();

  const canvas = _waveformCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const ctx = _waveformCtx;

  ctx.clearRect(0, 0, w, h);

  // Y-axis grid lines at 60, 80, 100 BPM
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  const gridBPMs = [60, 80, 100];
  for (const bpm of gridBPMs) {
    const y = h - ((bpm - HR_MIN) / (HR_MAX - HR_MIN)) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const bpm of gridBPMs) {
    const y = h - ((bpm - HR_MIN) / (HR_MAX - HR_MIN)) * h;
    ctx.fillText(String(bpm), 4, y);
  }

  if (_waveformFilled < 2) return;

  // Create vertical gradient for fill
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, TEAL_FILL_TOP);
  gradient.addColorStop(1, TEAL_FILL_BOTTOM);

  // Build points from the smooth circular buffer
  const n = _waveformFilled;
  const stepX = w / Math.max(n - 1, 1);
  const points = [];
  for (let i = 0; i < n; i++) {
    const bufIdx = (_waveformHead - n + i + WAVEFORM_BUFFER_SIZE) % WAVEFORM_BUFFER_SIZE;
    const hr = _waveformBuffer[bufIdx];
    const x = i * stepX;
    const clamped = Math.max(HR_MIN, Math.min(HR_MAX, hr));
    const y = h - ((clamped - HR_MIN) / (HR_MAX - HR_MIN)) * h;
    points.push({ x, y });
  }

  if (points.length < 2) return;

  // Two-pass smoothing: moving average then downsample for gentle rolling curves
  // Pass 1: wide moving average over raw points
  const smoothRadius = 12;
  const avgPoints = points.map((p, i) => {
    let sumY = 0, count = 0;
    for (let j = Math.max(0, i - smoothRadius); j <= Math.min(points.length - 1, i + smoothRadius); j++) {
      sumY += points[j].y;
      count++;
    }
    return { x: p.x, y: sumY / count };
  });

  // Pass 2: downsample to ~60 points so bezier curves create wide gentle arcs
  const targetCount = 60;
  const step = Math.max(1, Math.floor(avgPoints.length / targetCount));
  const smoothed = [];
  for (let i = 0; i < avgPoints.length; i += step) {
    smoothed.push(avgPoints[i]);
  }
  // Always include the last point
  if (smoothed.length > 0 && smoothed[smoothed.length - 1] !== avgPoints[avgPoints.length - 1]) {
    smoothed.push(avgPoints[avgPoints.length - 1]);
  }

  // Helper: draw smooth Bezier curve through points
  function drawSmoothCurve(pts) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpX = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
    }
  }

  // Filled area
  ctx.beginPath();
  drawSmoothCurve(smoothed);
  ctx.lineTo(smoothed[smoothed.length - 1].x, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Smooth line on top
  ctx.beginPath();
  drawSmoothCurve(smoothed);
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ---- Spectrum Renderer ----

function drawSpectrum() {
  if (!_spectrumCtx) return;

  const canvas = _spectrumCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const ctx = _spectrumCtx;

  ctx.clearRect(0, 0, w, h);

  // Chart title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Heart Rhythm Frequency', 8, 6);

  // LF band background shading (always visible)
  const lfLeftX = (LF_LOW / MAX_FREQ_HZ) * w;
  const lfRightX = (LF_HIGH / MAX_FREQ_HZ) * w;
  ctx.fillStyle = 'rgba(20, 184, 166, 0.07)';
  ctx.fillRect(lfLeftX, 0, lfRightX - lfLeftX, h);

  // LF band label
  ctx.fillStyle = 'rgba(20, 184, 166, 0.3)';
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Resonance Zone', (lfLeftX + lfRightX) / 2, 22);

  // X-axis labels
  const xLabels = [0.04, 0.10, 0.15, 0.25];
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const freq of xLabels) {
    const x = (freq / MAX_FREQ_HZ) * w;
    ctx.fillText(freq.toFixed(2), x, h - 2);
  }

  // Calibration state
  if (AppState.calibrating) {
    const elapsed = _sessionStartTime ? (Date.now() - _sessionStartTime) / 1000 : 0;
    const remaining = Math.max(0, Math.ceil(120 - elapsed));

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Calibrating... ${remaining}s`, w / 2, h / 2 - 12);

    // Progress bar
    const progress = Math.min(1, elapsed / 120);
    const barW = w * 0.4;
    const barH = 4;
    const barX = (w - barW) / 2;
    const barY = h / 2 + 8;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = TEAL;
    ctx.fillRect(barX, barY, barW * progress, barH);

    return;
  }

  // Handle fade-in transition after calibration ends
  if (_calibrationFadeAlpha < 1) {
    _calibrationFadeAlpha = Math.min(1, _calibrationFadeAlpha + 0.02);
  }

  const psd = AppState.spectralBuffer;
  if (!psd) return;

  ctx.save();
  ctx.globalAlpha = _calibrationFadeAlpha;

  // Normalize against LF band peak so the resonance signal fills the chart
  const maxBin = Math.min(psd.length, Math.floor(MAX_FREQ_HZ * FFT_SIZE / SAMPLE_RATE));
  const lfLowBin = Math.max(1, Math.round(LF_LOW * FFT_SIZE / SAMPLE_RATE));
  const lfHighBin = Math.min(psd.length - 1, Math.round(LF_HIGH * FFT_SIZE / SAMPLE_RATE));

  let lfMax = 0;
  let peakBin = lfLowBin;
  for (let i = lfLowBin; i <= lfHighBin; i++) {
    if (psd[i] > lfMax) { lfMax = psd[i]; peakBin = i; }
  }

  // Use LF peak as normalization ceiling (with small headroom)
  // Anything above is clamped — keeps the resonance peak prominent
  const normVal = lfMax > 0 ? lfMax * 1.15 : 1;

  // Also find global max (only used as fallback if LF is empty)
  let globalMax = 0;
  for (let i = 1; i < maxBin; i++) {
    if (psd[i] > globalMax) globalMax = psd[i];
  }
  if (globalMax === 0) { ctx.restore(); return; }
  const maxVal = lfMax > 0 ? normVal : globalMax;

  const chartBottom = h - 18; // leave room for x-axis labels
  const chartHeight = chartBottom * 0.85;

  // Build filled area path
  const gradient = ctx.createLinearGradient(0, chartBottom - chartHeight, 0, chartBottom);
  gradient.addColorStop(0, 'rgba(20, 184, 166, 0.6)');
  gradient.addColorStop(0.5, 'rgba(20, 184, 166, 0.25)');
  gradient.addColorStop(1, 'rgba(20, 184, 166, 0.03)');

  // Start plot from LF low bound — bins below are DC/VLF noise that dominates visually
  const plotStartBin = Math.max(1, lfLowBin - 1);
  const startX = (binToHz(plotStartBin) / MAX_FREQ_HZ) * w;

  ctx.beginPath();
  ctx.moveTo(startX, chartBottom);
  for (let i = plotStartBin; i < maxBin; i++) {
    const freq = binToHz(i);
    const x = (freq / MAX_FREQ_HZ) * w;
    const normalized = Math.min(1, psd[i] / maxVal);
    const y = chartBottom - normalized * chartHeight;
    ctx.lineTo(x, y);
  }
  ctx.lineTo((binToHz(maxBin - 1) / MAX_FREQ_HZ) * w, chartBottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line on top — thicker for visibility
  ctx.beginPath();
  for (let i = plotStartBin; i < maxBin; i++) {
    const freq = binToHz(i);
    const x = (freq / MAX_FREQ_HZ) * w;
    const normalized = Math.min(1, psd[i] / maxVal);
    const y = chartBottom - normalized * chartHeight;
    if (i === plotStartBin) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw peak dot (larger)
  const peakFreq = binToHz(peakBin);
  const peakX = (peakFreq / MAX_FREQ_HZ) * w;
  const peakNorm = Math.min(1, psd[peakBin] / maxVal);
  const peakY = chartBottom - peakNorm * chartHeight;

  ctx.beginPath();
  ctx.arc(peakX, peakY, 6, 0, Math.PI * 2);
  ctx.fillStyle = TEAL;
  ctx.fill();
  // Glow ring around peak
  ctx.beginPath();
  ctx.arc(peakX, peakY, 10, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(20, 184, 166, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Peak frequency label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${peakFreq.toFixed(2)} Hz`, peakX, peakY - 12);

  ctx.restore();
}

// ---- Phase Lock Gauge Renderer ----

function drawPhaseLockGauge() {
  if (!_gaugeCtx) return;

  const canvas = _gaugeCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const ctx = _gaugeCtx;

  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.35;
  const lineWidthBase = 12;

  // Calibration state — 25s phase lock warmup
  if (AppState.phaseLockCalibrating) {
    const elapsed = _sessionStartTime ? (Date.now() - _sessionStartTime) / 1000 : 0;
    const remaining = Math.max(0, Math.ceil(120 - elapsed));

    // Grey background ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = lineWidthBase;
    ctx.stroke();

    // Calibrating text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `${Math.round(radius * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Calibrating...', cx, cy - 10);
    ctx.fillText(`${remaining}s`, cx, cy + 14);

    // Progress bar below ring
    const progress = Math.min(1, elapsed / 120);
    const barW = radius * 1.2;
    const barH = 3;
    const barX = cx - barW / 2;
    const barY = cy + radius + 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = TEAL;
    ctx.fillRect(barX, barY, barW * progress, barH);

    return;
  }

  // Handle fade-in transition
  if (_calibrationFadeAlpha < 1) {
    _calibrationFadeAlpha = Math.min(1, _calibrationFadeAlpha + 0.02);
  }

  ctx.save();
  ctx.globalAlpha = _calibrationFadeAlpha;

  // Smooth interpolation — lighter than coherence (0.05 vs 0.08), heavier than Neural Calm (0.015)
  _displayedScore += (AppState.phaseLockScore - _displayedScore) * 0.05;

  const zone = getZone(AppState.phaseLockScore);
  const color = ZONE_COLORS[zone];

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = lineWidthBase;
  ctx.stroke();

  // Filled arc (sweep from -PI/2, clockwise)
  const sweep = (_displayedScore / 100) * Math.PI * 2;
  const startAngle = -Math.PI / 2;

  // Pulse animation in locked zone
  let currentLineWidth = lineWidthBase;
  if (zone === 'locked') {
    _pulsePhase += 0.05;
    currentLineWidth = lineWidthBase + Math.sin(_pulsePhase) * 2.5;
  }

  // Use lighter teal arc when PPG source (lower confidence indicator)
  const arcColor = AppState.hrSourceLabel === 'Muse PPG' ? '#5eead4' : color;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
  ctx.strokeStyle = arcColor;
  ctx.lineWidth = currentLineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Score number uses zone color (not arc color) — PPG shifts arc only
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(radius * 0.55)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(_displayedScore), cx, cy - 6);

  // Zone label
  ctx.font = `${Math.round(radius * 0.2)}px system-ui, sans-serif`;
  ctx.fillText(ZONE_LABELS[zone], cx, cy + radius * 0.3);

  // PPG confidence badge — draw below zone label when Muse PPG is HR source
  if (AppState.hrSourceLabel === 'Muse PPG') {
    const badgeFontSize = Math.round(radius * 0.16);
    const badgeText = 'PPG';
    ctx.font = `bold ${badgeFontSize}px system-ui, sans-serif`;
    const textW = ctx.measureText(badgeText).width;
    const badgePadX = badgeFontSize * 0.6;
    const badgePadY = badgeFontSize * 0.35;
    const badgeW = textW + badgePadX * 2;
    const badgeH = badgeFontSize + badgePadY * 2;
    const badgeX = cx - badgeW / 2;
    const badgeY = cy + radius * 0.3 + badgeFontSize * 0.8;

    // Rounded rect background
    const r = badgeH / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(badgeX + r, badgeY);
    ctx.arcTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + badgeH, r);
    ctx.arcTo(badgeX + badgeW, badgeY + badgeH, badgeX, badgeY + badgeH, r);
    ctx.arcTo(badgeX, badgeY + badgeH, badgeX, badgeY, r);
    ctx.arcTo(badgeX, badgeY, badgeX + badgeW, badgeY, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, cx, badgeY + badgeH / 2);
  }

  ctx.restore();
}

// ---- Neural Calm Gauge Renderer ----

function _getCalmZone(score) {
  if (score >= CALM_THRESHOLDS.high) return 'high';
  if (score >= CALM_THRESHOLDS.building) return 'building';
  return 'low';
}

function drawNeuralCalmGauge() {
  if (!_neuralCalmCtx) return;

  const canvas = _neuralCalmCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const ctx = _neuralCalmCtx;

  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.35;
  const lineWidthBase = 12;

  // Not connected placeholder
  if (!AppState.museConnected) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = NEURAL_CALM_DIM;
    ctx.lineWidth = lineWidthBase;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    const fontSize = Math.round(radius * 0.2);
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Connect', cx, cy - fontSize * 0.7);
    ctx.fillText('Muse-S', cx, cy + fontSize * 0.7);
    return;
  }

  // EEG calibrating state
  if (AppState.eegCalibrating) {
    const elapsed = _sessionStartTime ? (Date.now() - _sessionStartTime) / 1000 : 0;
    const progress = Math.min(1, elapsed / 20);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = lineWidthBase;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const fontSize = Math.round(radius * 0.18);
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EEG', cx, cy - fontSize * 1.1);
    ctx.fillText('Calibrating...', cx, cy + fontSize * 0.1);

    // Progress bar
    const barW = radius * 1.2;
    const barH = 3;
    const barX = cx - barW / 2;
    const barY = cy + radius + 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = NEURAL_CALM_COLOR;
    ctx.fillRect(barX, barY, barW * progress, barH);
    return;
  }

  // Rolling average smoothing — collect raw Neural Calm values, average them
  const rawCalm = AppState.neuralCalm;
  if (_calmHistory.length === 0 || _calmHistory[_calmHistory.length - 1] !== rawCalm) {
    // New value from the DSP tick (changes ~1/sec)
    _calmHistory.push(rawCalm);
    if (_calmHistory.length > CALM_SMOOTH_WINDOW) _calmHistory.shift();
  }
  const avgCalm = _calmHistory.length > 0
    ? _calmHistory.reduce((a, b) => a + b, 0) / _calmHistory.length
    : 0;

  // Very slow visual interpolation toward the rolling average
  _displayedCalm += (avgCalm - _displayedCalm) * 0.015;

  const zone = _getCalmZone(avgCalm);

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = lineWidthBase;
  ctx.stroke();

  // Filled arc
  const sweep = (_displayedCalm / 100) * Math.PI * 2;
  const startAngle = -Math.PI / 2;

  let currentLineWidth = lineWidthBase;
  if (zone === 'high') {
    currentLineWidth = lineWidthBase + Math.sin(_pulsePhase) * 2.5;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
  ctx.strokeStyle = NEURAL_CALM_COLOR;
  ctx.lineWidth = currentLineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Score number
  ctx.fillStyle = NEURAL_CALM_COLOR;
  ctx.font = `bold ${Math.round(radius * 0.55)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(_displayedCalm), cx, cy - 6);

  // Zone label
  ctx.font = `${Math.round(radius * 0.2)}px system-ui, sans-serif`;
  ctx.fillText(CALM_LABELS[zone], cx, cy + radius * 0.3);
}

// ---- EEG Alpha Power Bar ----
// Replaces the raw scrolling waveform with a calm, slow-moving alpha power meter.
// Shows current alpha power as a horizontal fill bar — serene to watch during breathing.

let _displayedAlpha = 0; // smooth interpolation target

function drawEEGWaveform() {
  if (!_eegCtx) return;

  const canvas = _eegCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const ctx = _eegCtx;

  ctx.clearRect(0, 0, w, h);

  // When Muse not connected: show placeholder
  if (!AppState.museConnected) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Alpha power — connect Muse-S', w / 2, h / 2);
    return;
  }

  // Use the Neural Calm score as proxy for alpha power level (0-100)
  const target = Math.max(0, Math.min(100, AppState.neuralCalm || 0));
  _displayedAlpha += (target - _displayedAlpha) * 0.005; // glacial interpolation — moves like a tide

  const barPad = 8;
  const barH = Math.max(12, h - barPad * 2);
  const barY = (h - barH) / 2;
  const barW = w - barPad * 2;
  const fillW = (_displayedAlpha / 100) * barW;

  // Background track
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.roundRect(barPad, barY, barW, barH, 6);
  ctx.fill();

  // Filled portion — gradient from dim blue to bright blue
  if (fillW > 1) {
    const grad = ctx.createLinearGradient(barPad, 0, barPad + fillW, 0);
    grad.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0.7)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barPad, barY, fillW, barH, 6);
    ctx.fill();
  }

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Alpha', barPad + 6, h / 2);

  // Value on right
  ctx.textAlign = 'right';
  ctx.fillText(Math.round(_displayedAlpha), w - barPad - 6, h / 2);
}

// ---- Breathing Circle Renderer ----

function drawBreathingCircle() {
  if (!_pacerCtx) return;

  const canvas = _pacerCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const ctx = _pacerCtx;

  ctx.clearRect(0, 0, w, h);

  // Derive circle position directly from the audio scheduler's state.
  // AppState.nextCueTime/Phase = the most recently scheduled cue = what's CURRENTLY PLAYING.
  const audioTime = getAudioTime();
  const cueTime = AppState.nextCueTime;
  if (audioTime === 0 || cueTime === 0) return;

  const halfPeriod = 1 / (AppState.pacingFreq * 2);
  const currentPhase = AppState.nextCuePhase;  // This IS the current phase

  // Progress since this phase's cue fired (0→1)
  const halfProgress = Math.max(0, Math.min(1, (audioTime - cueTime) / halfPeriod));

  // Map to full-cycle phase: inhale = 0→0.5, exhale = 0.5→1.0
  const phase = currentPhase === 'inhale'
    ? halfProgress * 0.5
    : 0.5 + halfProgress * 0.5;

  // Cosine gives smooth 1→0→1 shape, remap to 0→1→0 for radius
  // cos(0) = 1 (start small), cos(π) = -1 (fully expanded), cos(2π) = 1 (small again)
  const expansion = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0→1→0 smooth

  const isInhale = phase < 0.5;
  const dim = Math.min(w, h);
  const minR = dim * 0.12;
  const maxR = dim * 0.38;
  const radius = minR + (maxR - minR) * expansion;

  const cx = w / 2;
  const cy = h / 2;

  // Glowing teal ring
  ctx.save();
  ctx.shadowColor = '#14b8a6';
  ctx.shadowBlur = 15 + expansion * 20;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#14b8a6';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Phase label (Inhale/Exhale) with fade transition
  const labelPhase = isInhale ? 'inhale' : 'exhale';
  if (labelPhase !== _prevPhase) {
    _labelOpacity = 0.3;
    _prevPhase = labelPhase;
  }
  _labelOpacity = Math.min(1.0, _labelOpacity + 0.04);

  ctx.fillStyle = `rgba(232, 232, 232, ${_labelOpacity})`;
  ctx.font = `${Math.round(dim * 0.05)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isInhale ? 'Inhale' : 'Exhale', cx, cy - dim * 0.03);

  // Countdown / elapsed timer inside circle
  let displaySeconds;
  if (_sessionDuration > 0 && AppState.sessionStartTime) {
    // Countdown mode
    const remaining = _sessionDuration - (Date.now() - AppState.sessionStartTime) / 1000;
    displaySeconds = Math.max(0, Math.ceil(remaining));
  } else if (AppState.sessionStartTime) {
    // Elapsed mode (discovery blocks)
    displaySeconds = Math.floor((Date.now() - AppState.sessionStartTime) / 1000);
  } else {
    displaySeconds = 0;
  }
  const mins = Math.floor(displaySeconds / 60);
  const secs = displaySeconds % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  ctx.fillStyle = 'rgba(232, 232, 232, 0.7)';
  ctx.font = `${Math.round(dim * 0.04)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(timeStr, cx, cy + dim * 0.04);

  // BPM badge — always visible during practice sessions
  if (AppState.sessionPhase === 'practice') {
    const bpm = (AppState.pacingFreq * 60).toFixed(1);
    const isAtBound = AppState.pacerAtBound;
    const badgeColor = isAtBound ? '#f59e0b' : '#14b8a6';  // amber when clamped, teal normally
    const badgeFontSize = Math.round(dim * 0.055);

    ctx.font = `bold ${badgeFontSize}px monospace`;
    ctx.fillStyle = badgeColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${bpm}`, cx, cy + dim * 0.13);
  }
}

// ---- Render Loop ----

function renderLoop() {
  _rAF = requestAnimationFrame(renderLoop);
  drawBreathingCircle();
  drawWaveform();
  drawSpectrum();
  drawPhaseLockGauge();
  drawNeuralCalmGauge();
  drawEEGWaveform();
}

// ---- Public API ----

/**
 * Start the shared rendering loop.
 * @param {HTMLCanvasElement} waveformCanvas
 * @param {HTMLCanvasElement} spectrumCanvas
 * @param {HTMLCanvasElement} gaugeCanvas
 * @param {HTMLCanvasElement} pacerCanvas
 * @param {number} sessionStartTime - Date.now() when session started
 * @param {number} [sessionDuration=0] - Total session duration in seconds (0 = show elapsed)
 * @param {HTMLCanvasElement} [neuralCalmCanvas] - Optional Neural Calm gauge canvas
 * @param {HTMLCanvasElement} [eegCanvas] - Optional EEG waveform canvas
 */
export function startRendering(waveformCanvas, spectrumCanvas, gaugeCanvas, pacerCanvas, sessionStartTime, sessionDuration = 0, neuralCalmCanvas, eegCanvas) {
  _waveformCanvas = waveformCanvas;
  _spectrumCanvas = spectrumCanvas;
  _gaugeCanvas = gaugeCanvas;
  _pacerCanvas = pacerCanvas;
  _neuralCalmCanvas = neuralCalmCanvas || null;
  _eegCanvas = eegCanvas || null;
  _sessionStartTime = sessionStartTime;
  _sessionDuration = sessionDuration;

  _displayedScore = 0;
  _displayedCalm = 0;
  _calmHistory = [];
  _displayedAlpha = 0;
  _pulsePhase = 0;
  _calibrationFadeAlpha = 0;
  _prevPhase = 'inhale';
  _labelOpacity = 1.0;

  // Reset waveform interpolation buffer
  _waveformBuffer.fill(0);
  _waveformHead = 0;
  _waveformFilled = 0;
  _lastHR = 0;
  _targetHR = 0;
  _smoothHR = 0;
  _lastWaveformTime = performance.now();
  _lastWriteTime = 0;

  // Delay canvas setup by one frame so the browser can compute the
  // flex layout after session-viz transitions from display:none to flex.
  // Without this, getBoundingClientRect() returns 0x0.
  requestAnimationFrame(() => {
    _setupAllCanvases();
    _rAF = requestAnimationFrame(renderLoop);
  });
}

function _setupAllCanvases() {
  _waveformCtx = setupCanvas(_waveformCanvas);
  _spectrumCtx = _spectrumCanvas ? setupCanvas(_spectrumCanvas) : null;
  _gaugeCtx = _gaugeCanvas ? setupCanvas(_gaugeCanvas) : null;
  if (_pacerCanvas) _pacerCtx = setupCanvas(_pacerCanvas);
  _neuralCalmCtx = _neuralCalmCanvas ? setupCanvas(_neuralCalmCanvas) : null;
  _eegCtx = _eegCanvas ? setupCanvas(_eegCanvas) : null;
}

// Re-setup canvases on window resize
window.addEventListener('resize', () => {
  if (_rAF) _setupAllCanvases();
});

/**
 * Stop the rendering loop and clear all canvases.
 */
export function stopRendering() {
  if (_rAF) {
    cancelAnimationFrame(_rAF);
    _rAF = null;
  }

  const dpr = window.devicePixelRatio || 1;

  if (_waveformCtx && _waveformCanvas) {
    _waveformCtx.clearRect(0, 0, _waveformCanvas.width / dpr, _waveformCanvas.height / dpr);
  }
  if (_spectrumCtx && _spectrumCanvas) {
    _spectrumCtx.clearRect(0, 0, _spectrumCanvas.width / dpr, _spectrumCanvas.height / dpr);
  }
  if (_gaugeCtx && _gaugeCanvas) {
    _gaugeCtx.clearRect(0, 0, _gaugeCanvas.width / dpr, _gaugeCanvas.height / dpr);
  }
  if (_pacerCtx && _pacerCanvas) {
    _pacerCtx.clearRect(0, 0, _pacerCanvas.width / dpr, _pacerCanvas.height / dpr);
  }
  if (_neuralCalmCtx && _neuralCalmCanvas) {
    _neuralCalmCtx.clearRect(0, 0, _neuralCalmCanvas.width / dpr, _neuralCalmCanvas.height / dpr);
  }
  if (_eegCtx && _eegCanvas) {
    _eegCtx.clearRect(0, 0, _eegCanvas.width / dpr, _eegCanvas.height / dpr);
  }
}

// ---- Tuning Ring Renderer (Phase 10) ----

let _tuningRAF = null;
let _tuningCanvas = null;
let _tuningCtx = null;

/**
 * Draw a single frame of the tuning scanning animation.
 * Shows a progress ring filling clockwise in orange, with candidate counter inside.
 */
function _drawTuningRing() {
  if (!_tuningCanvas || !_tuningCtx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = _tuningCanvas.width / dpr;
  const h = _tuningCanvas.height / dpr;
  const ctx = _tuningCtx;

  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const radius = 110;  // ~240px diameter ring
  const lineWidth = 6;

  // Background track
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Progress arc (clockwise from top)
  const progress = Math.max(0, Math.min(1, AppState.tuningProgress));
  if (progress > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + progress * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Candidate counter text inside ring
  const idx = AppState.tuningCandidateIndex;
  const count = AppState.tuningCandidateCount;
  const label = idx >= 0 ? `${idx + 1} / ${count}` : '— / —';

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = `bold 22px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
}

/**
 * Start the tuning scanning ring animation loop.
 * Uses a separate rAF handle from the main session renderer.
 * @param {HTMLCanvasElement} canvas - The tuning ring canvas element
 */
export function startTuningRenderer(canvas) {
  if (_tuningRAF) {
    cancelAnimationFrame(_tuningRAF);
    _tuningRAF = null;
  }

  _tuningCanvas = canvas;

  // Set up canvas with DPR scaling
  const dpr = window.devicePixelRatio || 1;
  _tuningCanvas.width = _tuningCanvas.clientWidth * dpr || 280 * dpr;
  _tuningCanvas.height = _tuningCanvas.clientHeight * dpr || 280 * dpr;
  _tuningCtx = _tuningCanvas.getContext('2d');
  _tuningCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function loop() {
    _drawTuningRing();
    _tuningRAF = requestAnimationFrame(loop);
  }
  _tuningRAF = requestAnimationFrame(loop);
}

/**
 * Stop the tuning scanning ring animation loop.
 */
export function stopTuningRenderer() {
  if (_tuningRAF) {
    cancelAnimationFrame(_tuningRAF);
    _tuningRAF = null;
  }
  if (_tuningCtx && _tuningCanvas) {
    const dpr = window.devicePixelRatio || 1;
    _tuningCtx.clearRect(0, 0, _tuningCanvas.width / dpr, _tuningCanvas.height / dpr);
  }
  _tuningCanvas = null;
  _tuningCtx = null;
}
