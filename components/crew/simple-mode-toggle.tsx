'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface SimpleModeToggleProps {
  initialValue: boolean
}

export function SimpleModeToggle({ initialValue }: SimpleModeToggleProps) {
  const [enabled, setEnabled] = useState(initialValue)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function toggle() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      // Set cookie via a simple fetch call to avoid a full server action round-trip
      document.cookie = `crew_simple_mode=${next ? 'true' : 'false'}; path=/; max-age=31536000; samesite=lax`
      router.refresh()
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          Simple Mode
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            marginTop: '2px',
          }}
        >
          Show only the current job with big buttons
        </div>
      </div>

      {/* Toggle switch */}
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={enabled}
        style={{
          position: 'relative',
          width: '48px',
          height: '28px',
          borderRadius: '14px',
          backgroundColor: enabled ? 'var(--accent)' : 'var(--bg-elevated)',
          border: `2px solid ${enabled ? 'var(--accent)' : 'var(--border-subtle)'}`,
          cursor: isPending ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s, border-color 0.2s',
          flexShrink: 0,
          padding: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: enabled ? '22px' : '2px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: enabled ? '#000' : 'var(--text-muted)',
            transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  )
}
