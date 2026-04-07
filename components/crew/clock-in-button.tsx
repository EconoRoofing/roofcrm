'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { clockIn, clockOut } from '@/lib/actions/time-tracking'
import { PhotoCapture } from './photo-capture'
import { PpeChecklist } from '@/components/safety/ppe-checklist'
import type { TimeEntry } from '@/lib/types/time-tracking'
import { GpsCheckIcon, GpsFlaggedIcon, GpsWarningIcon } from '@/components/icons'

// ─── GPS helpers ─────────────────────────────────────────────────────────────

function getDistanceFt(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 20902231 // Earth radius in feet
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

type GpsStatus = 'idle' | 'loading' | 'confirmed' | 'warning' | 'flagged' | 'no-coords'

// ─── Clock-In Button ─────────────────────────────────────────────────────────

interface ClockInButtonProps {
  jobId: string
  jobLat?: number | null
  jobLng?: number | null
  userId: string
}

export function ClockInButton({ jobId, jobLat, jobLng, userId }: ClockInButtonProps) {
  const router = useRouter()

  const [step, setStep] = useState<'idle' | 'gps' | 'cost-code' | 'ppe' | 'photo' | 'done'>('idle')
  const [ppeVerified, setPpeVerified] = useState<Record<string, boolean>>({})
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle')
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLng, setGpsLng] = useState<number | null>(null)
  const [distanceFt, setDistanceFt] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [costCode, setCostCode] = useState<string>('labor')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleStart = useCallback(() => {
    setError(null)
    setStep('gps')
    setGpsStatus('loading')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setGpsLat(lat)
        setGpsLng(lng)

        if (jobLat && jobLng) {
          const dist = getDistanceFt(lat, lng, jobLat, jobLng)
          setDistanceFt(Math.round(dist))
          if (dist <= 500) {
            setGpsStatus('confirmed')
          } else if (dist <= 2000) {
            setGpsStatus('warning')
          } else {
            setGpsStatus('flagged')
          }
        } else {
          setGpsStatus('no-coords')
        }
      },
      () => {
        // GPS failed — still allow clock-in without coords
        setGpsStatus('no-coords')
        setGpsLat(null)
        setGpsLng(null)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }, [jobLat, jobLng])

  const proceedToPhoto = useCallback(() => {
    setStep('cost-code')
  }, [])

  const handlePpeConfirmed = useCallback((verified: Record<string, boolean>) => {
    setPpeVerified(verified)
    setStep('photo')
  }, [])

  const handlePhotoCapture = useCallback(
    (photoUrl: string) => {
      doClockIn(photoUrl)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gpsLat, gpsLng, notes, ppeVerified]
  )

  const handlePhotoSkip = useCallback(() => {
    doClockIn(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsLat, gpsLng, notes, ppeVerified])

  function doClockIn(photoUrl?: string) {
    startTransition(async () => {
      try {
        await clockIn(jobId, gpsLat, gpsLng, photoUrl, costCode, Object.keys(ppeVerified).length > 0 ? ppeVerified : undefined)
        setStep('done')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Clock-in failed. Try again.')
        setStep('idle')
      }
    })
  }

  // ─── GPS gate: require notes for warning/flagged ──────────────────────────
  const requiresNotes = gpsStatus === 'warning' || gpsStatus === 'flagged'
  const canProceed =
    gpsStatus === 'confirmed' ||
    gpsStatus === 'no-coords' ||
    (requiresNotes && notes.trim().length >= 5)

  // ─── Render ───────────────────────────────────────────────────────────────

  if (step === 'cost-code') {
    return (
      <CostCodeSelector
        selected={costCode}
        onSelect={setCostCode}
        onContinue={() => setStep('ppe')}
      />
    )
  }

  if (step === 'ppe') {
    return (
      <PpeChecklist
        onConfirm={handlePpeConfirmed}
        onBack={() => setStep('cost-code')}
      />
    )
  }

  if (step === 'photo') {
    return <PhotoCapture userId={userId} onCapture={handlePhotoCapture} onSkip={handlePhotoSkip} />
  }

  if (step === 'done') {
    return (
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: 'var(--accent-dim)',
          border: '1px solid var(--accent-glow)',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          fontWeight: 700,
          color: 'var(--accent)',
          textAlign: 'center',
        }}
      >
        Clocked in
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* GPS status panel (shown after tapping Clock In) */}
      {step === 'gps' && (
        <GpsPanel
          status={gpsStatus}
          distanceFt={distanceFt}
          notes={notes}
          onNotesChange={setNotes}
        />
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--accent-red)',
            padding: '8px 12px',
            backgroundColor: 'var(--accent-red-dim)',
            borderRadius: '8px',
            border: '1px solid rgba(255,82,82,0.2)',
          }}
        >
          {error}
        </div>
      )}

      {/* Main action button */}
      {step === 'idle' ? (
        <button
          type="button"
          onClick={handleStart}
          style={{
            width: '100%',
            padding: '16px',
            background: 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))',
            border: 'none',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 800,
            color: 'var(--nav-text)',
            cursor: 'pointer',
            letterSpacing: '0.01em',
          }}
        >
          Clock In
        </button>
      ) : gpsStatus === 'loading' ? (
        <div
          style={{
            width: '100%',
            padding: '16px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          Getting GPS...
        </div>
      ) : (
        <button
          type="button"
          onClick={proceedToPhoto}
          disabled={!canProceed || isPending}
          style={{
            width: '100%',
            padding: '16px',
            background:
              canProceed && !isPending
                ? 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))'
                : 'var(--bg-elevated)',
            border: canProceed && !isPending ? 'none' : '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 800,
            color: canProceed && !isPending ? 'var(--nav-text)' : 'var(--text-muted)',
            cursor: canProceed && !isPending ? 'pointer' : 'not-allowed',
            opacity: isPending ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isPending ? 'Clocking in...' : 'Continue'}
        </button>
      )}

      {/* Cancel */}
      {step === 'gps' && gpsStatus !== 'loading' && !isPending && (
        <button
          type="button"
          onClick={() => {
            setStep('idle')
            setGpsStatus('idle')
            setNotes('')
            setCostCode('labor')
            setError(null)
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            textAlign: 'center',
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
          }}
        >
          Cancel
        </button>
      )}
    </div>
  )
}

