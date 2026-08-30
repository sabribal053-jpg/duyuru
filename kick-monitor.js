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

// Durum takibi
let lastStreamStatus = null;

async function checkKickStream() {
  try {
    const response = await axios.get(
      `https://kick.com/api/v1/channels/${CONFIG.KICK_USERNAME}`
    );

    // API direkt kanal objesini dönüyor, data wrapper'ı yok
    const channel = response.data;
    
    if (!channel || !channel.livestream) {
      console.log('⚠️ Kick API veri döndürmedi. Sonra tekrar deneyeceğiz...');
      return;
    }
    
    const isLive = channel.livestream !== null && channel.livestream !== undefined;

    if (isLive && !lastStreamStatus) {
      // Yayın başladı!
      await sendDiscordNotification(channel);
      lastStreamStatus = true;
    } else if (!isLive && lastStreamStatus) {
      // Yayın bitti
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

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('🔴 BURAK YAYINDA!')
    .setDescription(stream.title || 'Yayın başladı! Hemen katılın')
    .setURL(streamUrl)
    .setImage(stream.thumbnail?.url || stream.thumbnail)
    .addFields(
      { name: 'Kanal', value: `[@${channel.user.username}](${streamUrl})`, inline: true },
      { name: 'İzleyici', value: `${stream.viewers || 0} kişi`, inline: true },
      { name: 'Kategori', value: stream.category?.name || 'Bilinmiyor', inline: true },
      { name: 'Yayını İzle', value: `[Kick'te Aç](${streamUrl})`, inline: false }
    )
    .setTimestamp();

  try {
    // Webhook ile gönder
    if (CONFIG.DISCORD_WEBHOOK_URL) {
      const webhook = new WebhookClient({
        url: CONFIG.DISCORD_WEBHOOK_URL,
      });
      await webhook.send({
        content: '@everyone',
        embeds: [embed],
      });
      console.log(`✅ Duyuru gönderildi (Webhook)`);
    }
  } catch (error) {
    console.error('❌ Discord mesaj gönderme hatası:', error.message);
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
