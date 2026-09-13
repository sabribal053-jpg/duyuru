require('dotenv').config();
const axios = require('axios');
const { WebhookClient, EmbedBuilder } = require('discord.js');
const { loadState, updateState } = require('./monitor-state');
const { logEvent } = require('./bot-logger');

const CONFIG = {
  USERNAME: (process.env.TIKTOK_USERNAME || 'burakcan_dlmc').replace(/^@/, '').trim(),
  CHECK_INTERVAL: 5 * 60 * 1000,
  DISCORD_TIKTOK_WEBHOOK_URL: process.env.DISCORD_TIKTOK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL,
};

if (!CONFIG.USERNAME) {
  console.error('TikTok kullanıcı adı .env dosyasında bulunamadı.');
  process.exit(1);
}

if (!CONFIG.DISCORD_TIKTOK_WEBHOOK_URL) {
  console.error('DISCORD_TIKTOK_WEBHOOK_URL .env dosyasında bulunamadı.');
  console.log("Önce bot.js ile TikTok webhook'unun oluşturulmasını sağlayın.");
  process.exit(1);
}

function normalizePublishedAt(value) {
  if (value === undefined || value === null || value === '') return null;
  if (/^\d+$/.test(String(value))) {
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

function parseEmbeddedData(html) {
  const documents = [];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const raw = match[1].trim();
    if (!raw.startsWith('{') && !raw.startsWith('[')) continue;
    try {
      documents.push(JSON.parse(raw));
    } catch {
      // TikTok embeds non-JSON scripts as well; those are ignored.
    }
  }
  return documents;
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
  if (rawId && title && hasVideoData && /^\d{10,}$/.test(String(rawId))) {
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

function extractLatestVideo(documents, html) {
  const candidates = [];
  for (const document of documents) collectVideoCandidates(document, candidates, new WeakSet());
  if (candidates.length > 0) {
    candidates.sort((left, right) => {
      const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
      const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;
      return rightTime - leftTime;
    });
    return candidates[0];
  }
  const match = html.match(/\/video\/(\d{10,})/);
  if (!match) return null;
  return { id: match[1], title: 'Yeni TikTok videosu', publishedAt: null, coverUrl: null, author: null };
}

function parseLiveStatus(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (value === undefined || value === null) return null;
  const normalized = String(value).toLowerCase();
  if (['live', 'online', 'on', 'true', '1', '2'].includes(normalized)) return true;
  if (['offline', 'off', 'false', '0'].includes(normalized)) return false;
  return null;
}

function collectLiveCandidates(value, candidates, seen, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 12 || candidates.length >= 100) return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectLiveCandidates(item, candidates, seen, depth + 1);
    return;
  }

  const liveContainer = value.liveRoomInfo || value.live_room_info || value.liveRoom || value.live_room || value.roomInfo || value.room_info;
  const roomId = value.roomId || value.room_id || value.liveRoomId || value.live_room_id || liveContainer?.roomId || liveContainer?.room_id || liveContainer?.id;
  const rawStatus = value.isLive ?? value.is_live ?? value.liveStatus ?? value.live_status ?? value.alive ?? value.roomStatus ?? value.room_status ?? liveContainer?.isLive ?? liveContainer?.status;
  const hasLiveData = liveContainer !== undefined || rawStatus !== undefined || value.liveTitle !== undefined || value.viewerCount !== undefined;

  if (hasLiveData) {
    const parsedStatus = parseLiveStatus(rawStatus);
    candidates.push({
      known: true,
      isLive: parsedStatus === null ? Boolean(roomId && liveContainer) : parsedStatus,
      roomId: roomId ? String(roomId) : null,
      title: String(value.liveTitle || value.live_title || liveContainer?.title || liveContainer?.roomTitle || ''),
      coverUrl: firstUrl(value.liveCover || value.live_cover || liveContainer?.cover || liveContainer?.coverUrl),
      viewers: Number(value.viewerCount || value.viewer_count || liveContainer?.viewerCount || liveContainer?.userCount || 0) || 0,
      startedAt: normalizePublishedAt(value.liveStartTime || value.live_start_time || liveContainer?.startTime || liveContainer?.createTime),
    });
  }

  for (const child of Object.values(value)) collectLiveCandidates(child, candidates, seen, depth + 1);
}

function extractLiveState(documents) {
  const candidates = [];
  for (const document of documents) collectLiveCandidates(document, candidates, new WeakSet());
  if (candidates.length === 0) return { known: false, isLive: false };
  const liveCandidate = candidates.find((candidate) => candidate.isLive) || candidates.find((candidate) => candidate.roomId) || candidates[0];
  return liveCandidate;
}

async function fetchProfileSnapshot() {
  const profileUrl = 'https://www.tiktok.com/@' + encodeURIComponent(CONFIG.USERNAME);
  const response = await axios.get(profileUrl, {
    timeout: 20000,
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
    },
  });
  const documents = parseEmbeddedData(response.data);
  return {
    video: extractLatestVideo(documents, response.data),
    live: extractLiveState(documents),
  };
}

