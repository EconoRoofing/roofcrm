'use client'

import type { Job } from '@/lib/types/database'
import type { TimeEntry } from '@/lib/types/time-tracking'
import { JobCardCrew } from './job-card-crew'

// Module-level style constants — extracted to avoid object allocation on every render
const timelineStyles = {
  dot: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    flexShrink: 0,
  } as React.CSSProperties,
  dotActive: {
    animation: 'pulse-dot 2s ease-in-out infinite',
    boxShadow: '0 0 12px var(--accent-glow)',
  } as React.CSSProperties,
  dotInactive: {
    animation: 'none',
    boxShadow: 'none',
  } as React.CSSProperties,
  timeLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    marginBottom: '6px',
  } as React.CSSProperties,
} as const

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

interface DayTimelineProps {
  jobs: JobWithCompany[]
  activeTimeEntry?: (TimeEntry & { job?: { job_number: string; customer_name: string; address: string; city: string } }) | null
  userId?: string
}

// Determine time label for each job slot
function getTimeLabel(index: number, isActive: boolean, isCompleted: boolean, _job: JobWithCompany): string {
  if (isCompleted) return 'DONE'
  if (isActive) return 'NOW'
  // Upcoming: second non-completed = NEXT, rest = LATER
  return index === 0 ? 'NEXT' : 'LATER'
}

export function DayTimeline({ jobs, activeTimeEntry, userId }: DayTimelineProps) {
  if (jobs.length === 0) {
    return (
      <div
        style={{
          padding: '48px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          No jobs today
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          Check your schedule for upcoming work
        </span>
      </div>
    )
  }

  // First non-completed job is active
  const firstActiveIdx = jobs.findIndex((j) => j.status !== 'completed' && j.status !== 'cancelled')
  // upcoming non-completed (for NEXT/LATER labels)
  let upcomingCount = 0

  return (
    <div style={{ padding: '0 16px 24px', position: 'relative' }}>
      {/* Vertical timeline line */}
      <div
        style={{
          position: 'absolute',
          left: '27px', // 16px padding + half of dot offset
          top: '20px',
          bottom: '20px',
          width: '2px',
          background: 'linear-gradient(to bottom, var(--accent), var(--border-subtle))',
          opacity: 0.4,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {jobs.map((job, idx) => {
          const isJobCompleted = job.status === 'completed' || job.status === 'cancelled'
          const isActive = idx === firstActiveIdx

          let timeLabelText: string
          if (isJobCompleted) {
            timeLabelText = 'DONE'
          } else if (isActive) {
            timeLabelText = 'NOW'
          } else {
            timeLabelText = upcomingCount === 0 ? 'NEXT' : 'LATER'
            upcomingCount++
          }

          const dotColor = isActive
            ? 'var(--accent)'
            : isJobCompleted
            ? 'var(--text-muted)'
            : 'var(--text-muted)'

          const timeLabelColor = isActive ? 'var(--accent)' : 'var(--text-muted)'

          return (
            <div key={job.id} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              {/* Timeline dot column */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingTop: '22px',
                  flexShrink: 0,
                  width: '14px',
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    ...timelineStyles.dot,
                    ...(isActive ? timelineStyles.dotActive : timelineStyles.dotInactive),
                    backgroundColor: dotColor,
                  }}
                />
              </div>

              {/* Content column */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Time label */}
                <div
                  style={{
                    ...timelineStyles.timeLabel,
                    color: timeLabelColor,
                  }}
                >
                  {timeLabelText}
                </div>

                {/* Job card */}
                <JobCardCrew
                  job={job}
                  isActive={isActive}
                  isCompleted={isJobCompleted}
                  activeTimeEntry={activeTimeEntry}
                  userId={userId}
                />
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
