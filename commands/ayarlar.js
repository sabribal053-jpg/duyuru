const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings, saveGuildSettings } = require('../settings-store');
const { logEvent } = require('../bot-logger');

const mentionLabels = {
  none: 'Hiç kimse',
  everyone: '@everyone',
  here: '@here',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ayarlar')
    .setDescription('Duyuru görünümünü ve mention ayarlarını yönet')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand.setName('goster').setDescription('Mevcut duyuru ayarlarını göster')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('renk')
        .setDescription('Embed rengini değiştir')
        .addStringOption((option) =>
          option.setName('hex').setDescription('Örnek: #00b4ff').setMaxLength(7).setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('footer')
        .setDescription('Embed alt bilgisini değiştir')
        .addStringOption((option) =>
          option.setName('metin').setDescription('Kapatmak için yok yazın').setMaxLength(2048).setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('mention')
        .setDescription('Duyurularda mention hedefini değiştir')
        .addStringOption((option) =>
          option
            .setName('hedef')
            .setDescription('Mention hedefi')
            .setRequired(true)
            .addChoices(
              { name: 'Hiç kimse', value: 'none' },
              { name: '@everyone', value: 'everyone' },
              { name: '@here', value: 'here' },
            )
        )
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

    const action = interaction.options.getSubcommand();
    const current = getGuildSettings(interaction.guildId);

    if (action === 'goster') {
      const embed = new EmbedBuilder()
        .setColor(current.embedColor)
        .setTitle('⚙️ Duyuru ayarları')
        .addFields(
          { name: 'Embed rengi', value: current.embedColor, inline: true },
          { name: 'Mention', value: mentionLabels[current.mention] || mentionLabels.none, inline: true },
          { name: 'Footer', value: current.footerText || 'Kapalı' },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (action === 'renk') {
      const input = interaction.options.getString('hex').trim();
      const color = input.startsWith('#') ? input : '#' + input;
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        await interaction.reply({ content: '❌ Geçerli bir HEX renk girin. Örnek: #00b4ff', ephemeral: true });
        return;
      }
      saveGuildSettings(interaction.guildId, { embedColor: color.toLowerCase() });
      await logEvent('settings', interaction.user.tag + ' embed rengini güncelledi.', { Renk: color.toLowerCase() });
      await interaction.reply({ content: '✅ Embed rengi ' + color.toLowerCase() + ' olarak güncellendi.', ephemeral: true });
      return;
    }

    if (action === 'footer') {
      const input = interaction.options.getString('metin').trim();
      const footerText = input.toLowerCase() === 'yok' ? '' : input;
      saveGuildSettings(interaction.guildId, { footerText });
      await logEvent('settings', interaction.user.tag + ' embed footer ayarını güncelledi.', { Footer: footerText || 'Kapalı' });
      await interaction.reply({ content: footerText ? '✅ Embed footer güncellendi.' : '✅ Embed footer kapatıldı.', ephemeral: true });
      return;
    }

    if (action === 'mention') {
      const mention = interaction.options.getString('hedef');
      saveGuildSettings(interaction.guildId, { mention });
      await logEvent('settings', interaction.user.tag + ' mention ayarını güncelledi.', { Mention: mentionLabels[mention] });
      await interaction.reply({ content: '✅ Duyuru mention ayarı ' + mentionLabels[mention] + ' olarak güncellendi.', ephemeral: true });
    }
  },
};
