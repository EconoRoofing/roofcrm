'use client'

/**
 * Audit R3-#4: customer-facing error boundary for the portal page. The
 * portal is the only public surface of the app — a transient Resend or
 * Supabase failure here used to show a brand-less Next.js crash screen
 * to a paying customer trying to view their project. Now they see a
 * branded card with a Reload button and a stable error reference they
 * can quote to support.
 */
import { useEffect } from 'react'

interface PortalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PortalError({ error, reset }: PortalErrorProps) {
  useEffect(() => {
    void import('@/lib/observability').then(({ reportError }) => {
      reportError(error, { source: 'portal/[token]/error.tsx', digest: error.digest })
    }).catch(() => {})
  }, [error])

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'var(--bg-deep)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          textAlign: 'center',
          padding: '36px 28px',
          borderRadius: '16px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 800,
            marginTop: 0,
            marginBottom: '12px',
            color: 'var(--text-primary)',
          }}
        >
          We couldn&rsquo;t load your project
        </h1>
        <p
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            lineHeight: '1.55',
            marginBottom: '28px',
          }}
        >
          This is usually temporary. Please try again — if it keeps happening,
          call your roofing company directly and they can pull up your file.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            display: 'inline-block',
            padding: '14px 28px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--accent)',
            color: '#0a0a0a',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Try again
        </button>
        {error.digest && (
          <div
            style={{
              marginTop: '24px',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-muted)',
            }}
          >
            ref: {error.digest}
          </div>
        )}
      </div>
    </div>
  )
}
