'use client'

/**
 * Audit R3-#4: per-segment error boundary for the (manager) / (sales) / (crew)
 * route groups. Without this, any uncaught exception in a server component
 * inside the app shows the raw Next.js default crash screen, branded with
 * the Vercel logo and zero recovery affordance.
 *
 * Next.js 16 invokes this client component automatically when a child server
 * component throws. The `reset` callback re-runs the failed segment without
 * a full reload, which is what the user usually wants (transient Supabase
 * hiccup, network blip, etc.).
 *
 * `app/global-error.tsx` is the parent fallback — only fires if THIS
 * boundary itself throws.
 */
import { useEffect } from 'react'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Forward to the same observability sink used by route handlers.
    // The `digest` field is Next's stable fingerprint for the error,
    // useful for cross-referencing against runtime logs.
    void import('@/lib/observability').then(({ reportError }) => {
      reportError(error, { source: 'app/error.tsx', digest: error.digest })
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
          maxWidth: '420px',
          width: '100%',
          textAlign: 'center',
          padding: '32px',
          borderRadius: '16px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            marginBottom: '12px',
          }}
        >
          Something went wrong
        </div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 800,
            marginBottom: '8px',
            color: 'var(--text-primary)',
          }}
        >
          We hit a snag loading this page
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            lineHeight: '1.5',
            marginBottom: '24px',
          }}
        >
          The team has been notified. You can try again — most issues are
          temporary and clear up on a retry.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent)',
            color: '#0a0a0a',
            fontSize: '14px',
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
              marginTop: '20px',
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
