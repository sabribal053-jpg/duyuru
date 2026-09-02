const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { logEvent } = require('../bot-logger');
const { DEFAULT_SETTINGS, getGuildSettings } = require('../settings-store');

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
    .addStringOption((option) =>
      option
        .setName('resim')
        .setDescription('Embed görseli için HTTPS URL (isteğe bağlı)')
        .setMaxLength(2048)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel('kanal');
    const title = interaction.options.getString('baslik')?.trim();
    const description = interaction.options.getString('aciklama')?.trim();
    const imageUrl = interaction.options.getString('resim')?.trim();

    if (!title || !description) {
      await interaction.reply({
        content: '❌ Başlık ve açıklama boş bırakılamaz.',
        ephemeral: true,
      });
      return;
    }

    if (imageUrl) {
      try {
        const parsedUrl = new URL(imageUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Geçersiz protokol');
      } catch {
        await interaction.reply({
          content: '❌ Görsel adresi geçerli bir HTTP veya HTTPS URL olmalı.',
          ephemeral: true,
        });
        return;
      }
    }

    const settings = getGuildSettings(interaction.guildId);
    const embedColor = /^#[0-9a-fA-F]{6}$/.test(settings.embedColor)
      ? settings.embedColor
      : DEFAULT_SETTINGS.embedColor;
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    if (settings.footerText) embed.setFooter({ text: settings.footerText });
    if (imageUrl) embed.setImage(imageUrl);

    const payload = {
      embeds: [embed],
      allowedMentions: { parse: [] },
    };
    const mentionText = {
      everyone: '@everyone',
      here: '@here',
    }[settings.mention];
    if (mentionText) {
      payload.content = mentionText;
      payload.allowedMentions = { parse: ['everyone'] };
    }

    try {
      await channel.send(payload);
      await logEvent('manual', interaction.user.tag + ' manuel duyuru gönderdi.', {
        Kanal: channel.name,
        Başlık: title,
        Görsel: imageUrl ? 'Var' : 'Yok',
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
