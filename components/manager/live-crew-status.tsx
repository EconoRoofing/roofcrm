'use client'

import { useEffect, useState, useCallback } from 'react'
import { getTimeEntries } from '@/lib/actions/time-tracking'
import type { TimeEntry } from '@/lib/types/time-tracking'

type ActiveEntry = TimeEntry & {
  job?: { job_number: string; customer_name: string; address: string; city: string }
  user?: { id: string; name: string; email: string }
}

function ElapsedTimer({ clockIn }: { clockIn: string }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    function format() {
      const diffMs = Date.now() - new Date(clockIn).getTime()
      const totalSecs = Math.floor(diffMs / 1000)
      const h = Math.floor(totalSecs / 3600)
      const m = Math.floor((totalSecs % 3600) / 60)
      const s = totalSecs % 60
      setElapsed(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      )
    }
    format()
    const id = setInterval(format, 1000)
    return () => clearInterval(id)
  }, [clockIn])

  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains-mono, monospace)',
        fontSize: '15px',
        fontWeight: 700,
        color: 'var(--accent)',
        letterSpacing: '0.04em',
      }}
    >
      {elapsed}
    </span>
  )
}

function CrewCard({ entry }: { entry: ActiveEntry }) {
  const initials = (entry.user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const isFlagged = entry.flagged

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${isFlagged ? 'rgba(255,82,82,0.4)' : 'var(--border-subtle)'}`,
        borderLeft: isFlagged ? '3px solid #ff5252' : '3px solid var(--accent)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Avatar */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-jetbrains-mono, monospace)',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--accent)',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {entry.user?.name ?? 'Unknown'}
          </div>
          {entry.job && (
            <div
              style={{
                fontFamily: 'var(--font-jetbrains-mono, monospace)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginTop: '1px',
              }}
            >
              #{entry.job.job_number}
            </div>
          )}
        </div>

        <ElapsedTimer clockIn={entry.clock_in} />
      </div>

      {/* Job info */}
      {entry.job && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {entry.job.customer_name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}
          >
            {entry.job.address}, {entry.job.city}
          </div>
        </div>
      )}

      {/* GPS distance */}
      {entry.clock_in_distance_ft != null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono, monospace)',
              fontSize: '11px',
              color:
                entry.clock_in_distance_ft > 500
                  ? '#ffab00'
                  : 'var(--text-muted)',
            }}
          >
            {Math.round(entry.clock_in_distance_ft)}ft from jobsite
          </span>
        </div>
      )}

      {/* Flagged indicator */}
      {isFlagged && entry.flag_reason && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '6px',
            padding: '6px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(255,82,82,0.08)',
            border: '1px solid rgba(255,82,82,0.2)',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ff5252"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: '1px' }}
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              color: '#ff5252',
              lineHeight: '1.4',
            }}
          >
            {entry.flag_reason}
          </span>
        </div>
      )}
    </div>
  )
}

interface LiveCrewStatusProps {
  initialEntries: ActiveEntry[]
}

export default function LiveCrewStatus({ initialEntries }: LiveCrewStatusProps) {
  const [entries, setEntries] = useState<ActiveEntry[]>(initialEntries)

  const refresh = useCallback(async () => {
    try {
      const fresh = await getTimeEntries({})
      // Filter active (no clock_out) entries
      const active = (fresh as ActiveEntry[]).filter((e) => e.clock_out == null)
      setEntries(active)
    } catch {
      // silently ignore refresh errors
    }
  }, [])

  useEffect(() => {
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Live Crew Status
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: entries.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono, monospace)',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            {entries.length} clocked in
          </span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--text-muted)',
            }}
          >
            No crew clocked in right now
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}
        >
          {entries.map((entry) => (
            <CrewCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
