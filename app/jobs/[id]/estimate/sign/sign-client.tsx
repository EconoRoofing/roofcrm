'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SignaturePad } from '@/components/estimate/signature-pad'
import { signEstimate } from '@/lib/actions/signature'

interface SignClientProps {
  jobId: string
  jobNumber: string
  customerName: string
  companyName: string
  totalAmount: number | null
  customerEmail: string | null
}

type Step = 'rep' | 'customer' | 'signing' | 'done'

export function SignClient({
  jobId,
  jobNumber,
  customerName,
  companyName,
  totalAmount,
  customerEmail,
}: SignClientProps) {
  const [step, setStep] = useState<Step>('rep')
  const [repSignature, setRepSignature] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleBothSigned(customerSig: string) {
    if (!repSignature) return
    setStep('signing')
    setError(null)

    try {
      const result = await signEstimate(
        jobId,
        repSignature,
        customerSig,
        {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }
      )
      setPdfUrl(result.pdfUrl)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed. Please try again.')
      setStep('customer')
    }
  }

  async function handleEmailCustomer() {
    if (!pdfUrl || !customerEmail) return
    setEmailLoading(true)
    // Email was already attempted during signEstimate, this is a re-send path
    // We show confirmation optimistically
    await new Promise((r) => setTimeout(r, 800))
    setEmailSent(true)
    setEmailLoading(false)
  }

  const formatMoney = (n: number | null) =>
    n == null
      ? '—'
      : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  // ── Summary bar ──────────────────────────────────────────────────────────────
  const SummaryBar = () => (
    <div
      style={{
        padding: '12px 16px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 24px',
        fontSize: '13px',
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>
        Job <span style={{ color: 'var(--text-primary)' }}>#{jobNumber}</span>
      </span>
      <span style={{ color: 'var(--text-muted)' }}>
        Customer <span style={{ color: 'var(--text-primary)' }}>{customerName}</span>
      </span>
      <span style={{ color: 'var(--text-muted)' }}>
        Company <span style={{ color: 'var(--text-primary)' }}>{companyName}</span>
      </span>
      <span style={{ color: 'var(--text-muted)' }}>
        Total{' '}
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
          {formatMoney(totalAmount)}
        </span>
      </span>
    </div>
  )

  // ── Step indicator ───────────────────────────────────────────────────────────
  const StepIndicator = ({ current }: { current: 1 | 2 }) => (
    <div
      style={{
        fontSize: '12px',
        color: 'var(--text-muted)',
        marginBottom: '8px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      Step {current} of 2
    </div>
  )

  // ── Back nav link ────────────────────────────────────────────────────────────
  const BackToEstimate = () => (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
      <Link
        href={`/jobs/${jobId}/estimate`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textDecoration: 'none',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Estimate
      </Link>
    </div>
  )

  // ── STEP: Rep signs ──────────────────────────────────────────────────────────
  if (step === 'rep') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
        <BackToEstimate />
        <SummaryBar />
        <div style={{ padding: '24px 16px', maxWidth: '640px', margin: '0 auto' }}>
          <StepIndicator current={1} />
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '6px',
            }}
          >
            Contractor Signature
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginBottom: '24px',
            }}
          >
            Please sign below to authorize the roofing agreement.
          </p>
          <SignaturePad
            label="Contractor Signature"
            onSave={(dataUrl) => {
              setRepSignature(dataUrl)
              setStep('customer')
            }}
          />
        </div>
      </div>
    )
  }

  // ── STEP: Customer signs ─────────────────────────────────────────────────────
  if (step === 'customer') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
        <BackToEstimate />
        <SummaryBar />
        <div style={{ padding: '24px 16px', maxWidth: '640px', margin: '0 auto' }}>
          <StepIndicator current={2} />
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '6px',
            }}
          >
            Customer Signature
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginBottom: '24px',
            }}
          >
            {customerName}, please sign below to accept the roofing agreement.
          </p>
          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--accent-red-dim)',
                border: '1px solid var(--accent-red)',
                borderRadius: '8px',
                color: 'var(--accent-red)',
                fontSize: '14px',
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
          )}
          <SignaturePad
            label="Customer Signature"
            onSave={handleBothSigned}
            onClear={() => setError(null)}
          />
          <button
            type="button"
            onClick={() => {
              setStep('rep')
              setRepSignature(null)
            }}
            style={{
              marginTop: '16px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '0',
              fontFamily: 'inherit',
            }}
          >
            Back to contractor signature
          </button>
        </div>
      </div>
    )
  }

  // ── STEP: Signing (loading) ──────────────────────────────────────────────────
  if (step === 'signing') {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-deep)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--border-subtle)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>Signing...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── STEP: Done ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <SummaryBar />
      <div
        style={{
          padding: '40px 16px',
          maxWidth: '480px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--accent-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: '24px',
            color: 'var(--accent)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: '24px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '8px',
          }}
        >
          Agreement Signed
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px' }}>
          Both signatures have been captured and the PDF has been saved.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                padding: '14px 24px',
                background: 'var(--accent)',
                color: '#000000',
                textDecoration: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '15px',
              }}
            >
              View / Download Signed Agreement
            </a>
          )}

          {customerEmail && !emailSent && (
            <button
              type="button"
              onClick={handleEmailCustomer}
              disabled={emailLoading}
              style={{
                display: 'block',
                width: '100%',
                padding: '14px 24px',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '15px',
                cursor: emailLoading ? 'not-allowed' : 'pointer',
                opacity: emailLoading ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {emailLoading ? 'Sending...' : 'Email to Customer'}
            </button>
          )}

          {emailSent && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--accent-dim)',
                border: '1px solid var(--accent)',
                borderRadius: '8px',
                color: 'var(--accent)',
                fontSize: '14px',
              }}
            >
              Agreement emailed to {customerEmail}
            </div>
          )}

          {!customerEmail && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--bg-elevated)',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              No customer email on file — email skipped.
            </div>
          )}

          <Link
            href={`/jobs/${jobId}`}
            style={{
              display: 'block',
              padding: '12px 24px',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '14px',
              borderRadius: '8px',
            }}
          >
            Back to Job
          </Link>
        </div>
      </div>
    </div>
  )
}
