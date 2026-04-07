'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { updateJobStatus } from '@/lib/actions/jobs'
import type { Job, Company, User, JobStatus } from '@/lib/types/database'
import { CallIcon, TextIcon, NavigateIcon, DocumentIcon } from '@/components/icons'

interface JobActionsProps {
  job: Job & { company?: Company; rep?: User }
  role?: string | null
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

const quickLinkStyle: React.CSSProperties = {
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
  cursor: 'pointer',
  transition: 'filter 0.15s ease',
}

function quickLinkHover(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.filter = 'brightness(1.25)'
}
function quickLinkLeave(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.filter = ''
}

export function JobActions({ job, role }: JobActionsProps) {
  const router = useRouter()
  const [advancing, setAdvancing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phone = job.phone
  const address = [job.address, job.city, job.state, job.zip].filter(Boolean).join(', ')
  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(address)}`

  const next = NEXT_STATUS[job.status]
  const canCancel = job.status !== 'completed' && job.status !== 'cancelled'
  const canManageEstimate = role === 'manager' || role === 'sales' || role === 'sales_crew'

  async function handleAdvance() {
    if (!next) return
    setAdvancing(true)
    setError(null)
    try {
      await updateJobStatus(job.id, next.status)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    setError(null)
    try {
      await updateJobStatus(job.id, 'cancelled')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job')
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
            style={quickLinkStyle}
            onMouseEnter={quickLinkHover}
            onMouseLeave={quickLinkLeave}
          >
            <CallIcon size={18} />
            Call
          </a>
        )}

        {phone && (
          <a
            href={`sms:${phone}`}
            style={quickLinkStyle}
            onMouseEnter={quickLinkHover}
            onMouseLeave={quickLinkLeave}
          >
            <TextIcon size={18} />
            Text
          </a>
        )}

        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...quickLinkStyle, gridColumn: phone ? 'auto' : '1 / -1' }}
          onMouseEnter={quickLinkHover}
          onMouseLeave={quickLinkLeave}
        >
          <NavigateIcon size={18} />
          Map
        </a>
      </div>

      {/* Estimate quick action — sales/manager only */}
      {canManageEstimate && (
        <Link
          href={`/jobs/${job.id}/estimate`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--accent-blue)',
            color: 'var(--accent-blue)',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            fontWeight: '700',
            textDecoration: 'none',
            letterSpacing: '-0.01em',
            transition: 'filter 0.15s ease',
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.filter = 'brightness(1.2)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.filter = '' }}
        >
          <DocumentIcon size={16} />
          {job.estimate_pdf_url ? 'Edit Estimate' : 'Create Estimate'}
        </Link>
      )}

      {/* Status advancement button */}
      {next && (
        <button
          type="button"
          onClick={handleAdvance}
          disabled={advancing}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: advancing ? 'rgba(0,230,118,0.6)' : 'var(--accent)',
            border: 'none',
            color: 'var(--nav-text)',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: '800',
            cursor: advancing ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.01em',
            transition: 'filter 0.15s ease',
          }}
          onMouseEnter={(e) => { if (!advancing) e.currentTarget.style.filter = 'brightness(1.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = '' }}
        >
          {advancing ? 'Updating...' : next.label}
        </button>
      )}

      {/* Cancel button */}
      {canCancel && (
        <button
          type="button"
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
            transition: 'border-color 0.15s ease, color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!cancelling) {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = ''
            e.currentTarget.style.color = ''
          }}
        >
          {cancelling ? 'Cancelling...' : 'Cancel Job'}
        </button>
      )}

      {/* Error display */}
      {error && (
        <div style={{ color: 'var(--accent-red)', fontSize: '12px', marginTop: '4px', textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  )
}
