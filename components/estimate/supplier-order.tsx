'use client'

import { useState } from 'react'
import { emailSupplierOrder, generateSupplierOrderText } from '@/lib/actions/supplier'

interface SupplierOrderProps {
  jobId: string
  companyName?: string
}

export function SupplierOrder({ jobId, companyName = 'Roofing Company' }: SupplierOrderProps) {
  const [supplierEmail, setSupplierEmail] = useState('')
  const [orderText, setOrderText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleGenerateOrder = async () => {
    setLoading(true)
    setError(null)
    try {
      const text = await generateSupplierOrderText(jobId)
      setOrderText(text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate order')
    } finally {
      setLoading(false)
    }
  }

  const handleSendEmail = async () => {
    if (!supplierEmail.trim()) {
      setError('Please enter supplier email address')
      return
    }

    setSending(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await emailSupplierOrder(jobId, supplierEmail, companyName)
      if (result) {
        setSuccess(true)
        setSupplierEmail('')
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError('Failed to send email. Please check the supplier email and try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  const handleCopyText = async () => {
    if (!orderText) return
    try {
      await navigator.clipboard.writeText(orderText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setError('Failed to copy to clipboard')
    }
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '24px',
      }}
    >
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
        Send to Supplier
      </h3>

      {/* Supplier email input */}
      <div style={{ marginBottom: '16px' }}>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            marginBottom: '6px',
          }}
        >
          SUPPLIER EMAIL
        </label>
        <input
          type="email"
          value={supplierEmail}
          onChange={(e) => setSupplierEmail(e.target.value)}
          placeholder="supplier@example.com"
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={handleGenerateOrder}
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Generating...' : 'Preview Order'}
        </button>

        <button
          onClick={handleSendEmail}
          disabled={sending || !supplierEmail.trim()}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '4px',
            border: '1px solid var(--accent)',
            backgroundColor: 'var(--accent)',
            color: 'var(--bg-deep)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: sending || !supplierEmail.trim() ? 'not-allowed' : 'pointer',
            opacity: sending || !supplierEmail.trim() ? 0.5 : 1,
          }}
        >
          {sending ? 'Sending...' : 'Send Email'}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: '12px',
            borderRadius: '4px',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            color: '#dc2626',
            fontSize: '12px',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      {/* Success message */}
      {success && (
        <div
          style={{
            padding: '12px',
            borderRadius: '4px',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            color: '#22c55e',
            fontSize: '12px',
            marginBottom: '16px',
          }}
        >
          Order sent successfully!
        </div>
      )}

      {/* Order text preview */}
      {orderText && (
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <label
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}
            >
              ORDER PREVIEW
            </label>
            <button
              onClick={handleCopyText}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <pre
            style={{
              padding: '12px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              maxHeight: '300px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono, monospace)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {orderText}
          </pre>
        </div>
      )}
    </div>
  )
}
