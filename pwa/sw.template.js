/* Platewise service worker. Generated at build time from pwa/sw.template.js.
 *
 * Update model:
 *  - Every deploy produces a new sw.js (new BUILD_ID), so the browser or Android WebView
 *    installs it in the background and leaves it *waiting*.
 *  - The page shows "New version ready". Tapping Reload posts SKIP_WAITING, the new
 *    worker takes over, and the page reloads onto the new code.
 *  - Hashed JS/CSS from the running version stay cached, so a lazily loaded route
 *    still works after the server has moved on to a newer deploy.
 */
const BUILD_ID = __BUILD_ID__
const PRECACHE = __PRECACHE__
const CACHE = `platewise-${BUILD_ID}`
const PRECACHE_SET = new Set(PRECACHE)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Add files one by one so a single missing file can't fail the whole install.
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('platewise-') && k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Never touch Supabase, Gemini, server functions or API routes: always live data.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/_serverFn') || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    // Pages: always try the network for the newest HTML; show the offline page if it's down.
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error()),
    )
    return
  }

  if (PRECACHE_SET.has(url.pathname)) {
    // Hashed assets never change, so cache-first is safe.
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)))
  }
})
