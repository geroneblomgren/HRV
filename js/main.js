// js/main.js — App bootstrap: init modules, wire subscriptions, register SW
import { AppState, subscribe } from './state.js';
import { initStorage, getSetting } from './storage.js';
import { init as initDeviceManager, connectChestStrap, connectMuse, disconnectAll } from './devices/DeviceManager.js';
import { setStyle, setVolume } from './audio.js';
import { startDiscovery, stopDiscovery, onDisconnect as discoveryDisconnect, _wireStartBtn, loadLastDiscoveryResults, initPacePicker } from './discovery.js';
import { initPracticeUI, onDisconnect as practiceDisconnect } from './practice.js';
import { initDashboard } from './dashboard.js';
import { handleCallback } from './oura.js';

// ---- DOM references ----
const hrValue = document.getElementById('hr-value');
const rrCount = document.getElementById('rr-count');
const artifactCount = document.getElementById('artifact-count');
const uptimeEl = document.getElementById('uptime');
const chestStrapBtn = document.getElementById('connect-chest-strap-btn');
const chestStrapLabel = document.getElementById('chest-strap-label');
const chestStrapStatusDot = document.getElementById('chest-strap-status-dot');
const chestStrapStatusText = document.getElementById('chest-strap-status-text');
const museBtn = document.getElementById('connect-muse-btn');
const museLabel = document.getElementById('muse-label');
const museStatusDot = document.getElementById('muse-status-dot');
const museStatusText = document.getElementById('muse-status-text');
const hrSourceLabelEl = document.getElementById('hr-source-label');
const connectError = document.getElementById('connect-error');
const reconnectBtn = document.getElementById('reconnect-btn');
const banner = document.getElementById('connection-banner');
const bannerText = document.getElementById('banner-text');
const connectionArea = document.getElementById('connection-area');
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanels = document.querySelectorAll('.tab-panel');
const eyesOpenWarningEl = document.getElementById('eyes-open-warning');
const ppgQualityCell = document.getElementById('ppg-quality-cell');
const ppgQualityDot = document.getElementById('ppg-quality-dot');
const ppgQualityText = document.getElementById('ppg-quality-text');

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

// ---- Device chip UI helper ----

/**
 * Update a device chip's visual state based on connection status.
 * @param {string} _deviceId - device identifier (unused, for future logging)
 * @param {string} status - 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
 * @param {Element} dot - status dot element
 * @param {Element} text - status text element
 * @param {Element} btn - connect button element
 */
function updateDeviceChipUI(_deviceId, status, dot, text, btn) {
  // Update dot class
  dot.className = `status-dot ${status}`;

  // Update text
  const labels = {
    disconnected: 'Not connected',
    connecting: 'Connecting...',
    connected: 'Connected',
    reconnecting: 'Reconnecting...',
    paired: 'Paired — ready for Phase 7',
  };
  text.textContent = labels[status] || 'Not connected';

  // Update button state
  if (status === 'connected') {
    btn.classList.add('connected');
    // Hide connection area after 2s when any device connects
    setTimeout(() => {
      if (AppState.connected) {
        connectionArea.classList.add('hidden');
      }
    }, 2000);
  } else {
    btn.classList.remove('connected');
    // Show connection area when disconnected
    if (status === 'disconnected') {
      connectionArea.classList.remove('hidden');
    }
  }
}

// ---- Capability-gated UI ----

