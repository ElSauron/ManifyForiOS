// Manify backend — youtubei.js (InnerTube) üzerinden arama/gezinme + ses proxy'si.
// Sadece kişisel kullanım için. Her istek API_KEY ister.

import express from 'express';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { Innertube, UniversalCache, Constants } from 'youtubei.js';
import { mapItems, mapShelf, mapHeader, mapCard, nodeType } from './normalize.js';

// ---------- Ayarlar ----------
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // PWA'nın adresini yazarsan kilitlenir
// Ses için denenecek InnerTube client'ları (sırayla). /api/diag hangisinin çalıştığını gösterir.
const CLIENTS = (process.env.PLAYER_CLIENTS || 'ANDROID_VR,IOS,TV_EMBEDDED,WEB_EMBEDDED')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const SESSION_MAX_AGE = 5 * 60 * 60 * 1000; // player script'i yenilemek için 5 saatte bir oturumu tazele

if (API_KEY.length < 16) {
  console.error('API_KEY ortam değişkeni zorunlu (en az 16 karakter). Render > Environment kısmından ekle.');
  process.exit(1);
}

// ---------- InnerTube oturumu ----------
let ytPromise = null;
let ytCreatedAt = 0;

function getYT(force = false) {
  if (force || !ytPromise || Date.now() - ytCreatedAt > SESSION_MAX_AGE) {
    ytCreatedAt = Date.now();
    ytPromise = Innertube.create({
      cache: new UniversalCache(false),
      cookie: process.env.YT_COOKIE || undefined,
      visitor_data: process.env.VISITOR_DATA || undefined,
      po_token: process.env.PO_TOKEN || undefined
    }).catch((e) => {
      ytPromise = null; // bir sonraki istekte tekrar denensin
      throw e;
    });
  }
  return ytPromise;
}

// ---------- Express ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Access-Control-Allow-Headers', 'x-api-key, content-type, range');
  res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.set('Access-Control-Expose-Headers', 'content-length, content-range, accept-ranges');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const keyHash = sha(API_KEY);

// <audio src> header gönderemediği için anahtar ?key= ile de kabul edilir.
function auth(req, res, next) {
  const given = req.get('x-api-key') || req.query.key || '';
  if (crypto.timingSafeEqual(sha(given), keyHash)) return next();
  res.status(401).json({ error: 'Geçersiz API anahtarı' });
}

const h = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.error(`[${req.path}]`, e?.message ?? e);
    if (!res.headersSent) res.status(502).json({ error: e?.message ?? String(e) });
  }
};

const isVideoId = (v) => /^[\w-]{11}$/.test(v ?? '');

// ---------- Herkese açık ----------
app.get('/', (_req, res) => res.json({ name: 'manify-backend', ok: true }));
app.get('/health', (_req, res) => res.send('ok')); // Render health check (YouTube'a dokunmaz)

// ---------- Gezinme / arama ----------
app.get('/api/search', auth, h(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'q gerekli' });
  const allowed = ['all', 'song', 'video', 'album', 'playlist', 'artist'];
  const type = allowed.includes(req.query.type) ? req.query.type : 'all';
  const pages = Math.min(Math.max(Number(req.query.pages) || 1, 1), 4);

  const yt = await getYT();
  const r = await yt.music.search(q, { type });

  const sections = [];
  for (const c of r.contents ?? []) {
    const t = nodeType(c);
    if (t === 'MusicCardShelf') {
      const top = mapCard(c);
      const more = mapItems(c.contents);
      if (top) sections.push({ title: 'En iyi sonuç', items: [top, ...more] });
    } else if (t === 'MusicShelf') {
      const sec = mapShelf(c);
      if (sec) sections.push(sec);
    }
  }

  // Filtreli aramada devam sayfaları (tek istekte birkaç sayfa)
  if (type !== 'all' && pages > 1) {
    let cur = r;
    for (let i = 1; i < pages && cur?.has_continuation; i++) {
      try {
        cur = await cur.getContinuation();
        const items = mapItems(cur.contents?.contents);
        if (items.length) sections.push({ title: null, items });
      } catch {
        break;
      }
    }
  }

  res.json({ query: q, type, items: sections.flatMap((s) => s.items), sections });
}));

app.get('/api/suggest', auth, h(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.json({ suggestions: [] });
  const yt = await getYT();
  const sects = await yt.music.getSearchSuggestions(q);
  const out = [];
  for (const sec of sects ?? []) {
    for (const c of sec.contents ?? []) {
      const t = c.suggestion?.text;
      if (t) out.push(t);
    }
  }
  res.json({ suggestions: out });
}));

