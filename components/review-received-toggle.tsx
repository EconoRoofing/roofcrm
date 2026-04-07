'use client'

import { useState } from 'react'
import { updateJob } from '@/lib/actions/jobs'

interface ReviewReceivedToggleProps {
  jobId: string
  initialValue: boolean
}

export function ReviewReceivedToggle({ jobId, initialValue }: ReviewReceivedToggleProps) {
  const [received, setReceived] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    setSaving(true)
    const newValue = !received
    try {
      await updateJob(jobId, {
        review_received: newValue,
        review_date: newValue ? new Date().toISOString().split('T')[0] : null,
      } as Parameters<typeof updateJob>[1])
      setReceived(newValue)
    } catch {
      // silently revert on error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        backgroundColor: received ? 'rgba(0,230,118,0.06)' : 'var(--bg-elevated)',
        border: `1px solid ${received ? 'rgba(0,230,118,0.2)' : 'var(--border-subtle)'}`,
        borderRadius: '8px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          fontWeight: 600,
          color: received ? 'var(--accent)' : 'var(--text-secondary)',
        }}
      >
        {received ? 'Review received' : 'Review not yet received'}
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        style={{
          padding: '6px 14px',
          borderRadius: '8px',
          border: 'none',
          background: received ? 'var(--bg-surface)' : 'var(--accent)',
          color: received ? 'var(--text-muted)' : '#0a0a0a',
          fontSize: '12px',
          fontWeight: 700,
          cursor: saving ? 'wait' : 'pointer',
          fontFamily: 'var(--font-sans)',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? '...' : received ? 'Unmark' : 'Mark Received'}
      </button>
    </div>
  )
}
