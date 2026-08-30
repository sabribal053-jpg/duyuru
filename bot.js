require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const token = process.env.DISCORD_TOKEN?.trim();

if (!token || token === 'your_token_here') {
  console.error('❌ DISCORD_TOKEN bulunamadı. Proje klasöründeki .env dosyasını kontrol edin.');
  process.exit(1);
}

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

  if (!command.data?.name || typeof command.execute !== 'function') {
    console.error(`⚠️ Geçersiz komut dosyası atlandı: ${file}`);
    continue;
  }

  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  console.log(`✅ Bot başlatıldı: ${client.user.tag}`);
  console.log(`📝 ${client.commands.size} komut yüklendi`);

  await setupKickAnnouncementChannel();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('❌ Komut hatası:', error);

    try {
      const reply = { content: '❌ Komut çalıştırılırken bir hata oluştu!', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (replyError) {
      console.error('❌ Hata mesajı gönderilemedi:', replyError.message);
    }
  }
});

// Kick Duyuru Kanalı Oluştur
async function setupKickAnnouncementChannel() {
  try {
    const configuredGuildId = process.env.DISCORD_GUILD_ID?.trim();
    const guild = (configuredGuildId && client.guilds.cache.get(configuredGuildId)) || client.guilds.cache.first();

    if (!guild) {
      console.log('⚠️ Bot henüz bir sunucuya eklenmedi');
      return;
    }

    if (configuredGuildId && guild.id !== configuredGuildId) {
      console.warn('⚠️ DISCORD_GUILD_ID botun bulunduğu sunucular arasında bulunamadı; ilk sunucu kullanılacak.');
    }

    const channelName = 'kick-duyuru';
    let channel = guild.channels.cache.find(
      (ch) => ch.name === channelName && ch.type === ChannelType.GuildText
    );

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
    let webhook = webhooks.find((item) => item.name === 'Kick Monitor');

    if (!webhook) {
      console.log('🔗 Webhook oluşturuluyor...');
      webhook = await channel.createWebhook({
        name: 'Kick Monitor',
        reason: 'Kick Duyuru Botu Webhook',
      });
      console.log('✅ Webhook başarıyla oluşturuldu!');
    }

    // .env dosyasını güvenli şekilde güncelle
    const webhookLine = 'DISCORD_WEBHOOK_URL=' + webhook.url;
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    if (/^DISCORD_WEBHOOK_URL\s*=.*$/m.test(envContent)) {
      envContent = envContent.replace(/^DISCORD_WEBHOOK_URL\s*=.*$/m, () => webhookLine);
    } else {
      envContent = envContent.replace(/\s*$/, '') + '\n' + webhookLine + '\n';
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ .env dosyası güncellendi!');
    console.log('\n🎯 Kick Duyuru Sistemi hazır!');
    console.log(`   Kanal: #${channel.name}`);
    console.log('   Webhook: Aktif\n');
  } catch (error) {
    console.error('❌ Kanal oluşturma hatası:', error.message);
  }
}

client.login(token).catch((error) => {
  if (error.code === 'TokenInvalid') {
    console.error('❌ Discord token geçersiz. Developer Portal’dan yeni token alıp .env dosyasını güncelleyin.');
  } else {
    console.error('❌ Discord’a bağlanılamadı:', error.message);
  }
  process.exitCode = 1;
});
