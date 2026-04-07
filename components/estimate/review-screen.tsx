'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Job } from '@/lib/types/database'
import type { SpecsData } from './specs-form'
import type { PricingData } from './pricing-form'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewScreenProps {
  job: Job
  specs: SpecsData
  pricing: PricingData
  onBack: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(val: number | null | undefined): string {
  if (val == null) return '$0.00'
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// ─── Row components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '10px 0',
        borderBottom: '1px solid var(--border-subtle)',
        gap: '16px',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '14px',
          color: 'var(--text-primary)',
          textAlign: 'right',
          lineHeight: '1.4',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function SpecRow({
  label,
  value,
  checked,
}: {
  label: string
  value?: string | number | null
  checked?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '9px 0',
        borderBottom: '1px solid var(--border-subtle)',
        gap: '12px',
      }}
    >
      <span style={{ fontSize: '14px', color: 'var(--text-primary)', flex: 1 }}>{label}</span>
      {value != null ? (
        <span
          style={{
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            textAlign: 'right',
          }}
        >
          {value}
        </span>
      ) : (
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: checked ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          {checked ? 'Yes' : '--'}
        </span>
      )}
    </div>
  )
}

function PriceRow({
  label,
  amount,
  large,
  muted,
}: {
  label: string
  amount: number
  large?: boolean
  muted?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span
        style={{
          fontSize: large ? '15px' : '13px',
          fontWeight: large ? 700 : 500,
          color: muted ? 'var(--text-secondary)' : 'var(--text-primary)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: large ? '22px' : '15px',
          fontFamily: 'var(--font-mono)',
          fontWeight: large ? 700 : 500,
          color: large ? 'var(--accent)' : muted ? 'var(--text-secondary)' : 'var(--text-primary)',
        }}
      >
        {formatMoney(amount)}
      </span>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: '4px',
        marginTop: '8px',
      }}
    >
      {title}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReviewScreen({ job, specs, pricing, onBack }: ReviewScreenProps) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(job.estimate_pdf_url ?? null)
  const [error, setError] = useState<string | null>(null)

  const roof = pricing.roof_amount ?? 0
  const gutters = pricing.gutters_amount ?? 0
  const options = pricing.options_amount ?? 0
  const total = roof + gutters + options
  const deposit = total / 2

  async function handleGeneratePdf() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/estimate-pdf`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      setPdfUrl(body.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ padding: '0 16px' }}>

      {/* Customer Info */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <SectionHeader title="Customer" />
        <InfoRow label="Name" value={job.customer_name} />
        <InfoRow label="Address" value={job.address} />
        <InfoRow label="City" value={job.city} />
        <InfoRow label="Phone" value={job.phone} />
        <InfoRow label="Email" value={job.email} />
      </div>

      {/* Specifications */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <SectionHeader title="Specifications" />

        {specs.material && (
          <SpecRow label="Material" value={specs.material} />
        )}
        {specs.material_color && (
          <SpecRow label="Color" value={specs.material_color} />
        )}
        {specs.warranty_manufacturer_years != null && (
          <SpecRow label="Manufacturer Warranty" value={`${specs.warranty_manufacturer_years} years`} />
        )}
        {specs.warranty_workmanship_years != null && (
          <SpecRow label="Workmanship Warranty" value={`${specs.warranty_workmanship_years} years`} />
        )}
        {specs.felt_type && (
          <SpecRow label="Underlayment" value={specs.felt_type} />
        )}
        {specs.tear_off && (
          <SpecRow
            label="Tear-off"
            value={specs.layers ? `${specs.layers} layer${specs.layers > 1 ? 's' : ''}` : 'Yes'}
          />
        )}

        {specs.fascia_replacement && (
          <SpecRow
            label="Fascia Replacement"
            value={[specs.fascia_lineal_ft ? `${specs.fascia_lineal_ft} lin ft` : null, specs.fascia_dimensions]
              .filter(Boolean)
              .join(' / ') || 'Yes'}
          />
        )}
        {specs.tg_shiplap && (
          <SpecRow label="T&G / Shiplap" value="Yes" />
        )}
        {specs.sheeting && (
          <SpecRow label="Sheeting" value={specs.sheeting_type ?? 'Yes'} />
        )}
        {specs.metal_nosing && (
          <SpecRow label="Metal Nosing" value={specs.nosing_color ?? 'Yes'} />
        )}
        {specs.ridge_caps && (
          <SpecRow label="Dimensional Ridge Caps" checked />
        )}
        {specs.ridge_vent_ft != null && specs.ridge_vent_ft > 0 && (
          <SpecRow label="Ridge Vent" value={`${specs.ridge_vent_ft} ft`} />
        )}
        {specs.ohagen_vents != null && specs.ohagen_vents > 0 && (
          <SpecRow label="O'Hagen Vents" value={`${specs.ohagen_vents} unit${specs.ohagen_vents > 1 ? 's' : ''}`} />
        )}
        {specs.antenna_removal && (
          <SpecRow label="Antenna Removal" checked />
        )}
        {specs.solar_removal && (
          <SpecRow label="Solar Panel Removal" checked />
        )}
        {specs.flat_section_sq != null && specs.flat_section_sq > 0 && (
          <SpecRow
            label="Flat Section Re-roofing"
            value={[`${specs.flat_section_sq} sq ft`, specs.flat_section_material]
              .filter(Boolean)
              .join(' — ')}
          />
        )}
        {specs.other_structures && (
          <SpecRow label="Other Structures" value={specs.other_structures} />
        )}
        {specs.gutters_length != null && specs.gutters_length > 0 && (
          <SpecRow
            label="Gutters"
            value={[
              `${specs.gutters_length} lin ft`,
              specs.gutter_size,
              specs.gutter_color,
            ]
              .filter(Boolean)
              .join(' / ')}
          />
        )}
        {specs.downspout_color && (
          <SpecRow label="Downspouts" value={specs.downspout_color} />
        )}
      </div>

      {/* Pricing */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <SectionHeader title="Pricing" />
        {roof > 0 && <PriceRow label="Roof" amount={roof} />}
        {gutters > 0 && <PriceRow label="Gutters" amount={gutters} />}
        {options > 0 && <PriceRow label="Options" amount={options} />}
        <PriceRow label="Total" amount={total} large />
        <PriceRow label="50% Deposit Due on Start" amount={deposit} />
        <PriceRow label="50% Due on Completion" amount={deposit} muted />
      </div>

      {/* Special Remarks */}
      {pricing.notes && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
          }}
        >
          <SectionHeader title="Special Remarks" />
          <p
            style={{
              margin: '8px 0 0',
              fontSize: '14px',
              color: 'var(--text-primary)',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
            }}
          >
            {pricing.notes}
          </p>
        </div>
      )}

      {/* Validity note */}
      <div
        style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          textAlign: 'center',
          marginBottom: '24px',
        }}
      >
        Cash/check discount price — estimate valid for 15 days
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            borderRadius: '8px',
            background: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.3)',
            color: 'var(--accent-red)',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* PDF success */}
      {pdfUrl && (
        <>
          {/* Sign Estimate — primary action */}
          <button
            type="button"
            onClick={() => router.push(`/jobs/${job.id}/estimate/sign`)}
            style={{
              display: 'block',
              width: '100%',
              padding: '20px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #00c853 0%, #00e676 100%)',
              color: '#003d00',
              fontSize: '17px',
              fontWeight: 800,
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '12px',
              boxSizing: 'border-box',
              letterSpacing: '0.3px',
            }}
          >
            Sign Estimate
          </button>
          {/* View PDF — secondary action */}
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              width: '100%',
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid var(--accent)',
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              fontSize: '14px',
              fontWeight: 600,
              textAlign: 'center',
              textDecoration: 'none',
              marginBottom: '12px',
              boxSizing: 'border-box',
            }}
          >
            View PDF
          </a>
        </>
      )}

      {/* Generate PDF button */}
      <button
        type="button"
        onClick={handleGeneratePdf}
        disabled={generating}
        style={{
          width: '100%',
          padding: '18px',
          borderRadius: '8px',
          border: 'none',
          background: generating
            ? 'var(--bg-elevated)'
            : 'linear-gradient(135deg, #00c853 0%, #00e676 100%)',
          color: generating ? 'var(--text-muted)' : '#003d00',
          fontSize: '16px',
          fontWeight: 700,
          cursor: generating ? 'not-allowed' : 'pointer',
          letterSpacing: '0.3px',
          boxSizing: 'border-box',
          transition: 'all 0.15s ease',
          marginBottom: '12px',
        }}
      >
        {generating ? 'Generating PDF...' : 'Generate PDF'}
      </button>

      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontSize: '15px',
          fontWeight: 500,
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        Back to Pricing
      </button>

    </div>
  )
}
