require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ChannelType, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('./bot-logger');
const { reconnectConfiguredVoice } = require('./voice-manager');

const token = process.env.DISCORD_TOKEN?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();
const missingEnvironment = [];

if (!token || token === 'your_token_here') missingEnvironment.push('DISCORD_TOKEN');
if (!guildId || guildId === 'your_guild_id_here') missingEnvironment.push('DISCORD_GUILD_ID');

if (missingEnvironment.length > 0) {
  console.error('❌ Eksik Discord ayarları: ' + missingEnvironment.join(', '));
  console.error('Proje klasöründeki .env dosyasını kontrol edin.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

function reportBackgroundError(source, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('❌ ' + source + ':', message);
  void logEvent('error', source + ' hatası.', { Hata: message }).catch((logError) => {
    console.error('❌ Arka plan hata kaydı gönderilemedi:', logError.message);
  });
}

client.on('error', (error) => reportBackgroundError('Discord istemcisi', error));
client.on('shardError', (error) => reportBackgroundError('Discord bağlantı katmanı', error));
process.on('unhandledRejection', (error) => reportBackgroundError('Yakalanmamış Promise hatası', error));

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

async function registerSlashCommands(guild) {
  try {
    const commandData = [...client.commands.values()].map((command) => command.data.toJSON());
    await guild.commands.set(commandData);
    console.log('✅ Slash komutları otomatik kaydedildi: ' + commandData.map((command) => '/' + command.name).join(', '));
  } catch (error) {
    reportBackgroundError('Slash komutları kaydedilemedi', error);
  }
}

client.once('ready', async () => {
  try {
    const statusText = (process.env.DISCORD_STATUS_TEXT || 'Duyuruları takip ediyor').trim().slice(0, 128);
    client.user.setPresence({
      status: 'dnd',
      activities: [{ name: statusText || 'Duyuruları takip ediyor', type: ActivityType.Watching }],
    });
    console.log('🔕 Discord durumu: Rahatsız Etmeyin - ' + (statusText || 'Duyuruları takip ediyor'));

    console.log(`✅ Bot başlatıldı: ${client.user.tag}`);
    console.log(`📝 ${client.commands.size} komut yüklendi`);

    const guild = getTargetGuild();
    if (!guild) return;

    await registerSlashCommands(guild);
    await setupMonitorAnnouncementChannels(guild);
    await setupBotLogChannel(guild);
    await reconnectConfiguredVoice(guild);
    await logEvent('startup', 'Bot Discord’a başarıyla bağlandı.', {
      Sunucu: guild.name,
    });
  } catch (error) {
    reportBackgroundError('Bot başlangıç hazırlığı', error);
  }
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
  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    console.error('❌ DISCORD_GUILD_ID botun bulunduğu sunucular arasında bulunamadı.');
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

async function findOrCreateAnnouncementCategory(guild) {
  const categoryType = ChannelType.GuildCategory;
  const configuredCategoryId = process.env.DISCORD_ANNOUNCEMENT_CATEGORY_ID?.trim();
  let category = configuredCategoryId
    ? await guild.channels.fetch(configuredCategoryId).catch(() => null)
    : null;

  if (!category || category.type !== categoryType) {
    const channels = await guild.channels.fetch();
    category = channels.find(
      (item) => item.type === categoryType && item.name.toLowerCase() === 'duyuru'
    );
  }

  if (!category) {
    category = await guild.channels.create({
      name: 'Duyuru',
      type: categoryType,
      reason: 'Duyuru kanalları kategorisi',
    });
    console.log('✅ Duyuru kategorisi oluşturuldu.');
  }

  saveEnvValues({ DISCORD_ANNOUNCEMENT_CATEGORY_ID: category.id });
  return category;
}

async function findOrCreateTextChannel(guild, channelName, topic, savedChannelId, parentCategory) {
  const channelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
  let channel = null;

  if (savedChannelId) {
    channel = await guild.channels.fetch(savedChannelId).catch(() => null);
    if (channel && !channelTypes.includes(channel.type)) channel = null;
  }

  if (!channel) {
    const channels = await guild.channels.fetch();
    channel = channels.find(
      (item) => item.name === channelName && channelTypes.includes(item.type)
    );
  }

  if (!channel) {
    console.log('📝 "' + channelName + '" kanalı oluşturuluyor...');
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic,
      parent: parentCategory?.id,
      reason: 'Duyuru Botu Kurulumu',
    });
    console.log('✅ "' + channelName + '" kanalı başarıyla oluşturuldu!');
  } else if (parentCategory && channel.parentId !== parentCategory.id) {
    await channel.setParent(parentCategory.id, {
      lockPermissions: false,
      reason: 'Duyuru kanallarını Duyuru kategorisinde toplama',
    });
    console.log('✅ "' + channelName + '" kanalı Duyuru kategorisine taşındı.');
  } else {
    console.log('✅ Mevcut #' + channel.name + ' kanalı kullanılıyor.');
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

// Monitör kanallarını oluştur veya mevcut kanalları bul
async function setupMonitorAnnouncementChannel(guild, parentCategory, options) {
  try {
    const channel = await findOrCreateTextChannel(
      guild,
      options.channelName,
      options.topic,
      process.env[options.channelEnv]?.trim(),
      parentCategory
    );
    const webhook = await findOrCreateWebhook(channel, options.webhookName, options.reason);
    const envValues = {
      [options.channelEnv]: channel.id,
      [options.webhookEnv]: webhook.url,
    };
    if (options.legacyWebhookEnv) envValues[options.legacyWebhookEnv] = webhook.url;
    saveEnvValues(envValues);
    console.log('✅ #' + options.channelName + ' ayarları hazır!');
  } catch (error) {
    console.error('❌ #' + options.channelName + ' kanalı oluşturma hatası:', error.message);
    await logEvent('error', options.channelName + ' kanalı hazırlanamadı.', { Hata: error.message });
  }
}

async function setupMonitorAnnouncementChannels(guild) {
  try {
    const category = await findOrCreateAnnouncementCategory(guild);
    await setupMonitorAnnouncementChannel(guild, category, {
      channelName: 'kick-duyuru',
      topic: '🎬 Kick yayın duyuruları',
      channelEnv: 'DISCORD_KICK_CHANNEL_ID',
      webhookEnv: 'DISCORD_KICK_WEBHOOK_URL',
      legacyWebhookEnv: 'DISCORD_WEBHOOK_URL',
      webhookName: 'Kick Monitor',
      reason: 'Kick Duyuru Botu Webhook',
    });
    await setupMonitorAnnouncementChannel(guild, category, {
      channelName: 'youtube-duyuru',
      topic: '▶️ YouTube video duyuruları',
      channelEnv: 'DISCORD_YOUTUBE_CHANNEL_ID',
      webhookEnv: 'DISCORD_YOUTUBE_WEBHOOK_URL',
      webhookName: 'YouTube Monitor',
      reason: 'YouTube Duyuru Botu Webhook',
    });
    await setupMonitorAnnouncementChannel(guild, category, {
      channelName: 'tiktok-duyuru',
      topic: '🎵 TikTok video duyuruları',
      channelEnv: 'DISCORD_TIKTOK_CHANNEL_ID',
      webhookEnv: 'DISCORD_TIKTOK_WEBHOOK_URL',
      webhookName: 'TikTok Monitor',
      reason: 'TikTok Duyuru Botu Webhook',
    });
  } catch (error) {
    console.error('❌ Duyuru kategorisi hazırlanamadı:', error.message);
    await logEvent('error', 'Duyuru kategorisi hazırlanamadı.', { Hata: error.message });
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
