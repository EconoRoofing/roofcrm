'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

interface RoleToggleProps {
  currentRole: string
}

const OPTIONS = [
  { label: 'Crew', value: 'crew', href: '/route' },
  { label: 'Sales', value: 'sales', href: '/today' },
]

export function RoleToggle({ currentRole }: RoleToggleProps) {
  if (currentRole !== 'sales_crew') return null

  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Determine which view is active: if on a crew route, show "crew" as active
  // We expose this as a prop to keep it server-friendly; default to 'crew' view
  const activeView = 'crew'

  function handleSwitch(value: string, href: string) {
    if (value === activeView || isPending) return
    // Set preferred_view cookie and navigate
    document.cookie = `preferred_view=${value}; path=/; max-age=${60 * 60 * 24 * 365}`
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '3px',
        gap: '3px',
      }}
    >
      {OPTIONS.map(({ label, value, href }) => {
        const isActive = value === activeView
        return (
          <button
            key={value}
            type="button"
            onClick={() => handleSwitch(value, href)}
            disabled={isPending}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: '8px',
              backgroundColor: isActive ? 'var(--accent-dim)' : 'transparent',
              border: 'none',
              cursor: isActive ? 'default' : 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              transition: 'background-color 0.15s, color 0.15s',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
