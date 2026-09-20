// Manify backend — youtubei.js (InnerTube) üzerinden arama/gezinme + ses proxy'si.
// Sadece kişisel kullanım için. API_KEY env'i tanımlıysa her istek ister, tanımlı değilse anahtarsız çalışır.

import express from 'express';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

if (!API_KEY.trim()) {
  console.warn('API_KEY tanımlı değil: servis anahtarsız çalışıyor (URL\'yi bilen herkes kullanabilir).');
} else if (API_KEY.trim().length < 8) {
  console.warn('API_KEY çok kısa; tahmin edilmesi kolay olabilir.');
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
const keyHash = API_KEY.trim() ? sha(API_KEY.trim()) : null; // null = anahtar kontrolü kapalı

// <audio src> header gönderemediği için anahtar ?key= ile de kabul edilir.
function auth(req, res, next) {
  if (!keyHash) return next();
  const given = String(req.get('x-api-key') || req.query.key || '').trim();
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
// PWA (public/ klasörü) aynı sunucudan yayınlanır: CORS yok, tek adres. İçinde gizli bir şey yok;
// API anahtarını sen uygulamadaki Ayarlar'a girersin, o da sadece telefonunda (localStorage) durur.
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
app.use(express.static(publicDir, {
  setHeaders(res, file) {
    if (/sw\.js$|index\.html$|\.webmanifest$/.test(file)) res.set('Cache-Control', 'no-cache');
  }
}));
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

const withTimeout = (p, ms, label) => {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${label}: ${ms / 1000} sn içinde cevap gelmedi`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
};

async function resolveAudio(id, client, fmt) {
  const key = cacheKey(id, client, fmt);
  const hit = urlCache.get(key);
  if (hit && hit.exp > Date.now()) return hit;

  const yt = await getYT();
  const info = await yt.getBasicInfo(id, { client });
  const ps = info.playability_status;
  if (ps && ps.status !== 'OK') throw new Error(`${ps.status}${ps.reason ? ': ' + ps.reason : ''}`);

  const opts = { type: 'audio', quality: 'best' };
  if (fmt === 'mp4') opts.format = 'mp4'; // iOS Safari AAC/mp4 ister, webm/opus çalmaz
  const format = info.chooseFormat(opts);
  const url = await format.decipher(yt.session.player);
  if (!url) throw new Error('Format URL yok');

  const expire = Number(new URL(url).searchParams.get('expire')) * 1000;
  const exp = Math.min(Date.now() + 30 * 60 * 1000, Number.isFinite(expire) && expire > 0 ? expire - 60_000 : Infinity);
  const entry = { url, mime: (format.mime_type || 'audio/mp4').split(';')[0], exp };
  urlCache.set(key, entry);
  if (urlCache.size > 500) urlCache.delete(urlCache.keys().next().value);
  return entry;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function upstreamHeaders(client, range) {
  const headers = { accept: '*/*', range: range || 'bytes=0-' };
  const ua = Constants.CLIENTS?.[client]?.USER_AGENT;
  if (String(client).startsWith('PIPED')) {
    headers['user-agent'] = BROWSER_UA;
  } else if (ua) {
    headers['user-agent'] = ua;
  } else {
    headers['user-agent'] = BROWSER_UA;
    headers.origin = 'https://www.youtube.com';
    headers.referer = 'https://www.youtube.com/';
  }
  return headers;
}

// googlevideo'dan istek at; header'lar ve İLK VERİ süre içinde gelmezse hata fırlat.
// (Sessizce takılan istekler yerine hangi client'ın neden başarısız olduğunu görelim.)
async function openUpstream(entry, client, range, outerSignal) {
  const ac = new AbortController();
  const signal = outerSignal ? AbortSignal.any([outerSignal, ac.signal]) : ac.signal;
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const up = await fetch(entry.url, { headers: upstreamHeaders(client, range), signal, redirect: 'follow' });
    if (!up.ok) {
      await up.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${up.status}`);
    }
    const reader = up.body.getReader();
    const first = await reader.read(); // ilk parça gelene kadar timer çalışmaya devam eder
    if (first.done || !first.value?.length) throw new Error('boş yanıt');
    return { up, reader, first: first.value };
  } catch (e) {
    if (ac.signal.aborted && !outerSignal?.aborted) throw new Error('12 sn içinde veri gelmedi (takıldı)');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Yedek kaynak: herkese açık Piped örnekleri ----------
// YouTube, datacenter IP'lerinden (Render dahil) gelen /player isteklerini engelliyorsa, başkalarının
// işlettiği Piped API'lerinden ses adresi alınır (ses onların proxy'sinden gelir, bize IP kilidi yok).
// Herkese açık örnekler paylaşımlı altyapıdır: dengesiz olabilir ve nazik kullanılmalı (kişisel, az istek).
const PIPED_ON = process.env.PIPED_FALLBACK !== 'off';
const PIPED_LIST_URL = process.env.PIPED_LIST_URL || 'https://piped-instances.kavin.rocks/';
const PIPED_DOC_URL = 'https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md';
const PIPED_STATIC = (process.env.PIPED_INSTANCES || '').split(',').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean);
const PIPED_TRIES = Number(process.env.PIPED_TRIES) || 4; // aynı anda kaç örneğe sorulsun
// Piped'in resmi dokümanındaki liste (canlı liste alınamazsa bu kullanılır)
const PIPED_BUILTIN = [
  'https://pipedapi.leptons.xyz', 'https://pipedapi.nosebs.ru', 'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de', 'https://api.piped.yt', 'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si', 'https://pipedapi.ducks.party', 'https://piped-api.codespace.cz',
  'https://pipedapi.reallyaweso.me', 'https://api.piped.private.coffee', 'https://pipedapi.darkness.services',
  'https://pipedapi.orangenet.cc', 'https://pipedapi-libre.kavin.rocks', 'https://pipedapi.kavin.rocks'
];
let pipedList = { at: 0, list: [] };
let pipedRR = 0;
const pipedBad = new Map(); // api -> bu zamana kadar atla
const PIPED_BAD_MS = 15 * 60_000;
const markBad = (api) => pipedBad.set(api, Date.now() + PIPED_BAD_MS);
// Örneğin kendisi bozuksa (ağ/5xx/429/403) askıya al; "video yok" gibi içerik hatalarında alma.
const isInstanceFault = (msg) => /HTTP (5\d\d|429|403|408)|zaman|cevap gelmedi|takıldı|fetch failed|ECONN|ENOTFOUND|certificate|timeout|abort/i.test(String(msg));

