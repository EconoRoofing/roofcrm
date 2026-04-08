'use client'

import { useState, useTransition } from 'react'
import { generateReviewQR, sendReviewLinkSMS } from '@/lib/actions/reviews'

interface ReviewQRProps {
  jobId: string
  companyId: string
  companyName: string
  customerPhone: string | null
}

export function ReviewQR({ jobId: _jobId, companyId, companyName, customerPhone }: ReviewQRProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [smsSent, setSmsSent] = useState(false)
  const [smsError, setSmsError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isSmsPending, startSmsTransition] = useTransition()

  function loadQR() {
    startTransition(async () => {
      const url = await generateReviewQR(companyId)
      setQrUrl(url)
    })
  }

  function handleSendSMS() {
    if (!customerPhone) return
    startSmsTransition(async () => {
      const result = await sendReviewLinkSMS(_jobId, customerPhone, companyId)
      if (result.success) {
        setSmsSent(true)
      } else {
        setSmsError(result.error ?? 'Failed to send')
      }
    })
  }

  if (!qrUrl) {
    return (
      <button
        type="button"
        onClick={loadQR}
        disabled={isPending}
        style={{
          width: '100%',
          padding: '12px 16px',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--accent)',
          borderRadius: '8px',
          color: 'var(--accent)',
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          fontWeight: 700,
          cursor: isPending ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {/* QR icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="10" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="1" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="3" y="3" width="1" height="1" fill="currentColor" />
          <rect x="12" y="3" width="1" height="1" fill="currentColor" />
          <rect x="3" y="12" width="1" height="1" fill="currentColor" />
          <path d="M10 10h2v2h-2zM12 12h2v2h-2z" fill="currentColor" />
          <path d="M10 13h1M13 10h1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        {isPending ? 'Loading...' : 'Show Review QR Code'}
      </button>
    )
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      {/* Company name header */}
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {companyName} — Google Review
      </div>

      {/* QR code image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrUrl}
        alt="Google review QR code"
        width={200}
        height={200}
        style={{
          borderRadius: '8px',
          border: '4px solid white',
          display: 'block',
        }}
      />

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--text-muted)',
          margin: 0,
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        Show this to the customer — they scan it to leave a review
      </p>

      {/* Text button */}
      {customerPhone && (
        <div style={{ width: '100%' }}>
          {smsSent ? (
            <div
              style={{
                padding: '10px',
                backgroundColor: 'var(--accent-dim)',
                borderRadius: '6px',
                color: 'var(--accent)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              Review link sent via SMS
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSendSMS}
              disabled={isSmsPending}
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: 'var(--accent-blue-dim)',
                border: '1px solid rgba(68,138,255,0.3)',
                borderRadius: '6px',
                color: 'var(--accent-blue)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isSmsPending ? 'not-allowed' : 'pointer',
                opacity: isSmsPending ? 0.6 : 1,
              }}
            >
              {isSmsPending ? 'Sending...' : 'Text Review Link to Customer'}
            </button>
          )}
          {smsError && (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'var(--accent-red)',
                margin: '6px 0 0',
                textAlign: 'center',
              }}
            >
              {smsError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