app.get('/api/home', auth, h(async (_req, res) => {
  const yt = await getYT();
  const home = await yt.music.getHomeFeed();
  res.json({ sections: (home.sections ?? []).map(mapShelf).filter(Boolean) });
}));

app.get('/api/album/:id', auth, h(async (req, res) => {
  const yt = await getYT();
  const a = await yt.music.getAlbum(req.params.id);
  const header = mapHeader(a.header);
  const fallbackArtists = header?.artist ? [{ name: header.artist, id: header.artistId }] : [];
  const tracks = mapItems(a.contents).map((t) => ({
    ...t,
    artists: t.artists?.length ? t.artists : fallbackArtists,
    album: t.album ?? { name: header?.title, id: req.params.id },
    thumb: t.thumb ?? header?.thumb ?? null
  }));
  res.json({ header, tracks, sections: (a.sections ?? []).map(mapShelf).filter(Boolean) });
}));

app.get('/api/artist/:id', auth, h(async (req, res) => {
  const yt = await getYT();
  const a = await yt.music.getArtist(req.params.id);
  res.json({ header: mapHeader(a.header), sections: (a.sections ?? []).map(mapShelf).filter(Boolean) });
}));

app.get('/api/playlist/:id', auth, h(async (req, res) => {
  const pages = Math.min(Math.max(Number(req.query.pages) || 1, 1), 5);
  const yt = await getYT();
  let p = await yt.music.getPlaylist(req.params.id);
  const header = mapHeader(p.header);
  let tracks = mapItems(p.items);
  for (let i = 1; i < pages && p.has_continuation; i++) {
    try {
      p = await p.getContinuation();
      tracks = tracks.concat(mapItems(p.items));
    } catch {
      break;
    }
  }
  res.json({ header, tracks, hasMore: p.has_continuation });
}));

app.get('/api/next/:videoId', auth, h(async (req, res) => {
  if (!isVideoId(req.params.videoId)) return res.status(400).json({ error: 'Geçersiz videoId' });
  const yt = await getYT();
  const panel = await yt.music.getUpNext(req.params.videoId);
  res.json({ playlistId: panel.playlist_id ?? null, items: mapItems(panel.contents) });
}));

// ---------- Şarkı sözleri ----------
app.get('/api/lyrics/:videoId', auth, h(async (req, res) => {
  if (!isVideoId(req.params.videoId)) return res.status(400).json({ error: 'Geçersiz videoId' });
  const yt = await getYT();
  const l = await yt.music.getLyrics(req.params.videoId);
  res.json({ lyrics: l?.description?.text ?? null, source: l?.footer?.text ?? null });
}));

// Zaman damgalı (LRC) sözler için LrcLib — Metrolist'teki gibi
app.get('/api/lrclib', auth, h(async (req, res) => {
  const { title, artist, album, duration } = req.query;
  if (!title || !artist) return res.status(400).json({ error: 'title ve artist gerekli' });
  const url = new URL('https://lrclib.net/api/get');
  url.searchParams.set('track_name', String(title));
  url.searchParams.set('artist_name', String(artist));
  if (album) url.searchParams.set('album_name', String(album));
  if (duration) url.searchParams.set('duration', String(Math.round(Number(duration))));
  const r = await fetch(url, { headers: { 'user-agent': 'ManifyPWA/1.0 (kisisel kullanim)' } });
  if (r.status === 404) return res.json({ synced: null, plain: null });
  if (!r.ok) throw new Error(`LrcLib HTTP ${r.status}`);
  const j = await r.json();
  res.json({ synced: j.syncedLyrics ?? null, plain: j.plainLyrics ?? null });
}));

// ---------- Ses akışı (proxy) ----------
// googlevideo URL'leri isteği çözen sunucunun IP'sine bağlı; bu yüzden ses buradan geçer.
const urlCache = new Map();
const cacheKey = (id, client, fmt) => `${id}:${client}:${fmt}`;

