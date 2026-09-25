# Manify (kişisel kullanım)

youtubei.js (InnerTube) + Express backend ve aynı sunucudan yayınlanan iOS PWA (`public/`).
Arama/gezinme JSON döner, ses `/stream/:id` üzerinden proxy'lenir.

## iPhone'a kurulum (PWA)
1. Safari'de servis adresini aç (örn. https://manifybackend.onrender.com).
2. Ayarlar sekmesinde "Bağlantıyı test et"e bas. (`API_KEY` tanımlıysa önce anahtarı yazıp Kaydet.)
3. Paylaş → Ana Ekrana Ekle. Uygulamayı oradan aç (tam ekran, kilit ekranı kontrolleri).


## Render'a kurulum
1. Dosyaları bir GitHub reposuna at (node_modules'u commit'leme; .gitignore'a `node_modules` yaz).
2. Render > New > Blueprint > repoyu seç (render.yaml her şeyi ayarlar). Ya da Web Service: Build `npm install`, Start `npm start`.
3. `API_KEY` isteğe bağlı: Environment'ta tanımlarsan her istek anahtar ister, tanımlamazsan (veya silersen) anahtarsız çalışır.

## İlk test (en önemlisi)
```
curl "https://SERVIS.onrender.com/api/diag"   # API_KEY tanımlıysa sonuna ?key=ANAHTAR ekle
```
`results` içinde en az bir client için `"status": 206` (veya 200) görmelisin. Hepsi 403 / "Sign in to confirm you're not a bot" ise Render IP'si engelli demektir:
- `YT_COOKIE` (tarayıcıdan music.youtube.com çerezleri) ekle, ve/veya
- `PO_TOKEN` + `VISITOR_DATA` ekle (birbiriyle eşleşmeli), ve/veya
- `PLAYER_CLIENTS` sırasını değiştir (örn. `IOS,ANDROID_VR,TV_EMBEDDED`).

## Telefon köprüsü (sunucu IP'si engelliyken)
YouTube, Render gibi datacenter IP'lerinden gelen `/player` isteklerini reddediyor (403). Metrolist gibi istekleri **telefonun kendi IP'sinden** atmak için:
1. App Store'dan **Userscripts** (ücretsiz, açık kaynak Safari eklentisi) kur; Ayarlar → Safari → Uzantılar → Userscripts → Açık, "Tüm web sitelerine" izin ver.
2. Uygulamayı **Safari'de** aç (Ana ekran uygulamasında Safari eklentileri çalışmaz), Ayarlar sekmesinde "Köprü betiğini yükle"ye dokun → aA → Userscripts → Install. Sayfayı yenile.
3. Ayarlar → "Telefondan test et". Bir client ✓ ise şarkılar doğrudan telefonun IP'sinden çözülür ve sunucu ses akışına hiç karışmaz (sunucu sadece arama/gezinme yapar).
Köprü betiği (`bridge.user.js`) sadece Manify sayfasında çalışır ve yalnızca `www.youtube.com` / `youtubei.googleapis.com` adreslerine istek atabilir. Köprü yoksa ya da başarısız olursa uygulama sunucu yoluna (`/stream`) düşer.

## IP engeli olursa
Render gibi datacenter IP'leri YouTube tarafından sık sık engellenir (`LOGIN_REQUIRED: Sign in to confirm you're not a bot`). Çözümler:
- Aynı klasörü evdeki bir Raspberry Pi / bilgisayarda çalıştır (`npm install && node server.js`) ve `cloudflared tunnel --url http://localhost:3000` ile dışarı aç. Ev IP'si genelde engellenmez. (Hızlı tünel adresi her başlatmada değişir; kalıcı adres için Cloudflare'de adlandırılmış tünel gerekir.)
- Ya da `YT_COOKIE` / `PO_TOKEN` + `VISITOR_DATA` ekle.

## Endpoint'ler (API_KEY tanımlıysa `?key=` veya `x-api-key` header'ı ister)
| Yol | Açıklama |
|---|---|
| `GET /api/search?q=&type=all,song,video,album,artist,playlist&pages=1-4` | Arama |
| `GET /api/suggest?q=` | Arama önerileri |
| `GET /api/home` | Ana sayfa rafları |
| `GET /api/album/:id`, `/api/artist/:id`, `/api/playlist/:id?pages=` | Detay sayfaları |
| `GET /api/next/:videoId` | Sıradaki / radyo listesi |
| `GET /api/lyrics/:videoId` | YT Music sözleri (düz metin) |
| `GET /api/lrclib?title=&artist=&album=&duration=` | Zaman damgalı sözler (LrcLib) |
| `GET /stream/:videoId?key=` | Ses (Range destekli, varsayılan AAC/mp4, iOS için) |
| `GET /api/diag`, `GET /api/reset` | Teşhis / oturumu sıfırla |
| `GET /health` | Anahtarsız, Render health check |

Notlar: Render ücretsiz plan 15 dk boşta kalınca uyur (ilk istek yavaş). Bu servis kişisel kullanım içindir; anahtarı paylaşma.
