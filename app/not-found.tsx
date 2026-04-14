/**
 * Audit R3-#4: branded 404. Without this, calling notFound() or hitting
 * a route that doesn't exist shows the default Next.js 404, which has
 * no link back to a working page on the user's role-appropriate home.
 */
import Link from 'next/link'

export default function NotFound() {
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
          404
        </div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 800,
            marginTop: 0,
            marginBottom: '8px',
            color: 'var(--text-primary)',
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            lineHeight: '1.5',
            marginBottom: '24px',
          }}
        >
          The page you&rsquo;re looking for doesn&rsquo;t exist or has been
          moved. The link in the address bar may have a typo.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            borderRadius: '8px',
            background: 'var(--accent)',
            color: '#0a0a0a',
            fontSize: '14px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
