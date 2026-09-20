/* Manify PWA — tek dosya, bağımlılık yok. */
(() => {
'use strict';

// ============================================================ yardımcılar
const $ = (s, r = document) => r.querySelector(s);
const audio = $('#audio');

const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  library: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  play: '<polygon class="f" points="7 3 20 12 7 21 7 3"/>',
  pause: '<rect class="f" x="6" y="4" width="4" height="16" rx="1"/><rect class="f" x="14" y="4" width="4" height="16" rx="1"/>',
  next: '<polygon class="f" points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  prev: '<polygon class="f" points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>',
  shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  repeat1: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="15.5" font-size="9" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">1</text>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  heartOn: '<path class="f" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  more: '<circle class="f" cx="5" cy="12" r="1.6"/><circle class="f" cx="12" cy="12" r="1.6"/><circle class="f" cx="19" cy="12" r="1.6"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  loader: '<path d="M12 3a9 9 0 1 0 9 9"/>'
};
const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const setIcon = (el, n) => { if (el) el.innerHTML = svg(n); };

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(3)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const iconBtn = (name, cls, onclick, label) => {
  const b = h('button', { class: cls, onclick, 'aria-label': label || name });
  setIcon(b, name);
  return b;
};

const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* dolu/kapalı */ } };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ============================================================ durum
const S = {
  key: localStorage.getItem('mf_key') || '',
  base: (localStorage.getItem('mf_base') || '').replace(/\/+$/, ''),
  tab: 'home',
  stack: [],
  homeData: null,
  search: { q: '', type: 'all', res: null },
  favs: load('mf_favs', []),
  hist: load('mf_hist', []),
  queue: [], idx: -1, trail: [], played: new Set(),
  shuffle: load('mf_shuffle', false), repeat: load('mf_repeat', 'off'),
  seeking: false, buffering: false, retried: false, extending: false,
  pane: null, savedPos: 0, lyr: null
};
window.__mf = S; // hata ayıklama için

// ============================================================ API
function apiUrl(path, params = {}) {
  const u = new URL((S.base || '') + path, location.origin);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  return u;
}

