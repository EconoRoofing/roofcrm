'use client'

import { useState } from 'react'
import { formatNumericInput } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PricingData {
  roof_amount?: number | null
  gutters_amount?: number | null
  options_amount?: number | null
  notes?: string | null
}

interface PricingFormProps {
  data: PricingData
  onChange: (updates: Partial<PricingData>) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCurrency(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? null : parsed
}

// ─── Currency Input ───────────────────────────────────────────────────────────

function CurrencyInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null | undefined
  onChange: (val: number | null) => void
}) {
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState<string>(() => {
    if (value == null) return ''
    return String(value)
  })

  function handleFocus() {
    setFocused(true)
    setRaw(value != null ? String(value) : '')
  }

  function handleBlur() {
    setFocused(false)
    const parsed = parseCurrency(raw)
    onChange(parsed)
    setRaw(parsed != null ? String(parsed) : '')
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setRaw(v)
  }

  const displayValue = focused ? raw : formatNumericInput(value)

  return (
    <div style={{ marginBottom: '16px' }}>
      <label
        style={{
          display: 'block',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: focused ? 'var(--accent)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '15px',
            fontWeight: 500,
            pointerEvents: 'none',
            transition: 'color 0.15s ease',
          }}
        >
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="0"
          style={{
            width: '100%',
            background: 'var(--bg-elevated)',
            border: `1px solid ${focused ? 'var(--accent)' : 'var(--border-subtle)'}`,
            borderRadius: '8px',
            padding: '12px 12px 12px 28px',
            color: 'var(--text-primary)',
            fontSize: '15px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
            textAlign: 'right',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease',
          }}
        />
      </div>
    </div>
  )
}

// ─── Total Display Row ────────────────────────────────────────────────────────

function TotalRow({
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
        alignItems: 'center',
        justifyContent: 'space-between',
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
        ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PricingForm({ data, onChange }: PricingFormProps) {
  const roof = data.roof_amount ?? 0
  const gutters = data.gutters_amount ?? 0
  const options = data.options_amount ?? 0
  const total = roof + gutters + options
  const deposit = total / 2

  const [notesFocused, setNotesFocused] = useState(false)

  return (
    <div style={{ padding: '0 16px' }}>

      {/* Line items */}
      <div
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '24px',
          marginBottom: '24px',
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
          }}
        >
          Line Items
        </div>
        <CurrencyInput
          label="Roof Amount"
          value={data.roof_amount}
          onChange={v => onChange({ roof_amount: v })}
        />
        <CurrencyInput
          label="Gutters Amount"
          value={data.gutters_amount}
          onChange={v => onChange({ gutters_amount: v })}
        />
        <CurrencyInput
          label="Options Amount"
          value={data.options_amount}
          onChange={v => onChange({ options_amount: v })}
        />
      </div>

      {/* Totals */}
      <div
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '24px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '8px',
          }}
        >
          Totals
        </div>
        <TotalRow label="Total" amount={total} large />
        <TotalRow label="50% Deposit Due on Start" amount={deposit} />
        <TotalRow label="50% Due on Completion" amount={deposit} muted />
      </div>

      {/* Special remarks */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '12px',
          }}
        >
          Remarks
        </div>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            marginBottom: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Special Remarks
        </label>
        <textarea
          value={data.notes ?? ''}
          onChange={e => onChange({ notes: e.target.value || null })}
          onFocus={() => setNotesFocused(true)}
          onBlur={() => setNotesFocused(false)}
          placeholder="Any special conditions, exclusions, or notes for the customer..."
          rows={4}
          style={{
            width: '100%',
            background: 'var(--bg-elevated)',
            border: `1px solid ${notesFocused ? 'var(--accent)' : 'var(--border-subtle)'}`,
            borderRadius: '8px',
            padding: '12px',
            color: 'var(--text-primary)',
            fontSize: '15px',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'var(--font-sans)',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease',
          }}
        />
        <div
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          Cash/check discount price — estimate valid for 15 days
        </div>
      </div>

    </div>
  )
}
