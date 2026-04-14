'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { updateJob } from '@/lib/actions/jobs'
import { getPreviousJobAtAddress } from '@/lib/actions/price-memory'
import { dollarsToCents, centsToDollars, readMoneyFromRow, sumCents } from '@/lib/money'
import { ChevronLeftNavIcon } from '@/components/icons'
import { SpecsForm } from './specs-form'
import type { Job } from '@/lib/types/database'
import type { SpecsData } from './specs-form'
import type { PricingData } from './pricing-form'

const PricingForm = dynamic(
  () => import('./pricing-form').then(m => ({ default: m.PricingForm })),
  { loading: () => <div style={{ padding: '16px', color: 'var(--text-muted)' }}>Loading pricing...</div> }
)

const ReviewScreen = dynamic(
  () => import('./review-screen').then(m => ({ default: m.ReviewScreen })),
  { loading: () => <div style={{ padding: '16px', color: 'var(--text-muted)' }}>Loading review...</div> }
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface EstimateWizardProps {
  job: Job
}

const STEPS = ['Specs', 'Pricing', 'Review']

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? '24px' : '8px',
            height: '8px',
            borderRadius: '4px',
            background: i === current ? 'var(--accent)' : i < current ? 'var(--accent-dim)' : 'var(--bg-elevated)',
            border: `1px solid ${i <= current ? 'var(--accent)' : 'var(--border-subtle)'}`,
            transition: 'all 0.2s ease',
          }}
        />
      ))}
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function EstimateWizard({ job }: EstimateWizardProps) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previousJobData, setPreviousJobData] = useState<{ specs: unknown; pricing: unknown } | null>(null)
  const [showPrevBanner, setShowPrevBanner] = useState(false)

  // Check for a previous job at the same address on mount
  useEffect(() => {
    getPreviousJobAtAddress(job.address).then((prev) => {
      if (prev) {
        setPreviousJobData(prev)
        setShowPrevBanner(true)
      }
    }).catch(() => {})
  }, [job.address])

  function applyPreviousSpecs() {
    if (!previousJobData) return
    const p = previousJobData.pricing as Record<string, unknown>
    setSpecs((prev) => ({
      ...prev,
      material: (p.material as string | null) ?? prev.material,
      material_color: (p.material_color as string | null) ?? prev.material_color,
      felt_type: (p.felt_type as string | null) ?? prev.felt_type,
      layers: (p.layers as number | null) ?? prev.layers,
      warranty_manufacturer_years: (p.warranty_manufacturer_years as number | null) ?? prev.warranty_manufacturer_years,
      warranty_workmanship_years: (p.warranty_workmanship_years as number | null) ?? prev.warranty_workmanship_years,
    }))
    // Prefer *_cents from the previous job's pricing memory; fall back to
    // legacy dollar fields if cents are missing (un-migrated row).
    const prevRoofCents = readMoneyFromRow(
      p.roof_amount_cents as number | null | undefined,
      p.roof_amount as number | null | undefined
    )
    const prevGuttersCents = readMoneyFromRow(
      p.gutters_amount_cents as number | null | undefined,
      p.gutters_amount as number | null | undefined
    )
    const prevOptionsCents = readMoneyFromRow(
      p.options_amount_cents as number | null | undefined,
      p.options_amount as number | null | undefined
    )
    setPricing((prev) => ({
      ...prev,
      roof_amount: prevRoofCents > 0 ? centsToDollars(prevRoofCents) : prev.roof_amount,
      gutters_amount: prevGuttersCents > 0 ? centsToDollars(prevGuttersCents) : prev.gutters_amount,
      options_amount: prevOptionsCents > 0 ? centsToDollars(prevOptionsCents) : prev.options_amount,
    }))
    setShowPrevBanner(false)
  }

  // Initialize from existing job data
  const [specs, setSpecs] = useState<SpecsData>(() => {
    const s = job.estimate_specs ?? {}
    return {
      // material fields
      material: job.material,
      material_color: job.material_color,
      warranty_manufacturer_years: job.warranty_manufacturer_years,
      warranty_workmanship_years: job.warranty_workmanship_years,
      felt_type: job.felt_type,
      layers: job.layers,
      tear_off: (job.layers != null && job.layers > 0) ? true : false,
      // gutters
      gutters_length: job.gutters_length,
      gutter_size: job.gutter_size,
      gutter_color: job.gutter_color,
      downspout_color: job.downspout_color,
      // estimate_specs JSONB fields
      ...s,
    }
  })

  // Pricing UI state is in dollars (form inputs are dollars), but we source
  // from the authoritative `*_amount_cents` columns. Falls back to legacy
  // dollar columns if cents are still 0 from an un-migrated row.
  const [pricing, setPricing] = useState<PricingData>(() => ({
    roof_amount: centsToDollars(readMoneyFromRow(job.roof_amount_cents, job.roof_amount)) || null,
    gutters_amount: centsToDollars(readMoneyFromRow(job.gutters_amount_cents, job.gutters_amount)) || null,
    options_amount: centsToDollars(readMoneyFromRow(job.options_amount_cents, job.options_amount)) || null,
    notes: job.notes,
  }))

  function handleSpecsChange(updates: Partial<SpecsData>) {
    setSpecs(prev => ({ ...prev, ...updates }))
  }

  function handlePricingChange(updates: Partial<PricingData>) {
    setPricing(prev => ({ ...prev, ...updates }))
  }

  async function saveAndAdvance() {
    setSaving(true)
    setSaveError(null)
    try {
      const {
        material, material_color, warranty_manufacturer_years,
        warranty_workmanship_years, felt_type, layers, tear_off,
        gutters_length, gutter_size, gutter_color, downspout_color,
        flat_section_material, tg_lineal_ft, tg_dimensions,
        ...estimateSpecsRaw
      } = specs

      // Build the JSONB estimate_specs object — exclude non-JSONB fields
      // null → undefined to satisfy EstimateSpecs (which uses optional, not nullable)
      const nullToUndef = <T,>(v: T | null | undefined): T | undefined =>
        v == null ? undefined : v

      const estimateSpecs = {
        fascia_replacement: estimateSpecsRaw.fascia_replacement,
        fascia_lineal_ft: nullToUndef(estimateSpecsRaw.fascia_lineal_ft),
        fascia_dimensions: estimateSpecsRaw.fascia_dimensions,
        tg_shiplap: estimateSpecsRaw.tg_shiplap,
        tg_lineal_ft: nullToUndef(tg_lineal_ft),
        tg_dimensions: tg_dimensions,
        flat_section_material: flat_section_material,
        sheeting: estimateSpecsRaw.sheeting,
        sheeting_type: estimateSpecsRaw.sheeting_type,
        metal_nosing: estimateSpecsRaw.metal_nosing,
        nosing_color: estimateSpecsRaw.nosing_color,
        ridge_caps: estimateSpecsRaw.ridge_caps,
        ridge_vent_ft: nullToUndef(estimateSpecsRaw.ridge_vent_ft),
        ohagen_vents: nullToUndef(estimateSpecsRaw.ohagen_vents),
        antenna_removal: estimateSpecsRaw.antenna_removal,
        solar_removal: estimateSpecsRaw.solar_removal,
        flat_section_sq: nullToUndef(estimateSpecsRaw.flat_section_sq),
        other_structures: estimateSpecsRaw.other_structures,
      }

      // Convert form dollars → integer cents at the save boundary.
      // All arithmetic (total = roof + gutters + options) happens in cents
      // so there's no float drift between the sum and the displayed parts.
      const roofCents = dollarsToCents(pricing.roof_amount)
      const guttersCents = dollarsToCents(pricing.gutters_amount)
      const optionsCents = dollarsToCents(pricing.options_amount)
      const totalCents = sumCents([roofCents, guttersCents, optionsCents])

      await updateJob(job.id, {
        // Specs fields
        material: material ?? null,
        material_color: material_color ?? null,
        warranty_manufacturer_years: warranty_manufacturer_years ?? null,
        warranty_workmanship_years: warranty_workmanship_years ?? null,
        felt_type: felt_type ?? null,
        layers: tear_off ? (layers ?? 1) : null,
        gutters_length: gutters_length ?? null,
        gutter_size: gutter_size ?? null,
        gutter_color: gutter_color ?? null,
        downspout_color: downspout_color ?? null,
        estimate_specs: estimateSpecs,
        // Pricing fields — pass ONLY cents. updateJob's normalizer dual-writes
        // the legacy `*_amount` columns derived from these cents values.
        roof_amount_cents: roofCents || null,
        gutters_amount_cents: guttersCents || null,
        options_amount_cents: optionsCents || null,
        total_amount_cents: totalCents > 0 ? totalCents : null,
        notes: pricing.notes ?? null,
      })
      setStep(s => s + 1)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const stepLabels = STEPS
  const isLastInputStep = step === 1 // pricing is last before review

  return (
    <div
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 16px 0',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-deep)',
          zIndex: 10,
          paddingTop: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Back to Job link */}
        <div style={{ marginBottom: '8px' }}>
          <Link
            href={`/jobs/${job.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '' }}
          >
            <ChevronLeftNavIcon />
            Back to Job
          </Link>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {step < 2 ? `Estimate — ${stepLabels[step]}` : 'Review & Generate'}
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginTop: '2px',
              }}
            >
              {job.customer_name} · {job.address}
            </div>
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {step + 1}/{STEPS.length}
          </div>
        </div>
        <StepDots current={step} total={STEPS.length} />
      </div>

      {/* Previous estimate banner */}
      {showPrevBanner && previousJobData && (
        <div
          style={{
            margin: '16px 16px 0',
            padding: '12px 14px',
            backgroundColor: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}
          >
            Previous estimate found at this address
          </span>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={applyPreviousSpecs}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent)',
                color: '#0a0a0a',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Use previous specs
            </button>
            <button
              type="button"
              onClick={() => setShowPrevBanner(false)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, paddingTop: '24px', paddingBottom: '120px' }}>
        {step === 0 && (
          <SpecsForm
            data={specs}
            onChange={handleSpecsChange}
            address={job.address}
            city={job.city}
            state={job.state ?? undefined}
          />
        )}
        {step === 1 && (
          <PricingForm data={pricing} onChange={handlePricingChange} />
        )}
        {step === 2 && (
          <ReviewScreen
            job={job}
            specs={specs}
            pricing={pricing}
            onBack={() => setStep(1)}
          />
        )}
      </div>

      {/* Navigation — not shown on review screen (it has its own buttons) */}
      {step < 2 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px',
            background: 'var(--bg-deep)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: '12px',
            maxWidth: '560px',
            margin: '0 auto',
          }}
        >
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              disabled={saving}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '15px',
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'filter 0.15s ease',
                opacity: saving ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!saving) e.currentTarget.style.filter = 'brightness(1.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = '' }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={saveAndAdvance}
            disabled={saving}
            style={{
              flex: step > 0 ? 2 : 1,
              padding: '16px',
              borderRadius: '8px',
              border: 'none',
              background: saving ? 'var(--bg-elevated)' : 'var(--accent)',
              color: saving ? 'var(--text-muted)' : '#0a0a0a',
              fontSize: '15px',
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              letterSpacing: '0.3px',
              transition: 'all 0.15s ease',
              opacity: saving ? 0.7 : 1,
            }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.filter = 'brightness(1.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = '' }}
          >
            {saving ? 'Saving...' : isLastInputStep ? 'Review' : 'Next'}
          </button>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div
          style={{
            position: 'fixed',
            bottom: saving ? '90px' : '90px',
            left: '16px',
            right: '16px',
            padding: '12px',
            borderRadius: '8px',
            background: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.3)',
            color: 'var(--accent-red)',
            fontSize: '13px',
            maxWidth: '528px',
            margin: '0 auto',
          }}
        >
          {saveError}
        </div>
      )}
    </div>
  )
}
