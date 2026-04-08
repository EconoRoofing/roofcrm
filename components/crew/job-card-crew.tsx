'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CompanyTag } from '@/components/company-tag'
import { updateJobStatus } from '@/lib/actions/jobs'
import { ClockInButton, ClockOutButton, SwitchJobButton } from './clock-in-button'
import { ActiveTimer } from './active-timer'
import { BreakControls } from './break-controls'
import {
  MapPinIcon,
  ArrowIcon,
  CameraIcon,
  PhoneIcon,
  SpecsIcon,
  MiniMapsIcon,
  CheckIcon,
  ExternalLinkIcon,
} from '@/components/icons'
import { formatJobType, buildMapsUrl } from '@/lib/utils'
import type { Job, JobStatus } from '@/lib/types/database'
import type { TimeEntry } from '@/lib/types/time-tracking'

// Job with company joined
type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

interface JobCardCrewProps {
  job: JobWithCompany
  isActive: boolean
  isCompleted?: boolean
  /** The currently active time entry for this user (null if not clocked in anywhere) */
  activeTimeEntry?: (TimeEntry & { job?: { job_number: string; customer_name: string; address: string; city: string } }) | null
  /** The authenticated user's ID (for photo upload path) */
  userId?: string
}

// ─── Static style constants ───────────────────────────────────────────────────

const crewStyles = {
  collapsedCard: {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  } as React.CSSProperties,

  miniActionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '40px',
    height: '40px',
    padding: '0 8px',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    textDecoration: 'none',
  } as React.CSSProperties,

  actionButtonBase: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '10px 8px',
    textDecoration: 'none',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,

  actionButtonLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    lineHeight: 1,
  } as React.CSSProperties,

  companyTagLarge: {
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: '5px',
  } as React.CSSProperties,

  monoSmall: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-muted)',
  } as React.CSSProperties,

  jobNumberTag: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: 500,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  } as React.CSSProperties,
} as const

// --- Completed card ---
function CompletedCard({ job }: { job: JobWithCompany }) {
  return (
    <div style={{ ...crewStyles.collapsedCard, opacity: 0.45 }}>
      <span style={{ color: 'var(--text-muted)' }}>
        <CheckIcon />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textDecoration: 'line-through',
            display: 'block',
          }}
        >
          {job.customer_name}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-muted)',
          }}
        >
          {job.city} · {formatJobType(job.job_type)}
        </span>
      </div>
      {job.company && (
        <CompanyTag name={job.company.name} color={job.company.color} />
      )}
    </div>
  )
}

