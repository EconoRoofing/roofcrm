'use client'

import { useState, useEffect } from 'react'
import type { RoofMeasurements } from '@/lib/roof-measurements'
import { SatelliteIcon } from '@/components/icons'

// ─── Style constants ──────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  fontFamily: 'var(--font-mono)',
  marginBottom: '4px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '10px 12px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-mono)',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RoofViewerProps {
  address: string
  city: string
  state: string
  onMeasurementsLoaded: (data: Partial<RoofMeasurements>) => void
}

// ─── Measurement card ─────────────────────────────────────────────────────────

function MeasurementCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '12px',
      }}
    >
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          fontSize: '22px',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent)',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RoofViewer({ address, city, state, onMeasurementsLoaded }: RoofViewerProps) {
  const [loading, setLoading] = useState(true)
  const [satelliteUrl, setSatelliteUrl] = useState<string | null>(null)
  const [measurements, setMeasurements] = useState<RoofMeasurements | null>(null)

  // Manual entry state — pre-filled from API data when available
  const [manualSquares, setManualSquares] = useState('')
  const [manualRidge, setManualRidge] = useState('')
  const [manualValley, setManualValley] = useState('')
  const [manualEave, setManualEave] = useState('')
  const [manualPitch, setManualPitch] = useState('')

  useEffect(() => {
    if (!address || !city || !state) {
      setLoading(false)
      return
    }

    const params = new URLSearchParams({ address, city, state })
    fetch(`/api/measurements?${params}`)
      .then(r => r.json())
      .then(data => {
        setSatelliteUrl(data.satellite_image_url ?? null)
        const m: RoofMeasurements | null = data.measurements ?? null
        setMeasurements(m)
        if (m) {
          setManualSquares(String(m.total_squares))
          setManualRidge(String(m.ridge_length_ft))
          setManualValley(String(m.valley_length_ft))
          setManualEave(String(m.eave_length_ft))
          setManualPitch(m.pitch)
        }
      })
      .catch(() => {
        // No-op — show manual entry fallback
      })
      .finally(() => setLoading(false))
  }, [address, city, state])

  function handleUseApiMeasurements() {
    if (!measurements) return
    onMeasurementsLoaded({
      total_squares: measurements.total_squares,
      ridge_length_ft: measurements.ridge_length_ft,
      hip_length_ft: measurements.hip_length_ft,
      valley_length_ft: measurements.valley_length_ft,
      eave_length_ft: measurements.eave_length_ft,
      pitch: measurements.pitch,
      facets: measurements.facets,
      satellite_image_url: measurements.satellite_image_url,
    })
  }

  function handleApplyManual() {
    const data: Partial<RoofMeasurements> = {}
    if (manualSquares !== '') data.total_squares = Number(manualSquares)
    if (manualRidge !== '') data.ridge_length_ft = Number(manualRidge)
    if (manualValley !== '') data.valley_length_ft = Number(manualValley)
    if (manualEave !== '') data.eave_length_ft = Number(manualEave)
    if (manualPitch !== '') data.pitch = manualPitch
    onMeasurementsLoaded(data)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Satellite image ── */}
      <div>
        {loading ? (
          <div
            style={{
              width: '100%',
              height: '250px',
              background: 'var(--bg-elevated)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
              Loading satellite view...
            </span>
          </div>
        ) : satelliteUrl ? (
          <img
            src={satelliteUrl}
            alt="Satellite view of property"
            style={{
              width: '100%',
              height: '250px',
              objectFit: 'cover',
              borderRadius: '12px',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '160px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '16px',
            }}
          >
            <SatelliteIcon size={24} />
            <span
              style={{
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              Satellite imagery not available — enter measurements manually
            </span>
          </div>
        )}

        {/* Address label */}
        <div
          style={{
            marginTop: '8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-secondary)',
          }}
        >
          {address}, {city}, {state}
        </div>
      </div>

      {/* ── API measurement cards ── */}
      {measurements && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <MeasurementCard label="Squares" value={measurements.total_squares} />
            <MeasurementCard label="Pitch" value={measurements.pitch} />
            <MeasurementCard label="Ridge (ft)" value={measurements.ridge_length_ft} />
            <MeasurementCard label="Hips (ft)" value={measurements.hip_length_ft} />
            <MeasurementCard label="Valleys (ft)" value={measurements.valley_length_ft} />
            <MeasurementCard label="Eaves (ft)" value={measurements.eave_length_ft} />
          </div>
          <button
            type="button"
            onClick={handleUseApiMeasurements}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))',
              color: '#0a0a0a',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Use These Measurements
          </button>
        </div>
      )}

      {/* ── Manual entry ── */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '16px',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '16px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {measurements ? 'Adjust measurements' : 'Enter measurements manually'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Squares</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={manualSquares}
              onChange={e => setManualSquares(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Pitch</label>
            <input
              type="text"
              value={manualPitch}
              onChange={e => setManualPitch(e.target.value)}
              placeholder="e.g., 6/12"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Ridge (ft)</label>
            <input
              type="number"
              min={0}
              value={manualRidge}
              onChange={e => setManualRidge(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Valley (ft)</label>
            <input
              type="number"
              min={0}
              value={manualValley}
              onChange={e => setManualValley(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Eave (ft)</label>
            <input
              type="number"
              min={0}
              value={manualEave}
              onChange={e => setManualEave(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleApplyManual}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Apply
        </button>
      </div>

    </div>
  )
}
