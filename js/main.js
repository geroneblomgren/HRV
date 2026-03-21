// js/main.js — App bootstrap: init modules, wire subscriptions, register SW
import { AppState, subscribe } from './state.js';
import { initStorage, getSetting } from './storage.js';

// ---- DOM references ----
const hrValue = document.getElementById('hr-value');
const rrCount = document.getElementById('rr-count');
const artifactCount = document.getElementById('artifact-count');
const uptimeEl = document.getElementById('uptime');
const connectBtn = document.getElementById('connect-btn');
const connectLabel = document.getElementById('connect-label');
const connectStatus = document.getElementById('connect-status');
const connectError = document.getElementById('connect-error');
const banner = document.getElementById('connection-banner');
const bannerText = document.getElementById('banner-text');
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

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

  // Update connect button
  connectBtn.className = 'connect-button';
  if (status === 'connected') {
    connectBtn.classList.add('connected');
    connectStatus.textContent = 'Connected';
  } else if (status === 'connecting' || status === 'reconnecting') {
    connectBtn.classList.add('connecting');
    connectStatus.textContent = status === 'connecting' ? 'Connecting...' : 'Reconnecting...';
  } else {
    connectStatus.textContent = 'Not connected';
  }
});

subscribe('connected', value => {
  if (value) {
    AppState.connectionUptime = 0;
    startUptimeTimer();
  } else {
    stopUptimeTimer();
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

// ---- Connect button (placeholder until BLEService in Plan 02) ----

connectBtn.addEventListener('click', () => {
  console.log('BLEService not yet loaded');
  connectError.textContent = 'BLE connection will be available after Plan 02.';
  connectError.classList.remove('hidden');
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
