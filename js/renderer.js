// js/renderer.js — Canvas 2D renderers: Waveform, Spectrum, CoherenceGauge
// All three share a single requestAnimationFrame loop at 60fps.
// Reads from AppState for live data; imports getHRArray from dsp.js.

import { AppState } from './state.js';
import { getHRArray } from './dsp.js';

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

const ZONE_COLORS = { low: '#ef4444', building: '#eab308', high: '#22c55e' };
const ZONE_THRESHOLDS = { building: 31, high: 66 };
const ZONE_LABELS = { low: 'Low', building: 'Building', high: 'Locked In' };

// ---- Module state ----
let _rAF = null;
let _waveformCanvas = null, _waveformCtx = null;
let _spectrumCanvas = null, _spectrumCtx = null;
let _gaugeCanvas = null, _gaugeCtx = null;
let _displayedScore = 0;
let _pulsePhase = 0;
let _sessionStartTime = null;
let _calibrationFadeAlpha = 0;

// ---- Helpers ----

function binToHz(bin) {
  return bin * SAMPLE_RATE / FFT_SIZE;
}

function getZone(score) {
  if (score >= ZONE_THRESHOLDS.high) return 'high';
  if (score >= ZONE_THRESHOLDS.building) return 'building';
  return 'low';
}

/**
 * Set up a canvas for crisp rendering at the device pixel ratio.
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D}
 */
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

// ---- Waveform Renderer ----

function drawWaveform() {
  if (!_waveformCtx) return;

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

  // Get HR data
  const hrData = getHRArray(WAVEFORM_WINDOW_SECONDS);
  if (hrData.length === 0) return;

  // Create vertical gradient for fill
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, TEAL_FILL_TOP);
  gradient.addColorStop(1, TEAL_FILL_BOTTOM);

  // Build filled area path
  const stepX = w / Math.max(hrData.length - 1, 1);

  ctx.beginPath();
  for (let i = 0; i < hrData.length; i++) {
    const x = i * stepX;
    const clamped = Math.max(HR_MIN, Math.min(HR_MAX, hrData[i]));
    const y = h - ((clamped - HR_MIN) / (HR_MAX - HR_MIN)) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  // Close to baseline for fill
  ctx.lineTo((hrData.length - 1) * stepX, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Redraw line on top
  ctx.beginPath();
  for (let i = 0; i < hrData.length; i++) {
    const x = i * stepX;
    const clamped = Math.max(HR_MIN, Math.min(HR_MAX, hrData[i]));
    const y = h - ((clamped - HR_MIN) / (HR_MAX - HR_MIN)) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
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

  // LF band background shading (always visible)
  const lfLeftX = (LF_LOW / MAX_FREQ_HZ) * w;
  const lfRightX = (LF_HIGH / MAX_FREQ_HZ) * w;
  ctx.fillStyle = 'rgba(20, 184, 166, 0.07)';
  ctx.fillRect(lfLeftX, 0, lfRightX - lfLeftX, h);

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

  // Find max for normalization
  const maxBin = Math.min(psd.length, Math.floor(MAX_FREQ_HZ * FFT_SIZE / SAMPLE_RATE));
  let maxVal = 0;
  for (let i = 1; i < maxBin; i++) {
    if (psd[i] > maxVal) maxVal = psd[i];
  }
  if (maxVal === 0) { ctx.restore(); return; }

  // Build filled area path
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, TEAL_FILL_TOP);
  gradient.addColorStop(1, TEAL_FILL_BOTTOM);

  const chartBottom = h - 18; // leave room for x-axis labels

  ctx.beginPath();
  ctx.moveTo(0, chartBottom);
  for (let i = 0; i < maxBin; i++) {
    const freq = binToHz(i);
    const x = (freq / MAX_FREQ_HZ) * w;
    const normalized = psd[i] / maxVal;
    const y = chartBottom - normalized * chartBottom * 0.8;
    ctx.lineTo(x, y);
  }
  ctx.lineTo((binToHz(maxBin - 1) / MAX_FREQ_HZ) * w, chartBottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line on top
  ctx.beginPath();
  for (let i = 0; i < maxBin; i++) {
    const freq = binToHz(i);
    const x = (freq / MAX_FREQ_HZ) * w;
    const normalized = psd[i] / maxVal;
    const y = chartBottom - normalized * chartBottom * 0.8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Find peak in LF range
  const lfLowBin = Math.max(1, Math.round(LF_LOW * FFT_SIZE / SAMPLE_RATE));
  const lfHighBin = Math.min(psd.length - 1, Math.round(LF_HIGH * FFT_SIZE / SAMPLE_RATE));
  let peakBin = lfLowBin;
  let peakVal = 0;
  for (let i = lfLowBin; i <= lfHighBin; i++) {
    if (psd[i] > peakVal) {
      peakVal = psd[i];
      peakBin = i;
    }
  }

  // Draw peak dot
  const peakFreq = binToHz(peakBin);
  const peakX = (peakFreq / MAX_FREQ_HZ) * w;
  const peakY = chartBottom - (peakVal / maxVal) * chartBottom * 0.8;

  ctx.beginPath();
  ctx.arc(peakX, peakY, 4, 0, Math.PI * 2);
  ctx.fillStyle = TEAL;
  ctx.fill();

  // Peak frequency label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${peakFreq.toFixed(2)} Hz`, peakX, peakY - 8);

  ctx.restore();
}

// ---- Coherence Gauge Renderer ----

function drawCoherenceGauge() {
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

  // Calibration state
  if (AppState.calibrating) {
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

  // Smooth interpolation
  _displayedScore += (AppState.coherenceScore - _displayedScore) * 0.08;

  const zone = getZone(AppState.coherenceScore);
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

  // Pulse animation in high zone
  let currentLineWidth = lineWidthBase;
  if (zone === 'high') {
    _pulsePhase += 0.05;
    currentLineWidth = lineWidthBase + Math.sin(_pulsePhase) * 2.5;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
  ctx.strokeStyle = color;
  ctx.lineWidth = currentLineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Score number
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(radius * 0.55)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(_displayedScore), cx, cy - 6);

  // Zone label
  ctx.font = `${Math.round(radius * 0.2)}px system-ui, sans-serif`;
  ctx.fillText(ZONE_LABELS[zone], cx, cy + radius * 0.3);

  ctx.restore();
}

// ---- Render Loop ----

function renderLoop() {
  _rAF = requestAnimationFrame(renderLoop);
  drawWaveform();
  drawSpectrum();
  drawCoherenceGauge();
}

// ---- Public API ----

/**
 * Start the shared rendering loop.
 * @param {HTMLCanvasElement} waveformCanvas
 * @param {HTMLCanvasElement} spectrumCanvas
 * @param {HTMLCanvasElement} gaugeCanvas
 * @param {number} sessionStartTime - Date.now() when session started
 */
export function startRendering(waveformCanvas, spectrumCanvas, gaugeCanvas, sessionStartTime) {
  _waveformCanvas = waveformCanvas;
  _spectrumCanvas = spectrumCanvas;
  _gaugeCanvas = gaugeCanvas;
  _sessionStartTime = sessionStartTime;

  _waveformCtx = setupCanvas(_waveformCanvas);
  _spectrumCtx = setupCanvas(_spectrumCanvas);
  _gaugeCtx = setupCanvas(_gaugeCanvas);

  _displayedScore = 0;
  _pulsePhase = 0;
  _calibrationFadeAlpha = 0;

  _rAF = requestAnimationFrame(renderLoop);
}

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
}
