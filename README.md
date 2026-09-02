# Discord Duyuru Botu

Discord sunucunuzda duyuru göndermek için slash komut tabanlı bir bot.

## Kurulum

### 1. Discord Developer Portal'da Bot Oluştur
- [Discord Developer Portal](https://discord.com/developers/applications) açın
- "New Application" tıklayın
- "Bot" sekmesinden "Add Bot" tıklayın
- Bot token'ını kopyalayın

### 2. Bot Permissions Ayarla
- OAuth2 → URL Generator kısmında:
  - Scopes: `bot`
  - Permissions: `Send Messages`, `Embed Links`, `Administrator` seçin
- Oluşturulan linki tarayıcıda açıp sunucunuza bot'u ekleyin

### 3. .env Dosyasını Doldur
```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_server_id
```

### 4. Gerekli Paketleri Yükle
```bash
npm install
```

### 5. Slash Komutlarını Deploy Et
```bash
npm run deploy-commands
```

### 6. Bot'u Başlat
```bash
npm start
```

## Windows'ta Tek Tıkla Çalıştırma

Dosyaları Windows bilgisayarında çalıştırmak için:

1. İlk kurulumda **kurulum.bat** dosyasını çalıştırın.
2. Oluşan **.env** dosyasına Discord token, uygulama ID'si ve sunucu ID'sini yazın.
3. Bir kez `npm run deploy-commands` komutunu çalıştırın.
4. Botu ve monitörleri başlatmak için **baslat.bat** dosyasını açın.

`baslat.bat` botu ve Kick/YouTube monitörlerini ayrı pencerelerde açar. Açılan pencereleri kapatmadığınız sürece süreçler çalışmaya devam eder.

## Log ve İstatistikler\n\nBot ilk başarılı açılışında `bot-log` kanalını ve log webhook'unu oluşturur. Bu kanal; bot başlangıcını, manuel duyuruları, Kick/YouTube bildirimlerini ve komut hatalarını kaydeder. Kanal daha sonraki açılışlarda tekrar oluşturulmaz.\n\nYöneticiler Discord’da `\/istatistik` komutuyla toplam duyuru sayılarını ve son olayları görebilir. Yeni komutun görünmesi için güncelleme sonrası bir kez `npm run deploy-commands` çalıştırın.\n\n## Monitör Durumu ve Tekrar Koruması

Bot, Kick yayın oturumunu ve YouTube'daki son videoyu proje klasöründeki `.data/monitor-state.json` dosyasında saklar. Bu dosya GitHub'a gönderilmez.

Discord'da `/durum` komutunu kullanarak:
- Kick'in canlı/çevrimdışı durumunu,
- YouTube'da görülen son videoyu,
- Monitörlerin son kontrol zamanını,
- Varsa son hatayı görebilirsiniz.

Bot yeniden başlatıldığında aynı Kick yayını veya YouTube videosu için tekrar bildirim gönderilmez.

## Komutlar

### /duyuru
Belirtilen kanala bir duyuru gönder

**Parametreler:**
- `kanal`: Duyurunun gönderileceği kanal
- `baslik`: Duyuru başlığı
- `aciklama`: Duyuru açıklaması

**Örnek:**
```
/duyuru kanal: #announcements baslik: "Yeni Güncelleme" aciklama: "Sunucu v2.0 güncellendi!"
```

## Kick Canlı Yayın Monitörü

Kick kanalında yayın başladığında otomatik Discord'a duyuru gönderir.

### Kurulum

1. **Paketleri yükle:**
```bash
npm install
```

2. **Discord bot'unu sunucuya ekle:**
   - Bot token'ını .env dosyasına ekle
   - Bot'a `Administrator` yetkisi ver

3. **Botu başlat (kanal ve webhook otomatik oluşturulacak):**
```bash
npm start
```

Bot şu işlemleri otomatik olarak yapacak:
- ✅ `#kick-duyuru` kanalını oluştur
- ✅ Webhook oluştur
- ✅ `.env` dosyasına webhook URL'sini ekle

4. **Kick Monitörü başlat:**
```bash
npm run kick-monitor
```

### Özellikler
- 🎬 Kick kanalını 2 dakikada bir otomatik kontrol eder
- 🔴 Yayın başladığında Discord'a embed mesaj gönderir
- 👥 Canlı izleyici sayısını gösterir
- 🎯 Yayın başlığı ve kategoriyi paylaşır
- 🤖 Kanal ve webhook'u otomatik oluşturur

## İleri Özellikleri

Kullanıcıyla iletişime geçerek aşağıdaki özellikleri ekleyebiliriz:
- ⏰ Zamanlanan duyurular
- 📅 İçerik planlama
- 🎨 Özel embed tasarımı
- 📊 Duyuru analitikleri

## Sorun Giderme

**Bot çevrimiçi değil:**
- Token doğru mu kontrol edin
- Bot token'ının geçerli olduğundan emin olun
- Token'ı yenilediyseniz proje klasöründeki `.env` dosyasını güncelleyin

**Komutlar görünmüyor:**
- `npm run deploy-commands` komutunu çalıştırdığınızdan emin olun
- `DISCORD_GUILD_ID` doğru sunucu ID'si mi kontrol edin

**Monitörler başlamıyor:**
- Önce `npm start` ile botun `#kick-duyuru` kanalını ve webhook'u oluşturduğunu kontrol edin
- Botun kanal oluşturma ve webhook yönetme yetkisi olduğundan emin olun

## Lisans
ISC

## v2.0.0 — Embed Tasarımı ve Yönetici Ayarları

v2 ile duyurular sunucuya özel görünüm ayarlarını kullanır:

- /duyuru komutunda isteğe bağlı resim parametresiyle embed görseli ekleyin.
- /ayarlar goster ile mevcut ayarları görüntüleyin.
- /ayarlar renk hex:#5865f2 ile embed rengini değiştirin.
- /ayarlar footer metin:Topluluk Duyuruları ile footer metnini değiştirin. Footer'ı kapatmak için yok yazın.
- /ayarlar mention hedef:@everyone ile duyurularda @everyone, @here veya mention olmamasını seçin.

Ayarlar sunucu bazında .data/bot-settings.json dosyasına kaydedilir ve .data/ GitHub'a gönderilmez. Yeni /ayarlar komutunu Discord'a tanıtmak için güncelleme sonrası bir kez npm run deploy-commands çalıştırın.
