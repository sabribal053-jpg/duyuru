const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { logEvent } = require('../bot-logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duyuru')
    .setDescription('Bir duyuru gönder')
    .addChannelOption((option) =>
      option
        .setName('kanal')
        .setDescription('Duyurunun gönderileceği kanal')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('baslik')
        .setDescription('Duyuru başlığı')
        .setMaxLength(256)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('aciklama')
        .setDescription('Duyuru açıklaması')
        .setMaxLength(4096)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel('kanal');
    const title = interaction.options.getString('baslik')?.trim();
    const description = interaction.options.getString('aciklama')?.trim();

    if (!title || !description) {
      await interaction.reply({
        content: '❌ Başlık ve açıklama boş bırakılamaz.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#00b4ff')
      .setTitle(title)
      .setDescription(description)
      .setTimestamp()
      .setFooter({ text: 'Duyuru botu tarafından gönderildi' });

    try {
      await channel.send({ embeds: [embed] });
      await logEvent('manual', interaction.user.tag + ' manuel duyuru gönderdi.', {
        Kanal: channel.name,
        Başlık: title,
      });
      await interaction.reply({
        content: '✅ Duyuru başarıyla ' + channel + ' kanalına gönderildi!',
        ephemeral: true,
      });
    } catch (error) {
      console.error('❌ Duyuru gönderme hatası:', error);
      await logEvent('error', 'Manuel duyuru gönderilemedi.', {
        Kanal: channel.name,
        Hata: error.message,
      });
      await interaction.reply({
        content: '❌ Duyuru gönderilirken bir hata oluştu. Botun kanalda mesaj gönderme yetkisini kontrol edin.',
        ephemeral: true,
      });
    }
  },
};
