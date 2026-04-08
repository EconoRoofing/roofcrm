'use client'

import { useState, useEffect } from 'react'
import { buildMapsUrl } from '@/lib/utils'
import type { Job } from '@/lib/types/database'
import type { TimeEntry } from '@/lib/types/time-tracking'
import { ClockInButton, ClockOutButton } from './clock-in-button'
import { ActiveTimer } from './active-timer'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

interface SimpleModeProps {
  jobs: JobWithCompany[]
  activeTimeEntry: (TimeEntry & { job?: { job_number: string; customer_name: string; address: string; city: string } }) | null
  userId: string
  firstName: string
}

export function SimpleMode({ jobs, activeTimeEntry, userId, firstName }: SimpleModeProps) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Current job: first non-completed, non-cancelled
  const currentJob = jobs.find(j => j.status !== 'completed' && j.status !== 'cancelled') ?? jobs[0]
  const nextJob = currentJob
    ? jobs.find(j => j.id !== currentJob.id && j.status !== 'completed' && j.status !== 'cancelled')
    : null

  const isClockedIn = activeTimeEntry != null && activeTimeEntry.job_id === (currentJob?.id ?? '')

  if (!currentJob) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '32px 24px',
          gap: '16px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
          }}
        >
          {greeting}, {firstName}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '16px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          No jobs scheduled for today.
        </div>
      </div>
    )
  }

  const mapsUrl = buildMapsUrl(currentJob.address, currentJob.city)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 16px 32px',
        gap: '16px',
        minHeight: '100%',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* Greeting */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '24px',
            fontWeight: 900,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
          }}
        >
          {greeting}, {firstName}
        </div>

        {/* Company badge */}
        {currentJob.company && (
          <div
            style={{
              display: 'inline-block',
              marginTop: '8px',
              padding: '3px 10px',
              borderRadius: '6px',
              backgroundColor: currentJob.company.color + '22',
              border: `1px solid ${currentJob.company.color}44`,
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 700,
              color: currentJob.company.color,
            }}
          >
            {currentJob.company.name}
          </div>
        )}

        {/* Job name + address */}
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '20px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginTop: '8px',
            lineHeight: 1.3,
          }}
        >
          {currentJob.customer_name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            color: 'var(--text-secondary)',
            marginTop: '2px',
          }}
        >
          {currentJob.address}, {currentJob.city}
        </div>
      </div>

      {/* Site notes alert */}
      {currentJob.site_notes && (
        <div
          style={{
            backgroundColor: 'var(--accent-red-dim)',
            border: '1px solid var(--accent-red)',
            borderRadius: '8px',
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
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
              fontSize: '14px',
              color: 'var(--accent-red)',
              lineHeight: 1.5,
            }}
          >
            {currentJob.site_notes}
          </div>
        </div>
      )}

      {/* MASSIVE BUTTONS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* GO TO JOB */}
        <a
          href={mapsUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            height: '80px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))',
            color: 'var(--nav-text)',
            fontFamily: 'var(--font-sans)',
            fontSize: '18px',
            fontWeight: 900,
            textDecoration: 'none',
            letterSpacing: '-0.01em',
            boxSizing: 'border-box',
          }}
        >
          {/* Map pin icon */}
          <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
            <path d="M9 1C6.2 1 4 3.2 4 6c0 4 5 11 5 11s5-7 5-11c0-2.8-2.2-5-5-5z" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <circle cx="9" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          GO TO JOB
        </a>

        {/* CLOCK IN / CLOCK OUT */}
        {isClockedIn && activeTimeEntry ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <ActiveTimer timeEntry={activeTimeEntry} jobName={currentJob.customer_name} />
            <ClockOutButton timeEntry={activeTimeEntry} userId={userId} />
          </div>
        ) : (
          <ClockInButton jobId={currentJob.id} userId={userId} />
        )}

        {/* PHOTOS (CompanyCam deep link) */}
        {currentJob.companycam_project_id ? (
          <a
            href={`https://app.companycam.com/projects/${currentJob.companycam_project_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%',
              height: '60px',
              borderRadius: '14px',
              backgroundColor: 'var(--accent-blue-dim)',
              border: '1px solid rgba(68,138,255,0.3)',
              color: 'var(--accent-blue)',
              fontFamily: 'var(--font-sans)',
              fontSize: '16px',
              fontWeight: 900,
              textDecoration: 'none',
              letterSpacing: '-0.01em',
              boxSizing: 'border-box',
            }}
          >
            {/* Camera icon */}
            <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="9" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 5L7 2h4l1 3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            PHOTOS
          </a>
        ) : (
          <a
            href="companycam://"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%',
              height: '60px',
              borderRadius: '14px',
              backgroundColor: 'var(--accent-blue-dim)',
              border: '1px solid rgba(68,138,255,0.3)',
              color: 'var(--accent-blue)',
              fontFamily: 'var(--font-sans)',
              fontSize: '16px',
              fontWeight: 900,
              textDecoration: 'none',
              letterSpacing: '-0.01em',
              boxSizing: 'border-box',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="9" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 5L7 2h4l1 3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            PHOTOS
          </a>
        )}
      </div>

      {/* Next job preview */}
      {nextJob && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          Next: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{nextJob.customer_name}</span>
          {nextJob.address && (
            <span> — {nextJob.address}</span>
          )}
        </div>
      )}
    </div>
  )
}
