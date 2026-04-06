'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CompanyTag } from '@/components/company-tag'
import { updateJobStatus } from '@/lib/actions/jobs'
import { ClockInButton, ClockOutButton, SwitchJobButton } from './clock-in-button'
import { ActiveTimer } from './active-timer'
import { BreakControls } from './break-controls'
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

// Map job type to display string
function formatJobType(type: string): string {
  const map: Record<string, string> = {
    reroof: 'Re-Roof',
    repair: 'Repair',
    maintenance: 'Maintenance',
    inspection: 'Inspection',
    coating: 'Coating',
    new_construction: 'New Construction',
    gutters: 'Gutters',
    other: 'Other',
  }
  return map[type] ?? type
}

function buildMapsUrl(address: string, city: string): string {
  const full = `${address}, ${city}, CA`
  return `https://maps.apple.com/?daddr=${encodeURIComponent(full)}`
}

// --- Icons ---
function MapPinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 1.5C6.51 1.5 4.5 3.51 4.5 6C4.5 9.375 9 16.5 9 16.5C9 16.5 13.5 9.375 13.5 6C13.5 3.51 11.49 1.5 9 1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8H13M13 8L9 4M13 8L9 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 3L5.8 1.5H8.2L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 2.5C2 2 2.5 1.5 3 1.5H5L6.5 4.5L5.5 5.5C5.5 5.5 6 7 7 8C8 9 9.5 9.5 9.5 9.5L10.5 8.5L13.5 10V12C13.5 12.5 13 13 12.5 13C6.5 13 1 7.5 1 1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SpecsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 5H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.5 7.5H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.5 10H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function MiniMapsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M6 1C4.34 1 3 2.34 3 4C3 6.25 6 11 6 11C6 11 9 6.25 9 4C9 2.34 7.66 1 6 1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="4" r="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 7L5.5 10.5L12 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// --- Completed card ---
function CompletedCard({ job }: { job: JobWithCompany }) {
  return (
    <div
      style={{
        opacity: 0.45,
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
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
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
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
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            display: 'block',
            marginTop: '2px',
          }}
        >
          {job.city} · {formatJobType(job.job_type)}
        </span>
      </div>

      {/* Mini action buttons */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <a
          href={mapsUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
          aria-label="Navigate"
        >
          <MiniMapsIcon />
        </a>
        {job.phone && (
          <a
            href={`tel:${job.phone}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
            aria-label="Call"
          >
            <PhoneIcon />
          </a>
        )}
        {job.site_notes && (
          <Link
            href={`/jobs/${job.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
            aria-label="Notes"
          >
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

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          {job.company && (
            <CompanyTag name={job.company.name} color={job.company.color} />
          )}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
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
            background: 'linear-gradient(135deg, #00c853, #00e676)',
            borderRadius: '8px',
            padding: '10px 12px',
            textDecoration: 'none',
            color: '#003d00',
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
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'var(--accent-blue-dim)',
            border: '1px solid rgba(68,138,255,0.2)',
            borderRadius: '8px',
            padding: '10px 8px',
            cursor: 'pointer',
            color: 'var(--accent-blue)',
          }}
        >
          <CameraIcon />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              lineHeight: 1,
            }}
          >
            Cam
          </span>
        </button>

        {/* Call */}
        {job.phone ? (
          <a
            href={`tel:${job.phone}`}
            style={{
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
            }}
          >
            <PhoneIcon />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}
            >
              Call
            </span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '10px 8px',
              cursor: 'not-allowed',
              color: 'var(--text-muted)',
              opacity: 0.5,
            }}
          >
            <PhoneIcon />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}
            >
              Call
            </span>
          </button>
        )}

        {/* Specs */}
        <Link
          href={`/jobs/${job.id}`}
          style={{
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
          }}
        >
          <SpecsIcon />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              lineHeight: 1,
            }}
          >
            Specs
          </span>
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
