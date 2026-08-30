const fs = require('fs');
const path = require('path');

const dataDirectory = path.join(__dirname, '.data');
const statePath = path.join(dataDirectory, 'monitor-state.json');

const defaultState = {
  kick: {
    isLive: false,
    streamId: null,
    lastCheckAt: null,
    lastNotificationAt: null,
    lastError: null,
  },
  youtube: {
    latestVideoId: null,
    latestVideoTitle: null,
    latestPublishedAt: null,
    lastCheckAt: null,
    lastNotificationAt: null,
    lastError: null,
  },
};

function loadState() {
  if (!fs.existsSync(statePath)) {
    return structuredClone(defaultState);
  }

  try {
    const savedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
      kick: { ...defaultState.kick, ...(savedState.kick || {}) },
      youtube: { ...defaultState.youtube, ...(savedState.youtube || {}) },
    };
  } catch (error) {
    console.warn('⚠️ Monitör hafızası okunamadı, varsayılan durum kullanılacak:', error.message);
    return structuredClone(defaultState);
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (error) {
    console.error('❌ Monitör hafızası kaydedilemedi:', error.message);
  }
}

function updateState(section, updates) {
  const state = loadState();
  state[section] = { ...state[section], ...updates };
  saveState(state);
  return state;
}

module.exports = { loadState, saveState, updateState };
