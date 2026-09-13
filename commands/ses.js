const {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const {
  configureVoiceChannel,
  disconnectVoice,
  getVoiceStatus,
} = require('../voice-manager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ses')
    .setDescription('Botun ses kanalı bağlantısını yönet')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('gir')
        .setDescription('Botu bir ses kanalına bağla')
        .addChannelOption((option) =>
          option
            .setName('kanal')
            .setDescription('Botun gireceği ses kanalı')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('cik').setDescription('Botu ses kanalından çıkar')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('durum').setDescription('Ses bağlantısı durumunu göster')
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ Bu komut sadece sunucularda kullanılabilir.', ephemeral: true });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: '❌ Bu komutu sadece yöneticiler kullanabilir.', ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'gir') {
      const channel = interaction.options.getChannel('kanal', true);
      try {
        const connectedChannel = await configureVoiceChannel(interaction.guild, channel);
        await interaction.reply({ content: '✅ Bot artık ' + connectedChannel + ' ses kanalında.', ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: '❌ Ses kanalına bağlanılamadı: ' + error.message, ephemeral: true });
      }
      return;
    }

    if (subcommand === 'cik') {
      disconnectVoice(interaction.guildId);
      await interaction.reply({ content: '✅ Bot ses kanalından çıkarıldı.', ephemeral: true });
      return;
    }

    const status = getVoiceStatus(interaction.guildId);
    const channelText = status.channelId ? '<#' + status.channelId + '>' : 'Ayarlanmadı';
    const embed = new EmbedBuilder()
      .setColor(status.connected ? '#57f287' : '#fee75c')
      .setTitle('🔊 Ses Bağlantısı')
      .addFields(
        { name: 'Durum', value: status.connected ? 'Bağlı' : status.enabled ? 'Bağlanması bekleniyor' : 'Kapalı', inline: true },
        { name: 'Kanal', value: channelText, inline: true },
      )
      .setTimestamp();
    if (status.lastError) embed.addFields({ name: 'Son hata', value: status.lastError.slice(0, 1024), inline: false });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
