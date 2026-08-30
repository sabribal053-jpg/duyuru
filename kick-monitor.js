require('dotenv').config();
const axios = require('axios');
const { EmbedBuilder, WebhookClient } = require('discord.js');

// Konfigürasyon
const CONFIG = {
  KICK_USERNAME: 'burakcandilmac',
  CHECK_INTERVAL: 2 * 60 * 1000, // 2 dakika
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
};

// Webhook URL kontrolü
if (!CONFIG.DISCORD_WEBHOOK_URL) {
  console.error('❌ DISCORD_WEBHOOK_URL .env dosyasında bulunamadı!');
  console.log('💡 Lütfen bot.js ile önce botu çalıştırın:');
  console.log('   npm start');
  process.exit(1);
}

// Durum takibi: ilk kontrol offline ise sonraki yayın yine bildirilir.
let lastStreamStatus = false;

async function checkKickStream() {
  try {
    const response = await axios.get(
      `https://kick.com/api/v1/channels/${CONFIG.KICK_USERNAME}`
    );

    // API direkt kanal objesini döndürüyor; yayın yoksa livestream null olur.
    const channel = response.data;
    if (!channel || typeof channel !== 'object' || !Object.prototype.hasOwnProperty.call(channel, 'livestream')) {
      console.log('⚠️ Kick API beklenmeyen veri döndürdü. Sonra tekrar deneyeceğiz...');
      return;
    }

    const stream = channel.livestream;
    const isLive = Boolean(stream);

    if (isLive && !lastStreamStatus) {
      const sent = await sendDiscordNotification(channel);
      if (sent) {
        lastStreamStatus = true;
      }
    } else if (!isLive && lastStreamStatus) {
      lastStreamStatus = false;
      console.log(`🔴 ${CONFIG.KICK_USERNAME} yayını sonlandırdı`);
    }
  } catch (error) {
    console.error('❌ Kick kontrol hatası:', error.message);
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
    const webhook = new WebhookClient({ url: CONFIG.DISCORD_WEBHOOK_URL });
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