// ─── GPS Panel ────────────────────────────────────────────────────────────────

function GpsPanel({
  status,
  distanceFt,
  notes,
  onNotesChange,
}: {
  status: GpsStatus
  distanceFt: number | null
  notes: string
  onNotesChange: (v: string) => void
}) {
  if (status === 'loading') return null

  const isConfirmed = status === 'confirmed'
  const isWarning = status === 'warning'
  const isFlagged = status === 'flagged'
  const isNoCoords = status === 'no-coords'

  const color = isConfirmed
    ? 'var(--accent)'
    : isWarning
      ? 'var(--accent-amber)'
      : isFlagged
        ? 'var(--accent-red)'
        : 'var(--text-secondary)'

  const bgColor = isConfirmed
    ? 'var(--accent-dim)'
    : isWarning
      ? 'var(--accent-amber-dim)'
      : isFlagged
        ? 'var(--accent-red-dim)'
        : 'var(--bg-elevated)'

  const borderColor = isConfirmed
    ? 'var(--accent-glow)'
    : isWarning
      ? 'rgba(255,171,0,0.25)'
      : isFlagged
        ? 'rgba(255,82,82,0.25)'
        : 'var(--border-subtle)'

  const label = isConfirmed
    ? 'At jobsite'
    : isNoCoords
      ? 'GPS captured'
      : distanceFt !== null
        ? `${distanceFt.toLocaleString()} ft from jobsite`
        : 'Location captured'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          backgroundColor: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: '8px',
        }}
      >
        <GpsIcon status={status} color={color} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            color,
          }}
        >
          {label}
        </span>
      </div>

      {(isWarning || isFlagged) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            {isFlagged ? 'Explanation required' : 'Notes required'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={
              isFlagged
                ? 'Explain why you are far from the jobsite...'
                : 'Briefly explain your location...'
            }
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-elevated)',
              border: `1px solid ${isFlagged ? 'rgba(255,82,82,0.3)' : 'rgba(255,171,0,0.3)'}`,
              borderRadius: '8px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              resize: 'none',
              outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Cost Code Selector ───────────────────────────────────────────────────────

const COST_CODES = [
  { value: 'labor', label: 'Labor' },
  { value: 'supervision', label: 'Supervision' },
  { value: 'travel', label: 'Travel' },
  { value: 'cleanup', label: 'Cleanup' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'inspection', label: 'Inspection' },
]

function CostCodeSelector({
  selected,
  onSelect,
  onContinue,
}: {
  selected: string
  onSelect: (code: string) => void
  onContinue: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        Cost Code
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
        }}
      >
        {COST_CODES.map(({ value, label }) => {
          const isSelected = selected === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              style={{
                padding: '10px 8px',
                borderRadius: '8px',
                border: isSelected
                  ? '1px solid var(--accent)'
                  : '1px solid var(--border-subtle)',
                backgroundColor: isSelected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 600,
                color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onContinue}
        style={{
          width: '100%',
          padding: '16px',
          background: 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))',
          border: 'none',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 800,
          color: 'var(--nav-text)',
          cursor: 'pointer',
          letterSpacing: '0.01em',
        }}
      >
        Continue
      </button>
    </div>
  )
}

function GpsIcon({ status, color }: { status: GpsStatus; color: string }) {
  if (status === 'confirmed') return <GpsCheckIcon color={color} />
  if (status === 'flagged') return <GpsFlaggedIcon color={color} />
  return <GpsWarningIcon color={color} />
}

// ─── Clock-Out Button ─────────────────────────────────────────────────────────

interface ClockOutButtonProps {
  timeEntry: TimeEntry
  userId: string
  totalHours?: number
}

export function ClockOutButton({ timeEntry, userId, totalHours }: ClockOutButtonProps) {
  const router = useRouter()

  const [step, setStep] = useState<'idle' | 'gps' | 'photo' | 'done'>('idle')
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLng, setGpsLng] = useState<number | null>(null)
  const [summary, setSummary] = useState<{
    totalHours: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleStart = useCallback(() => {
    setError(null)
    setStep('gps')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude)
        setGpsLng(pos.coords.longitude)
        setStep('photo')
      },
      () => {
        setGpsLat(null)
        setGpsLng(null)
        setStep('photo')
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }, [])

  function doClockOut(photoUrl?: string) {
    startTransition(async () => {
      try {
        const updated = await clockOut(gpsLat, gpsLng, photoUrl)
        setSummary({ totalHours: updated.total_hours ?? 0 })
        setStep('done')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Clock-out failed. Try again.')
        setStep('idle')
      }
    })
  }

  if (step === 'gps') {
    return (
      <div
        style={{
          padding: '16px',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}
      >
        Getting GPS...
      </div>
    )
  }

  if (step === 'photo') {
    return (
      <PhotoCapture
        userId={userId}
        onCapture={(url) => doClockOut(url)}
        onSkip={() => doClockOut(undefined)}
      />
    )
  }

  if (step === 'done' && summary) {
    const h = Math.floor(summary.totalHours)
    const m = Math.round((summary.totalHours - h) * 60)
    return (
      <div
        style={{
          padding: '16px',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: '4px',
          }}
        >
          Clocked out
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '20px',
            color: 'var(--accent)',
            fontWeight: 700,
          }}
        >
          {h}h {m}m worked
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {error && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--accent-red)',
            padding: '8px 12px',
            backgroundColor: 'var(--accent-red-dim)',
            borderRadius: '8px',
            border: '1px solid rgba(255,82,82,0.2)',
          }}
        >
          {error}{' '}
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-red)',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
            }}
          >
            Retry
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={handleStart}
        disabled={isPending}
        style={{
          width: '100%',
          padding: '16px',
          background: 'linear-gradient(135deg, #c62828, #ef5350)',
          border: 'none',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 800,
          color: '#fff',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.6 : 1,
          letterSpacing: '0.01em',
        }}
      >
        {isPending ? 'Clocking out...' : 'Clock Out'}
      </button>
    </div>
  )
}

