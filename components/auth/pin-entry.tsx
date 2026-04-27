'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { verifyPin, selectProfile, selfResetPin } from '@/lib/actions/profiles'
import { BackspaceIcon, BackArrowIcon } from '@/components/icons'

interface PinEntryProps {
  profileId: string
  profileName: string
  profileRole: string
  /** Email on the profile being unlocked. If it matches `callerGoogleEmail`,
   *  the "Forgot PIN?" link becomes interactive (self-service reset).
   *  If null or non-matching, the link falls back to "Ask your manager." */
  profileEmail?: string | null
  /** Email on the currently signed-in Google account. Used to gate self-
   *  service reset eligibility on the client; the server gates again
   *  inside selfResetPin(). */
  callerGoogleEmail?: string | null
  onBack: () => void
}

const ROLE_ROUTES: Record<string, string> = {
  owner: '/home',
  office_manager: '/home',
  sales: '/today',
  crew: '/route',
}

export function PinEntry({
  profileId,
  profileName,
  profileRole,
  profileEmail,
  callerGoogleEmail,
  onBack,
}: PinEntryProps) {
  const [digits, setDigits] = useState<string[]>([])
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  // Self-service PIN reset is offered only when the profile's email
  // exactly matches the signed-in Google account email. The server gates
  // the same way inside selfResetPin — this client check is purely UX
  // hygiene (don't show a button that would just error).
  const canSelfReset =
    !!profileEmail &&
    !!callerGoogleEmail &&
    profileEmail.toLowerCase() === callerGoogleEmail.toLowerCase()
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
    } catch (err) {
      // Audit 2026-04: previously this swallowed the thrown Error and showed
      // a generic "Something went wrong. Try again." — which made four very
      // different failure modes look identical to the user:
      //   1. Lockout ("Too many PIN attempts...")
      //   2. Missing/unconfigured PIN ("No PIN configured...")
      //   3. Server misconfig ("PIN_HASH_SALT is not configured...")
      //   4. selectProfile downstream throws ("Not authenticated", etc.)
      // During the April 2026 PIN debugging saga, that opacity cost hours —
      // we repeatedly chased "OAuth redirect loop" ghosts when the actual
      // error on the server was a clear "No companies associated" throw.
      //
      // verifyPin + selectProfile throw user-friendly strings by design
      // (see lib/actions/profiles.ts). Pass them through. If any throw site
      // later leaks internal detail, harden the message at the throw (where
      // context is richest), not here.
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Sign-in error. Try again.')
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

      {/* Error message — minHeight keeps the layout stable when empty
          while allowing multi-line messages like "Too many PIN attempts.
          Try again in 5 minutes." to render without clipping. */}
      <div
        style={{
          minHeight: '16px',
          padding: '0 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          lineHeight: '1.4',
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
        {canSelfReset ? (
          <>
            Forgot PIN?{' '}
            <button
              type="button"
              onClick={() => {
                setError('')
                setResetOpen(true)
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Reset it.
            </button>
          </>
        ) : (
          'Forgot PIN? Ask your manager to reset it.'
        )}
      </div>

      {resetOpen && (
        <ResetPinModal
          profileId={profileId}
          profileName={profileName}
          callerEmail={callerGoogleEmail ?? ''}
          onClose={() => setResetOpen(false)}
          onSuccess={() => {
            setResetOpen(false)
            setError('')
            setDigits([])
            // The PIN entry view stays mounted so the user can immediately
            // type their new PIN to sign in.
          }}
        />
      )}
    </div>
  )
}

/**
 * Reset PIN modal — opened from the "Forgot PIN?" link when the signed-in
 * Google account matches the profile's email. Two-step PIN entry (PIN +
 * confirm) to catch typos. On submit, calls selfResetPin server action;
 * server enforces the same email-match gate as the client.
 *
 * Kept inline in pin-entry.tsx because the modal is tightly coupled to
 * the entry flow — only used here, shares state ergonomics, no
 * public-API value to extract.
 */
function ResetPinModal({
  profileId,
  profileName,
  callerEmail,
  onClose,
  onSuccess,
}: {
  profileId: string
  profileName: string
  callerEmail: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!/^\d{4}$/.test(newPin)) {
      setError('PIN must be exactly 4 digits.')
      return
    }
    if (newPin !== confirmPin) {
      setError('PINs do not match.')
      return
    }
    setSubmitting(true)
    try {
      await selfResetPin(profileId, newPin)
      setDone(true)
      // Brief success flash, then close so the user can enter the new PIN.
      setTimeout(() => onSuccess(), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset PIN.')
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-pin-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          padding: '24px',
          maxWidth: '360px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h2
          id="reset-pin-title"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Reset PIN
        </h2>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            lineHeight: 1.4,
          }}
        >
          Setting a new PIN for <strong>{profileName}</strong>.<br />
          Verified via your Google account: {callerEmail}
        </div>

        {done ? (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--accent-green, #4ade80)',
              textAlign: 'center',
              padding: '24px 0',
            }}
          >
            ✓ PIN reset. Sign in with your new PIN.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={newPin}
              onChange={e =>
                setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              placeholder="New 4-digit PIN"
              autoFocus
              disabled={submitting}
              style={{
                width: '100%',
                padding: '14px',
                fontFamily: 'var(--font-mono)',
                fontSize: '18px',
                letterSpacing: '8px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                outline: 'none',
              }}
            />
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={confirmPin}
              onChange={e =>
                setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              placeholder="Confirm PIN"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '14px',
                fontFamily: 'var(--font-mono)',
                fontSize: '18px',
                letterSpacing: '8px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                outline: 'none',
              }}
            />

            {error && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--accent-red)',
                  textAlign: 'center',
                  lineHeight: 1.4,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || newPin.length !== 4 || confirmPin.length !== 4}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  backgroundColor: 'var(--accent)',
                  color: 'var(--bg-deep)',
                  border: 'none',
                  borderRadius: '12px',
                  cursor:
                    submitting || newPin.length !== 4 || confirmPin.length !== 4
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    submitting || newPin.length !== 4 || confirmPin.length !== 4
                      ? 0.5
                      : 1,
                }}
              >
                {submitting ? 'Saving…' : 'Reset PIN'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
