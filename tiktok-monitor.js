require('dotenv').config();
const axios = require('axios');
const { WebhookClient, EmbedBuilder } = require('discord.js');
const { loadState, updateState } = require('./monitor-state');
const { logEvent } = require('./bot-logger');

const CONFIG = {
  USERNAME: (process.env.TIKTOK_USERNAME || 'burakcan_dlmc').replace(/^@/, '').trim(),
  CHECK_INTERVAL: 5 * 60 * 1000,
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
};

if (!CONFIG.USERNAME) {
  console.error('TikTok kullanıcı adı .env dosyasında bulunamadı.');
  process.exit(1);
}

if (!CONFIG.DISCORD_WEBHOOK_URL) {
  console.error('DISCORD_WEBHOOK_URL .env dosyasında bulunamadı.');
  console.log("Önce bot.js ile Kick webhook'unun oluşturulmasını sağlayın.");
  process.exit(1);
}

function normalizePublishedAt(value) {
  if (value === undefined || value === null || value === '') return null;
  if (/^\\d+$/.test(String(value))) {
    const numeric = Number(value);
    const milliseconds = numeric < 100000000000 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstUrl(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(firstUrl).find(Boolean) || null;
  if (value && typeof value === 'object') return firstUrl(value.url_list || value.url || value.src || value.uri);
  return null;
}

function collectVideoCandidates(value, candidates, seen, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 12 || candidates.length >= 200) return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectVideoCandidates(item, candidates, seen, depth + 1);
    return;
  }

  const rawId = value.id || value.videoId || value.itemId;
  const title = value.desc || value.description || value.title;
  const publishedAt = value.createTime || value.create_time || value.publishedAt || value.published_at;
  const hasVideoData = value.video || value.videoInfo || value.music || value.stats;
  if (rawId && title && hasVideoData && /^\\d{10,}$/.test(String(rawId))) {
    candidates.push({
      id: String(rawId),
      title: String(title),
      publishedAt: normalizePublishedAt(publishedAt),
      coverUrl: firstUrl(value.video?.cover || value.video?.dynamicCover || value.cover || value.thumbnail),
      author: value.author?.nickname || value.author?.uniqueId || value.author?.unique_id || null,
    });
  }
  for (const child of Object.values(value)) collectVideoCandidates(child, candidates, seen, depth + 1);
}

function extractLatestVideo(html) {
  const candidates = [];
  const scriptPattern = /<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const raw = match[1].trim();
    if (!raw.startsWith('{') && !raw.startsWith('[')) continue;
    try {
      collectVideoCandidates(JSON.parse(raw), candidates, new WeakSet());
    } catch {
      // TikTok embeds non-JSON scripts as well; those are ignored.
    }
  }
  if (candidates.length > 0) {
    candidates.sort((left, right) => {
      const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
      const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;
      return rightTime - leftTime;
    });
    return candidates[0];
  }
  const match = html.match(/\\/video\\/(\\d{10,})/);
  if (!match) return null;
  return { id: match[1], title: 'Yeni TikTok videosu', publishedAt: null, coverUrl: null, author: null };
}

async function fetchLatestVideo() {
  const profileUrl = 'https://www.tiktok.com/@' + encodeURIComponent(CONFIG.USERNAME);
  const response = await axios.get(profileUrl, {
    timeout: 20000,
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
    },
  });
  const video = extractLatestVideo(response.data);
  if (!video) throw new Error('TikTok profilinden video bilgisi okunamadı');
  return video;
}

async function sendTikTokNotification(video) {
  const videoUrl = 'https://www.tiktok.com/@' + CONFIG.USERNAME + '/video/' + video.id;
  const embed = new EmbedBuilder()
    .setColor('#fe2c55')
    .setTitle('🎵 Yeni TikTok videosu!')
    .setDescription(video.title.slice(0, 4096))
    .setURL(videoUrl)
    .addFields(
      { name: 'Hesap', value: '[@' + CONFIG.USERNAME + '](https://www.tiktok.com/@' + CONFIG.USERNAME + ')', inline: true },
      { name: 'Videoyu İzle', value: "[TikTok'ta Aç](" + videoUrl + ")", inline: false }
    )
    .setTimestamp();
  if (video.coverUrl) embed.setImage(video.coverUrl);
  if (video.author) embed.setAuthor({ name: video.author });

  try {
    const webhook = new WebhookClient({ url: CONFIG.DISCORD_WEBHOOK_URL });
    await webhook.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
    console.log('TikTok duyurusu gönderildi (' + video.id + ')');
    return true;
  } catch (error) {
    console.error('TikTok Discord mesajı gönderilemedi:', error.message);
    return false;
  }
}

let lastVideoId = loadState().tiktok.latestVideoId || null;
let isChecking = false;

async function checkTikTokProfile() {
  if (isChecking) return;
  isChecking = true;
  const checkedAt = new Date().toISOString();
  try {
    const latestVideo = await fetchLatestVideo();
    if (!lastVideoId) {
      lastVideoId = latestVideo.id;
      updateState('tiktok', { latestVideoId: latestVideo.id, latestVideoTitle: latestVideo.title, latestPublishedAt: latestVideo.publishedAt, lastCheckAt: checkedAt, lastError: null });
      console.log('TikTok başlangıç videosu kaydedildi: ' + latestVideo.id);
      return;
    }
    if (latestVideo.id !== lastVideoId) {
      const sent = await sendTikTokNotification(latestVideo);
      if (sent) {
        lastVideoId = latestVideo.id;
        updateState('tiktok', { latestVideoId: latestVideo.id, latestVideoTitle: latestVideo.title, latestPublishedAt: latestVideo.publishedAt, lastCheckAt: checkedAt, lastNotificationAt: checkedAt, lastError: null });
        await logEvent('tiktok', 'Yeni TikTok videosu duyuruldu.', { Video: latestVideo.title, Hesap: '@' + CONFIG.USERNAME });
      } else {
        updateState('tiktok', { lastCheckAt: checkedAt, lastError: 'Discord TikTok bildirimi gönderilemedi' });
      }
    } else {
      updateState('tiktok', { latestVideoTitle: latestVideo.title, latestPublishedAt: latestVideo.publishedAt, lastCheckAt: checkedAt, lastError: null });
    }
  } catch (error) {
    updateState('tiktok', { lastCheckAt: checkedAt, lastError: error.message });
    console.error('TikTok kontrol hatası:', error.message);
  } finally {
    isChecking = false;
  }
}

console.log('TikTok Monitor başlatıldı');
console.log('Hesap: @' + CONFIG.USERNAME);
console.log('Kontrol aralığı: ' + CONFIG.CHECK_INTERVAL / 1000 + ' saniye\\n');
checkTikTokProfile();
setInterval(checkTikTokProfile, CONFIG.CHECK_INTERVAL);
