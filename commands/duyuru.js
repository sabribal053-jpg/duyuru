const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duyuru')
    .setDescription('Bir duyuru gönder')
    .addChannelOption((option) =>
      option
        .setName('kanal')
        .setDescription('Duyurunun gönderileceği kanal')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('baslik')
        .setDescription('Duyuru başlığı')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('aciklama')
        .setDescription('Duyuru açıklaması')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel('kanal');
    const title = interaction.options.getString('baslik');
    const description = interaction.options.getString('aciklama');

    const embed = new EmbedBuilder()
      .setColor('#00b4ff')
      .setTitle(title)
      .setDescription(description)
      .setTimestamp()
      .setFooter({ text: 'Duyuru botu tarafından gönderildi' });

    try {
      await channel.send({ embeds: [embed] });
      await interaction.reply({
        content: `✅ Duyuru başarıyla ${channel} kanalına gönderildi!`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Duyuru gönderme hatası:', error);
      await interaction.reply({
        content: '❌ Duyuru gönderilirken bir hata oluştu!',
        ephemeral: true,
      });
    }
  },
};