// --- Collapsed card ---
function CollapsedCard({ job }: { job: JobWithCompany }) {
  const mapsUrl = buildMapsUrl(job.address, job.city)

  return (
    <div style={crewStyles.collapsedCard}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {job.company && (
            <CompanyTag name={job.company.name} color={job.company.color} />
          )}
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            {job.customer_name}
          </span>
        </div>
        <span
          style={{ ...crewStyles.monoSmall, display: 'block', marginTop: '2px' }}
        >
          {job.city} · {formatJobType(job.job_type)}
        </span>
      </div>

      {/* Mini action buttons */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <a href={mapsUrl} style={crewStyles.miniActionButton} aria-label="Navigate">
          <MiniMapsIcon />
        </a>
        {job.phone && (
          <a href={`tel:${job.phone}`} style={crewStyles.miniActionButton} aria-label="Call">
            <PhoneIcon />
          </a>
        )}
        {job.site_notes && (
          <Link href={`/jobs/${job.id}`} style={crewStyles.miniActionButton} aria-label="Notes">
            <SpecsIcon />
          </Link>
        )}
      </div>
    </div>
  )
}

// --- Active (expanded) card ---
function ActiveCard({
  job,
  activeTimeEntry,
  userId,
}: {
  job: JobWithCompany
  activeTimeEntry?: (TimeEntry & { job?: { job_number: string; customer_name: string; address: string; city: string } }) | null
  userId?: string
}) {
  const [isPending, startTransition] = useTransition()
  const mapsUrl = buildMapsUrl(job.address, job.city)

  const isInProgress = job.status === 'in_progress'
  const isCompleted = job.status === 'completed'
  const canProgress = job.status === 'scheduled' || job.status === 'in_progress'

  const nextStatus: JobStatus | null =
    job.status === 'scheduled' ? 'in_progress' : job.status === 'in_progress' ? 'completed' : null

  const buttonLabel = isCompleted
    ? 'Completed'
    : isInProgress
    ? 'Mark Complete'
    : 'Mark In Progress'

  // Determine clock state
  const isClockedIntoThis = activeTimeEntry?.job_id === job.id
  const isClockedIntoOther = activeTimeEntry != null && activeTimeEntry.job_id !== job.id
  const notClockedIn = activeTimeEntry == null

  const jobName = job.customer_name

  function handleStatusChange() {
    if (!nextStatus || isPending) return
    startTransition(async () => {
      await updateJobStatus(job.id, nextStatus)
    })
  }

  // Materials summary
  const materialParts = [
    job.material,
    job.material_color,
    job.squares ? `${job.squares} sq` : null,
  ].filter(Boolean)
  const materialsStr = materialParts.join(' · ')

  const companyColor = job.company?.color ?? 'var(--accent)'

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `4px solid ${companyColor}`,
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          {job.company && (
            <span
              style={{
                ...crewStyles.companyTagLarge,
                color: job.company.color,
                backgroundColor: job.company.color + '22',
                border: `1px solid ${job.company.color}44`,
              }}
            >
              {job.company.name}
            </span>
          )}
          <span style={crewStyles.jobNumberTag}>
            #{job.job_number}
          </span>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '18px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
            marginBottom: '2px',
          }}
        >
          {job.customer_name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          {formatJobType(job.job_type)}
        </div>
      </div>

      {/* Navigate button */}
      <div style={{ padding: '0 12px 12px' }}>
        <a
          href={mapsUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))',
            borderRadius: '8px',
            padding: '10px 12px',
            textDecoration: 'none',
            color: 'var(--nav-text)',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: 'rgba(0,0,0,0.18)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MapPinIcon />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 700,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {job.address}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 500,
                opacity: 0.75,
              }}
            >
              {job.city}, CA
            </div>
          </div>
          <ArrowIcon />
        </a>
      </div>

      {/* Action buttons row */}
      <div style={{ padding: '0 12px 12px', display: 'flex', gap: '8px' }}>
        {/* CompanyCam */}
        <button
          type="button"
          style={{
            ...crewStyles.actionButtonBase,
            backgroundColor: 'var(--accent-blue-dim)',
            border: '1px solid rgba(68,138,255,0.2)',
            cursor: 'pointer',
            color: 'var(--accent-blue)',
          }}
        >
          <CameraIcon />
          <span style={crewStyles.actionButtonLabel}>Cam</span>
        </button>

        {/* Call */}
        {job.phone ? (
          <a href={`tel:${job.phone}`} style={crewStyles.actionButtonBase}>
            <PhoneIcon />
            <span style={crewStyles.actionButtonLabel}>Call</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            style={{ ...crewStyles.actionButtonBase, cursor: 'not-allowed', color: 'var(--text-muted)', opacity: 0.5 }}
          >
            <PhoneIcon />
            <span style={crewStyles.actionButtonLabel}>Call</span>
          </button>
        )}

        {/* Specs */}
        <Link href={`/jobs/${job.id}`} style={crewStyles.actionButtonBase}>
          <SpecsIcon />
          <span style={crewStyles.actionButtonLabel}>Specs</span>
        </Link>
      </div>

      {/* Site notes alert */}
      {job.site_notes && job.site_notes.trim() !== '' && (
        <div style={{ padding: '0 12px 12px' }}>
          <div
            style={{
              backgroundColor: 'var(--accent-red-dim)',
              border: '1px solid var(--accent-red)',
              borderRadius: '8px',
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                fontWeight: 700,
                color: 'var(--accent-red)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '4px',
              }}
            >
              Site Note
            </div>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--accent-red)',
                lineHeight: 1.5,
              }}
            >
              {job.site_notes}
            </div>
          </div>
        </div>
      )}

      {/* Details section */}
      <div
        style={{
          padding: '0 12px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}
          >
            {job.customer_name}
          </span>
          {job.phone && (
            <a
              href={`tel:${job.phone}`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--accent-blue)',
                textDecoration: 'none',
              }}
            >
              {job.phone}
            </a>
          )}
        </div>
        {materialsStr && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            {materialsStr}
          </span>
        )}
      </div>

      {/* View Agreement — shown when a signed PDF exists */}
      {job.estimate_pdf_url && (
        <div style={{ padding: '0 12px 12px' }}>
          <a
            href={job.estimate_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid rgba(68,138,255,0.25)',
              color: 'var(--accent-blue)',
              textDecoration: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <ExternalLinkIcon size={12} />
            View Agreement
          </a>
        </div>
      )}

      {/* Clock-in / timer / clock-out section */}
      {!isCompleted && userId && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Active timer + break controls (only when clocked into THIS job) */}
          {isClockedIntoThis && activeTimeEntry && (
            <>
              <ActiveTimer timeEntry={activeTimeEntry} jobName={jobName} />
              <BreakControls
                timeEntryId={activeTimeEntry.id}
                clockInTime={activeTimeEntry.clock_in}
              />
              <ClockOutButton
                timeEntry={activeTimeEntry}
                userId={userId}
              />
            </>
          )}

          {/* Clock in (not clocked in anywhere) */}
          {notClockedIn && (
            <ClockInButton
              jobId={job.id}
              userId={userId}
            />
          )}

          {/* Switch job (clocked into a different job) */}
          {isClockedIntoOther && activeTimeEntry && (
            <SwitchJobButton
              currentTimeEntry={activeTimeEntry}
              newJobId={job.id}
              userId={userId}
            />
          )}
        </div>
      )}

      {/* Mark complete button — shown only when not clocked in (no active entry) */}
      {!isCompleted && (!userId || notClockedIn) && (
        <div style={{ padding: '0 12px 16px' }}>
          <button
            type="button"
            onClick={handleStatusChange}
            disabled={!canProgress || isPending}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: 'var(--bg-elevated)',
              border: `1px solid ${canProgress ? 'var(--accent)' : 'var(--border-subtle)'}`,
              borderRadius: '8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              color: canProgress ? 'var(--accent)' : 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: canProgress && !isPending ? 'pointer' : 'not-allowed',
              opacity: isPending ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isPending ? 'Updating...' : buttonLabel}
          </button>
        </div>
      )}
    </div>
  )
}

// --- Main export ---
export function JobCardCrew({
  job,
  isActive,
  isCompleted = false,
  activeTimeEntry,
  userId,
}: JobCardCrewProps) {
  if (isCompleted) {
    return <CompletedCard job={job} />
  }
  if (isActive) {
    return <ActiveCard job={job} activeTimeEntry={activeTimeEntry} userId={userId} />
  }
  return <CollapsedCard job={job} />
}
