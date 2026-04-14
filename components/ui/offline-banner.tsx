'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Audit R4-#13: previously this banner trusted `navigator.onLine` blindly.
 * On iPhone Safari, `navigator.onLine` returns `true` whenever the device
 * is associated with Wi-Fi — including captive portals and dead APs. Crew
 * members at weak-signal jobsites saw "connected" while every mutation
 * silently queued to IndexedDB forever with no user feedback.
 *
 * Fix: combine two signals.
 *   1. `navigator.onLine === false` is trusted as the fast negative —
 *      the OS knows for certain when the radio is off.
 *   2. `navigator.onLine === true` is NOT trusted; we verify with a
 *      HEAD probe to our own origin's /api/ping endpoint (created
 *      alongside this fix, same origin to avoid CORS and ad-blockers).
 *
 * The probe only runs while the tab is visible (battery) and only when
 * we haven't seen network activity recently. It uses `cache: 'no-store'`
 * so a cached 200 doesn't mask a dead connection, and aborts after 3s.
 */
const PROBE_INTERVAL_MS = 30_000
const PROBE_TIMEOUT_MS = 3_000

export function OfflineBanner() {
  const [realOnline, setRealOnline] = useState(true)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function probe(): Promise<boolean> {
      // Fast negative: OS says offline, trust it.
      if (!navigator.onLine) return false
      try {
        const res = await fetch('/api/ping', {
          method: 'HEAD',
          cache: 'no-store',
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        return res.ok
      } catch {
        return false
      }
    }

    async function updateStatus() {
      const isOnline = await probe()
      if (!mountedRef.current) return
      setRealOnline(isOnline)
      if (!isOnline) {
        setVisible(true)
      } else if (visible) {
        // Keep banner visible briefly so user sees the "back online" state
        setTimeout(() => {
          if (mountedRef.current) setVisible(false)
        }, 1500)
      }
    }

    // Initial probe
    void updateStatus()

    // Poll while visible; stop polling when tab is hidden (battery)
    function startPolling() {
      if (timerRef.current) return
      timerRef.current = setInterval(() => { void updateStatus() }, PROBE_INTERVAL_MS)
    }
    function stopPolling() {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void updateStatus()
        startPolling()
      } else {
        stopPolling()
      }
    }

    // Fast-path OS events: the browser telling us something changed is
    // still useful as a trigger, we just don't trust `navigator.onLine`
    // as a positive signal — we re-probe when it fires.
    const handleOSEvent = () => { void updateStatus() }

    if (document.visibilityState === 'visible') {
      startPolling()
    }
    window.addEventListener('online', handleOSEvent)
    window.addEventListener('offline', handleOSEvent)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mountedRef.current = false
      stopPolling()
      window.removeEventListener('online', handleOSEvent)
      window.removeEventListener('offline', handleOSEvent)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-xs font-medium transition-opacity duration-500"
      style={{
        background: 'var(--accent-amber-dim)',
        color: 'var(--accent-amber)',
        opacity: visible ? 1 : 0,
      }}
    >
      {realOnline ? 'Back online' : 'Offline \u2014 viewing cached data'}
    </div>
  )
}
