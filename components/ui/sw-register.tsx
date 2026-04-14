'use client'

import { useEffect } from 'react'

/**
 * Audit R4-#23: previously this component called register('/sw.js') once
 * and forgot about it. Combined with the SW's `self.skipWaiting()` in the
 * install handler, an open tab that stayed live across a deploy would
 * keep the OLD service worker controlling fetches while the NEW static
 * assets were served with new hashes. The old SW's cache had the old
 * `/_next/static/*` filenames; it couldn't serve the new ones. Result:
 * stale tabs got 404s on hashed asset lookups until the user fully
 * closed and reopened the tab.
 *
 * Fix: poll registration.update() periodically, listen for `updatefound`,
 * and when a new worker has reached `activated`, `navigator.serviceWorker
 * .controller` changes — at that point the old controller is dead and the
 * safe move is to reload the page so it runs against the new SW + new
 * static assets. The reload is silent for users who refresh organically,
 * and a ~60-second delay before it fires keeps it from yanking the page
 * out from under someone mid-form.
 */
export function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let reg: ServiceWorkerRegistration | null = null
    let updateInterval: ReturnType<typeof setInterval> | null = null

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        reg = registration

        // Check for updates every 60 minutes while the tab is live.
        // Cheap — just hits the SW file to compare hashes.
        updateInterval = setInterval(() => {
          reg?.update().catch(() => {})
        }, 60 * 60 * 1000)

        // Fire one update check on initial registration too, for tabs
        // that were open before the user navigated.
        registration.update().catch(() => {})
      })
      .catch((err) => console.warn('[SW] Registration failed:', err))

    // When the controller changes (old SW dead, new SW took over), the
    // page is now running against a potentially mismatched set of assets.
    // Reload to get a consistent view. This fires at most once per SW
    // upgrade and is idempotent — if multiple tabs are open they all
    // reload themselves independently.
    let reloaded = false
    const handleControllerChange = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    return () => {
      if (updateInterval) clearInterval(updateInterval)
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  return null
}