async function api(path, params) {
  const ctl = new AbortController();
  const kill = setTimeout(() => ctl.abort(), 90000);
  const slow = setTimeout(() => toast('Sunucu uyanıyor olabilir, biraz sürebilir…', 6000), 7000);
  try {
    const r = await fetch(apiUrl(path, { ...params, key: S.key }), { signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { setTab('settings'); throw new Error('API anahtarı hatalı veya eksik'); }
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Zaman aşımı');
    throw e;
  } finally {
    clearTimeout(kill); clearTimeout(slow);
  }
}

const streamUrl = (id, extra = {}) => apiUrl(`/stream/${id}`, { key: S.key, ...extra }).toString();

// ============================================================ model yardımcıları
const isPlayable = (i) => (i.kind === 'song' || i.kind === 'video') && /^[\w-]{11}$/.test(i.id || '');
const artistText = (t) => (t.artists || []).map((a) => a.name).filter(Boolean).join(', ') || t.subtitle || '';
const trackOf = (i) => ({
  id: i.id, title: i.title, artists: i.artists || [], album: i.album || null,
  thumb: i.thumb || null, duration: i.duration || null, kind: i.kind || 'song'
});
const isFav = (id) => S.favs.some((t) => t.id === id);
function toggleFav(t) {
  if (isFav(t.id)) { S.favs = S.favs.filter((x) => x.id !== t.id); toast('Favorilerden çıkarıldı'); }
  else { S.favs.unshift(trackOf(t)); toast('Favorilere eklendi'); }
  save('mf_favs', S.favs);
  updateFavUI();
}
function subLine(i) {
  switch (i.kind) {
    case 'song': return [artistText(i), i.album?.name].filter(Boolean).join(' • ');
    case 'video': return artistText(i);
    case 'album': return i.subtitle || [artistText(i), i.year].filter(Boolean).join(' • ');
    case 'artist': return i.subtitle || i.subscribers || 'Sanatçı';
    case 'playlist': return i.subtitle || (i.itemCount ? `${i.itemCount} şarkı` : artistText(i));
    default: return i.subtitle || artistText(i);
  }
}
function browseKind(id) {
  if (/^UC/.test(id)) return 'artist';
  if (/^MPRE/.test(id)) return 'album';
  return 'playlist';
}
const detailType = (i) => (['album', 'artist', 'playlist'].includes(i.kind) ? i.kind : i.kind === 'browse' ? browseKind(i.id) : null);

function openItem(item, list = []) {
  if (isPlayable(item)) {
    const tracks = list.filter(isPlayable).map(trackOf);
    const i = Math.max(0, tracks.findIndex((t) => t.id === item.id));
    playList(tracks.length ? tracks : [trackOf(item)], tracks.length ? i : 0);
    return;
  }
  const type = detailType(item);
  if (type) go({ v: 'detail', type, id: item.id, title: item.title });
}

// ============================================================ UI: toast & sheet
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function openSheet(...nodes) {
  const s = $('#sheet');
  s.replaceChildren(...nodes);
  s.hidden = false; $('#sheet-back').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-back').hidden = true; }
$('#sheet-back').addEventListener('click', closeSheet);

function trackSheet(t) {
  const item = (label, fn) => h('button', { class: 'item', onclick: () => { closeSheet(); fn(); } }, label);
  const nodes = [h('h3', null, t.title), h('div', { class: 'dim' }, artistText(t))];
  nodes.push(item('Sıradaki olarak çal', () => queueInsert(t, true)));
  nodes.push(item('Kuyruğa ekle', () => queueInsert(t, false)));
  nodes.push(item(isFav(t.id) ? 'Favorilerden çıkar' : 'Favorilere ekle', () => toggleFav(t)));
  const a = (t.artists || []).find((x) => x.id);
  if (a) nodes.push(item(`Sanatçıya git: ${a.name}`, () => { closePlayer(); go({ v: 'detail', type: 'artist', id: a.id, title: a.name }); }));
  if (t.album?.id) nodes.push(item(`Albüme git: ${t.album.name}`, () => { closePlayer(); go({ v: 'detail', type: 'album', id: t.album.id, title: t.album.name }); }));
  openSheet(...nodes);
}

// ============================================================ görünümler
const view = $('#view');
const skeleton = (n = 4) => h('div', { class: 'shelf' }, Array.from({ length: n }, () => h('div', { class: 'card' }, h('div', { class: 'skeleton' }))));
const errorBox = (msg, retry) => h('div', { class: 'center' }, h('div', null, msg), retry && h('button', { class: 'btn', style: 'margin-top:12px', onclick: retry }, 'Tekrar dene'));
const img = (src, cls) => h('img', { class: cls, src: src || '', loading: 'lazy', alt: '', referrerpolicy: 'no-referrer' });

function card(item, list) {
  return h('div', { class: 'card' + (item.kind === 'artist' ? ' artist' : ''), 'data-id': item.id, onclick: () => openItem(item, list) },
    img(item.thumb), h('div', { class: 't' }, item.title), h('div', { class: 's' }, subLine(item)));
}
const shelf = (items) => h('div', { class: 'shelf' }, items.map((i) => card(i, items)));

function row(item, list, opts = {}) {
  const playable = isPlayable(item);
  const kids = [];
  kids.push(opts.index != null ? h('div', { class: 'idx' }, opts.index) : img(item.thumb, 'art'));
  kids.push(h('div', { class: 'meta' }, h('div', { class: 't' }, item.title), h('div', { class: 's' }, subLine(item))));
  if (playable && item.duration) kids.push(h('div', { class: 'dur dim' }, fmt(item.duration)));
  if (playable) kids.push(iconBtn('more', 'ibtn', (e) => { e.stopPropagation(); trackSheet(trackOf(item)); }, 'Seçenekler'));
  const cur = S.queue[S.idx];
  return h('div', { class: 'row' + (item.kind === 'artist' ? ' artist' : '') + (cur && cur.id === item.id ? ' playing' : ''), 'data-id': item.id, onclick: () => openItem(item, list) }, kids);
}

// --- Ana sayfa
async function viewHome(el) {
  el.append(h('h1', null, 'Ana Sayfa'));
  if (S.hist.length) el.append(h('h2', null, 'Son çalınanlar'), shelf(S.hist.slice(0, 15).map((t) => ({ ...t, kind: 'song' }))));
  const box = h('div', null, skeleton());
  el.append(box);
  try {
    S.homeData = S.homeData || await api('/api/home');
    box.replaceChildren();
    const secs = S.homeData.sections || [];
    if (!secs.length) box.append(h('div', { class: 'center' }, 'Gösterilecek bir şey yok. Ara sekmesini dene.'));
    for (const s of secs) box.append(s.title ? h('h2', null, s.title) : '', shelf(s.items));
  } catch (e) {
    box.replaceChildren(errorBox(e.message, () => { S.homeData = null; render(); }));
  }
}

// --- Arama
function viewSearch(el) {
  const st = S.search;
  const body = h('div');
  const input = h('input', { type: 'search', placeholder: 'Şarkı, sanatçı, albüm ara', enterkeyhint: 'search', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  input.value = st.q;
  const types = [['all', 'Tümü'], ['song', 'Şarkılar'], ['video', 'Videolar'], ['album', 'Albümler'], ['artist', 'Sanatçılar'], ['playlist', 'Listeler']];
  const chips = h('div', { class: 'chips' }, types.map(([v, l]) => h('button', {
    class: 'chip' + (st.type === v ? ' on' : ''), onclick: (e) => {
      st.type = v;
      chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      e.currentTarget.classList.add('on');
      if (input.value.trim()) doSearch(input.value);
    }
  }, l)));
  el.append(h('div', { class: 'searchbar' }, input, chips), body);

  let seq = 0;
  async function doSearch(q) {
    q = q.trim(); if (!q) return;
    st.q = q; input.value = q; input.blur();
    const my = ++seq;
    body.replaceChildren(skeleton());
    try {
      const res = await api('/api/search', { q, type: st.type, pages: st.type === 'all' ? 1 : 2 });
      if (my !== seq) return;
      st.res = { q, type: st.type, data: res };
      showResults(res);
    } catch (e) { if (my === seq) body.replaceChildren(errorBox(e.message, () => doSearch(q))); }
  }
  function showResults(res) {
    body.replaceChildren();
    if (!res.items.length) return body.append(h('div', { class: 'center' }, 'Sonuç bulunamadı'));
    if (st.type === 'all') {
      for (const s of res.sections) {
        body.append(s.title ? h('h2', null, s.title) : '');
        s.items.forEach((i) => body.append(row(i, s.items)));
      }
    } else {
      res.items.forEach((i) => body.append(row(i, res.items)));
    }
  }
  const suggest = debounce(async () => {
    const q = input.value.trim();
    if (!q) { body.replaceChildren(); st.res = null; return; }
    const my = ++seq;
    try {
      const r = await api('/api/suggest', { q });
      if (my !== seq) return;
      body.replaceChildren(h('div', { class: 'sugg' }, (r.suggestions || []).slice(0, 8).map((s) => h('button', { onclick: () => doSearch(s) }, s))));
    } catch { /* öneri yoksa sessiz geç */ }
  }, 280);
  input.addEventListener('input', suggest);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(input.value); });
  if (st.res && st.res.type === st.type && st.res.q === st.q) showResults(st.res.data);
}

// --- Kitaplık
function viewLibrary(el) {
  el.append(h('h1', null, 'Kitaplık'));
  const favItems = S.favs.map((t) => ({ ...t, kind: 'song' }));
  el.append(h('h2', null, `Favoriler (${favItems.length})`));
  if (favItems.length) {
    el.append(h('div', { class: 'actions', style: 'justify-content:flex-start' },
      h('button', { class: 'btn pri', onclick: () => playList(favItems.map(trackOf), 0) }, 'Oynat'),
      h('button', { class: 'btn', onclick: () => playList(shuffled(favItems.map(trackOf)), 0) }, 'Karıştır')));
    favItems.forEach((i) => el.append(row(i, favItems)));
  } else el.append(h('div', { class: 'dim' }, 'Şarkılarda ♥ simgesine dokunarak favori ekle.'));
  const hist = S.hist.map((t) => ({ ...t, kind: 'song' }));
  if (hist.length) {
    el.append(h('h2', null, 'Geçmiş'));
    hist.slice(0, 30).forEach((i) => el.append(row(i, hist)));
  }
}

// --- Detay: albüm / liste / sanatçı
async function viewDetail(el, d) {
  el.append(iconBtn('back', 'ibtn back', back, 'Geri'));
  const box = h('div', null, skeleton(2));
  el.append(box);
  try {
    const data = await api(`/api/${d.type}/${encodeURIComponent(d.id)}`, d.type === 'playlist' ? { pages: 3 } : {});
    box.replaceChildren();
    const hd = data.header || {};
    const tracks = (data.tracks || []).filter(isPlayable);
    const all = d.type === 'artist'
      ? (data.sections || []).flatMap((s) => s.items).filter(isPlayable)
      : tracks;
    box.append(h('div', { class: 'dhead' + (d.type === 'artist' ? ' artist' : '') },
      img(hd.thumb),
      h('div', { class: 't' }, hd.title || d.title || ''),
      h('div', { class: 's' }, [hd.artist || hd.subtitle, hd.secondSubtitle].filter(Boolean).join(' • '))));
    if (all.length) {
      box.append(h('div', { class: 'actions' },
        h('button', { class: 'btn pri', onclick: () => playList(all.map(trackOf), 0) }, d.type === 'artist' ? 'Popüler' : 'Oynat'),
        h('button', { class: 'btn', onclick: () => playList(shuffled(all.map(trackOf)), 0) }, 'Karıştır')));
    }
    if (hd.description) box.append(h('div', { class: 'desc' }, hd.description));
    if (d.type !== 'artist') {
      tracks.forEach((t, n) => box.append(row(t, tracks, d.type === 'album' ? { index: n + 1 } : {})));
      if (!tracks.length) box.append(h('div', { class: 'center' }, 'Şarkı bulunamadı'));
    }
    for (const s of data.sections || []) {
      if (!s.items.length) continue;
      box.append(s.title ? h('h2', null, s.title) : '');
      if (s.items.every(isPlayable)) s.items.slice(0, 10).forEach((t) => box.append(row(t, s.items)));
      else box.append(shelf(s.items));
    }
  } catch (e) {
    box.replaceChildren(errorBox(e.message, render));
  }
}

// --- Ayarlar
function viewSettings(el) {
  el.append(h('h1', null, 'Ayarlar'));
  const key = h('input', { type: 'password', placeholder: 'Boş bırakabilirsin', autocomplete: 'off', autocapitalize: 'off' });
  key.value = S.key;
  const base = h('input', { type: 'url', placeholder: 'Boş bırak: bu siteyi kullanır', autocomplete: 'off', autocapitalize: 'off' });
  base.value = S.base;
  const out = h('div', { style: 'margin-top:14px' });

  const saveBtn = h('button', { class: 'btn pri', onclick: () => {
    S.key = key.value.trim(); S.base = base.value.trim().replace(/\/+$/, '');
    localStorage.setItem('mf_key', S.key); localStorage.setItem('mf_base', S.base);
    S.homeData = null; toast('Kaydedildi');
  } }, 'Kaydet');

  const diagBtn = h('button', { class: 'btn', onclick: async () => {
    saveBtn.click();
    out.replaceChildren(h('div', { class: 'dim' }, 'Test ediliyor… (ilk seferde 1 dakikayı bulabilir)'));
    try {
      const r = await api('/api/diag');
      const good = (x) => x.status === 200 || x.status === 206;
      const direct = r.results.some(good);
      const viaPiped = (r.piped || []).some(good);
      const style = 'margin-top:10px;white-space:pre-wrap;-webkit-user-select:text;user-select:text';
      const line = (x) => h('div', { class: 'dim', style },
        `${good(x) ? '✓' : '✗'} ${x.client} (${x.ms} ms)\n  player: ${x.playability ?? '—'}${x.formats != null ? ' • ' + x.formats + ' format' : ''}\n  ${x.status ? 'akış: HTTP ' + x.status : 'hata: ' + (x.error ?? '?')}`);
      const pline = (x) => h('div', { class: 'dim', style },
        `${good(x) ? '✓' : '✗'} Piped ${x.instance} (${x.ms} ms)\n  ${x.status ? 'akış: HTTP ' + x.status : 'hata: ' + (x.error ?? '?')}`);
      const head = direct ? '✓ Ses akışı çalışıyor (YouTube doğrudan)'
        : viaPiped ? '✓ Ses akışı yedek kaynaktan (Piped) çalışıyor — YouTube doğrudan engelli'
        : '✗ Hiçbir kaynak çalışmıyor';
      out.replaceChildren(
        h('div', { style: 'font-weight:700;margin-bottom:4px' }, head),
        r.sessionError ? h('div', { class: 'dim', style: 'white-space:pre-wrap' }, 'YouTube oturumu: ' + r.sessionError) : '',
        ...r.results.map(line),
        ...(r.piped || []).map(pline),
        h('div', { class: 'dim', style: 'margin-top:10px' }, `cookie: ${r.hasCookie ? 'var' : 'yok'} • po_token: ${r.hasPoToken ? 'var' : 'yok'} • ${r.node} • ${Math.round(r.totalMs / 1000)} sn`));
    } catch (e) { out.replaceChildren(h('div', { style: 'white-space:pre-wrap' }, '✗ Test isteği başarısız: ' + e.message + (/HTTP 5\d\d|Zaman/.test(e.message) ? '\n(Render isteği zaman aşımıyla kesmiş olabilir; sunucu loglarına bak.)' : ''))); }
  } }, 'Bağlantıyı test et');

  const resetBtn = h('button', { class: 'btn', onclick: async () => {
    try { await api('/api/reset'); toast('Sunucu oturumu sıfırlandı'); } catch (e) { toast(e.message); }
  } }, 'Sunucu oturumunu sıfırla');

  const clearBtn = h('button', { class: 'btn', onclick: () => {
    if (!confirm('Favoriler ve geçmiş silinsin mi?')) return;
    S.favs = []; S.hist = []; save('mf_favs', []); save('mf_hist', []); toast('Temizlendi');
  } }, 'Favori/geçmişi temizle');

  const le = load('mf_err', null);
  if (le) el.append(h('h2', null, 'Son ses hatası'), h('div', { class: 'dim', style: 'white-space:pre-wrap;-webkit-user-select:text;user-select:text;font-size:13px' },
    `${new Date(le.at).toLocaleTimeString('tr-TR')} • ${le.title}\n${le.detail}`));
  el.append(h('label', { class: 'dim', style: 'display:block;margin:12px 0 6px;font-size:13px' }, 'API anahtarı (sunucuda API_KEY tanımlıysa gerekir)'), key,
    h('label', { class: 'dim', style: 'display:block;margin:12px 0 6px;font-size:13px' }, 'Sunucu adresi (isteğe bağlı)'), base,
    h('div', { class: 'actions', style: 'justify-content:flex-start;flex-wrap:wrap' }, saveBtn, diagBtn, resetBtn, clearBtn), out,
    h('div', { class: 'dim', style: 'margin-top:26px;font-size:13px' }, 'iPhone’da yüklemek için: Safari → Paylaş → Ana Ekrana Ekle. Sadece kişisel kullanım içindir.'));
  for (const i of el.querySelectorAll('input')) i.style.cssText = 'width:100%;height:44px;border-radius:10px;border:0;background:var(--bg3);padding:0 12px;outline:none;-webkit-user-select:text;user-select:text';
}

// ============================================================ yönlendirme
const roots = { home: viewHome, search: viewSearch, library: viewLibrary, settings: viewSettings };

function render() {
  const top = S.stack[S.stack.length - 1];
  view.replaceChildren();
  const fn = top ? viewDetail : roots[S.tab];
  fn(view, top);
  view.scrollTop = top?.scroll || 0;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  markPlaying();
}
function go(d) {
  const top = S.stack[S.stack.length - 1];
  if (top) top.scroll = view.scrollTop;
  S.stack.push(d);
  render();
}
function back() { S.stack.pop(); render(); }
function setTab(t) {
  if (t === S.tab && !S.stack.length) { view.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  S.tab = t; S.stack = []; render();
}
document.querySelectorAll('#tabs button').forEach((b) => {
  setIcon($('span', b), b.dataset.tab);
  b.addEventListener('click', () => setTab(b.dataset.tab));
});

function markPlaying() {
  const cur = S.queue[S.idx];
  document.querySelectorAll('#view .row').forEach((r) => r.classList.toggle('playing', !!cur && r.dataset.id === cur.id));
}

// ============================================================ oynatıcı
const recordError = (title, detail) => save('mf_err', { title, detail, at: Date.now() });
const cur = () => S.queue[S.idx];
const shuffled = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const persistQueue = () => save('mf_q', { queue: S.queue.slice(0, 200), idx: Math.min(S.idx, 199) });

function playList(tracks, i = 0) {
  if (!tracks.length) return;
  S.queue = tracks.slice(); S.trail = []; S.played = new Set(); S.idx = -1;
  playIndex(i);
}

function queueInsert(t, next) {
  t = trackOf(t);
  if (!S.queue.length) return playList([t], 0);
  S.queue.splice(next ? S.idx + 1 : S.queue.length, 0, t);
  persistQueue(); renderQueue();
  toast(next ? 'Sıradaki olarak eklendi' : 'Kuyruğa eklendi');
}

function playIndex(i, opts = {}) {
  const t = S.queue[i];
  if (!t) return;
  if (!opts.fromTrail && S.idx >= 0 && S.idx !== i && cur()) S.trail.push(S.idx);
  if (S.trail.length > 100) S.trail.shift();
  S.idx = i; S.retried = false; S.buffering = true;
  audio.src = streamUrl(t.id);
  clearTimeout(S.stall);
  S.stall = setTimeout(() => {
    if (cur()?.id === t.id && audio.readyState < 3 && !audio.paused) {
      toast('Ses 30 sn’dir gelmedi. Ayarlar → “Bağlantıyı test et”', 8000);
      recordError(t.title, '30 sn içinde ses verisi gelmedi');
    }
  }, 30000);
  if (opts.seek) audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = opts.seek; } catch { /* */ } }, { once: true });
  const p = audio.play();
  if (p && p.catch) p.catch((e) => { S.buffering = false; if (e.name !== 'AbortError') toast('Çalmak için ▶ düğmesine dokun'); updatePlayUI(); });
  S.hist = [trackOf(t), ...S.hist.filter((x) => x.id !== t.id)].slice(0, 60);
  save('mf_hist', S.hist);
  persistQueue();
  updateTrackUI();
  updateMediaSession();
  extendIfNeeded();
  if (S.pane === 'lyrics') loadLyrics();
  renderQueue();
}

function nextIndex(auto) {
  const n = S.queue.length;
  if (!n) return -1;
  if (auto && S.repeat === 'one') return S.idx;
  if (S.shuffle && n > 1) {
    S.played.add(S.idx);
    let pool = S.queue.map((_, k) => k).filter((k) => !S.played.has(k));
    if (!pool.length) {
      if (S.repeat === 'off') return -1;
      S.played = new Set([S.idx]);
      pool = S.queue.map((_, k) => k).filter((k) => k !== S.idx);
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (S.idx + 1 < n) return S.idx + 1;
  return S.repeat === 'all' ? 0 : -1;
}
function next(auto = false) {
  const k = nextIndex(auto);
  if (k < 0) { audio.pause(); updatePlayUI(); return; }
  playIndex(k);
}
function prev() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (S.trail.length) return playIndex(S.trail.pop(), { fromTrail: true });
  if (S.idx > 0) return playIndex(S.idx - 1, { fromTrail: true });
  audio.currentTime = 0;
}
function togglePlay() {
  if (!cur()) return;
  if (!audio.src) return playIndex(S.idx, { seek: S.savedPos });
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

// Sıra bitmeye yakınsa "sıradaki/radyo" önerilerini kuyruğa ekle
async function extendIfNeeded() {
  const t = cur();
  if (!t || S.extending || S.repeat !== 'off' || S.queue.length - S.idx > 2) return;
  S.extending = true;
  try {
    const r = await api(`/api/next/${t.id}`);
    const have = new Set(S.queue.map((x) => x.id));
    const add = (r.items || []).filter(isPlayable).map(trackOf).filter((x) => !have.has(x.id));
    if (add.length && cur()?.id === t.id) { S.queue.push(...add); persistQueue(); renderQueue(); }
  } catch { /* sessiz */ } finally { S.extending = false; }
}

// --- ses olayları
audio.addEventListener('ended', () => next(true));
audio.addEventListener('waiting', () => { S.buffering = true; updatePlayUI(); });
audio.addEventListener('playing', () => { S.buffering = false; clearTimeout(S.stall); updatePlayUI(); });
audio.addEventListener('canplay', () => { S.buffering = false; updatePlayUI(); });
audio.addEventListener('play', updatePlayUI);
audio.addEventListener('pause', updatePlayUI);
audio.addEventListener('error', async () => {
  const t = cur();
  if (!t || !audio.src) return;
  if (!S.retried) { // bir kez yeniden dene (URL süresi dolmuş olabilir)
    S.retried = true;
    audio.src = streamUrl(t.id, { r: Date.now() });
    audio.play().catch(() => {});
    return;
  }
  S.buffering = false; updatePlayUI();
  let detail = '';
  try {
    const r = await fetch(streamUrl(t.id), { headers: { Range: 'bytes=0-1' } });
    if (!r.ok) { const j = await r.json().catch(() => ({})); detail = (j.details || [j.error]).filter(Boolean).join(' | '); }
  } catch (e) { detail = e.message; }
  recordError(t.title, detail || 'bilinmeyen hata');
  toast(`Çalınamadı: ${t.title}${detail ? ' — ' + detail.slice(0, 160) : ''}`, 8000);
  if (nextIndex(true) >= 0 && S.queue.length > 1) setTimeout(() => next(true), 1200);
});

let lastPos = 0, lastSave = 0;
audio.addEventListener('timeupdate', () => {
  const t = cur(); if (!t) return;
  const d = dur(), c = audio.currentTime;
  if (!S.seeking) {
    const v = d ? Math.min(1000, (c / d) * 1000) : 0;
    $('#p-range').value = v; $('#p-range').style.setProperty('--pct', v / 10 + '%');
    $('#p-cur').textContent = fmt(c);
  }
  $('#p-dur').textContent = fmt(d);
  $('#mini-bar i').style.width = (d ? (c / d) * 100 : 0) + '%';
  highlightLyrics(c);
  const now = Date.now();
  if (now - lastPos > 1000 && 'mediaSession' in navigator && navigator.mediaSession.setPositionState && d) {
    lastPos = now;
    try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(c, d), playbackRate: 1 }); } catch { /* */ }
  }
  if (now - lastSave > 5000) { lastSave = now; save('mf_pos', c); }
});
const dur = () => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (cur()?.duration || 0));

