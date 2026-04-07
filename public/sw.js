const CACHE_NAME = 'roofcrm-v1'
const STATIC_ASSETS = [
  '/',
  '/route',
  '/week',
  '/more',
]

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.url.includes('/api/')) {
    // API calls: network first, fallback to cache
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request))
    )
  } else {
    // Static: cache first, fallback to network
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    )
  }
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

// Queue a mutation when offline
self.addEventListener('message', async (event) => {
  if (event.data.type === 'QUEUE_MUTATION') {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(event.data.mutation)
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