// ─── Switch Job Button ────────────────────────────────────────────────────────

interface SwitchJobButtonProps {
  currentTimeEntry: TimeEntry
  newJobId: string
  newJobLat?: number | null
  newJobLng?: number | null
  userId: string
}

export function SwitchJobButton({
  currentTimeEntry,
  newJobId,
  newJobLat,
  newJobLng,
  userId,
}: SwitchJobButtonProps) {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'pending'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSwitch() {
    setError(null)
    setStep('pending')
    startTransition(async () => {
      try {
        // Get GPS for clock-out
        let lat: number | null = null
        let lng: number | null = null
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
          )
          lat = pos.coords.latitude
          lng = pos.coords.longitude
        } catch {
          /* ignore */
        }

        // Clock out of current job
        await clockOut(lat, lng, undefined)

        // Clock into new job
        await clockIn(newJobId, lat, lng, undefined)

        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Switch failed. Try again.')
        setStep('idle')
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {error && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--accent-amber)',
            padding: '8px 12px',
            backgroundColor: 'var(--accent-amber-dim)',
            borderRadius: '8px',
            border: '1px solid rgba(255,171,0,0.2)',
          }}
        >
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={handleSwitch}
        disabled={isPending || step === 'pending'}
        style={{
          width: '100%',
          padding: '16px',
          background: 'linear-gradient(135deg, #e65100, #ffab00)',
          border: 'none',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 800,
          color: '#fff',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.6 : 1,
          letterSpacing: '0.01em',
        }}
      >
        {isPending ? 'Switching...' : 'Switch to This Job'}
      </button>
    </div>
  )
}
