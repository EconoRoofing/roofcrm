'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { verifyPin, selectProfile } from '@/lib/actions/profiles'

interface PinEntryProps {
  profileId: string
  profileName: string
  profileRole: string
  onBack: () => void
}

const ROLE_ROUTES: Record<string, string> = {
  manager: '/pipeline',
  sales: '/today',
  sales_crew: '/today',
  crew: '/route',
}

function BackspaceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 6H8L3 12L8 18H21V6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16 10L11 15M11 10L16 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BackArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M12 4L6 10L12 16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PinEntry({ profileId, profileName, profileRole, onBack }: PinEntryProps) {
  const [digits, setDigits] = useState<string[]>([])
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [noPin, setNoPin] = useState(false)
  const router = useRouter()

  const getRoleRoute = () => ROLE_ROUTES[profileRole] ?? '/route'

  const handleSubmit = useCallback(async (pin: string) => {
    setSubmitting(true)
    try {
      const valid = await verifyPin(profileId, pin)
      if (valid) {
        await selectProfile(profileId)
        // Check if user has no PIN set (first-time)
        // verifyPin returns true for no-PIN users
        router.push(getRoleRoute())
      } else {
        setShaking(true)
        setError('Incorrect PIN')
        setTimeout(() => {
          setShaking(false)
          setDigits([])
          setError('')
        }, 700)
      }
    } catch {
      setError('Something went wrong. Try again.')
      setDigits([])
    } finally {
      setSubmitting(false)
    }
  }, [profileId, profileRole, router])

  const pressDigit = useCallback((d: string) => {
    if (submitting) return
    setDigits(prev => {
      if (prev.length >= 4) return prev
      const next = [...prev, d]
      if (next.length === 4) {
        // Auto-submit after next render
        setTimeout(() => handleSubmit(next.join('')), 50)
      }
      return next
    })
  }, [submitting, handleSubmit])

  const pressBackspace = useCallback(() => {
    if (submitting) return
    setDigits(prev => prev.slice(0, -1))
    setError('')
  }, [submitting])

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') pressDigit(e.key)
      else if (e.key === 'Backspace') pressBackspace()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pressDigit, pressBackspace])

  const keypad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'back'],
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '32px',
        padding: '32px 24px',
        maxWidth: '320px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          padding: '4px 0',
        }}
      >
        <BackArrowIcon />
        Back
      </button>

      {/* Profile name */}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '20px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '4px',
          }}
        >
          {profileName}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
          }}
        >
          Enter PIN
        </div>
      </div>

      {/* PIN dots */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          animation: shaking ? 'pinShake 0.6s ease' : 'none',
        }}
      >
        <style>{`
          @keyframes pinShake {
            0%, 100% { transform: translateX(0); }
            15% { transform: translateX(-8px); }
            30% { transform: translateX(8px); }
            45% { transform: translateX(-6px); }
            60% { transform: translateX(6px); }
            75% { transform: translateX(-3px); }
            90% { transform: translateX(3px); }
          }
        `}</style>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: digits.length > i
                ? (shaking ? 'var(--accent-red)' : 'var(--accent)')
                : 'transparent',
              border: `2px solid ${
                digits.length > i
                  ? (shaking ? 'var(--accent-red)' : 'var(--accent)')
                  : 'var(--border-subtle)'
              }`,
              transition: 'background-color 0.15s, border-color 0.15s',
            }}
          />
        ))}
      </div>

      {/* Error message */}
      <div
        style={{
          height: '16px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--accent-red)',
          textAlign: 'center',
          marginTop: '-16px',
        }}
      >
        {error}
      </div>

      {/* Keypad */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          width: '100%',
          maxWidth: '280px',
        }}
      >
        {keypad.flat().map((key, i) => {
          if (key === '') {
            return <div key={i} />
          }
          if (key === 'back') {
            return (
              <button
                key={i}
                onClick={pressBackspace}
                disabled={submitting || digits.length === 0}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: digits.length === 0 ? 'default' : 'pointer',
                  opacity: digits.length === 0 ? 0.3 : 1,
                  transition: 'background-color 0.1s, opacity 0.15s',
                }}
                onMouseDown={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-surface)'
                }}
                onMouseUp={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'
                }}
              >
                <BackspaceIcon />
              </button>
            )
          }
          return (
            <button
              key={i}
              onClick={() => pressDigit(key)}
              disabled={submitting || digits.length >= 4}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '24px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background-color 0.1s',
              }}
              onMouseDown={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-surface)'
              }}
              onMouseUp={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'
              }}
            >
              {key}
            </button>
          )
        })}
      </div>

      {/* Forgot PIN */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}
      >
        Forgot PIN? Ask your manager to reset it.
      </div>
    </div>
  )
}
