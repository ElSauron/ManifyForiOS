// ==UserScript==
// @name         Manify Köprü
// @description  Manify'ın YouTube isteklerini telefonun kendi IP'sinden atmasını sağlar.
// @version      1.0.0
// @match        __ORIGIN__/*
// @grant        GM.xmlHttpRequest
// @connect      www.youtube.com
// @connect      youtubei.googleapis.com
// @run-at       document-start
// ==/UserScript==

// Bu betik SADECE Manify sayfasında (@match) çalışır ve yalnızca aşağıdaki YouTube adreslerine
// istek atabilir. Başka hiçbir siteye erişimi yok.
(() => {
  'use strict';
  const ALLOWED_HOSTS = ['www.youtube.com', 'youtubei.googleapis.com'];
  const ORIGIN = location.origin;

  // Sayfa bunu eşzamanlı okuyabilsin diye işaret bırak.
  // (document-start anında <html> henüz olmayabilir; gelene kadar bekle.)
  const mark = () => {
    const de = document.documentElement;
    if (!de) return false;
    de.setAttribute('data-manify-bridge', '1');
    window.postMessage({ manifyBridgeReady: true }, ORIGIN);
    return true;
  };
  if (!mark()) {
    const mo = new MutationObserver(() => { if (mark()) mo.disconnect(); });
    mo.observe(document, { childList: true });
    document.addEventListener('DOMContentLoaded', () => { mark(); mo.disconnect(); }, { once: true });
  }

  const reply = (msg) => window.postMessage({ manifyBridgeRes: true, ...msg }, ORIGIN);

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== ORIGIN) return;
    const m = ev.data;
    if (!m || m.manifyBridgeReq !== true) return;
    const id = m.id;

    let u;
    try { u = new URL(String(m.url)); } catch { return reply({ id, ok: false, error: 'geçersiz adres' }); }
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) {
      return reply({ id, ok: false, error: 'bu adrese izin yok: ' + u.hostname });
    }

    const method = m.method === 'POST' ? 'POST' : 'GET';
    try {
      GM.xmlHttpRequest({
        method,
        url: u.toString(),
        headers: m.headers && typeof m.headers === 'object' ? m.headers : {},
        data: method === 'POST' && typeof m.body === 'string' ? m.body : undefined,
        timeout: 25000,
        onload: (r) => reply({ id, ok: true, status: r.status, text: r.responseText }),
        onerror: () => reply({ id, ok: false, error: 'ağ hatası' }),
        ontimeout: () => reply({ id, ok: false, error: 'zaman aşımı' }),
        onabort: () => reply({ id, ok: false, error: 'iptal edildi' })
      });
    } catch (e) {
      reply({ id, ok: false, error: String(e && e.message || e) });
    }
  });
})();