// --- UI güncellemeleri
function updatePlayUI() {
  const icon = S.buffering && !audio.paused ? 'loader' : audio.paused ? 'play' : 'pause';
  const spin = icon === 'loader';
  for (const b of [$('#p-play'), $('#mini-play')]) { setIcon(b, icon); b.classList.toggle('spin', spin); }
  $('#player').classList.toggle('paused', audio.paused);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
}
function updateFavUI() {
  const t = cur();
  setIcon($('#p-fav'), t && isFav(t.id) ? 'heartOn' : 'heart');
  $('#p-fav').style.color = t && isFav(t.id) ? 'var(--acc2)' : '';
}
function updateTrackUI() {
  const t = cur();
  document.body.classList.toggle('has-mini', !!t);
  $('#mini').hidden = !t;
  if (!t) return;
  const art = t.thumb || '';
  $('#mini-art').src = art; $('#p-art').src = art;
  $('#mini-title').textContent = t.title; $('#mini-artist').textContent = artistText(t);
  $('#p-title').textContent = t.title; $('#p-artist').textContent = artistText(t);
  $('#p-dur').textContent = fmt(t.duration || 0); $('#p-cur').textContent = '0:00';
  $('#p-range').value = 0; $('#p-range').style.setProperty('--pct', '0%');
  $('#mini-bar i').style.width = '0%';
  updateFavUI(); updatePlayUI(); markPlaying();
}
function updateModeUI() {
  $('#p-shuffle').classList.toggle('on', S.shuffle);
  setIcon($('#p-repeat'), S.repeat === 'one' ? 'repeat1' : 'repeat');
  $('#p-repeat').classList.toggle('on', S.repeat !== 'off');
}

