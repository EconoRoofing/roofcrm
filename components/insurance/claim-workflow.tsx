'use client'

import { useState } from 'react'
import { updateClaimStatus, updateAdjusterInfo, updateSupplementAmount } from '@/lib/actions/insurance'
import type { ClaimStatus } from '@/lib/actions/insurance'

const CLAIM_STATUSES: ClaimStatus[] = ['filed', 'inspection', 'approved', 'supplement', 'done']

const STATUS_COLORS: Record<ClaimStatus, string> = {
  filed: '#64748b',
  inspection: '#3b82f6',
  approved: '#22c55e',
  supplement: '#f59e0b',
  done: '#10b981',
}

interface ClaimWorkflowProps {
  jobId: string
  claimNumber?: string
  currentStatus?: ClaimStatus
  adjusterName?: string
  adjusterPhone?: string
  adjusterEmail?: string
  supplementAmount?: number
  onStatusChange?: (status: ClaimStatus) => void
}

export function ClaimWorkflow({
  jobId,
  claimNumber,
  currentStatus = 'filed',
  adjusterName,
  adjusterPhone,
  adjusterEmail,
  supplementAmount = 0,
  onStatusChange,
}: ClaimWorkflowProps) {
  const [status, setStatus] = useState<ClaimStatus>(currentStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdjusterForm, setShowAdjusterForm] = useState(false)
  const [showSupplementForm, setShowSupplementForm] = useState(false)
  const [adjusterForm, setAdjusterForm] = useState({
    name: adjusterName || '',
    phone: adjusterPhone || '',
    email: adjusterEmail || '',
  })
  const [supplementForm, setSupplementForm] = useState({
    amount: supplementAmount.toString(),
  })

  const handleStatusChange = async (newStatus: ClaimStatus) => {
    try {
      setLoading(true)
      setError(null)
      await updateClaimStatus(jobId, newStatus)
      setStatus(newStatus)
      onStatusChange?.(newStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setLoading(false)
    }
  }

  const handleAdjusterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)
      await updateAdjusterInfo(jobId, adjusterForm.name, adjusterForm.phone, adjusterForm.email)
      setShowAdjusterForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update adjuster info')
    } finally {
      setLoading(false)
    }
  }

  const handleSupplementSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)
      await updateSupplementAmount(jobId, parseFloat(supplementForm.amount))
      setShowSupplementForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update supplement amount')
    } finally {
      setLoading(false)
    }
  }

  const currentIndex = CLAIM_STATUSES.indexOf(status)

  return (
    <div
      style={{
        padding: '20px',
        borderRadius: '8px',
        backgroundColor: 'var(--surface-hover)',
        border: '1px solid var(--border)',
      }}
    >
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', margin: 0 }}>Insurance Claim</h2>

      {claimNumber && (
        <div style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--text-secondary)' }}>
          Claim #{claimNumber}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Status Pipeline */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          {CLAIM_STATUSES.map((s, index) => (
            <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <button
                onClick={() => handleStatusChange(s)}
                disabled={loading || index > currentIndex + 1}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: index <= currentIndex ? STATUS_COLORS[s] : 'var(--surface)',
                  color: index <= currentIndex ? '#fff' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: index <= currentIndex + 1 && !loading ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                  opacity: index > currentIndex + 1 ? 0.5 : 1,
                  border: index === currentIndex ? `2px solid ${STATUS_COLORS[s]}` : '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
                title={s.replace('_', ' ')}
              >
                {index + 1}
              </button>
              <div style={{ fontSize: '11px', marginTop: '6px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                {s.replace('_', ' ')}
              </div>
            </div>
          ))}
        </div>

        {/* Status Line Connector */}
        <div
          style={{
            height: '2px',
            backgroundColor: 'var(--border)',
            position: 'relative',
            marginTop: '56px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              height: '100%',
              backgroundColor: STATUS_COLORS[status],
              width: `${(currentIndex / (CLAIM_STATUSES.length - 1)) * 100}%`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Adjuster Card */}
      <div
        style={{
          padding: '16px',
          borderRadius: '8px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Adjuster</h3>
          <button
            onClick={() => setShowAdjusterForm(!showAdjusterForm)}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--accent)',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-dim)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {showAdjusterForm ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {showAdjusterForm ? (
          <form onSubmit={handleAdjusterSubmit} style={{ display: 'grid', gap: '8px' }}>
            <input
              type="text"
              value={adjusterForm.name}
              onChange={(e) => setAdjusterForm({ ...adjusterForm, name: e.target.value })}
              placeholder="Adjuster name"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="tel"
              value={adjusterForm.phone}
              onChange={(e) => setAdjusterForm({ ...adjusterForm, phone: e.target.value })}
              placeholder="Phone number"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="email"
              value={adjusterForm.email}
              onChange={(e) => setAdjusterForm({ ...adjusterForm, email: e.target.value })}
              placeholder="Email address"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.15s',
                opacity: loading ? 0.5 : 1,
              }}
            >
              Save
            </button>
          </form>
        ) : (
          <div style={{ fontSize: '13px', display: 'grid', gap: '6px' }}>
            {adjusterName ? (
              <>
                <div>
                  <span style={{ fontWeight: 500 }}>Name:</span> {adjusterName}
                </div>
                {adjusterPhone && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Phone:</span> {adjusterPhone}
                  </div>
                )}
                {adjusterEmail && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Email:</span> {adjusterEmail}
                  </div>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>No adjuster assigned yet</span>
            )}
          </div>
        )}
      </div>

      {/* Supplement Amount Tracker */}
      {status === 'supplement' && (
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Supplement Amount</h3>
            <button
              onClick={() => setShowSupplementForm(!showSupplementForm)}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                backgroundColor: 'transparent',
                color: 'var(--accent)',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-dim)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {showSupplementForm ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {showSupplementForm ? (
            <form onSubmit={handleSupplementSubmit} style={{ display: 'grid', gap: '8px' }}>
              <input
                type="number"
                value={supplementForm.amount}
                onChange={(e) => setSupplementForm({ amount: e.target.value })}
                step="0.01"
                min="0"
                placeholder="0.00"
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface-hover)',
                  color: 'var(--text)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.15s',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                Save
              </button>
            </form>
          ) : (
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent)' }}>
              ${supplementAmount.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
