'use client'

import { useState } from 'react'
import { updateJob } from '@/lib/actions/jobs'
import { SpecsForm } from './specs-form'
import { PricingForm } from './pricing-form'
import { ReviewScreen } from './review-screen'
import type { Job } from '@/lib/types/database'
import type { SpecsData } from './specs-form'
import type { PricingData } from './pricing-form'

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

  const [pricing, setPricing] = useState<PricingData>(() => ({
    roof_amount: job.roof_amount,
    gutters_amount: job.gutters_amount,
    options_amount: job.options_amount,
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

      const roof = pricing.roof_amount ?? 0
      const gutters = pricing.gutters_amount ?? 0
      const options = pricing.options_amount ?? 0
      const total = roof + gutters + options

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
        // Pricing fields
        roof_amount: pricing.roof_amount ?? null,
        gutters_amount: pricing.gutters_amount ?? null,
        options_amount: pricing.options_amount ?? null,
        total_amount: total > 0 ? total : null,
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
        minHeight: '100vh',
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

      {/* Content */}
      <div style={{ flex: 1, paddingTop: '24px', paddingBottom: '120px' }}>
        {step === 0 && (
          <SpecsForm data={specs} onChange={handleSpecsChange} />
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
                cursor: 'pointer',
              }}
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
              cursor: saving ? 'not-allowed' : 'pointer',
              letterSpacing: '0.3px',
              transition: 'all 0.15s ease',
            }}
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
