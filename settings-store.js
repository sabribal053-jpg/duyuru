const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '.data');
const SETTINGS_FILE = path.join(DATA_DIR, 'bot-settings.json');

const DEFAULT_SETTINGS = {
  embedColor: '#00b4ff',
  footerText: 'Duyuru botu tarafından gönderildi',
  mention: 'none',
};

function normalizeSettings(settings = {}) {
  const normalized = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if (typeof normalized.embedColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(normalized.embedColor)) {
    normalized.embedColor = DEFAULT_SETTINGS.embedColor;
  } else {
    normalized.embedColor = normalized.embedColor.toLowerCase();
  }
  if (typeof normalized.footerText !== 'string') normalized.footerText = DEFAULT_SETTINGS.footerText;
  normalized.footerText = normalized.footerText.slice(0, 2048);
  if (!['none', 'everyone', 'here'].includes(normalized.mention)) normalized.mention = DEFAULT_SETTINGS.mention;
  return normalized;
}

function readAllSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('⚠️ Bot ayarları okunamadı, varsayılanlar kullanılacak:', error.message);
    return {};
  }
}

function getGuildSettings(guildId) {
  const allSettings = readAllSettings();
  return normalizeSettings(allSettings[guildId]);
}

function saveGuildSettings(guildId, updates) {
  if (!guildId) throw new Error('Sunucu kimliği bulunamadı.');
  const allSettings = readAllSettings();
  const nextSettings = normalizeSettings({ ...(allSettings[guildId] || {}), ...updates });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  allSettings[guildId] = nextSettings;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(allSettings, null, 2) + '\n', 'utf8');
  return nextSettings;
}

module.exports = { DEFAULT_SETTINGS, getGuildSettings, saveGuildSettings };
