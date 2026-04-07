'use client'

import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const [online, setOnline] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setOnline(navigator.onLine)

    const handleOnline = () => {
      setOnline(true)
      // Keep banner visible briefly so user sees the "back online" state — then hide
      setTimeout(() => setVisible(false), 1500)
    }
    const handleOffline = () => {
      setOnline(false)
      setVisible(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

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
      {online ? 'Back online' : 'Offline \u2014 viewing cached data'}
    </div>
  )
}
