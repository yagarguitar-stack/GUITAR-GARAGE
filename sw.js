/* GUITAR GARAGE：電波のない所でも開けるようにする仕組み
   ファイルを差し替えたら VERSION の数字を一つ上げる（上げると、次に開いたときに新しい中身へ入れ替わる） */
const VERSION = 'gg-v19';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './img/entrance-closed.webp', './img/entrance-open.webp', './img/overview.webp', './img/guitars.webp', './img/workbench.webp', './img/tools.webp',
  './img/library.webp', './img/practice.webp', './img/loft.webp', './img/jukebox.webp',
  './audio/eiga-de-mita-machi.mp3', './audio/odoru-rihatsushi.mp3',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];
const FONT_CACHE = 'gg-fonts';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

/* 曲の途中から流すための部分読み込み（Safari が求める形）に、保存した曲から応える */
async function rangeResponse(req, cached) {
  const range = req.headers.get('range');
  if (!range || !cached) return cached;
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const size = buf.byteLength;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' }
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* 字体：保存してあればそれを使い、裏で新しくする */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  /* ページ本体：通信できれば新しいものを、できなければ保存したものを */
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }

  /* 絵・曲・アイコン：保存したものを先に使う */
  e.respondWith((async () => {
    const cached = await caches.match(req.url, { ignoreSearch: true });
    if (cached) return req.headers.get('range') ? rangeResponse(req, cached) : cached;
    try {
      const r = await fetch(req);
      if (r && r.ok && r.status === 200) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req.url, cp)); }
      return r;
    } catch (err) {
      return new Response('', { status: 504 });
    }
  })());
});
