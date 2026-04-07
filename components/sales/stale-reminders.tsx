'use client'

import { useRouter } from 'next/navigation'
import type { Job } from '@/lib/types/database'

interface StaleRemindersProps {
  jobs: Job[]
}

function daysSince(dateStr: string): number {
  const created = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
}

function formatJobType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function StaleReminders({ jobs }: StaleRemindersProps) {
  const router = useRouter()

  if (jobs.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 16px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          Follow Up
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '18px',
            height: '18px',
            padding: '0 5px',
            borderRadius: '8px',
            backgroundColor: 'var(--accent-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--accent)',
          }}
        >
          {jobs.length}
        </span>
      </div>

      {/* Job rows */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {jobs.map((job) => {
          const days = daysSince(job.created_at)
          const isRed = days >= 30
          const borderColor = isRed ? 'var(--accent-red)' : 'var(--accent-amber)'
          const textColor = isRed ? 'var(--accent-red)' : 'var(--accent-amber)'

          return (
            <div
              key={job.id}
              onClick={() => router.push(`/jobs/${job.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: '8px',
                borderLeft: `3px solid ${borderColor}`,
                cursor: 'pointer',
              }}
            >
              {/* Customer + type */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {job.customer_name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    marginTop: '2px',
                  }}
                >
                  {formatJobType(job.job_type)}
                </div>
              </div>

              {/* Days count */}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: textColor,
                  flexShrink: 0,
                }}
              >
                {days}d
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
