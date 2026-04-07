'use client'

import { useEffect, useState } from 'react'
import type { TimeEntry } from '@/lib/types/time-tracking'
import { formatElapsed } from '@/lib/utils'

interface ActiveTimerProps {
  timeEntry: TimeEntry
  jobName: string
}

export function ActiveTimer({ timeEntry, jobName }: ActiveTimerProps) {
  const [elapsed, setElapsed] = useState<number>(0)

  useEffect(() => {
    const clockInMs = new Date(timeEntry.clock_in).getTime()

    function tick() {
      setElapsed(Date.now() - clockInMs)
    }

    tick() // immediate first render
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [timeEntry.clock_in])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 16px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
      }}
    >
      {/* Pulsing green dot */}
      <PulsingDot />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Running clock */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '28px',
            fontWeight: 700,
            color: 'var(--accent)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {formatElapsed(elapsed)}
        </div>
        {/* Job name */}
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {jobName}
        </div>
      </div>

      {/* Clock-in time label */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-muted)',
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        <div>Since</div>
        <div>
          {new Date(timeEntry.clock_in).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  )
}

function PulsingDot() {
  return (
    <div
      style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        backgroundColor: 'var(--accent)',
        flexShrink: 0,
        animation: 'pulse-dot 2.5s ease-in-out infinite',
      }}
    />
  )
}
