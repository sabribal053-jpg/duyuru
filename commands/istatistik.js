const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadState } = require('../monitor-state');

const eventNames = {
  manual: '📢 Manuel',
  kick: '🔴 Kick',
  youtube: '▶️ YouTube',
  error: '❌ Hata',
  startup: '✅ Başlangıç',
};

function formatDate(value) {
  if (!value) return 'Henüz yok';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Bilinmiyor' : date.toLocaleString('tr-TR');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('istatistik')
    .setDescription('Botun duyuru istatistiklerini ve son olaylarını gösterir')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const state = loadState();
    const stats = state.stats;
    const recentEvents = state.events.slice(0, 5);
    const eventText = recentEvents.length > 0
      ? recentEvents.map((event) => {
          const name = eventNames[event.type] || event.type;
          return name + ' • ' + formatDate(event.occurredAt) + '\n' + event.message.slice(0, 180);
        }).join('\n\n')
      : 'Henüz olay kaydı yok.';

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('📈 Duyuru Botu İstatistikleri')
      .addFields(
        {
          name: 'Toplam Duyuru',
          value: String(stats.totalAnnouncements),
          inline: true,
        },
        {
          name: 'Manuel',
          value: String(stats.manualAnnouncements),
          inline: true,
        },
        {
          name: 'Kick',
          value: String(stats.kickNotifications),
          inline: true,
        },
        {
          name: 'YouTube',
          value: String(stats.youtubeNotifications),
          inline: true,
        },
        {
          name: 'Son Duyuru',
          value: formatDate(stats.lastAnnouncementAt),
          inline: false,
        },
        {
          name: 'Son 5 Olay',
          value: eventText.slice(0, 1024),
          inline: false,
        }
      )
      .setFooter({ text: 'İstatistikler proje klasöründe yerel olarak tutuluyor' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
