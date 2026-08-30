const fs = require('fs');
const path = require('path');

const dataDirectory = path.join(__dirname, '.data');
const statePath = path.join(dataDirectory, 'monitor-state.json');

function createDefaultState() {
  return {
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
    stats: {
      totalAnnouncements: 0,
      manualAnnouncements: 0,
      kickNotifications: 0,
      youtubeNotifications: 0,
      lastAnnouncementAt: null,
    },
    events: [],
  };
}

function loadState() {
  const defaultState = createDefaultState();

  if (!fs.existsSync(statePath)) {
    return defaultState;
  }

  try {
    const savedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
      kick: { ...defaultState.kick, ...(savedState.kick || {}) },
      youtube: { ...defaultState.youtube, ...(savedState.youtube || {}) },
      stats: { ...defaultState.stats, ...(savedState.stats || {}) },
      events: Array.isArray(savedState.events) ? savedState.events.slice(0, 100) : [],
    };
  } catch (error) {
    console.warn('⚠️ Monitör hafızası okunamadı, varsayılan durum kullanılacak:', error.message);
    return defaultState;
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

function recordEvent(type, message, metadata = {}) {
  const state = loadState();
  const occurredAt = new Date().toISOString();
  const counterByType = {
    manual: 'manualAnnouncements',
    kick: 'kickNotifications',
    youtube: 'youtubeNotifications',
  };
  const counter = counterByType[type];

  if (counter) {
    state.stats.totalAnnouncements += 1;
    state.stats[counter] += 1;
    state.stats.lastAnnouncementAt = occurredAt;
  }

  state.events.unshift({
    occurredAt,
    type,
    message,
    ...metadata,
  });
  state.events = state.events.slice(0, 100);
  saveState(state);
  return state;
}

module.exports = { loadState, saveState, updateState, recordEvent };
