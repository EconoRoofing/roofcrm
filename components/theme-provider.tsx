'use client'

import { useEffect } from 'react'
import { getThemeForTime, type ThemeVars } from '@/lib/theme'

function applyTheme(vars: ThemeVars) {
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Apply immediately on mount
    applyTheme(getThemeForTime(new Date()))

    // Re-apply every 15 minutes
    const interval = setInterval(() => {
      applyTheme(getThemeForTime(new Date()))
    }, 15 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  return <>{children}</>
}
