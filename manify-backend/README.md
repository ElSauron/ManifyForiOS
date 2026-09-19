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