async function pipedInstances() {
  if (PIPED_STATIC.length) return PIPED_STATIC;
  if (pipedList.list.length && Date.now() - pipedList.at < 30 * 60_000) return pipedList.list;
  const found = [];
  const fetchText = async (url) => {
    const r = await fetch(url, { headers: { 'user-agent': BROWSER_UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  };
  try { // 1) canlı liste (uptime bilgisiyle)
    const j = await (await fetchText(PIPED_LIST_URL)).json();
    found.push(...(Array.isArray(j) ? j : [])
      .filter((i) => i?.api_url && Number(i.uptime_24h ?? 100) >= 70)
      .sort((x, y) => Number(y.uptime_24h ?? 0) - Number(x.uptime_24h ?? 0))
      .map((i) => String(i.api_url)));
  } catch (e) { console.error('[piped canlı liste]', e?.message ?? e); }
  try { // 2) resmi dokümandaki tablo
    const md = await (await fetchText(PIPED_DOC_URL)).text();
    for (const line of md.split('\n')) {
      const cell = (line.split('|')[1] || '').trim();
      if (/^https?:\/\/[^\s!]+$/.test(cell)) found.push(cell);
    }
  } catch (e) { console.error('[piped doküman listesi]', e?.message ?? e); }
  found.push(...PIPED_BUILTIN); // 3) yerleşik liste
  const uniq = [...new Set(found.map((u) => u.replace(/\/+$/, '')))];
  // resmi kavin.rocks örnekleri sık kapalı oluyor; sona at
  const list = [...uniq.filter((u) => !/kavin\.rocks/.test(u)), ...uniq.filter((u) => /kavin\.rocks/.test(u))];
  pipedList = { at: Date.now(), list };
  console.log(`[piped] ${list.length} örnek`);
  return list;
}

const pipedEntries = new Map();
async function resolvePiped(id, api, fmt) {
  const key = `${id}:${api}:${fmt}`;
  const hit = pipedEntries.get(key);
  if (hit && hit.exp > Date.now()) return hit;
  const r = await fetch(`${api}/streams/${id}`, { headers: { 'user-agent': BROWSER_UA }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`streams HTTP ${r.status}`);
  const j = await r.json();
  if (j?.error) throw new Error(String(j.message || j.error).slice(0, 120));
  let audios = (j.audioStreams || []).filter((a) => a?.url && !a.videoOnly);
  if (fmt === 'mp4') audios = audios.filter((a) => /mp4|m4a/i.test(`${a.mimeType} ${a.format}`));
  if (!audios.length) throw new Error('uygun ses akışı yok');
  audios.sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0));
  const entry = { url: audios[0].url, mime: fmt === 'mp4' ? 'audio/mp4' : (String(audios[0].mimeType || 'audio/mp4').split(';')[0]), exp: Date.now() + 20 * 60_000 };
  pipedEntries.set(key, entry);
  if (pipedEntries.size > 300) pipedEntries.delete(pipedEntries.keys().next().value);
  return entry;
}

// Doğrudan YouTube client'ları hep aynı sebeple (403/bot) düşüyorsa her şarkıda 30 sn boşa beklemeyelim.
const DIRECT_ON = process.env.DIRECT !== 'off';
const DIRECT_COOLDOWN = 10 * 60_000;
let directBlockedUntil = 0;

app.get('/stream/:id', auth, async (req, res) => {
  const id = req.params.id;
  if (!isVideoId(id)) return res.status(400).json({ error: 'Geçersiz videoId' });
  const fmt = req.query.format === 'any' ? 'any' : 'mp4';
  const range = req.get('range');
  const errors = [];

  const ac = new AbortController();
  res.on('close', () => ac.abort()); // kullanıcı şarkıyı geçince upstream'i kes

  // Bir kaynaktan akışı dene; başarılıysa true (yanıt gönderildi), değilse hata fırlatır.
  async function attempt(headerClient, getEntry) {
    const entry = await getEntry();
    const { up, reader, first } = await openUpstream(entry, headerClient, range, ac.signal);

    res.status(up.status);
    for (const name of ['content-type', 'content-length', 'content-range']) {
      const v = up.headers.get(name);
      if (v) res.set(name, v);
    }
    if (!res.get('content-type')) res.set('content-type', entry.mime);
    res.set('accept-ranges', 'bytes');
    res.set('cache-control', 'private, no-store');

    res.write(first);
    try {
      for (;;) {
        const { done, value } = await withTimeout(reader.read(), 20_000, 'akış');
        if (done) break;
        if (!res.write(value)) await new Promise((r) => { res.once('drain', r); res.once('close', r); });
        if (ac.signal.aborted) break;
      }
      res.end();
    } catch {
      reader.cancel().catch(() => {});
      res.destroy();
    }
    return true;
  }

  // 1) Doğrudan YouTube (InnerTube)
  if (DIRECT_ON && Date.now() >= directBlockedUntil) {
    const direct = [];
    for (const client of CLIENTS) {
      if (ac.signal.aborted) return;
      try {
        await attempt(client, () => withTimeout(resolveAudio(id, client, fmt), 20_000, `${client} çözümleme`));
        return;
      } catch (e) {
        if (ac.signal.aborted) return;
        urlCache.delete(cacheKey(id, client, fmt));
        direct.push(`${client}: ${e?.message ?? e}`);
      }
    }
    errors.push(...direct);
    if (PIPED_ON) directBlockedUntil = Date.now() + DIRECT_COOLDOWN; // sadece yedek varsa doğrudan denemeyi askıya al
  } else if (DIRECT_ON) {
    errors.push(`YouTube doğrudan: ${Math.ceil((directBlockedUntil - Date.now()) / 60000)} dk askıda (son denemeler başarısız)`);
  }

  // 2) Yedek: herkese açık Piped örnekleri (birkaçına aynı anda sor, ilk çalışanı kullan)
  if (PIPED_ON) {
    const all = await pipedInstances();
    const now = Date.now();
    const usable = all.filter((api) => (pipedBad.get(api) || 0) < now);
    const start = usable.length ? pipedRR % usable.length : 0;
    const ordered = [...usable.slice(start), ...usable.slice(0, start)].slice(0, PIPED_TRIES);
    const pending = new Map();
    for (const api of ordered) {
      pending.set(api, resolvePiped(id, api, fmt).then((entry) => ({ api, entry }), (error) => ({ api, error })));
    }
    while (pending.size) {
      if (ac.signal.aborted) return;
      const r = await Promise.race(pending.values());
      pending.delete(r.api);
      const host = new URL(r.api).host;
      if (r.error) {
        const msg = r.error?.message ?? String(r.error);
        if (isInstanceFault(msg)) markBad(r.api);
        errors.push(`Piped ${host}: ${msg}`);
        continue;
      }
      try {
        await attempt('PIPED', async () => r.entry);
        pipedRR++;
        return;
      } catch (e) {
        if (ac.signal.aborted) return;
        pipedEntries.delete(`${id}:${r.api}:${fmt}`);
        markBad(r.api);
        errors.push(`Piped ${host} (ses): ${e?.message ?? e}`);
      }
    }
  }

  console.error(`[stream ${id}]`, errors.join(' | '));
  res.status(502).json({ error: 'Hiçbir kaynaktan akış alınamadı', details: errors });
});

// ---------- Teşhis ----------
// Render IP'sinin YouTube tarafından engellenip engellenmediğini burada göreceksin.
// Client'lar paralel denenir, her biri süre sınırlıdır; toplam ~30 sn'yi geçmez.
app.get('/api/diag', auth, h(async (req, res) => {
  const id = isVideoId(req.query.id) ? req.query.id : 'dQw4w9WgXcQ';
  const started = Date.now();

  let sessionError = null;
  try {
    await withTimeout(getYT(), 25_000, 'YouTube oturumu');
  } catch (e) {
    sessionError = e?.message ?? String(e);
  }

  const results = await Promise.all(CLIENTS.map(async (client) => {
    const t0 = Date.now();
    const r = { client };
    try {
      const yt = await withTimeout(getYT(), 25_000, 'oturum');
      const info = await withTimeout(yt.getBasicInfo(id, { client }), 15_000, 'player isteği');
      const ps = info.playability_status;
      r.playability = ps ? `${ps.status}${ps.reason ? ': ' + ps.reason : ''}` : 'bilinmiyor';
      r.formats = (info.streaming_data?.adaptive_formats?.length ?? 0) + (info.streaming_data?.formats?.length ?? 0);
      const e = await withTimeout(resolveAudio(id, client, 'mp4'), 20_000, 'çözümleme');
      r.mime = e.mime;
      const { up, reader } = await openUpstream(e, client, 'bytes=0-1', null);
      r.status = up.status;
      await reader.cancel().catch(() => {});
    } catch (e) {
      r.error = e?.message ?? String(e);
      urlCache.delete(cacheKey(id, client, 'mp4'));
    }
    r.ms = Date.now() - t0;
    return r;
  }));

  // Yedek kaynak: ilk birkaç Piped örneği (askıdakiler dahil hepsini yeniden dene)
  const piped = [];
  if (PIPED_ON) {
    const list = (await pipedInstances()).slice(0, 8);
    await Promise.all(list.map(async (api) => {
      const t0 = Date.now();
      const r = { instance: new URL(api).host };
      try {
        const e = await withTimeout(resolvePiped(id, api, 'mp4'), 12_000, 'streams');
        const { up, reader } = await openUpstream(e, 'PIPED', 'bytes=0-1', null);
        r.status = up.status;
        pipedBad.delete(api);
        await reader.cancel().catch(() => {});
      } catch (e) {
        r.error = e?.message ?? String(e);
        if (isInstanceFault(r.error)) markBad(api);
      }
      r.ms = Date.now() - t0;
      piped.push(r);
    }));
    piped.sort((x, y) => (y.status ? 1 : 0) - (x.status ? 1 : 0) || x.ms - y.ms);
  }

  if (results.some((x) => x.status === 200 || x.status === 206)) directBlockedUntil = 0; // doğrudan yol düzelmiş
  res.json({
    node: process.version,
    piped,
    directBlocked: directBlockedUntil > Date.now(),
    hasCookie: !!process.env.YT_COOKIE,
    hasPoToken: !!process.env.PO_TOKEN,
    hasVisitorData: !!process.env.VISITOR_DATA,
    sessionError,
    totalMs: Date.now() - started,
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