// --- Media Session (kilit ekranı / kulaklık kontrolleri)
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const t = cur(); if (!t) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title, artist: artistText(t), album: t.album?.name || '',
    artwork: t.thumb ? [{ src: t.thumb, sizes: '544x544', type: 'image/jpeg' }] : []
  });
}
if ('mediaSession' in navigator) {
  const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* desteklenmiyor */ } };
  set('play', () => audio.play().catch(() => {}));
  set('pause', () => audio.pause());
  set('previoustrack', prev);
  set('nexttrack', () => next(false));
  set('seekto', (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
  set('seekbackward', (d) => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); });
  set('seekforward', (d) => { audio.currentTime = Math.min(dur() || 1e9, audio.currentTime + (d.seekOffset || 10)); });
}

// --- tam ekran oynatıcı
function openPlayer() { if (!cur()) return; $('#player').classList.add('open'); $('#player').setAttribute('aria-hidden', 'false'); }
function closePlayer() { $('#player').classList.remove('open'); $('#player').setAttribute('aria-hidden', 'true'); }
setIcon($('#p-close'), 'down'); setIcon($('#p-more'), 'more');
setIcon($('#p-prev'), 'prev'); setIcon($('#p-next'), 'next'); setIcon($('#p-shuffle'), 'shuffle');
setIcon($('#mini-next'), 'next'); setIcon($('#p-play'), 'play'); setIcon($('#mini-play'), 'play');
$('#mini').addEventListener('click', (e) => { if (!e.target.closest('button')) openPlayer(); });
$('#mini-play').addEventListener('click', togglePlay);
$('#mini-next').addEventListener('click', () => next(false));
$('#p-close').addEventListener('click', closePlayer);
$('#p-more').addEventListener('click', () => cur() && trackSheet(cur()));
$('#p-play').addEventListener('click', togglePlay);
$('#p-next').addEventListener('click', () => next(false));
$('#p-prev').addEventListener('click', prev);
$('#p-fav').addEventListener('click', () => cur() && toggleFav(cur()));
$('#p-shuffle').addEventListener('click', () => { S.shuffle = !S.shuffle; S.played = new Set(); save('mf_shuffle', S.shuffle); updateModeUI(); toast(S.shuffle ? 'Karıştırma açık' : 'Karıştırma kapalı'); });
$('#p-repeat').addEventListener('click', () => {
  S.repeat = S.repeat === 'off' ? 'all' : S.repeat === 'all' ? 'one' : 'off';
  save('mf_repeat', S.repeat); updateModeUI();
  toast({ off: 'Tekrar kapalı', all: 'Tümünü tekrarla', one: 'Şarkıyı tekrarla' }[S.repeat]);
});

