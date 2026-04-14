// Bump this on every deploy that changes caching semantics so the new SW
// installs cleanly and the old cache is purged.
const CACHE_VERSION = 'v3'
const CACHE_NAME = `roofcrm-${CACHE_VERSION}`

// Static assets only — NEVER cache authenticated app routes here, otherwise
// a different user on a shared device sees the previous user's HTML shell.
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/logo.png',
]

// Install: cache the static asset list
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: purge ALL old caches (don't keep anything from a previous version)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch:
//   - /api/*  → ALWAYS network. Never cache, never serve from cache.
//               Caching authenticated JSON on a shared device leaks data
//               between users (Mario's brother, the office manager, the crew).
//   - HTML pages → network only. Pages render per-user content (profile picker,
//                  role-based nav) — do not cache them either.
//   - Hashed static assets (Next build output, images, fonts) → stale-while-revalidate.
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only intercept same-origin GETs
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  // API: network-only, never cached
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request))
    return
  }

  // HTML navigations: network-only, never cached (auth-sensitive)
  const accept = request.headers.get('accept') ?? ''
  if (request.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(fetch(request))
    return
  }

  // Static assets only: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      return cached || network
    })
  )
})


// Offline mutation queue
const DB_NAME = 'roofcrm-offline'
const STORE_NAME = 'mutations'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Message handler: offline mutation queue + cache purge on logout
self.addEventListener('message', async (event) => {
  if (!event.data) return
  if (event.data.type === 'QUEUE_MUTATION') {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(event.data.mutation)
  } else if (event.data.type === 'CLEAR_CACHE') {
    // Purge all caches when a user logs out on a shared device
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
})

// Replay mutations when back online
self.addEventListener('sync', async (event) => {
  if (event.tag === 'replay-mutations') {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const mutations = await new Promise(resolve => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
    })

    for (const mutation of mutations) {
      try {
        await fetch(mutation.url, mutation.options)
      } catch {
        return // Still offline, try again later
      }
    }

    // Clear processed mutations
    store.clear()
  }
})
