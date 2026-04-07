'use client'

import { useEffect, useState, useCallback } from 'react'
import { getTimeEntries } from '@/lib/actions/time-tracking'
import { GpsIcon, FlagIcon } from '@/components/icons'
import { formatElapsed } from '@/lib/utils'
import type { TimeEntry } from '@/lib/types/time-tracking'
import CrewMap from './crew-map'

type ActiveEntry = TimeEntry & {
  job?: { job_number: string; customer_name: string; address: string; city: string }
  user?: { id: string; name: string; email: string }
}

function ElapsedTimer({ clockIn }: { clockIn: string }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    const tick = () => setElapsed(formatElapsed(Date.now() - new Date(clockIn).getTime()))
    tick()
    const id = setInterval(tick, 1000)
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
          <GpsIcon size={12} />
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
            borderRadius: '8px',
            backgroundColor: 'rgba(255,82,82,0.08)',
            border: '1px solid rgba(255,82,82,0.2)',
          }}
        >
          <FlagIcon size={12} />
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
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
          {/* Map / List toggle */}
          <div
            style={{
              display: 'flex',
              gap: '2px',
              backgroundColor: 'var(--bg-elevated)',
              borderRadius: '8px',
              padding: '2px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {(['list', 'map'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  backgroundColor: viewMode === mode ? 'var(--accent-dim)' : 'transparent',
                  color: viewMode === mode ? 'var(--accent)' : 'var(--text-muted)',
                  transition: 'background-color 0.15s, color 0.15s',
                }}
              >
                {mode === 'list' ? 'List' : 'Map'}
              </button>
            ))}
          </div>
        </div>

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
      ) : viewMode === 'map' ? (
        <CrewMap entries={entries} />
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
