'use client'

/**
 * Audit R3-#4: root error boundary. This is the LAST line of defense — only
 * fires if the app/error.tsx boundary itself throws (e.g. layout crash, font
 * load failure, ThemeProvider error).
 *
 * Next.js 16 requires this file to render its own <html> and <body> because
 * it replaces the entire document tree when invoked. No theme provider, no
 * fonts, no ToastProvider — anything in the layout tree is unavailable here.
 * Keep it minimal and dependency-free.
 */

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: '#08090d',
          color: '#e8e9ef',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '420px',
            width: '100%',
            textAlign: 'center',
            padding: '32px',
            borderRadius: '16px',
            backgroundColor: '#13151b',
            border: '1px solid #2a2d36',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: '#7a8294',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginBottom: '12px',
            }}
          >
            App error
          </div>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 800,
              marginTop: 0,
              marginBottom: '8px',
              color: '#e8e9ef',
            }}
          >
            RoofCRM ran into a problem
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#9aa0ae',
              lineHeight: '1.5',
              marginBottom: '24px',
            }}
          >
            Try reloading. If this keeps happening, contact your office manager.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              background: '#3ddc97',
              color: '#0a0a0a',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <div
              style={{
                marginTop: '20px',
                fontFamily: 'ui-monospace, "SF Mono", monospace',
                fontSize: '10px',
                color: '#7a8294',
              }}
            >
              ref: {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  )
}
