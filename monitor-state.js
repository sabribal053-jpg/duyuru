const fs = require('fs');
const path = require('path');

const dataDirectory = path.join(__dirname, '.data');
const statePath = path.join(dataDirectory, 'monitor-state.json');
const lockPath = statePath + '.lock';
const lockTimeoutMs = 30 * 1000;
const lockRetryMs = 50;
const waitBuffer = new SharedArrayBuffer(4);

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

function waitForLock() {
  Atomics.wait(new Int32Array(waitBuffer), 0, 0, lockRetryMs);
}

function acquireLock() {
  fs.mkdirSync(dataDirectory, { recursive: true });

  for (let attempt = 0; attempt < lockTimeoutMs / lockRetryMs; attempt += 1) {
    try {
      return fs.openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      try {
        const lockAge = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (lockAge > lockTimeoutMs) fs.unlinkSync(lockPath);
      } catch (lockError) {
        if (!['ENOENT', 'EPERM', 'EBUSY'].includes(lockError.code)) throw lockError;
      }

      waitForLock();
    }
  }

  throw new Error('Monitör hafızası kilidi zaman aşımına uğradı.');
}

function releaseLock(lockFd) {
  try {
    fs.closeSync(lockFd);
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function withStateLock(callback) {
  const lockFd = acquireLock();
  try {
    return callback();
  } finally {
    releaseLock(lockFd);
  }
}

function writeState(state) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const tempPath = statePath + '.' + process.pid + '.tmp';

  try {
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    try {
      fs.renameSync(tempPath, statePath);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      fs.rmSync(statePath, { force: true });
      fs.renameSync(tempPath, statePath);
    }
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function saveState(state) {
  try {
    withStateLock(() => writeState(state));
  } catch (error) {
    console.error('❌ Monitör hafızası kaydedilemedi:', error.message);
  }
}

function updateState(section, updates) {
  return withStateLock(() => {
    const state = loadState();
    state[section] = { ...state[section], ...updates };
    writeState(state);
    return state;
  });
}

function recordEvent(type, message, metadata = {}) {
  return withStateLock(() => {
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
    writeState(state);
    return state;
  });
}

module.exports = { loadState, saveState, updateState, recordEvent };
