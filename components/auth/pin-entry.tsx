'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { verifyPin, selectProfile } from '@/lib/actions/profiles'
import { BackspaceIcon, BackArrowIcon } from '@/components/icons'

interface PinEntryProps {
  profileId: string
  profileName: string
  profileRole: string
  onBack: () => void
}

const ROLE_ROUTES: Record<string, string> = {
  owner: '/home',
  office_manager: '/home',
  sales: '/today',
  crew: '/route',
}

export function PinEntry({ profileId, profileName, profileRole, onBack }: PinEntryProps) {
  const [digits, setDigits] = useState<string[]>([])
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // `mountedRef` gates all post-await setState in handleSubmit so a user
  // who taps Back while the verify call is in flight doesn't trigger the
  // "setState on unmounted component" React warning.
  const mountedRef = useRef(true)
  const router = useRouter()

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current)
      if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current)
    }
  }, [])

  const getRoleRoute = () => ROLE_ROUTES[profileRole] ?? '/route'

  const handleSubmit = useCallback(async (pin: string) => {
    setSubmitting(true)
    try {
      const valid = await verifyPin(profileId, pin)
      if (!mountedRef.current) return
      if (valid) {
        // Audit R5-#10: selectProfile returns `postLoginNext` if the
        // auth-callback handler stashed one. Prefer it over the role
        // home so a user who was bounced from /jobs/abc ends up back
        // at /jobs/abc after profile selection.
        const result = await selectProfile(profileId)
        if (!mountedRef.current) return
        const target = result?.postLoginNext || getRoleRoute()
        router.push(target)
      } else {
        setShaking(true)
        setError('Incorrect PIN')
        shakeTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return
          setShaking(false)
          setDigits([])
          setError('')
        }, 700)
      }
    } catch {
      if (!mountedRef.current) return
      setError('Something went wrong. Try again.')
      setDigits([])
    } finally {
      if (mountedRef.current) setSubmitting(false)
    }
  }, [profileId, profileRole, router])

  // Audit R2-#30: previously, scheduling a new auto-submit timer overwrote
  // the ref without clearing the prior one, AND backspace-after-4-digits
  // didn't clear the pending timer at all — meaning a fast user could:
  //   1. type 4 digits → schedule auto-submit T1 in 50 ms
  //   2. tap backspace at ~25 ms → digits = 3, but T1 still fires
  //   3. handleSubmit runs against the *old* 4-char string from T1's closure
  // The fix: every code path that mutates `digits` clears the timer first.
  const clearAutoSubmit = useCallback(() => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
  }, [])

  const pressDigit = useCallback((d: string) => {
    if (submitting) return
    setDigits(prev => {
      if (prev.length >= 4) return prev
      const next = [...prev, d]
      if (next.length === 4) {
        clearAutoSubmit()
        // Auto-submit after next render
        autoSubmitTimerRef.current = setTimeout(() => handleSubmit(next.join('')), 50)
      }
      return next
    })
  }, [submitting, handleSubmit, clearAutoSubmit])

  const pressBackspace = useCallback(() => {
    if (submitting) return
    clearAutoSubmit()
    setDigits(prev => prev.slice(0, -1))
    setError('')
  }, [submitting, clearAutoSubmit])

  // Submit all 4 digits at once (used for paste + password-manager autofill)
  const setAllDigits = useCallback((raw: string) => {
    if (submitting) return
    const only = raw.replace(/\D/g, '').slice(0, 4)
    if (only.length !== 4) return
    clearAutoSubmit()
    setDigits(only.split(''))
    autoSubmitTimerRef.current = setTimeout(() => handleSubmit(only), 50)
  }, [submitting, handleSubmit, clearAutoSubmit])

  // Keyboard + paste support — scoped so it doesn't hijack OTHER inputs
  // on the page. Previously, a global window keydown handler would advance
  // the PIN when the user typed digits into ANY text field (e.g. a search
  // box on a parent layout). Check `document.activeElement` and bail if
  // focus is inside an editable element.
  useEffect(() => {
    function focusIsInInput(): boolean {
      const el = document.activeElement as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }

    const keyHandler = (e: KeyboardEvent) => {
      if (focusIsInInput()) return
      if (e.key >= '0' && e.key <= '9') pressDigit(e.key)
      else if (e.key === 'Backspace') pressBackspace()
    }

    // Paste support: password managers and iPad Smart Keyboards send the
    // whole PIN in one paste event. Accept only if it produces exactly 4
    // digits after stripping non-digits.
    const pasteHandler = (e: ClipboardEvent) => {
      if (focusIsInInput()) return
      const text = e.clipboardData?.getData('text') ?? ''
      const only = text.replace(/\D/g, '').slice(0, 4)
      if (only.length === 4) {
        e.preventDefault()
        setAllDigits(only)
      }
    }

    window.addEventListener('keydown', keyHandler)
    window.addEventListener('paste', pasteHandler)
    return () => {
      window.removeEventListener('keydown', keyHandler)
      window.removeEventListener('paste', pasteHandler)
    }
  }, [pressDigit, pressBackspace, setAllDigits])

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
        type="button"
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
            return <div key={`empty-${i}`} />
          }
          if (key === 'back') {
            return (
              <button
                type="button"
                key="back"
                onClick={pressBackspace}
                disabled={submitting || digits.length === 0}
                aria-label="Delete PIN digit"
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
              type="button"
              key={key}
              onClick={() => pressDigit(key)}
              disabled={submitting || digits.length >= 4}
              aria-label={`PIN digit ${key}`}
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