const range = $('#p-range');
range.addEventListener('input', () => {
  S.seeking = true;
  range.style.setProperty('--pct', range.value / 10 + '%');
  $('#p-cur').textContent = fmt((range.value / 1000) * dur());
});
range.addEventListener('change', () => {
  if (dur()) audio.currentTime = (range.value / 1000) * dur();
  S.seeking = false;
});

// --- panel: sözler / kuyruk
function showPane(p) {
  S.pane = S.pane === p ? null : p;
  $('#p-lyrics').hidden = S.pane !== 'lyrics';
  $('#p-queue').hidden = S.pane !== 'queue';
  $('#p-stage').classList.toggle('overlay', !!S.pane);
  $('#p-lyr-btn').classList.toggle('on', S.pane === 'lyrics');
  $('#p-q-btn').classList.toggle('on', S.pane === 'queue');
  if (S.pane === 'lyrics') loadLyrics();
  if (S.pane === 'queue') renderQueue(true);
}
$('#p-lyr-btn').addEventListener('click', () => showPane('lyrics'));
$('#p-q-btn').addEventListener('click', () => showPane('queue'));

function renderQueue(scroll) {
  if (S.pane !== 'queue') return;
  const box = $('#p-queue');
  box.replaceChildren(...S.queue.map((t, i) => h('div', {
    class: 'row' + (i === S.idx ? ' playing' : ''), onclick: () => playIndex(i)
  }, img(t.thumb, 'art'), h('div', { class: 'meta' }, h('div', { class: 't' }, t.title), h('div', { class: 's' }, artistText(t))))));
  if (scroll) box.querySelector('.playing')?.scrollIntoView({ block: 'center' });
}

