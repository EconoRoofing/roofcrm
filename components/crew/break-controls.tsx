'use client'

import { useEffect, useState, useTransition, useCallback } from 'react'
import { startBreak, endBreak, getBreaksDue, getActiveBreak } from '@/lib/actions/breaks'
import type { Break, BreakType } from '@/lib/types/time-tracking'
import { formatMinutes } from '@/lib/utils'

// Module-level style constants — extracted to avoid object allocation on every render
const breakStyles = {
  breakButton: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    border: 'none',
  } as React.CSSProperties,
  mealButton: {
    backgroundColor: 'var(--accent-amber-dim)',
    border: '1px solid rgba(255,171,0,0.25)',
    color: 'var(--accent-amber)',
  } as React.CSSProperties,
  restButton: {
    backgroundColor: 'var(--accent-blue-dim)',
    border: '1px solid rgba(68,138,255,0.25)',
    color: 'var(--accent-blue)',
  } as React.CSSProperties,
  endBreakButton: {
    padding: '8px 14px',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    flexShrink: 0,
  } as React.CSSProperties,
  timerExceeded: {
    fontFamily: 'var(--font-mono)',
    fontSize: '14px',
    color: 'var(--accent-red)',
    fontWeight: 700,
  } as React.CSSProperties,
  timerRemaining: {
    fontFamily: 'var(--font-mono)',
    fontSize: '18px',
    fontWeight: 700,
  } as React.CSSProperties,
  breakLabel: {
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '2px',
  } as React.CSSProperties,
  errorBanner: {
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    color: 'var(--accent-red)',
    padding: '6px 10px',
    backgroundColor: 'var(--accent-red-dim)',
    borderRadius: '8px',
    border: '1px solid rgba(255,82,82,0.2)',
  } as React.CSSProperties,
} as const

interface BreakControlsProps {
  timeEntryId: string
  clockInTime: string
}

const MEAL_LIMIT_MINUTES = 30
const REST_LIMIT_MINUTES = 10


export function BreakControls({ timeEntryId, clockInTime }: BreakControlsProps) {
  const [activeBreak, setActiveBreak] = useState<Break | null>(null)
  const [breakElapsedMs, setBreakElapsedMs] = useState(0)
  const [complianceAlerts, setComplianceAlerts] = useState<{
    restDue: boolean
    mealDue: boolean
    hoursWorked: number
  }>({ restDue: false, mealDue: false, hoursWorked: 0 })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Load initial state
  useEffect(() => {
    getActiveBreak(timeEntryId)
      .then((b) => setActiveBreak(b))
      .catch(() => null)
  }, [timeEntryId])

  // Tick break elapsed timer
  useEffect(() => {
    if (!activeBreak) {
      setBreakElapsedMs(0)
      return
    }
    const breakStart = new Date(activeBreak.start_time).getTime()
    function tick() {
      setBreakElapsedMs(Date.now() - breakStart)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeBreak])

  // Poll compliance every 60 seconds
  const checkCompliance = useCallback(() => {
    getBreaksDue(timeEntryId)
      .then((result) => {
        setComplianceAlerts({
          restDue: result.restBreakDue,
          mealDue: result.mealBreakDue,
          hoursWorked: result.hoursWorked,
        })
      })
      .catch(() => null)
  }, [timeEntryId])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    function startPolling() {
      checkCompliance()
      intervalId = setInterval(checkCompliance, 60_000)
    }

    function stopPolling() {
      if (intervalId) { clearInterval(intervalId); intervalId = null }
    }

    function handleVisibility() {
      if (document.hidden) {
        stopPolling()
      } else {
        startPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [checkCompliance])

  // Compute hours since clock-in for banner logic
  const clockInMs = new Date(clockInTime).getTime()
  const hoursWorked = complianceAlerts.hoursWorked

  function handleStartBreak(type: BreakType) {
    setError(null)
    startTransition(async () => {
      try {
        const b = await startBreak(timeEntryId, type)
        setActiveBreak(b)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start break')
      }
    })
  }

  function handleEndBreak() {
    if (!activeBreak) return
    setError(null)
    startTransition(async () => {
      try {
        await endBreak(activeBreak.id)
        setActiveBreak(null)
        checkCompliance() // refresh compliance after break ends
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to end break')
      }
    })
  }

  const breakLimitMs =
    activeBreak?.type === 'meal' ? MEAL_LIMIT_MINUTES * 60_000 : REST_LIMIT_MINUTES * 60_000
  const breakExceeded = breakElapsedMs > breakLimitMs
  const breakRemainingMs = Math.max(0, breakLimitMs - breakElapsedMs)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Compliance banners */}
      {complianceAlerts.mealDue && !activeBreak && (
        <ComplianceBanner
          level="red"
          message={`Meal break REQUIRED — ${hoursWorked.toFixed(1)}h worked — CA law`}
        />
      )}
      {complianceAlerts.restDue && !complianceAlerts.mealDue && !activeBreak && (
        <ComplianceBanner
          level="amber"
          message={`Rest break due — ${hoursWorked.toFixed(1)}h worked`}
        />
      )}

      {/* Active break view */}
      {activeBreak ? (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: `1px solid ${breakExceeded ? 'var(--accent-red)' : 'var(--border-subtle)'}`,
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={breakStyles.breakLabel}>
              {activeBreak.type === 'meal' ? 'Meal Break' : 'Rest Break'}
            </div>
            {breakExceeded ? (
              <div style={breakStyles.timerExceeded}>
                Break exceeded — tap to end
              </div>
            ) : (
              <div
                style={{
                  ...breakStyles.timerRemaining,
                  color: activeBreak.type === 'meal' ? 'var(--accent-amber)' : 'var(--accent-blue)',
                }}
              >
                {formatMinutes(breakRemainingMs)} remaining
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleEndBreak}
            disabled={isPending}
            style={{
              ...breakStyles.endBreakButton,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            End Break
          </button>
        </div>
      ) : (
        /* Break start buttons */
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => handleStartBreak('meal')}
            disabled={isPending}
            style={{
              ...breakStyles.breakButton,
              ...breakStyles.mealButton,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            Meal (30m)
          </button>
          <button
            type="button"
            onClick={() => handleStartBreak('rest')}
            disabled={isPending}
            style={{
              ...breakStyles.breakButton,
              ...breakStyles.restButton,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            Rest (10m)
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={breakStyles.errorBanner}>
          {error}
        </div>
      )}
    </div>
  )
}

function ComplianceBanner({ level, message }: { level: 'amber' | 'red'; message: string }) {
  const isRed = level === 'red'
  return (
    <div
      style={{
        padding: '8px 12px',
        backgroundColor: isRed ? 'var(--accent-red-dim)' : 'var(--accent-amber-dim)',
        border: `1px solid ${isRed ? 'rgba(255,82,82,0.3)' : 'rgba(255,171,0,0.3)'}`,
        borderRadius: '8px',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        fontWeight: 700,
        color: isRed ? 'var(--accent-red)' : 'var(--accent-amber)',
      }}
    >
      {message}
    </div>
  )
}
