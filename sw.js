// Lets the app open like a normal app from the home screen.
// Serves the latest app files when online, and the saved copy when offline.
const CACHE = 'voice-notes-v6';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'store.js', 'speech.js', 'config.js', 'library.js',
  'vendor/marked.esm.js', 'vendor/purify.es.js', 'vendor/jszip.min.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // The sync library from the CDN never changes at a fixed version, so keep a copy
  // and the app can open with no signal.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // no-cache asks GitHub for the newest copy instead of the browser's 10 minute old one,
  // so updates show up the next time you open the app.
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)));
});