// --- sözler
function parseLRC(txt) {
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = line.replace(/\[[^\]]*\]/g, '').trim() || '♪';
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + parseFloat(m[2].replace(':', '.')), text });
  }
  return out.sort((a, b) => a.t - b.t);
}
async function loadLyrics() {
  const t = cur(); const box = $('#p-lyrics');
  if (!t) return;
  if (S.lyr && S.lyr.id === t.id && S.lyr.done) return;
  S.lyr = { id: t.id, lines: null, done: false, active: -1 };
  box.replaceChildren(h('div', { class: 'dim' }, 'Sözler yükleniyor…'));
  let synced = null, plain = null;
  try {
    const r = await api('/api/lrclib', { title: t.title, artist: (t.artists[0] && t.artists[0].name) || '', album: t.album?.name, duration: t.duration || Math.round(dur()) });
    synced = r.synced; plain = r.plain;
  } catch { /* LrcLib yoksa YT Music'e düş */ }
  if (!synced && !plain) {
    try { const r = await api(`/api/lyrics/${t.id}`); plain = r.lyrics; } catch { /* */ }
  }
  if (cur()?.id !== t.id) return; // şarkı değişti
  S.lyr.done = true;
  if (synced) {
    const lines = parseLRC(synced);
    S.lyr.lines = lines;
    box.replaceChildren(...lines.map((l) => h('div', { class: 'ln', onclick: () => { audio.currentTime = l.t; } }, l.text)));
    highlightLyrics(audio.currentTime);
  } else if (plain) {
    box.replaceChildren(h('div', { class: 'plain' }, plain));
  } else {
    box.replaceChildren(h('div', { class: 'dim' }, 'Bu şarkı için söz bulunamadı.'));
  }
}
function highlightLyrics(c) {
  const l = S.lyr; if (!l || !l.lines || S.pane !== 'lyrics') return;
  let k = -1;
  for (let i = 0; i < l.lines.length; i++) { if (l.lines[i].t <= c + 0.25) k = i; else break; }
  if (k === l.active) return;
  l.active = k;
  const nodes = $('#p-lyrics').children;
  for (let i = 0; i < nodes.length; i++) nodes[i].classList.toggle('on', i === k);
  nodes[k]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ============================================================ açılış
function restore() {
  const q = load('mf_q', null);
  if (q && Array.isArray(q.queue) && q.queue.length) {
    S.queue = q.queue; S.idx = Math.min(Math.max(q.idx, 0), q.queue.length - 1);
    S.savedPos = Number(load('mf_pos', 0)) || 0;
    updateTrackUI();
    if (S.savedPos && cur()?.duration) $('#p-cur').textContent = fmt(S.savedPos);
    audio.pause(); updatePlayUI();
  }
}

updateModeUI();
restore();
render();
fetch((S.base || '') + '/health', { cache: 'no-store' }).catch(() => {}); // Render uyku modundan uyandır
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
})();
