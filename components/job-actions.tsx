'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { updateJobStatus } from '@/lib/actions/jobs'
import type { Job, Company, User, JobStatus } from '@/lib/types/database'

interface JobActionsProps {
  job: Job & { company?: Company; rep?: User }
}

const NEXT_STATUS: Partial<Record<JobStatus, { status: JobStatus; label: string }>> = {
  lead: { status: 'estimate_scheduled', label: 'Schedule Estimate' },
  estimate_scheduled: { status: 'pending', label: 'Mark as Pending' },
  pending: { status: 'sold', label: 'Mark as Sold' },
  sold: { status: 'scheduled', label: 'Schedule Install' },
  scheduled: { status: 'in_progress', label: 'Start Job' },
  in_progress: { status: 'completed', label: 'Complete Job' },
  cancelled: { status: 'lead', label: 'Reactivate' },
}

export function JobActions({ job }: JobActionsProps) {
  const router = useRouter()
  const [advancing, setAdvancing] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const phone = job.phone
  const address = [job.address, job.city, job.state, job.zip].filter(Boolean).join(', ')
  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(address)}`

  const next = NEXT_STATUS[job.status]
  const canCancel = job.status !== 'completed' && job.status !== 'cancelled'

  async function handleAdvance() {
    if (!next) return
    setAdvancing(true)
    try {
      await updateJobStatus(job.id, next.status)
      router.refresh()
    } catch (err) {
      console.error('Failed to advance status:', err)
    } finally {
      setAdvancing(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    try {
      await updateJobStatus(job.id, 'cancelled')
      router.refresh()
    } catch (err) {
      console.error('Failed to cancel job:', err)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Quick action row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        {phone && (
          <a
            href={`tel:${phone}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 8px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '11px',
              fontFamily: 'var(--font-sans)',
              fontWeight: '500',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.1 6.1l.94-.94a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Call
          </a>
        )}

        {phone && (
          <a
            href={`sms:${phone}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 8px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '11px',
              fontFamily: 'var(--font-sans)',
              fontWeight: '500',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Text
          </a>
        )}

        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            padding: '12px 8px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
            fontWeight: '500',
            gridColumn: phone ? 'auto' : '1 / -1',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
          Map
        </a>
      </div>

      {/* Status advancement button */}
      {next && (
        <button
          onClick={handleAdvance}
          disabled={advancing}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: '8px',
            backgroundColor: advancing ? 'rgba(0,230,118,0.6)' : 'var(--accent)',
            border: 'none',
            color: '#003d00',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: '800',
            cursor: advancing ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.01em',
          }}
        >
          {advancing ? 'Updating...' : next.label}
        </button>
      )}

      {/* Cancel button */}
      {canCancel && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: '8px',
            backgroundColor: 'transparent',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: '500',
            cursor: cancelling ? 'not-allowed' : 'pointer',
          }}
        >
          {cancelling ? 'Cancelling...' : 'Cancel Job'}
        </button>
      )}
    </div>
  )
}
