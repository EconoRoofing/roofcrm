'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reportIncident } from '@/lib/actions/safety'
import { IncidentIcon, MapPinIcon } from '@/components/icons'

const INCIDENT_TYPES = [
  { value: 'injury', label: 'Injury', color: 'var(--accent-red)', bg: 'var(--accent-red-dim)' },
  { value: 'near_miss', label: 'Near Miss', color: 'var(--accent-amber)', bg: 'var(--accent-amber-dim)' },
  { value: 'property_damage', label: 'Property Damage', color: 'var(--accent-blue)', bg: 'var(--accent-blue-dim)' },
  { value: 'environmental', label: 'Environmental', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
] as const

const SEVERITIES = [
  { value: 'minor', label: 'Minor', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  { value: 'moderate', label: 'Moderate', color: 'var(--accent-amber)', bg: 'var(--accent-amber-dim)' },
  { value: 'serious', label: 'Serious', color: 'var(--accent-red)', bg: 'var(--accent-red-dim)' },
  { value: 'fatal', label: 'Fatal', color: '#fff', bg: '#7f1d1d' },
] as const

interface Props {
  jobId?: string
  onSuccess?: () => void
}

export function IncidentReport({ jobId, onSuccess }: Props) {
  const router = useRouter()
  const [incidentType, setIncidentType] = useState<string>('')
  const [severity, setSeverity] = useState<string>('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [witnesses, setWitnesses] = useState('')
  const [gpsCapturing, setGpsCapturing] = useState(false)
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLng, setGpsLng] = useState<number | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  function captureGps() {
    setGpsCapturing(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude)
        setGpsLng(pos.coords.longitude)
        setGpsCapturing(false)
      },
      () => {
        setGpsError('GPS unavailable — location not captured')
        setGpsCapturing(false)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  function handleSubmit() {
    if (!incidentType || !severity || !description.trim()) return

    startTransition(async () => {
      try {
        await reportIncident({
          jobId,
          incidentType,
          severity,
          description: description.trim(),
          location: location.trim() || undefined,
          lat: gpsLat ?? undefined,
          lng: gpsLng ?? undefined,
          witnesses: witnesses.trim() || undefined,
        })
        setSubmitted(true)
        onSuccess?.()
        router.refresh()
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to submit report')
      }
    })
  }

  if (submitted) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '8px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(34,197,94,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#22c55e',
          }}
        >
          <IncidentIcon size={24} />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '16px',
            fontWeight: 800,
            color: '#22c55e',
          }}
        >
          Report Submitted
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          Your incident report has been filed. The manager has been notified.
        </div>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false)
            setIncidentType('')
            setSeverity('')
            setDescription('')
            setLocation('')
            setWitnesses('')
            setGpsLat(null)
            setGpsLng(null)
            setSubmitError(null)
          }}
          style={{
            marginTop: '8px',
            padding: '8px 16px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          File Another Report
        </button>
      </div>
    )
  }

  const isValid = incidentType && severity && description.trim().length >= 10

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Incident Type */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <FieldLabel>Incident Type</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {INCIDENT_TYPES.map(({ value, label, color, bg }) => {
            const isSelected = incidentType === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setIncidentType(value)}
                style={{
                  padding: '12px 8px',
                  backgroundColor: isSelected ? bg : 'var(--bg-surface)',
                  border: `1px solid ${isSelected ? color : 'var(--border-subtle)'}`,
                  borderRadius: '8px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isSelected ? color : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Severity */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <FieldLabel>Severity</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {SEVERITIES.map(({ value, label, color, bg }) => {
            const isSelected = severity === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setSeverity(value)}
                style={{
                  padding: '10px 6px',
                  backgroundColor: isSelected ? bg : 'var(--bg-surface)',
                  border: `1px solid ${isSelected ? color : 'var(--border-subtle)'}`,
                  borderRadius: '8px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: isSelected ? color : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Description */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <FieldLabel>Description (required)</FieldLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what happened, where, and any relevant details..."
          rows={5}
          style={{
            width: '100%',
            padding: '12px 14px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: 'var(--text-primary)',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Location */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <FieldLabel>Location Description</FieldLabel>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. North slope, near chimney"
          style={{
            width: '100%',
            padding: '12px 14px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: 'var(--text-primary)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* GPS capture */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <FieldLabel>GPS Location (for OSHA 300 log)</FieldLabel>
        {gpsLat && gpsLng ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              backgroundColor: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '8px',
            }}
          >
            <MapPinIcon size={14} />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: '#22c55e',
                fontWeight: 600,
              }}
            >
              {gpsLat.toFixed(5)}, {gpsLng.toFixed(5)}
            </span>
            <button
              type="button"
              onClick={() => { setGpsLat(null); setGpsLng(null) }}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={captureGps}
            disabled={gpsCapturing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: gpsCapturing ? 'not-allowed' : 'pointer',
              opacity: gpsCapturing ? 0.6 : 1,
            }}
          >
            <MapPinIcon size={14} />
            {gpsCapturing ? 'Capturing GPS...' : 'Capture GPS Location'}
          </button>
        )}
        {gpsError && (
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              color: 'var(--accent-amber)',
            }}
          >
            {gpsError}
          </div>
        )}
      </div>

      {/* Witnesses */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <FieldLabel>Witnesses</FieldLabel>
        <input
          type="text"
          value={witnesses}
          onChange={(e) => setWitnesses(e.target.value)}
          placeholder="Names of any witnesses"
          style={{
            width: '100%',
            padding: '12px 14px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: 'var(--text-primary)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {submitError && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--accent-red-dim)',
            border: '1px solid rgba(255,82,82,0.2)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--accent-red)',
          }}
        >
          {submitError}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!isValid || isPending}
        style={{
          width: '100%',
          padding: '16px',
          background:
            isValid && !isPending
              ? 'linear-gradient(135deg, #c62828, #ef5350)'
              : 'var(--bg-elevated)',
          border: isValid && !isPending ? 'none' : '1px solid var(--border-subtle)',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 800,
          color: isValid && !isPending ? '#fff' : 'var(--text-muted)',
          cursor: isValid && !isPending ? 'pointer' : 'not-allowed',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? 'Submitting...' : 'Submit Incident Report'}
      </button>

      {!isValid && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          Select incident type, severity, and enter a description to submit
        </div>
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      {children}
    </div>
  )
}
