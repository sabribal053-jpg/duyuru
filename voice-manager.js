const {
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const {
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} = require('@discordjs/voice');
const { loadState, updateState } = require('./monitor-state');
const { logEvent } = require('./bot-logger');

const voiceChannelTypes = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const reconnectTimers = new Map();
const intentionalDisconnects = new WeakSet();
const recoveringConnections = new WeakSet();

function clearReconnectTimer(guildId) {
  const timer = reconnectTimers.get(guildId);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(guildId);
}

function destroyConnection(connection) {
  if (!connection) return;
  intentionalDisconnects.add(connection);
  connection.destroy();
}

function reportVoiceError(message, error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('❌ ' + message + ':', errorMessage);
  void logEvent('error', message, { Hata: errorMessage }).catch((logError) => {
    console.error('❌ Ses hata kaydı gönderilemedi:', logError.message);
  });
}

function scheduleReconnect(guild) {
  const state = loadState().voice;
  if (!state?.enabled || state.guildId !== guild.id || !state.channelId || reconnectTimers.has(guild.id)) return;

  const timer = setTimeout(async () => {
    reconnectTimers.delete(guild.id);
    await reconnectConfiguredVoice(guild);
  }, 10000);
  reconnectTimers.set(guild.id, timer);
}

async function recoverDisconnectedConnection(connection, guild) {
  if (intentionalDisconnects.has(connection) || recoveringConnections.has(connection)) return;
  recoveringConnections.add(connection);

  try {
    // Discord bazen kısa süreli kopmalarda aynı bağlantıyı kendisi toparlar.
    await Promise.race([
      entersState(connection, VoiceConnectionStatus.Signalling, 5000),
      entersState(connection, VoiceConnectionStatus.Connecting, 5000),
    ]);
    await entersState(connection, VoiceConnectionStatus.Ready, 15000);
    updateState('voice', { lastConnectedAt: new Date().toISOString(), lastError: null });
    console.log('✅ Discord ses bağlantısı otomatik olarak toparlandı.');
  } catch (error) {
    if (!intentionalDisconnects.has(connection)) {
      reportVoiceError('Discord ses bağlantısı koptu, yeniden bağlanılıyor', error);
      destroyConnection(connection);
      scheduleReconnect(guild);
    }
  } finally {
    recoveringConnections.delete(connection);
  }
}

function bindConnection(connection, guild) {
  connection.on('error', (error) => {
    updateState('voice', { lastError: error.message });
    reportVoiceError('Discord ses bağlantısı hatası', error);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    void recoverDisconnectedConnection(connection, guild);
  });
}

async function resolveVoiceChannel(guild, channelId) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !voiceChannelTypes.includes(channel.type)) {
    throw new Error('Seçilen kanal geçerli bir ses kanalı değil veya bulunamadı.');
  }

  const permissions = guild.members.me ? channel.permissionsFor(guild.members.me) : null;
  if (permissions && !permissions.has(PermissionFlagsBits.Connect)) {
    throw new Error('Botun bu ses kanalına bağlanma izni yok.');
  }
  return channel;
}

async function connectToVoiceChannel(guild, channelId) {
  const channel = await resolveVoiceChannel(guild, channelId);
  clearReconnectTimer(guild.id);

  const existingConnection = getVoiceConnection(guild.id);
  if (existingConnection) destroyConnection(existingConnection);

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });
  bindConnection(connection, guild);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15000);
    updateState('voice', {
      enabled: true,
      guildId: guild.id,
      channelId: channel.id,
      channelName: channel.name,
      lastConnectedAt: new Date().toISOString(),
      lastError: null,
    });
    return channel;
  } catch (error) {
    destroyConnection(connection);
    updateState('voice', { lastError: error.message });
    throw error;
  }
}

async function configureVoiceChannel(guild, channel) {
  updateState('voice', {
    enabled: true,
    guildId: guild.id,
    channelId: channel.id,
    channelName: channel.name,
    lastError: null,
  });
  return connectToVoiceChannel(guild, channel.id);
}

function disconnectVoice(guildId) {
  clearReconnectTimer(guildId);
  const connection = getVoiceConnection(guildId);
  if (connection) destroyConnection(connection);
  updateState('voice', { enabled: false, lastError: null });
}

async function reconnectConfiguredVoice(guild) {
  const state = loadState().voice;
  if (!state?.enabled || state.guildId !== guild.id || !state.channelId) return null;

  try {
    return await connectToVoiceChannel(guild, state.channelId);
  } catch (error) {
    reportVoiceError('Kayıtlı ses kanalına bağlanılamadı', error);
    scheduleReconnect(guild);
    return null;
  }
}

function getVoiceStatus(guildId) {
  const state = loadState().voice;
  const connection = guildId ? getVoiceConnection(guildId) : null;
  return {
    ...state,
    connected: Boolean(connection && connection.state.status === VoiceConnectionStatus.Ready),
  };
}

module.exports = {
  configureVoiceChannel,
  disconnectVoice,
  getVoiceStatus,
  reconnectConfiguredVoice,
  resolveVoiceChannel,
};
