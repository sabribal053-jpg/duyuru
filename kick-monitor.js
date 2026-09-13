require('dotenv').config();
const axios = require('axios');
const { EmbedBuilder, WebhookClient } = require('discord.js');
const { loadState, updateState, claimNotification, releaseNotification } = require('./monitor-state');
const { logEvent } = require('./bot-logger');

// Konfigürasyon
const CONFIG = {
  KICK_USERNAME: 'burakcandilmac',
  CHECK_INTERVAL: Math.min(60, Math.max(10, Number(process.env.KICK_CHECK_INTERVAL_SECONDS) || 30)) * 1000, // varsayılan 30 saniye
  DISCORD_KICK_WEBHOOK_URL: process.env.DISCORD_KICK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL,
};

// Webhook URL kontrolü
if (!CONFIG.DISCORD_KICK_WEBHOOK_URL) {
  console.error('❌ DISCORD_KICK_WEBHOOK_URL .env dosyasında bulunamadı!');
  console.log('💡 Lütfen bot.js ile önce botu çalıştırın:');
  console.log('   npm start');
  process.exit(1);
}

// Durum takibi: son yayın oturumu diske kaydedilir.
const savedKickState = loadState().kick;
let lastStreamStatus = Boolean(savedKickState.isLive);
let lastStreamId = savedKickState.streamId || null;
let activeNotificationKey = savedKickState.notificationKey || null;
let isChecking = false;

async function checkKickStream() {
  if (isChecking) return;
  isChecking = true;
  const checkedAt = new Date().toISOString();

  try {
    const response = await axios.get(
      `https://kick.com/api/v1/channels/${CONFIG.KICK_USERNAME}`,
      { timeout: 20000 }
    );

    // API direkt kanal objesini döndürüyor; yayın yoksa livestream null olur.
    const channel = response.data;
    if (!channel || typeof channel !== 'object' || !Object.prototype.hasOwnProperty.call(channel, 'livestream')) {
      updateState('kick', {
        lastCheckAt: checkedAt,
        lastError: 'Kick API beklenmeyen veri döndürdü',
      });
      console.log('⚠️ Kick API beklenmeyen veri döndürdü. Sonra tekrar deneyeceğiz...');
      return;
    }

    const stream = channel.livestream;
    const isLive = Boolean(stream);
    const streamId = stream?.id == null ? null : String(stream.id);
    const isNewStream = isLive && !lastStreamStatus;

    if (isNewStream) {
      const sessionMarker = stream?.started_at || stream?.created_at || 'active';
      const notificationKey = 'kick:' + CONFIG.KICK_USERNAME + ':session:' + sessionMarker;
      if (!claimNotification(notificationKey)) {
        lastStreamStatus = true;
        lastStreamId = streamId || lastStreamId;
        activeNotificationKey = notificationKey;
        updateState('kick', { isLive: true, streamId: lastStreamId, notificationKey: activeNotificationKey, lastCheckAt: checkedAt, lastError: null });
        console.log('ℹ️ Aynı Kick bildirimi daha önce işlendi; tekrar gönderilmedi.');
        return;
      }

      const sent = await sendDiscordNotification(channel);
      if (!sent) {
        releaseNotification(notificationKey);
        activeNotificationKey = null;
      } else {
        activeNotificationKey = notificationKey;
      }

      if (sent) {
        lastStreamStatus = true;
        lastStreamId = streamId;
        updateState('kick', {
          isLive: true,
          streamId,
          notificationKey: activeNotificationKey,
          lastCheckAt: checkedAt,
          lastNotificationAt: checkedAt,
          lastError: null,
        });
        await logEvent('kick', 'Kick yayını duyuruldu.', {
          Kanal: CONFIG.KICK_USERNAME,
          İzleyici: stream.viewers || 0,
        });
      } else {
        updateState('kick', {
          lastCheckAt: checkedAt,
          lastError: 'Discord Kick bildirimi gönderilemedi',
        });
      }
    } else if (!isLive) {
      if (lastStreamStatus) {
        console.log(`🔴 ${CONFIG.KICK_USERNAME} yayını sonlandırdı`);
      }
      if (activeNotificationKey) releaseNotification(activeNotificationKey);
      activeNotificationKey = null;

      lastStreamStatus = false;
      lastStreamId = null;
      updateState('kick', {
        isLive: false,
        streamId: null,
        notificationKey: null,
        lastCheckAt: checkedAt,
        lastError: null,
      });
    } else {
      // Aynı yayın devam ediyor; bildirim gönderme, sadece son kontrolü güncelle.
      lastStreamStatus = true;
      lastStreamId = streamId || lastStreamId;
      updateState('kick', {
        isLive: true,
        streamId: lastStreamId,
        lastCheckAt: checkedAt,
        lastError: null,
      });
    }
  } catch (error) {
    updateState('kick', {
      lastCheckAt: checkedAt,
      lastError: error.message,
    });
    console.error('❌ Kick kontrol hatası:', error.message);
  } finally {
    isChecking = false;
  }
}

async function sendDiscordNotification(channel) {
  const stream = channel.livestream;
  const streamUrl = `https://kick.com/${CONFIG.KICK_USERNAME}`;
  const thumbnailUrl = stream.thumbnail?.url || stream.thumbnail;

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('🔴 BURAK YAYINDA!')
    .setDescription(stream.title || 'Yayın başladı! Hemen katılın')
    .setURL(streamUrl)
    .addFields(
      { name: 'Kanal', value: `[@${channel.user?.username || CONFIG.KICK_USERNAME}](${streamUrl})`, inline: true },
      { name: 'İzleyici', value: `${stream.viewers || 0} kişi`, inline: true },
      { name: 'Kategori', value: stream.category?.name || 'Bilinmiyor', inline: true },
      { name: 'Yayını İzle', value: `[Kick'te Aç](${streamUrl})`, inline: false }
    )
    .setTimestamp();

  if (thumbnailUrl) {
    embed.setImage(thumbnailUrl);
  }

  try {
    const webhook = new WebhookClient({ url: CONFIG.DISCORD_KICK_WEBHOOK_URL });
    await webhook.send({
      content: '@everyone',
      embeds: [embed],
    });
    console.log('✅ Duyuru gönderildi (Webhook)');
    return true;
  } catch (error) {
    console.error('❌ Discord mesaj gönderme hatası:', error.message);
    return false;
  }
}

// Uygulamayı başlat
console.log(`🎬 Kick Monitor başlatıldı`);
console.log(`📺 Kanal: ${CONFIG.KICK_USERNAME}`);
console.log(`⏰ Kontrol aralığı: ${CONFIG.CHECK_INTERVAL / 1000} saniye\n`);

// İlk kontrol
checkKickStream();

// Periyodik kontrol
setInterval(checkKickStream, CONFIG.CHECK_INTERVAL);
