// offline cache for the trip app; bump happens automatically when index.html changes
const CACHE = 'ny26-fd850ef463';
const FILES = ["./", "index.html", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "img/amhist.jpg", "img/bbridge.jpg", "img/bethesda.jpg", "img/bryant.jpg", "img/capitol.jpg", "img/carousel.jpg", "img/chelsea.jpg", "img/domino.jpg", "img/dumbo.jpg", "img/ellis.jpg", "img/ferry.jpg", "img/fifth.jpg", "img/fortgreene.jpg", "img/frick.jpg", "img/gct.jpg", "img/herald.jpg", "img/highline.jpg", "img/jfk.jpg", "img/kelly.jpg", "img/liberty.jpg", "img/lincoln.jpg", "img/little.jpg", "img/loc.jpg", "img/madison.jpg", "img/memorial.jpg", "img/met.jpg", "img/metropark.jpg", "img/moma.jpg", "img/msg.jpg", "img/murray.jpg", "img/nbc.jpg", "img/neue.jpg", "img/oculus.jpg", "img/paramount.jpg", "img/poster.jpg", "img/promenade.jpg", "img/radio.jpg", "img/scotch.jpg", "img/seaport.jpg", "img/skyline.jpg", "img/soho.jpg", "img/stpat.jpg", "img/summit.jpg", "img/tram.jpg", "img/union.jpg", "img/vessel.jpg", "img/wall.jpg", "img/wburg.jpg", "img/whitney.jpg", "img/wmon.jpg", "img/wsp.jpg", "img/wtc7.jpg"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ny26-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: sameOrigin });
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) return hit;
    const r = await net;
    return r || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
  }));
});
