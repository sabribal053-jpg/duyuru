require('dotenv').config();
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { WebhookClient, EmbedBuilder } = require('discord.js');
const { loadState, updateState } = require('./monitor-state');
const { logEvent } = require('./bot-logger');

// Konfigürasyon
const CONFIG = {
  YOUTUBE_USERNAME: 'burakcandilmaç',
  YOUTUBE_CHANNEL_ID: 'UCP3W4DlmAGaEjN1rI2JX6-g', // burakcandilmaç kanalı
  CHECK_INTERVAL: 5 * 60 * 1000, // 5 dakika
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
};

// Webhook URL kontrolü
if (!CONFIG.DISCORD_WEBHOOK_URL) {
  console.error('❌ DISCORD_WEBHOOK_URL .env dosyasında bulunamadı!');
  console.log('💡 Lütfen bot.js ile önce botu çalıştırın:');
  console.log('   npm start');
  process.exit(1);
}

// Son video diskte tutulur; bot yeniden başlasa bile aynı video tekrar duyurulmaz.
let lastVideoId = loadState().youtube.latestVideoId || null;
let isChecking = false;

async function checkYouTubeChannel() {
  if (isChecking) return;
  isChecking = true;
  const checkedAt = new Date().toISOString();

  try {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CONFIG.YOUTUBE_CHANNEL_ID}`;
    const response = await axios.get(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const result = await parseStringPromise(response.data);

    if (!result.feed || !result.feed.entry) {
      updateState('youtube', {
        lastCheckAt: checkedAt,
        lastError: 'YouTube feed boş döndü',
      });
      console.log('⚠️ YouTube feed boş. Sonra tekrar deneyeceğiz...');
      return;
    }

    // En yeni videoyu al
    const latestVideo = result.feed.entry[0];
    const videoId = latestVideo['yt:videoId']?.[0];
    const title = latestVideo.title?.[0];
    const published = latestVideo.published?.[0];
    const channelName = latestVideo.author?.[0]?.name?.[0];

    if (!videoId || !title) {
      updateState('youtube', {
        lastCheckAt: checkedAt,
        lastError: 'YouTube video bilgileri eksik',
      });
      console.log('⚠️ Video bilgileri eksik');
      return;
    }

    // İlk kontrolde mevcut videoyu referans olarak kaydet, bildirim gönderme.
    if (!lastVideoId) {
      lastVideoId = videoId;
      updateState('youtube', {
        latestVideoId: videoId,
        latestVideoTitle: title,
        latestPublishedAt: published,
        lastCheckAt: checkedAt,
        lastError: null,
      });
      console.log(`ℹ️ YouTube başlangıç videosu kaydedildi: ${title}`);
      return;
    }

    if (videoId !== lastVideoId) {
      console.log(`✅ Yeni video bulundu: ${title}`);
      const sent = await sendYouTubeNotification({
        videoId,
        title,
        published,
        channelName,
      });

      if (sent) {
        lastVideoId = videoId;
        updateState('youtube', {
          latestVideoId: videoId,
          latestVideoTitle: title,
          latestPublishedAt: published,
          lastCheckAt: checkedAt,
          lastNotificationAt: checkedAt,
          lastError: null,
        });
        await logEvent('youtube', 'Yeni YouTube videosu duyuruldu.', {
          Video: title,
          Kanal: channelName || CONFIG.YOUTUBE_USERNAME,
        });
      } else {
        updateState('youtube', {
          lastCheckAt: checkedAt,
          lastError: 'Discord YouTube bildirimi gönderilemedi',
        });
      }
    } else {
      updateState('youtube', {
        latestVideoTitle: title,
        latestPublishedAt: published,
        lastCheckAt: checkedAt,
        lastError: null,
      });
    }
  } catch (error) {
    updateState('youtube', {
      lastCheckAt: checkedAt,
      lastError: error.message,
    });
    console.error('❌ YouTube kontrol hatası:', error.message);
  } finally {
    isChecking = false;
  }
}

async function sendYouTubeNotification(video) {
  const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
  const publishedDate = new Date(video.published).toLocaleDateString('tr-TR');

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('YENİ VIDEO!')
    .setDescription(video.title)
    .setURL(videoUrl)
    .addFields(
      {
        name: 'Kanal',
        value: `[@${CONFIG.YOUTUBE_USERNAME}](https://www.youtube.com/@${CONFIG.YOUTUBE_USERNAME})`,
        inline: true,
      },
      { name: 'Yayın Tarihi', value: publishedDate, inline: true },
      { name: 'Videoyu İzle', value: `[YouTube'da Aç](${videoUrl})`, inline: false }
    )
    .setImage(`https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`)
    .setTimestamp();

  if (video.channelName) {
    embed.setAuthor({ name: video.channelName });
  }

  try {
    const webhook = new WebhookClient({ url: CONFIG.DISCORD_WEBHOOK_URL });
    await webhook.send({
      content: '@everyone',
      embeds: [embed],
    });
    console.log(`✅ YouTube duyuru gönderildi (${video.title})`);
    return true;
  } catch (error) {
    console.error('❌ Discord mesaj gönderme hatası:', error.message);
    return false;
  }
}

// Uygulamayı başlat
console.log(`🎬 YouTube Monitor başlatıldı`);
console.log(`📺 Kanal: ${CONFIG.YOUTUBE_USERNAME}`);
console.log(`⏰ Kontrol aralığı: ${CONFIG.CHECK_INTERVAL / 1000} saniye\n`);

// İlk kontrol
checkYouTubeChannel();

// Periyodik kontrol
setInterval(checkYouTubeChannel, CONFIG.CHECK_INTERVAL);