function updateCapabilityGating() {
  const rrAvailable = AppState.chestStrapCapabilities?.rr || AppState.museCapabilities?.rr;
  const coherencePanel = document.getElementById('coherence-panel');
  if (coherencePanel) {
    coherencePanel.classList.toggle('no-hrv-data', !rrAvailable && AppState.connected);
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

// Banner — uses backward-compat connectionStatus derived by DeviceManager
subscribe('connectionStatus', status => {
  banner.className = 'connection-banner';
  switch (status) {
    case 'connected':
      banner.classList.add('connected');
      bannerText.textContent = 'Connected';
      banner.classList.remove('hidden');
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
});

// Per-device status chips
subscribe('chestStrapStatus', status => {
  updateDeviceChipUI('chest-strap', status, chestStrapStatusDot, chestStrapStatusText, chestStrapBtn);
});

subscribe('museStatus', status => {
  updateDeviceChipUI('muse', status, museStatusDot, museStatusText, museBtn);
});

// Uptime timer — driven by backward-compat connected flag
subscribe('connected', value => {
  if (value) {
    AppState.connectionUptime = 0;
    startUptimeTimer();
  } else {
    stopUptimeTimer();
  }
  updateCapabilityGating();
});

// Per-device disconnect routing to session controllers
subscribe('chestStrapConnected', val => {
  if (!val && AppState.hrSourceLabel === 'Chest Strap') {
    discoveryDisconnect();
    practiceDisconnect();
  }
});

subscribe('museConnected', val => {
  if (!val && AppState.hrSourceLabel === 'Muse PPG') {
    discoveryDisconnect();
    practiceDisconnect();
  }
});

// HR source label
subscribe('hrSourceLabel', label => {
  hrSourceLabelEl.textContent = label ? `HR: ${label}` : '';
  // Discovery mode accuracy warning for Muse PPG (per locked decision)
  const discoveryWarning = document.getElementById('discovery-ppg-warning');
  if (discoveryWarning) {
    discoveryWarning.classList.toggle('hidden', label !== 'Muse PPG');
  }
  // Show PPG quality cell only when Muse is active HR source
  if (ppgQualityCell) {
    ppgQualityCell.style.display = label === 'Muse PPG' ? '' : 'none';
  }
});

// Saved device name labels
subscribe('chestStrapName', name => {
  chestStrapLabel.textContent = name ? `Connect to ${name}` : 'Connect Chest Strap';
});

subscribe('museName', name => {
  museLabel.textContent = name ? `Connect to ${name}` : 'Connect Muse-S';
});

// Manual reconnect button visibility
subscribe('showManualReconnect', show => {
  if (show) {
    reconnectBtn.classList.remove('hidden');
  } else {
    reconnectBtn.classList.add('hidden');
  }
});

// Capability gating
subscribe('chestStrapCapabilities', updateCapabilityGating);
subscribe('museCapabilities', updateCapabilityGating);

// EEG calibration status — show "EEG calibrating..." on Muse chip when calibrating
subscribe('eegCalibrating', calibrating => {
  if (calibrating && AppState.museConnected) {
    museStatusText.textContent = 'EEG calibrating...';
  } else if (!calibrating && AppState.museStatus === 'streaming') {
    museStatusText.textContent = 'Streaming';
  }
});

// Eyes-open warning indicator
subscribe('eyesOpenWarning', visible => {
  if (eyesOpenWarningEl) {
    eyesOpenWarningEl.classList.toggle('hidden', !visible);
  }
});

// PPG signal quality indicator (shown when Muse is active HR source)
subscribe('ppgSignalQuality', quality => {
  const museActive = AppState.hrSourceLabel === 'Muse PPG';
  if (ppgQualityCell) {
    ppgQualityCell.style.display = museActive ? '' : 'none';
  }
  if (ppgQualityDot) {
    ppgQualityDot.className = `ppg-quality-dot ${quality}`;
  }
  if (ppgQualityText) {
    ppgQualityText.textContent = quality || '--';
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

    if (target === 'dashboard') {
      initDashboard();
    }
  });
});

// ---- Device connect button handlers ----

chestStrapBtn.addEventListener('click', async () => {
  connectError.classList.add('hidden');
  try {
    await connectChestStrap();
  } catch (err) {
    console.error('Chest strap connection error:', err);
    connectError.textContent = 'Make sure your HRM 600 is on and within range. Try again.';
    connectError.classList.remove('hidden');
  }
});

museBtn.addEventListener('click', async () => {
  connectError.classList.add('hidden');
  try {
    await connectMuse();
  } catch (err) {
    console.error('Muse connection error:', err);
    connectError.textContent = 'Make sure your Muse-S is on and within range. Try again.';
    connectError.classList.remove('hidden');
  }
});

// ---- Manual reconnect button ----

reconnectBtn.addEventListener('click', async () => {
  AppState.showManualReconnect = false;
  connectError.classList.add('hidden');
  try {
    await connectChestStrap(); // Primary device reconnect
  } catch (err) {
    connectError.textContent = 'Make sure your device is on and within range. Try again.';
    connectError.classList.remove('hidden');
  }
});

// ---- Pacer control event listeners ----

document.querySelectorAll('.style-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setStyle(btn.dataset.style);
  });
});

document.getElementById('volume-slider').addEventListener('input', e => {
  setVolume(e.target.value / 100);
});

// End session button wired per controller (discovery.js / practice.js handle their own flows)
// discovery-start-btn wired after DOM ready in init()

// ---- App initialization ----

async function init() {
  try {
    // Check for OAuth2 callback (Oura PKCE redirect)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code')) {
      try {
        await handleCallback();
        // Callback handled, continue normal init
      } catch (err) {
        console.error('OAuth2 callback failed:', err);
      }
    }

    await initStorage();

    // Initialize DeviceManager (subscribes to device states, derives backward-compat fields)
    await initDeviceManager();

    // Load saved chest strap name (chestStrapName primary, deviceName legacy fallback)
    const savedChestStrapName = await getSetting('chestStrapName') || await getSetting('deviceName');
    if (savedChestStrapName) {
      AppState.chestStrapName = savedChestStrapName;
    }

    // Load saved Muse name
    const savedMuseName = await getSetting('museName');
    if (savedMuseName) {
      AppState.museName = savedMuseName;
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

    // Wire discovery start button
    const discoveryStartBtn = document.getElementById('discovery-start-btn');
    if (discoveryStartBtn) {
      discoveryStartBtn.addEventListener('click', () => startDiscovery());
      _wireStartBtn(discoveryStartBtn);
    }

    // Wire end-session button for discovery
    const endSessionBtn = document.getElementById('end-session-btn');
    if (endSessionBtn) {
      endSessionBtn.addEventListener('click', () => {
        if (AppState.sessionPhase === 'discovery') stopDiscovery();
      });
    }

    // Wire practice UI
    initPracticeUI();

    // Load last discovery results so user can review/change selection
    if (AppState.savedResonanceFreq) {
      await loadLastDiscoveryResults();
    }

    // Wire pace picker (manual frequency selection)
    initPacePicker();

    console.log('ResonanceHRV initialized');
  } catch (err) {
    console.error('Init failed:', err);
  }
}

document.addEventListener('DOMContentLoaded', init);
