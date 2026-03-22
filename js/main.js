// js/main.js — App bootstrap: init modules, wire subscriptions, register SW
import { AppState, subscribe } from './state.js';
import { initStorage, getSetting } from './storage.js';
import { initiateConnection, tryQuickConnect } from './ble.js';
import { initDSP, tick } from './dsp.js';
import { startRendering, stopRendering } from './renderer.js';

// ---- DOM references ----
const hrValue = document.getElementById('hr-value');
const rrCount = document.getElementById('rr-count');
const artifactCount = document.getElementById('artifact-count');
const uptimeEl = document.getElementById('uptime');
const connectBtn = document.getElementById('connect-btn');
const connectLabel = document.getElementById('connect-label');
const connectStatus = document.getElementById('connect-status');
const connectError = document.getElementById('connect-error');
const reconnectBtn = document.getElementById('reconnect-btn');
const banner = document.getElementById('connection-banner');
const bannerText = document.getElementById('banner-text');
const connectionArea = document.getElementById('connection-area');
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

// ---- Session management (DSP + renderer) ----
let _dspInterval = null;
let _sessionStart = null;

function startSession() {
  _sessionStart = Date.now();

  // Show session viz, hide placeholder FIRST (before any code that might throw)
  const viz = document.querySelector('#tab-discovery .session-viz');
  if (viz) viz.classList.add('active');
  const placeholder = document.getElementById('discovery-placeholder');
  if (placeholder) placeholder.style.display = 'none';

  try {
    initDSP();
  } catch (err) {
    console.error('DSP init failed (FFT library may not have loaded):', err);
  }

  // Get canvas elements
  const waveformCanvas = document.getElementById('waveform-canvas');
  const spectrumCanvas = document.getElementById('spectrum-canvas');
  const gaugeCanvas = document.getElementById('gauge-canvas');

  // Start rendering
  startRendering(waveformCanvas, spectrumCanvas, gaugeCanvas, _sessionStart);

  // Start DSP tick at 1-second interval (setInterval, NOT rAF — DSP runs even when tab hidden)
  _dspInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - _sessionStart) / 1000);
    try {
      tick(elapsed);
    } catch (err) {
      console.error('DSP tick error:', err);
    }
  }, 1000);
}

function stopSession() {
  if (_dspInterval) {
    clearInterval(_dspInterval);
    _dspInterval = null;
  }
  stopRendering();
  const viz = document.querySelector('#tab-discovery .session-viz');
  if (viz) viz.classList.remove('active');
  const placeholder = document.getElementById('discovery-placeholder');
  if (placeholder) placeholder.style.display = '';
}

// ---- Uptime timer ----
let uptimeInterval = null;

function formatUptime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function startUptimeTimer() {
  stopUptimeTimer();
  uptimeInterval = setInterval(() => {
    AppState.connectionUptime++;
  }, 1000);
}

function stopUptimeTimer() {
  if (uptimeInterval) {
    clearInterval(uptimeInterval);
    uptimeInterval = null;
  }
}

// ---- UI subscriptions ----

subscribe('currentHR', value => {
  hrValue.textContent = value > 0 ? value : '--';
});

subscribe('rrCount', value => {
  rrCount.textContent = value;
});

subscribe('artifactCount', value => {
  artifactCount.textContent = value;
});

subscribe('connectionUptime', value => {
  uptimeEl.textContent = formatUptime(value);
});

subscribe('connectionStatus', status => {
  // Update banner
  banner.className = 'connection-banner';
  switch (status) {
    case 'connected':
      banner.classList.add('connected');
      bannerText.textContent = 'Connected';
      banner.classList.remove('hidden');
      // Auto-hide banner after 2 seconds
      setTimeout(() => banner.classList.add('hidden'), 2000);
      break;
    case 'reconnecting':
      banner.classList.add('reconnecting');
      bannerText.textContent = 'Reconnecting...';
      banner.classList.remove('hidden');
      break;
    case 'disconnected':
      banner.classList.add('hidden');
      break;
    case 'connecting':
      banner.classList.add('reconnecting');
      bannerText.textContent = 'Connecting...';
      banner.classList.remove('hidden');
      break;
  }

  // Update connect button and connection area
  connectBtn.className = 'connect-button';
  if (status === 'connected') {
    connectBtn.classList.add('connected');
    connectBtn.classList.add('hidden');
    connectStatus.textContent = 'Connected';
    connectError.classList.add('hidden');
    connectionArea.classList.add('hidden');
  } else if (status === 'connecting' || status === 'reconnecting') {
    connectBtn.classList.add('connecting');
    connectBtn.classList.add('hidden');
    connectionArea.classList.add('hidden');
    connectStatus.textContent = status === 'connecting' ? 'Connecting...' : 'Reconnecting...';
  } else {
    connectBtn.classList.remove('hidden');
    connectStatus.textContent = 'Not connected';
    connectionArea.classList.remove('hidden');
  }
});

subscribe('showManualReconnect', show => {
  if (show) {
    reconnectBtn.classList.remove('hidden');
  } else {
    reconnectBtn.classList.add('hidden');
  }
});

subscribe('connected', value => {
  if (value) {
    AppState.connectionUptime = 0;
    startUptimeTimer();
    startSession();   // Auto-start viz on connect (temporary Phase 2 behavior)
  } else {
    stopUptimeTimer();
    stopSession();    // Stop viz on disconnect
  }
});

subscribe('savedDeviceName', name => {
  if (name) {
    connectLabel.textContent = `Connect to ${name}`;
  } else {
    connectLabel.textContent = 'Connect to HRM 600';
  }
});

// ---- Nav tab switching ----

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;

    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${target}`);
    });
  });
});

// ---- Connect button ----

connectBtn.addEventListener('click', async () => {
  connectError.classList.add('hidden');
  try {
    if (AppState.savedDeviceName) {
      await tryQuickConnect();
    } else {
      await initiateConnection();
    }
  } catch (err) {
    console.error('BLE connection error:', err);
    connectError.textContent = 'Make sure your HRM 600 is on and within range. Try again.';
    connectError.classList.remove('hidden');
  }
});

// ---- Manual reconnect button ----

reconnectBtn.addEventListener('click', async () => {
  AppState.showManualReconnect = false;
  connectError.classList.add('hidden');
  try {
    if (AppState.savedDeviceName) {
      await tryQuickConnect();
    } else {
      await initiateConnection();
    }
  } catch (err) {
    console.error('Reconnect error:', err);
    connectError.textContent = 'Make sure your HRM 600 is on and within range. Try again.';
    connectError.classList.remove('hidden');
  }
});

// ---- App initialization ----

async function init() {
  try {
    await initStorage();

    // Load saved settings into AppState
    const savedDevice = await getSetting('deviceName');
    if (savedDevice) {
      AppState.savedDeviceName = savedDevice;
    }

    const savedFreq = await getSetting('resonanceFreq');
    if (savedFreq !== undefined && savedFreq !== null) {
      AppState.savedResonanceFreq = savedFreq;
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err.message));
    }

    console.log('ResonanceHRV initialized');
  } catch (err) {
    console.error('Init failed:', err);
  }
}

document.addEventListener('DOMContentLoaded', init);
