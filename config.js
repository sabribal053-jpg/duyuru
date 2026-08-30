/**
 * Discord Duyuru Botu - Konfigürasyon Dosyası
 * Bu dosyayı kendi ihtiyaçlarına göre düzenle
 */

module.exports = {
  // Bot Ayarları
  bot: {
    token: process.env.DISCORD_TOKEN || 'your_token_here',
    clientId: process.env.DISCORD_CLIENT_ID || 'your_client_id_here',
    guildId: process.env.DISCORD_GUILD_ID || 'your_guild_id_here',
  },

  // Kick Monitor Ayarları
  kickMonitor: {
    // Takip edilecek Kick kanalı
    username: 'burakcandilmac',

    // Kontrol sıklığı (dakika cinsinden)
    checkInterval: 2,

    // Discord Webhook URL'si
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || null,

    // Duyuru mesajı özelleştirmesi
    notification: {
      mention: '@everyone', // Kime mention etsin? (@everyone, @here, veya boş bırak)
      liveMessage: '🔴 YAYINDAaaaa!', // Yayın başlama mesajı
    },

    // Embed rengi (HEX)
    embedColor: '#00ff00',
  },

  // Komut Ayarları
  commands: {
    duyuru: {
      // Admin komutunu sadece admin'lerin kullanabilmesi için
      adminOnly: true,
    },
  },
};
