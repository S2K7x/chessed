// Chess Coach service worker: the app works offline once it has been opened.
// - pages: network first, cached copy when offline;
// - hashed assets, the engine and the Maia model: cache first (their names
//   change when their content changes);
// - other origins (Lichess, Chess.com, the coach): never cached here.
const CACHE = 'chess-coach-v1';
const SHELL = ['./', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = (path) => /\/(assets|engine|models)\//.test(path) || /\.(png|svg|webmanifest)$/.test(path);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  if (cacheFirst(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
