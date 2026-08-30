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

function setEnvValue(content, key, value) {
  const lines = content.split(/\r?\n/);
  const prefix = key + '=';
  const index = lines.findIndex((line) => line.trimStart().startsWith(prefix));
  const newLine = prefix + value;

  if (index === -1) {
    const base = content.replace(/\s*$/, '');
    return base ? base + '\n' + newLine + '\n' : newLine + '\n';
  }

  lines[index] = newLine;
  return lines.join('\n');
}

// Kick Duyuru Kanalı Oluştur veya mevcut kanalı bul
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
    const channelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
    const savedChannelId = process.env.DISCORD_KICK_CHANNEL_ID?.trim();
    let channel = null;

    // Önce .env içindeki ID ile bul; isim değişse bile aynı kanal korunur.
    if (savedChannelId) {
      channel = await guild.channels.fetch(savedChannelId).catch(() => null);
      if (channel && !channelTypes.includes(channel.type)) {
        channel = null;
      }
    }

    // ID yoksa veya kanal silindiyse Discord'dan güncel kanal listesini çek.
    if (!channel) {
      const channels = await guild.channels.fetch();
      channel = channels.find(
        (item) => item.name === channelName && channelTypes.includes(item.type)
      );
    }

    if (!channel) {
      console.log(`📝 "${channelName}" kanalı oluşturuluyor...`);
      channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: '🎬 Kick yayın duyuruları - Burak yayına başladığında otomatik duyuru alırsınız',
        reason: 'Kick Duyuru Botu Kurulumu',
      });
      console.log(`✅ "${channelName}" kanalı başarıyla oluşturuldu!`);
    } else {
      console.log(`✅ Mevcut #${channel.name} kanalı kullanılıyor.`);
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

    // Kanal ID'sini ve webhook'u yerelde hatırla; sonraki açılışta tekrar kanal oluşturulmaz.
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    envContent = setEnvValue(envContent, 'DISCORD_KICK_CHANNEL_ID', channel.id);
    envContent = setEnvValue(envContent, 'DISCORD_WEBHOOK_URL', webhook.url);
    fs.writeFileSync(envPath, envContent, 'utf8');

    process.env.DISCORD_KICK_CHANNEL_ID = channel.id;
    process.env.DISCORD_WEBHOOK_URL = webhook.url;

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
