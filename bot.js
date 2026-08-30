require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('./bot-logger');

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

  const guild = getTargetGuild();
  await setupKickAnnouncementChannel(guild);
  await setupBotLogChannel(guild);
  await logEvent('startup', 'Bot Discord’a başarıyla bağlandı.', {
    Sunucu: guild?.name || 'Bilinmiyor',
  });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('❌ Komut hatası:', error);
    await logEvent('error', 'Komut çalıştırılırken hata oluştu.', {
      Komut: interaction.commandName,
      Hata: error.message,
    });

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

function getTargetGuild() {
  const configuredGuildId = process.env.DISCORD_GUILD_ID?.trim();
  const guild = (configuredGuildId && client.guilds.cache.get(configuredGuildId)) || client.guilds.cache.first();

  if (configuredGuildId && guild && guild.id !== configuredGuildId) {
    console.warn('⚠️ DISCORD_GUILD_ID botun bulunduğu sunucular arasında bulunamadı; ilk sunucu kullanılacak.');
  }

  return guild;
}

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

function saveEnvValues(values) {
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  for (const [key, value] of Object.entries(values)) {
    envContent = setEnvValue(envContent, key, value);
    process.env[key] = value;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
}

async function findOrCreateTextChannel(guild, channelName, topic, savedChannelId) {
  const channelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
  let channel = null;

  if (savedChannelId) {
    channel = await guild.channels.fetch(savedChannelId).catch(() => null);
    if (channel && !channelTypes.includes(channel.type)) {
      channel = null;
    }
  }

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
      topic,
      reason: 'Duyuru Botu Kurulumu',
    });
    console.log(`✅ "${channelName}" kanalı başarıyla oluşturuldu!`);
  } else {
    console.log(`✅ Mevcut #${channel.name} kanalı kullanılıyor.`);
  }

  return channel;
}

async function findOrCreateWebhook(channel, webhookName, reason) {
  const webhooks = await channel.fetchWebhooks();
  let webhook = webhooks.find((item) => item.name === webhookName);

  if (!webhook) {
    console.log(`🔗 ${webhookName} webhook'u oluşturuluyor...`);
    webhook = await channel.createWebhook({
      name: webhookName,
      reason,
    });
    console.log(`✅ ${webhookName} webhook'u oluşturuldu!`);
  }

  return webhook;
}

// Kick Duyuru Kanalı Oluştur veya mevcut kanalı bul
async function setupKickAnnouncementChannel(guild) {
  try {
    if (!guild) {
      console.log('⚠️ Bot henüz bir sunucuya eklenmedi');
      return;
    }

    const channel = await findOrCreateTextChannel(
      guild,
      'kick-duyuru',
      '🎬 Kick yayın duyuruları - Burak yayına başladığında otomatik duyuru alırsınız',
      process.env.DISCORD_KICK_CHANNEL_ID?.trim()
    );
    const webhook = await findOrCreateWebhook(
      channel,
      'Kick Monitor',
      'Kick Duyuru Botu Webhook'
    );

    saveEnvValues({
      DISCORD_KICK_CHANNEL_ID: channel.id,
      DISCORD_WEBHOOK_URL: webhook.url,
    });

    console.log('✅ Kick duyuru ayarları hazır!');
  } catch (error) {
    console.error('❌ Kick kanal oluşturma hatası:', error.message);
    await logEvent('error', 'Kick duyuru kanalı hazırlanamadı.', { Hata: error.message });
  }
}

// Bot log kanalı oluştur veya mevcut kanalı bul
async function setupBotLogChannel(guild) {
  try {
    if (!guild) return;

    const channel = await findOrCreateTextChannel(
      guild,
      'bot-log',
      '🤖 Duyuru botu olay ve hata kayıtları',
      process.env.DISCORD_LOG_CHANNEL_ID?.trim()
    );
    const webhook = await findOrCreateWebhook(
      channel,
      'Bot Logger',
      'Duyuru Botu Log Webhook'
    );

    saveEnvValues({
      DISCORD_LOG_CHANNEL_ID: channel.id,
      DISCORD_LOG_WEBHOOK_URL: webhook.url,
    });

    console.log('✅ Bot log ayarları hazır!');
  } catch (error) {
    console.error('❌ Bot log kanalı oluşturma hatası:', error.message);
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