async function resolveAudio(id, client, fmt) {
  const key = cacheKey(id, client, fmt);
  const hit = urlCache.get(key);
  if (hit && hit.exp > Date.now()) return hit;

  const yt = await getYT();
  const opts = { client, type: 'audio', quality: 'best' };
  if (fmt === 'mp4') opts.format = 'mp4'; // iOS Safari AAC/mp4 ister, webm/opus çalmaz
  const format = await yt.getStreamingData(id, opts);
  if (!format?.url) throw new Error('Format URL yok');

  const expire = Number(new URL(format.url).searchParams.get('expire')) * 1000;
  const exp = Math.min(Date.now() + 30 * 60 * 1000, Number.isFinite(expire) && expire > 0 ? expire - 60_000 : Infinity);
  const entry = { url: format.url, mime: (format.mime_type || 'audio/mp4').split(';')[0], exp };
  urlCache.set(key, entry);
  if (urlCache.size > 500) urlCache.delete(urlCache.keys().next().value);
  return entry;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function upstreamHeaders(client, range) {
  const headers = { accept: '*/*', range: range || 'bytes=0-' };
  const ua = Constants.CLIENTS?.[client]?.USER_AGENT;
  if (ua) {
    headers['user-agent'] = ua;
  } else {
    headers['user-agent'] = BROWSER_UA;
    headers.origin = 'https://www.youtube.com';
    headers.referer = 'https://www.youtube.com/';
  }
  return headers;
}

app.get('/stream/:id', auth, async (req, res) => {
  const id = req.params.id;
  if (!isVideoId(id)) return res.status(400).json({ error: 'Geçersiz videoId' });
  const fmt = req.query.format === 'any' ? 'any' : 'mp4';
  const range = req.get('range');
  const errors = [];

  const ac = new AbortController();
  res.on('close', () => ac.abort()); // kullanıcı şarkıyı geçince upstream'i kes

  for (const client of CLIENTS) {
    try {
      const entry = await resolveAudio(id, client, fmt);
      const up = await fetch(entry.url, {
        headers: upstreamHeaders(client, range),
        signal: ac.signal,
        redirect: 'follow'
      });

      if (!up.ok) {
        urlCache.delete(cacheKey(id, client, fmt));
        errors.push(`${client}: HTTP ${up.status}`);
        await up.body?.cancel().catch(() => {});
        continue; // sıradaki client'ı dene
      }

      res.status(up.status);
      for (const name of ['content-type', 'content-length', 'content-range']) {
        const v = up.headers.get(name);
        if (v) res.set(name, v);
      }
      if (!res.get('content-type')) res.set('content-type', entry.mime);
      res.set('accept-ranges', 'bytes');
      res.set('cache-control', 'private, no-store');

      const body = Readable.fromWeb(up.body);
      body.on('error', () => res.destroy());
      body.pipe(res);
      return;
    } catch (e) {
      if (ac.signal.aborted) return;
      errors.push(`${client}: ${e?.message ?? e}`);
    }
  }

  console.error(`[stream ${id}]`, errors.join(' | '));
  res.status(502).json({ error: 'Hiçbir client ile akış alınamadı', details: errors });
});

// ---------- Teşhis ----------
// Render IP'sinin YouTube tarafından engellenip engellenmediğini burada göreceksin.
app.get('/api/diag', auth, h(async (req, res) => {
  const id = isVideoId(req.query.id) ? req.query.id : 'dQw4w9WgXcQ';
  const results = [];
  for (const client of CLIENTS) {
    const r = { client };
    try {
      const e = await resolveAudio(id, client, 'mp4');
      r.mime = e.mime;
      const up = await fetch(e.url, { headers: upstreamHeaders(client, 'bytes=0-1'), redirect: 'follow' });
      r.status = up.status;
      await up.body?.cancel().catch(() => {});
      if (!up.ok) urlCache.delete(cacheKey(id, client, 'mp4'));
    } catch (e) {
      r.error = e?.message ?? String(e);
    }
    results.push(r);
  }
  res.json({
    node: process.version,
    hasCookie: !!process.env.YT_COOKIE,
    hasPoToken: !!process.env.PO_TOKEN,
    hasVisitorData: !!process.env.VISITOR_DATA,
    results
  });
}));

// Oturumu sıfırla (YouTube bir şeyi değiştirip her şey hata vermeye başlarsa)
app.get('/api/reset', auth, h(async (_req, res) => {
  urlCache.clear();
  await getYT(true);
  res.json({ ok: true });
}));

process.on('unhandledRejection', (e) => console.error('unhandledRejection', e?.message ?? e));

app.listen(PORT, () => console.log(`manify-backend :${PORT} | clients: ${CLIENTS.join(',')}`));
