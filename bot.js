require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();

// Komutları yükle
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  console.log(`✅ Bot başlatıldı: ${client.user.tag}`);
  console.log(`📝 ${client.commands.size} komut yüklendi`);
  
  // Kick Duyuru kanalını oluştur
  await setupKickAnnouncementChannel();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('Komut hatası:', error);
    await interaction.reply({
      content: '❌ Komut çalıştırılırken bir hata oluştu!',
      ephemeral: true,
    });
  }
});

// Kick Duyuru Kanalı Oluştur
async function setupKickAnnouncementChannel() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.log('⚠️ Bot henüz bir sunucuya eklenmedi');
      return;
    }

    const channelName = 'kick-duyuru';
    let channel = guild.channels.cache.find(ch => ch.name === channelName && ch.type === ChannelType.GuildText);

    if (!channel) {
      console.log(`📝 "${channelName}" kanalı oluşturuluyor...`);
      channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: '🎬 Kick yayın duyuruları - Burak yayına başladığında otomatik duyuru alırsınız',
        reason: 'Kick Duyuru Botu Kurulumu',
      });
      console.log(`✅ "${channelName}" kanalı başarıyla oluşturuldu!`);
    }

    // Webhook oluştur veya mevcut webhook'u bul
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(w => w.name === 'Kick Monitor');

    if (!webhook) {
      console.log('🔗 Webhook oluşturuluyor...');
      webhook = await channel.createWebhook({
        name: 'Kick Monitor',
        reason: 'Kick Duyuru Botu Webhook',
      });
      console.log('✅ Webhook başarıyla oluşturuldu!');
    }

    // .env dosyasını güncelle
    const webhookUrl = webhook.url;
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');

    if (!envContent.includes('DISCORD_WEBHOOK_URL=')) {
      envContent += `\nDISCORD_WEBHOOK_URL=${webhookUrl}`;
    } else {
      envContent = envContent.replace(
        /DISCORD_WEBHOOK_URL=.*/,
        `DISCORD_WEBHOOK_URL=${webhookUrl}`
      );
    }

    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env dosyası güncellendi!');
    console.log('\n🎯 Kick Duyuru Sistemi hazır!');
    console.log(`   Kanal: #${channel.name}`);
    console.log(`   Webhook: Aktif\n`);

  } catch (error) {
    console.error('❌ Kanal oluşturma hatası:', error.message);
  }
}

client.login(process.env.DISCORD_TOKEN);
