// Bump this on every deploy that changes caching semantics so the new SW
// installs cleanly and the old cache is purged.
const CACHE_VERSION = 'v4'
const CACHE_NAME = `roofcrm-${CACHE_VERSION}`

// Install: no pre-caching. Everything useful is under /_next/static/* with
// content-hashed filenames, and those get cached on first request via the
// fetch handler below. Pre-caching `/logo.png` or `/manifest.webmanifest`
// just means the user waits for a background fetch on install — they'll be
// downloaded on first paint anyway.
self.addEventListener('install', () => {
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

// Fetch strategy — AGGRESSIVELY narrow caching to avoid cross-user leaks.
//
// Audit R2-#3: the previous version used a catchall stale-while-revalidate
// for anything that wasn't /api/* or an HTML navigation. That caught
// /_next/image?url=... (Supabase signed-URL thumbnails, CompanyCam photo
// proxies) which ARE user-scoped content, and leaked between users on
// shared devices (PWA on Mario's tablets).
//
// New rule: ONLY cache `/_next/static/*` — the hashed build output. These
// filenames include content hashes, so they're immutable and contain zero
// user data. Everything else passes through to network, including:
//   - /_next/image?url=...  (user-scoped image proxy)
//   - /api/*                (authenticated JSON)
//   - HTML navigations      (auth-sensitive shells)
//   - Supabase storage URLs (signed, cross-origin anyway)
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only intercept same-origin GETs
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  // Only cache hashed build output — nothing else is safe on a shared device
  if (url.pathname.startsWith('/_next/static/')) {
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
    return
  }

  // Everything else: pass through to network untouched
  // (default fetch behavior if we don't call event.respondWith)
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
