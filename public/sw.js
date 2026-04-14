// Bump this on every deploy that changes caching semantics so the new SW
// installs cleanly and the old cache is purged. Audit R4-#12 bumped v4→v5
// to ship the waitUntil + IDB-transaction fixes.
const CACHE_VERSION = 'v5'
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

// Wait for an IndexedDB transaction to commit. The transaction auto-commits
// once its queued operations finish, but we need a Promise the SW lifetime
// manager (event.waitUntil) can await.
function awaitTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// Wrap an IDBRequest as a Promise.
function awaitReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Audit R4-#12 (message handler): without event.waitUntil, the browser can
// terminate the SW before `await openDB()` resolves. The mutation is queued
// into IDB but the transaction never commits, so subsequent reads by the
// sync handler won't see it. Also, the old code never waited on tx.oncomplete,
// so even when the handler ran to completion, the tx might not have flushed.
self.addEventListener('message', (event) => {
  if (!event.data) return

  if (event.data.type === 'QUEUE_MUTATION') {
    event.waitUntil((async () => {
      const db = await openDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).add(event.data.mutation)
      await awaitTx(tx)
    })())
  } else if (event.data.type === 'CLEAR_CACHE') {
    // Purge all caches when a user logs out on a shared device
    event.waitUntil((async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    })())
  }
})

// Audit R4-#12 (sync handler): THREE bugs in one function previously:
//   1. No event.waitUntil — SW could be terminated mid-replay, leaving
//      queued mutations in IDB but never delivered.
//   2. Read + clear used the same readwrite transaction across `await fetch`.
//      IndexedDB transactions auto-commit the moment control yields to the
//      task queue with no pending operations. The `await fetch()` yields,
//      tx auto-commits, then `store.clear()` throws TransactionInactiveError.
//      Net effect: queued mutations read, replayed, but NEVER CLEARED — so
//      every subsequent sync event replayed the entire backlog from the top.
//      Each mutation fired N times, where N is the number of syncs since
//      queuing. Silent duplicate-write bug.
//   3. Errors from `store.clear()` were never surfaced because no oncomplete.
//
// Fix: separate read-tx from write-tx, bracket with waitUntil, await both
// tx.oncomplete events.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'replay-mutations') return

  event.waitUntil((async () => {
    const db = await openDB()

    // Read phase — separate read-only tx so it closes cleanly before the
    // network fetches begin.
    const readTx = db.transaction(STORE_NAME, 'readonly')
    const mutations = await awaitReq(readTx.objectStore(STORE_NAME).getAll())
    await awaitTx(readTx)

    // Network phase — fetch each queued mutation. If any fails, abort early
    // so the mutations remain queued for the next sync event.
    for (const mutation of mutations) {
      try {
        const res = await fetch(mutation.url, mutation.options)
        if (!res.ok) return
      } catch {
        return
      }
    }

    // Clear phase — fresh readwrite tx after the network work is done, so
    // the tx's lifetime doesn't span any awaits.
    const clearTx = db.transaction(STORE_NAME, 'readwrite')
    clearTx.objectStore(STORE_NAME).clear()
    await awaitTx(clearTx)
  })())
})
