# Manify (kişisel kullanım)

youtubei.js (InnerTube) + Express backend ve aynı sunucudan yayınlanan iOS PWA (`public/`).
Arama/gezinme JSON döner, ses `/stream/:id` üzerinden proxy'lenir.

## iPhone'a kurulum (PWA)
1. Safari'de servis adresini aç (örn. https://manifybackend.onrender.com).
2. Ayarlar sekmesinde "Bağlantıyı test et"e bas. (`API_KEY` tanımlıysa önce anahtarı yazıp Kaydet.)
3. Paylaş → Ana Ekrana Ekle. Uygulamayı oradan aç (tam ekran, kilit ekranı kontrolleri).


## Render'a kurulum (`fly.toml`/`Dockerfile` de repoda var ama Fly.io artık kart istiyor, bu yüzden aşağıdaki Zeabur önerilir)
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

## Zeabur'a kurulum (2. sırada dene — deploy sırasında "choose a provider/region" ekranında ücretsiz plana ait bölge net görünmeyebiliyor, o yüzden önce yukarıdaki Deno Deploy'u dene)
Kart istemeyen, tarayıcıdan GitHub'ı bağlayıp deploy eden bir platform. Render'dan farklı bir IP havuzu kullanır.

1. https://zeabur.com adresine git, **Sign in with GitHub** ile gir (kart istemez).
2. Dashboard'da **Create Project** → **Add Service** → **Deploy Your Source Code**.
3. GitHub hesabını bağla (izin ister), listeden **ElSauron/ManifyForiOS** reposunu seç, **Import**'a bas.
4. Zeabur repodaki `Dockerfile`'ı otomatik algılar ve build eder. Bir şey değiştirmene gerek yok.
5. Servise tıkla → **Networking** sekmesi → **Generate Domain**. Sana `https://....zeabur.app` gibi bir adres verir.
6. iPhone'daki Manify'ı aç → Ayarlar → **Sunucu adresi**'ne bu adresi yaz → Kaydet → **Sunucuyu test et**.

Ücretsiz planda servis bir süre boş kalınca uyur, ilk istekte birkaç saniye gecikme olur (Render'daki uyku gibi). Kart istemiyor; sadece kullanım çok artarsa yükseltme öneriyor, zorunlu değil.

## Deno Deploy'a kurulum (tamamen web, terminal gerekmez, kartsız, bölge seçimi yok)
Zeabur'ın bölge/sağlayıcı seçim ekranı ücretli çıkabiliyor; Deno Deploy'da böyle bir adım yok — deploy otomatik olarak global edge ağında çalışır, kart istemez. Aynı backend'in Deno'ya uyarlanmış hali `main.js` (mantık `server.js` ile birebir aynı, sadece `express` ve `youtubei.js` paketleri `npm:` önekiyle içe aktarılıyor).

1. https://console.deno.com adresine git, GitHub ile giriş yap (kart istemez).
2. **New App** (veya **+ New**) → GitHub reposunu bağla, izin ver, **ElSauron/ManifyForiOS**'u seç.
3. Kurulum adımında **Entry point** olarak `main.js` seç (framework sorarsa "None"/"Express" — hangisi çıkarsa).
4. Deploy'a bas. Sana `https://....deno.net` gibi bir adres verecek.
5. iPhone'da Manify → Ayarlar → Sunucu adresi'ne bu adresi yaz → Kaydet → **Sunucuyu test et**.

Ücretsiz planda uygulama ~20-30 saniye boşta kalınca kapanıyor, sonraki istekte hızlıca (isolate tabanlı, konteynerden hızlı) uyanıyor. Aylık 1M istek / 10 saat aktif CPU sınırı var, kişisel kullanım için fazlasıyla yeterli.
**Not:** Bu port'u gerçek Deno Deploy üzerinde deneme imkânım olmadı (bu ortamdan erişemiyorum). Deploy loglarında hata çıkarsa tam metnini buraya yapıştır, hemen düzeltirim.

## Telefon köprüsü (KULLANILMIYOR — başka bir uygulama/eklenti kurmayı gerektirdiği için devre dışı; kod repoda duruyor ama önerilmiyor)
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
