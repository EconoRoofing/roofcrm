'use client'

import { useEffect, useState } from 'react'
import type { TimeEntry } from '@/lib/types/time-tracking'

interface ActiveTimerProps {
  timeEntry: TimeEntry
  jobName: string
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':')
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
        borderRadius: '10px',
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
        animation: 'pulse-dot 2s ease-in-out infinite',
      }}
    >
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  )
}
