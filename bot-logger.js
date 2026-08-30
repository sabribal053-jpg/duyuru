require('dotenv').config();
const { EmbedBuilder, WebhookClient } = require('discord.js');
const { recordEvent } = require('./monitor-state');

const colors = {
  manual: '#00b4ff',
  kick: '#53fc18',
  youtube: '#ff0000',
  error: '#ff4d4f',
  startup: '#9b59b6',
};

const titles = {
  manual: '📢 Manuel Duyuru',
  kick: '🔴 Kick Bildirimi',
  youtube: '▶️ YouTube Bildirimi',
  error: '❌ Bot Hatası',
  startup: '✅ Bot Başladı',
};

async function logEvent(type, message, metadata = {}) {
  recordEvent(type, message, metadata);

  const webhookUrl = process.env.DISCORD_LOG_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.log('ℹ️ DISCORD_LOG_WEBHOOK_URL ayarlı değil; log sadece yerel hafızaya kaydedildi.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(colors[type] || '#7289da')
    .setTitle(titles[type] || 'ℹ️ Bot Logu')
    .setDescription(message)
    .setTimestamp();

  const fields = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .slice(0, 4)
    .map(([name, value]) => ({
      name,
      value: String(value).slice(0, 1024),
      inline: true,
    }));

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  try {
    const webhook = new WebhookClient({ url: webhookUrl });
    await webhook.send({ embeds: [embed] });
  } catch (error) {
    console.error('❌ Discord logu gönderilemedi:', error.message);
  }
}

module.exports = { logEvent };