async function sendTikTokVideoNotification(video) {
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
    const webhook = new WebhookClient({ url: CONFIG.DISCORD_TIKTOK_WEBHOOK_URL });
    await webhook.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
    console.log('TikTok video duyurusu gönderildi (' + video.id + ')');
    return true;
  } catch (error) {
    console.error('TikTok video mesajı gönderilemedi:', error.message);
    return false;
  }
}

async function sendTikTokLiveNotification(live) {
  const liveUrl = 'https://www.tiktok.com/@' + CONFIG.USERNAME + '/live';
  const embed = new EmbedBuilder()
    .setColor('#ff1744')
    .setTitle('🔴 TikTok canlı yayını başladı!')
    .setDescription(live.title || '@' + CONFIG.USERNAME + ' şu anda canlı yayında.')
    .setURL(liveUrl)
    .addFields(
      { name: 'Hesap', value: '[@' + CONFIG.USERNAME + '](https://www.tiktok.com/@' + CONFIG.USERNAME + ')', inline: true },
      { name: 'İzleyici', value: String(live.viewers || 0), inline: true },
      { name: 'Yayını İzle', value: "[TikTok canlı yayınına git](" + liveUrl + ")", inline: false }
    )
    .setTimestamp();
  if (live.coverUrl) embed.setImage(live.coverUrl);

  try {
    const webhook = new WebhookClient({ url: CONFIG.DISCORD_TIKTOK_WEBHOOK_URL });
    await webhook.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
    console.log('TikTok canlı yayın duyurusu gönderildi');
    return true;
  } catch (error) {
    console.error('TikTok canlı yayın mesajı gönderilemedi:', error.message);
    return false;
  }
}

async function syncLiveState(live, checkedAt) {
  if (!live.known) {
    updateState('tiktok', { lastLiveCheckAt: checkedAt });
    return;
  }

  const previous = loadState().tiktok;
  if (!live.isLive) {
    updateState('tiktok', { isLive: false, liveRoomId: null, liveTitle: null, liveViewers: 0, lastLiveCheckAt: checkedAt });
    return;
  }

  const newLiveSession = !previous.isLive || (live.roomId && live.roomId !== previous.liveRoomId);
  if (newLiveSession) {
    const sent = await sendTikTokLiveNotification(live);
    updateState('tiktok', {
      isLive: true,
      liveRoomId: live.roomId,
      liveTitle: live.title,
      liveViewers: live.viewers,
      liveStartedAt: live.startedAt,
      lastLiveCheckAt: checkedAt,
      lastLiveNotificationAt: sent ? checkedAt : previous.lastLiveNotificationAt,
      lastError: sent ? null : 'Discord TikTok canlı yayın bildirimi gönderilemedi',
    });
    if (sent) await logEvent('tiktokLive', 'TikTok canlı yayını duyuruldu.', { Hesap: '@' + CONFIG.USERNAME, Başlık: live.title });
    return;
  }

  updateState('tiktok', { isLive: true, liveRoomId: live.roomId || previous.liveRoomId, liveTitle: live.title, liveViewers: live.viewers, lastLiveCheckAt: checkedAt });
}

let lastVideoId = loadState().tiktok.latestVideoId || null;
let isChecking = false;

async function checkTikTokProfile() {
  if (isChecking) return;
  isChecking = true;
  const checkedAt = new Date().toISOString();
  try {
    const snapshot = await fetchProfileSnapshot();
    await syncLiveState(snapshot.live, checkedAt);
    if (!snapshot.video) throw new Error('TikTok profilinden video bilgisi okunamadı');
    const latestVideo = snapshot.video;

    if (!lastVideoId) {
      lastVideoId = latestVideo.id;
      updateState('tiktok', { latestVideoId: latestVideo.id, latestVideoTitle: latestVideo.title, latestPublishedAt: latestVideo.publishedAt, lastCheckAt: checkedAt, lastError: null });
      console.log('TikTok başlangıç videosu kaydedildi: ' + latestVideo.id);
      return;
    }
    if (latestVideo.id !== lastVideoId) {
      const sent = await sendTikTokVideoNotification(latestVideo);
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
