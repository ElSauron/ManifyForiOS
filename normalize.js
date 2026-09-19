// youtubei.js düğümlerini (nodes) PWA'nın kolay okuyacağı sade JSON'a çevirir.
// Hepsi defansif yazıldı: YouTube alan eklerse/çıkarırsa patlamaz, sadece boş döner.

const s = (x) => (typeof x === 'string' ? x : x?.text ?? undefined);

// Google resim URL'lerinde boyutu istediğimiz değere çeker (=w60-h60 -> =w544-h544).
export function pickThumb(list, size = 544) {
  const arr = Array.isArray(list) ? list : list?.contents;
  if (!arr?.length) return null;
  const best = [...arr].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  const url = best?.url;
  if (!url) return null;
  return /=w\d+-h\d+/.test(url) ? url.replace(/=w\d+-h\d+[^&]*/, `=w${size}-h${size}-l90-rj`) : url;
}

const artistsOf = (list) =>
  list?.map((a) => ({ name: a.name, id: a.channel_id ?? a.id ?? null })).filter((a) => a.name);

export const nodeType = (n) => n?.constructor?.type ?? n?.type;

export function mapItem(n) {
  if (!n) return null;
  const t = nodeType(n);

  if (t === 'PlaylistPanelVideoWrapper') return mapItem(n.primary);

  if (t === 'PlaylistPanelVideo') {
    return {
      kind: 'song',
      id: n.video_id,
      title: s(n.title),
      artists: artistsOf(n.artists) ?? (n.author ? [{ name: n.author, id: null }] : []),
      album: n.album ? { name: n.album.name, id: n.album.id ?? null } : null,
      duration: n.duration?.seconds ?? null,
      thumb: pickThumb(n.thumbnail)
    };
  }

  if (t === 'MusicTwoRowItem') {
    return {
      kind: n.item_type,
      id: n.id,
      title: s(n.title),
      subtitle: s(n.subtitle),
      artists: artistsOf(n.artists) ?? (n.author ? [{ name: n.author.name, id: n.author.channel_id ?? null }] : []),
      year: n.year ?? null,
      thumb: pickThumb(n.thumbnail)
    };
  }

  if (t === 'MusicResponsiveListItem') {
    const kind = n.item_type;
    const artists =
      artistsOf(n.artists) ??
      artistsOf(n.authors) ??
      (n.author ? [{ name: n.author.name, id: n.author.channel_id ?? null }] : []);
    return {
      kind,
      id: n.id,
      title: n.title ?? n.name,
      subtitle: s(n.subtitle),
      artists,
      album: n.album ? { name: n.album.name, id: n.album.id ?? null } : null,
      duration: n.duration?.seconds ?? null,
      year: n.year ?? null,
      itemCount: n.item_count ?? n.song_count ?? null,
      subscribers: n.subscribers ?? null,
      thumb: pickThumb(n.thumbnails)
    };
  }

  return null; // MusicNavigationButton, MusicMultiRowListItem vb. şimdilik atlanır
}

export const mapItems = (list) => (list ?? []).map(mapItem).filter((i) => i?.id);

export function mapShelf(section) {
  const title = s(section?.header?.title) ?? s(section?.title);
  const items = mapItems(section?.contents);
  return items.length ? { title: title ?? null, items } : null;
}

export function mapHeader(h) {
  if (!h) return null;
  return {
    title: s(h.title),
    subtitle: s(h.subtitle),
    secondSubtitle: s(h.second_subtitle) ?? null,
    artist: h.author?.name ?? s(h.strapline_text_one) ?? null,
    artistId: h.author?.channel_id ?? null,
    description: s(h.description) ?? s(h.description?.description) ?? null,
    thumb: pickThumb(h.thumbnails ?? h.thumbnail, 800)
  };
}

// Arama sonucundaki "En iyi sonuç" kartı
export function mapCard(c) {
  const p = c?.on_tap?.payload ?? {};
  const id = p.videoId ?? p.browseId ?? p.playlistId;
  if (!id) return null;
  return {
    kind: p.videoId ? 'song' : 'browse',
    id,
    title: s(c.title),
    subtitle: s(c.subtitle),
    thumb: pickThumb(c.thumbnail)
  };
}
