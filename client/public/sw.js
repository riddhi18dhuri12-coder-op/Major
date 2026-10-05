/* Minimal service worker: the app shell opens offline, and the safety-zone map keeps working
   without signal (zones are cached after the first online visit). Everything else needs the network. */
const SHELL = 'sts-shell-v1'
const DATA = 'sts-data-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Zones: network first, fall back to the last copy (needs the user's token, so this only caches what they could already read)
  if (url.pathname === '/api/zones') {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(DATA).then((c) => c.put(url.pathname, copy)) } return r }).catch(() => caches.match(url.pathname).then((r) => r || new Response('[]', { headers: { 'Content-Type': 'application/json' } }))))
    return
  }
  if (url.origin !== location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return

  // Pages: network first so deploys show up; fall back to the cached shell offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }
  // Built assets are content-hashed, so cache-first is safe
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(req, copy)) } return r })))
})
