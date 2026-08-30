const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadState } = require('../monitor-state');

function formatAge(value, staleAfterMs) {
  if (!value) return 'Henüz kontrol edilmedi';

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Bilinmiyor';

  const ageMs = Math.max(0, Date.now() - timestamp);
  const ageMinutes = Math.floor(ageMs / 60000);
  let ageText = 'az önce';

  if (ageMinutes >= 60) {
    ageText = String(Math.floor(ageMinutes / 60)) + ' saat önce';
  } else if (ageMinutes > 0) {
    ageText = String(ageMinutes) + ' dakika önce';
  }

  return ageMs > staleAfterMs ? ageText + ' ⚠️ gecikmiş' : ageText;
}

function errorText(error) {
  return error ? '\nSon hata: ' + error.slice(0, 500) : '';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('durum')
    .setDescription('Kick ve YouTube monitörlerinin durumunu gösterir'),

  async execute(interaction) {
    const state = loadState();
    const kickStatus = state.kick.isLive ? '🔴 Canlı' : '⚫ Çevrimdışı';
    const latestVideo = state.youtube.latestVideoId
      ? '[' + (state.youtube.latestVideoTitle || 'Son video') + '](https://www.youtube.com/watch?v=' + state.youtube.latestVideoId + ')'
      : 'Henüz video kaydedilmedi';

    const embed = new EmbedBuilder()
      .setColor(state.kick.isLive ? '#00ff00' : '#00b4ff')
      .setTitle('📊 Duyuru Botu Durumu')
      .addFields(
        {
          name: 'Kick Monitörü',
          value: 'Durum: ' + kickStatus + '\nSon kontrol: ' + formatAge(state.kick.lastCheckAt, 10 * 60 * 1000) + errorText(state.kick.lastError),
          inline: false,
        },
        {
          name: 'YouTube Monitörü',
          value: 'Son video: ' + latestVideo + '\nSon kontrol: ' + formatAge(state.youtube.lastCheckAt, 20 * 60 * 1000) + errorText(state.youtube.lastError),
          inline: false,
        }
      )
      .setFooter({ text: 'Durum bilgisi yerel monitör hafızasından okunuyor' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
