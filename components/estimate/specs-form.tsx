'use client'

import { useState } from 'react'
import type { Job, EstimateSpecs } from '@/lib/types/database'
import { RoofViewer } from './roof-viewer'
import type { RoofMeasurements } from '@/lib/roof-measurements'

// ─── Shared style constants ───────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '12px',
  color: 'var(--text-primary)',
  fontSize: '15px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-sans)',
}

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: 'var(--accent)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '4px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}

const sectionStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-subtle)',
  paddingBottom: '24px',
  marginBottom: '24px',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  marginBottom: '16px',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpecsData {
  // material & color
  material?: string | null
  material_color?: string | null
  // warranties
  warranty_manufacturer_years?: number | null
  warranty_workmanship_years?: number | null
  // underlayment
  felt_type?: string | null
  // tear-off
  layers?: number | null
  tear_off?: boolean
  // gutters
  gutters_length?: number | null
  gutter_size?: string | null
  gutter_color?: string | null
  downspout_color?: string | null
  // EstimateSpecs JSONB fields
  fascia_replacement?: boolean
  fascia_lineal_ft?: number | null
  fascia_dimensions?: string
  tg_shiplap?: boolean
  tg_lineal_ft?: number | null
  tg_dimensions?: string
  sheeting?: boolean
  sheeting_type?: string
  metal_nosing?: boolean
  nosing_color?: string
  ridge_caps?: boolean
  ridge_vent_ft?: number | null
  ohagen_vents?: number | null
  antenna_removal?: boolean
  solar_removal?: boolean
  flat_section_sq?: number | null
  flat_section_material?: string | null
  other_structures?: string
}

interface SpecsFormProps {
  data: SpecsData
  onChange: (updates: Partial<SpecsData>) => void
  address?: string
  city?: string
  state?: string
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string | number | null | undefined
  onChange: (val: string) => void
  placeholder?: string
  type?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={focused ? inputFocusStyle : inputStyle}
      />
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  min,
}: {
  label: string
  value: number | null | undefined
  onChange: (val: number | null) => void
  placeholder?: string
  min?: number
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{ ...(focused ? inputFocusStyle : inputStyle), fontFamily: 'var(--font-mono)' }}
      />
    </div>
  )
}

function ChipSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string | null | undefined
  onChange: (val: string) => void
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
        {options.map(opt => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${selected ? 'transparent' : 'var(--border-subtle)'}`,
                background: selected ? 'var(--accent)' : 'var(--bg-elevated)',
                color: selected ? '#0a0a0a' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: selected ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: boolean
  onChange: (val: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '44px',
          padding: '0 2px',
        }}
      >
        <span
          style={{
            fontSize: '15px',
            color: 'var(--text-primary)',
            fontWeight: 500,
            flex: 1,
            paddingRight: '16px',
          }}
        >
          {label}
        </span>
        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={value}
          onClick={() => onChange(!value)}
          style={{
            position: 'relative',
            width: '48px',
            height: '28px',
            borderRadius: '14px',
            border: 'none',
            background: value ? 'var(--accent)' : 'var(--bg-elevated)',
            cursor: 'pointer',
            transition: 'background 0.2s ease',
            flexShrink: 0,
            outline: 'none',
            padding: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '4px',
              left: value ? '24px' : '4px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: value ? '#0a0a0a' : 'var(--text-muted)',
              transition: 'left 0.2s ease',
            }}
          />
        </button>
      </div>
      {value && children && (
        <div
          style={{
            marginTop: '8px',
            borderLeft: '2px solid var(--accent-dim)',
            paddingLeft: '12px',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Satellite icon (small, inline) ──────────────────────────────────────────

function SatelliteIconSmall() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="m4.5 16.5-1.1 2.9a.5.5 0 0 0 .64.64L6.9 19" />
      <path d="M7.5 7.5 6 6" />
      <path d="m6 6-1.5-1.5" />
      <path d="m13.5 4.5 1.5 1.5" />
      <path d="m15 6 1.5 1.5" />
      <path d="m7.5 16.5 9-9" />
      <path d="m13.5 4.5-9 9" />
      <circle cx="16.5" cy="7.5" r="3" />
      <circle cx="7.5" cy="16.5" r="3" />
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SpecsForm({ data, onChange, address, city, state }: SpecsFormProps) {
  const [roofViewerOpen, setRoofViewerOpen] = useState(false)

  function handleMeasurementsLoaded(measurements: Partial<RoofMeasurements>) {
    // Map RoofMeasurements fields to SpecsData fields
    // total_squares → flat_section_sq is not the right mapping;
    // squares live in pricing. We pass them through flat_section_sq
    // as a best-effort until pricing form exposes squares directly.
    // Any future square field on SpecsData can be added here.
    const updates: Partial<SpecsData> = {}
    if (measurements.total_squares != null) {
      updates.flat_section_sq = measurements.total_squares
    }
    if (Object.keys(updates).length > 0) {
      onChange(updates)
    }
    setRoofViewerOpen(false)
  }

  const hasAddress = !!(address && city && state)

  return (
    <div style={{ padding: '0 16px' }}>

      {/* View Roof button — shown when job has an address */}
      {hasAddress && (
        <div style={{ marginBottom: '20px' }}>
          <button
            type="button"
            onClick={() => setRoofViewerOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            <SatelliteIconSmall />
            View Roof
          </button>
        </div>
      )}

      {/* Roof viewer modal/slide-up */}
      {roofViewerOpen && hasAddress && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Backdrop */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
            }}
            onClick={() => setRoofViewerOpen(false)}
          />
          {/* Panel */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--bg-surface)',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0',
            }}
          >
            {/* Panel header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <SatelliteIconSmall />
                Roof View
              </div>
              <button
                type="button"
                onClick={() => setRoofViewerOpen(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            <RoofViewer
              address={address!}
              city={city!}
              state={state!}
              onMeasurementsLoaded={handleMeasurementsLoaded}
            />
          </div>
        </div>
      )}

      {/* 1. Material & Color */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Material & Color</div>
        <TextInput
          label="Material"
          value={data.material}
          onChange={v => onChange({ material: v || null })}
          placeholder="e.g., GAF Timberline HDZ"
        />
        <TextInput
          label="Color"
          value={data.material_color}
          onChange={v => onChange({ material_color: v || null })}
          placeholder="e.g., Charcoal"
        />
      </div>

      {/* 2. Warranties */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Warranties</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <NumberInput
              label="Manufacturer Warranty (years)"
              value={data.warranty_manufacturer_years}
              onChange={v => onChange({ warranty_manufacturer_years: v })}
              placeholder="30"
              min={0}
            />
          </div>
          <div>
            <NumberInput
              label="Workmanship Warranty (years)"
              value={data.warranty_workmanship_years}
              onChange={v => onChange({ warranty_workmanship_years: v })}
              placeholder="10"
              min={0}
            />
          </div>
        </div>
      </div>

      {/* 3. Underlayment */}
      <div style={sectionStyle}>
        <ChipSelector
          label="Underlayment / Felt Type"
          options={[
            { value: 'Synthetic', label: 'Synthetic' },
            { value: '30lb', label: '30lb' },
            { value: 'Ice/Water', label: 'Ice/Water' },
          ]}
          value={data.felt_type}
          onChange={v => onChange({ felt_type: v })}
        />
      </div>

      {/* 4. Tear-Off */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Tear-Off</div>
        <ToggleRow
          label="Tear off existing roof"
          value={!!data.tear_off}
          onChange={v => onChange({ tear_off: v, layers: v ? (data.layers ?? 1) : null })}
        >
          <NumberInput
            label="Number of Layers"
            value={data.layers}
            onChange={v => onChange({ layers: v })}
            placeholder="1"
            min={1}
          />
        </ToggleRow>
      </div>

      {/* 5. Specification Toggles */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Specifications</div>

        <ToggleRow
          label="Fascia replacement"
          value={!!data.fascia_replacement}
          onChange={v => onChange({ fascia_replacement: v })}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <NumberInput
              label="Lineal Ft"
              value={data.fascia_lineal_ft}
              onChange={v => onChange({ fascia_lineal_ft: v })}
              placeholder="0"
              min={0}
            />
            <TextInput
              label="Dimensions"
              value={data.fascia_dimensions}
              onChange={v => onChange({ fascia_dimensions: v || undefined })}
              placeholder="e.g., 2x6"
            />
          </div>
        </ToggleRow>

        <ToggleRow
          label="T&G / Shiplap replacement"
          value={!!data.tg_shiplap}
          onChange={v => onChange({ tg_shiplap: v })}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <NumberInput
              label="Lineal Ft"
              value={data.tg_lineal_ft}
              onChange={v => onChange({ tg_lineal_ft: v })}
              placeholder="0"
              min={0}
            />
            <TextInput
              label="Dimensions"
              value={data.tg_dimensions}
              onChange={v => onChange({ tg_dimensions: v || undefined })}
              placeholder="e.g., 1x6"
            />
          </div>
        </ToggleRow>

        <ToggleRow
          label="Sheeting"
          value={!!data.sheeting}
          onChange={v => onChange({ sheeting: v })}
        >
          <TextInput
            label="Sheeting Type"
            value={data.sheeting_type}
            onChange={v => onChange({ sheeting_type: v || undefined })}
            placeholder="e.g., OSB"
          />
        </ToggleRow>

        <ToggleRow
          label="Metal nosing"
          value={!!data.metal_nosing}
          onChange={v => onChange({ metal_nosing: v })}
        >
          <TextInput
            label="Nosing Color"
            value={data.nosing_color}
            onChange={v => onChange({ nosing_color: v || undefined })}
            placeholder="e.g., Brown"
          />
        </ToggleRow>

        <ToggleRow
          label="Dimensional ridge caps"
          value={!!data.ridge_caps}
          onChange={v => onChange({ ridge_caps: v })}
        />

        <ToggleRow
          label="Ridge vent"
          value={data.ridge_vent_ft != null && data.ridge_vent_ft > 0}
          onChange={v => onChange({ ridge_vent_ft: v ? 1 : null })}
        >
          <NumberInput
            label="Ridge Vent Footage"
            value={data.ridge_vent_ft}
            onChange={v => onChange({ ridge_vent_ft: v })}
            placeholder="0"
            min={0}
          />
        </ToggleRow>

        <ToggleRow
          label="O'Hagen vents"
          value={data.ohagen_vents != null && data.ohagen_vents > 0}
          onChange={v => onChange({ ohagen_vents: v ? 1 : null })}
        >
          <NumberInput
            label="Quantity"
            value={data.ohagen_vents}
            onChange={v => onChange({ ohagen_vents: v })}
            placeholder="0"
            min={0}
          />
        </ToggleRow>

        <ToggleRow
          label="Antenna removal"
          value={!!data.antenna_removal}
          onChange={v => onChange({ antenna_removal: v })}
        />

        <ToggleRow
          label="Solar panel removal"
          value={!!data.solar_removal}
          onChange={v => onChange({ solar_removal: v })}
        />

        <ToggleRow
          label="Flat section re-roofing"
          value={data.flat_section_sq != null && data.flat_section_sq > 0}
          onChange={v => onChange({ flat_section_sq: v ? 1 : null })}
        >
          <NumberInput
            label="Square Footage"
            value={data.flat_section_sq}
            onChange={v => onChange({ flat_section_sq: v })}
            placeholder="0"
            min={0}
          />
          <TextInput
            label="Material"
            value={data.flat_section_material}
            onChange={v => onChange({ flat_section_material: v || undefined })}
            placeholder="e.g., TPO, Modified Bitumen"
          />
        </ToggleRow>

        <ToggleRow
          label="Other structures"
          value={!!data.other_structures}
          onChange={v => onChange({ other_structures: v ? ' ' : undefined })}
        >
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={data.other_structures ?? ''}
              onChange={e => onChange({ other_structures: e.target.value || undefined })}
              placeholder="Describe other structures..."
              rows={2}
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
        </ToggleRow>
      </div>

      {/* 6. Gutters & Downspouts */}
      <div style={{ paddingBottom: '8px' }}>
        <div style={sectionTitleStyle}>Gutters & Downspouts</div>

        <ToggleRow
          label="Gutters"
          value={data.gutters_length != null && data.gutters_length > 0}
          onChange={v => onChange({ gutters_length: v ? 1 : null })}
        >
          <NumberInput
            label="Lineal Ft"
            value={data.gutters_length}
            onChange={v => onChange({ gutters_length: v })}
            placeholder="0"
            min={0}
          />
          <ChipSelector
            label="Gutter Size"
            options={[
              { value: '5 inch', label: '5 inch' },
              { value: '6 inch', label: '6 inch' },
            ]}
            value={data.gutter_size}
            onChange={v => onChange({ gutter_size: v })}
          />
          <TextInput
            label="Gutter Color"
            value={data.gutter_color}
            onChange={v => onChange({ gutter_color: v || null })}
            placeholder="e.g., White"
          />
        </ToggleRow>

        <ToggleRow
          label="Downspouts"
          value={!!data.downspout_color}
          onChange={v => onChange({ downspout_color: v ? '' : null })}
        >
          <TextInput
            label="Downspout Color"
            value={data.downspout_color}
            onChange={v => onChange({ downspout_color: v || null })}
            placeholder="e.g., White"
          />
        </ToggleRow>
      </div>

    </div>
  )
}
