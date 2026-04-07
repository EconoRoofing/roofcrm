'use client'

import { useState, useTransition } from 'react'
import { generateMaterialList, exportMaterialListCSV } from '@/lib/actions/materials'
import { calculateMaterials, type MaterialItem, type MaterialCalcInput } from '@/lib/material-calculator'
import type { MaterialList } from '@/lib/types/database'

interface MaterialListProps {
  jobId: string
  initialList?: MaterialList | null
  calcInput?: MaterialCalcInput
}

export function MaterialListUI({ jobId, initialList, calcInput }: MaterialListProps) {
  const [list, setList] = useState<MaterialList | null>(initialList ?? null)
  const [wasteFactor, setWasteFactor] = useState<number>(
    initialList?.waste_factor ?? 0.10
  )
  const [overrides, setOverrides] = useState<Record<number, number>>({})
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  // Derive items: recalculate with current waste factor, then apply overrides
  const baseItems: MaterialItem[] = (() => {
    if (!list && !calcInput) return []
    const input = calcInput
      ? { ...calcInput, waste_factor: wasteFactor }
      : list
      ? { squares: 0, job_type: '', waste_factor: wasteFactor, ...buildInputFromList(list) }
      : null
    if (!input) return (list?.items as MaterialItem[]) ?? []
    return calculateMaterials({ ...input, waste_factor: wasteFactor })
  })()

  const displayItems: MaterialItem[] = baseItems.map((item, i) => ({
    ...item,
    quantity: overrides[i] !== undefined ? overrides[i] : item.quantity,
  }))

  function handleGenerate() {
    startTransition(async () => {
      try {
        const newList = await generateMaterialList(jobId)
        setList(newList)
        setWasteFactor(newList.waste_factor ?? 0.10)
        setOverrides({})
      } catch (err) {
        console.error('Failed to generate material list', err)
      }
    })
  }

  function handleRecalculate() {
    startTransition(async () => {
      try {
        const newList = await generateMaterialList(jobId)
        setList(newList)
        setOverrides({})
      } catch (err) {
        console.error('Failed to recalculate material list', err)
      }
    })
  }

  async function handleExportCSV() {
    try {
      const csv = await exportMaterialListCSV(jobId)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `materials-${jobId}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export CSV', err)
    }
  }

  function handleCopyToClipboard() {
    const lines = displayItems.map(
      (item) => `${item.name}: ${item.quantity} ${item.unit}`
    )
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleQuantityEdit(index: number, value: string) {
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= 0) {
      setOverrides((prev) => ({ ...prev, [index]: num }))
    } else if (value === '') {
      setOverrides((prev) => {
        const next = { ...prev }
        delete next[index]
        return next
      })
    }
  }

  const wastePercent = Math.round(wasteFactor * 100)

  // No list yet
  if (!list) {
    return (
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          textAlign: 'center',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="4" rx="1" />
          <path d="M5 4h2a1 1 0 0 1 1 1v1H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4V5a1 1 0 0 1 1-1h2" />
          <line x1="12" y1="12" x2="12" y2="16" />
          <line x1="10" y1="14" x2="14" y2="14" />
        </svg>
        <div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--text-secondary)', margin: 0, fontWeight: '500' }}>
            No material list generated yet
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Auto-calculates quantities from job specs
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isPending}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            backgroundColor: 'var(--accent-dim)',
            border: '1px solid rgba(0,230,118,0.25)',
            color: 'var(--accent)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            fontWeight: '700',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? 'Generating...' : 'Generate Material List'}
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '20px',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 16px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Material List
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {wastePercent}% waste factor
          </p>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-elevated)',
            padding: '3px 8px',
            borderRadius: '8px',
          }}
        >
          {displayItems.length} items
        </span>
      </div>

      {/* Waste factor slider */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
            Waste Factor
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '700' }}>
            {wastePercent}%
          </span>
        </div>
        <input
          type="range"
          min={5}
          max={20}
          step={1}
          value={wastePercent}
          onChange={(e) => {
            setWasteFactor(parseInt(e.target.value, 10) / 100)
            setOverrides({})
          }}
          style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>5%</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>20%</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '0 16px' }} />

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <th style={{ padding: '8px 16px', textAlign: 'left', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Material
              </th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', width: '80px' }}>
                Qty
              </th>
              <th style={{ padding: '8px 16px 8px 8px', textAlign: 'left', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Unit
              </th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, i) => {
              const isOverridden = overrides[i] !== undefined
              const isEven = i % 2 === 0
              return (
                <tr
                  key={i}
                  style={{ backgroundColor: isEven ? 'var(--bg-card)' : 'var(--bg-elevated)' }}
                >
                  <td style={{ padding: '10px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>
                      {item.name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {item.formula}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', verticalAlign: 'middle', width: '80px' }}>
                    <input
                      type="number"
                      value={item.quantity}
                      min={0}
                      onChange={(e) => handleQuantityEdit(i, e.target.value)}
                      style={{
                        width: '56px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '15px',
                        fontWeight: '700',
                        color: isOverridden ? 'var(--accent)' : 'var(--text-primary)',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderBottom: `1px solid ${isOverridden ? 'var(--accent)' : 'transparent'}`,
                        textAlign: 'right',
                        outline: 'none',
                        cursor: 'text',
                        padding: '2px 0',
                        MozAppearance: 'textfield',
                      } as React.CSSProperties}
                    />
                  </td>
                  <td style={{ padding: '10px 16px 10px 8px', verticalAlign: 'middle' }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {item.unit}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

      {/* Actions */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <button
          onClick={handleRecalculate}
          disabled={isPending}
          style={btnStyle('default', isPending)}
        >
          {isPending ? 'Recalculating...' : 'Recalculate'}
        </button>
        <button
          onClick={handleExportCSV}
          style={btnStyle('blue', false)}
        >
          Export CSV
        </button>
        <button
          onClick={handleCopyToClipboard}
          style={btnStyle(copied ? 'accent' : 'default', false)}
        >
          {copied ? 'Copied' : 'Copy to Clipboard'}
        </button>
      </div>
    </div>
  )
}

function btnStyle(variant: 'default' | 'accent' | 'blue', disabled: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontFamily: 'var(--font-sans)',
    fontWeight: '700',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: '1px solid',
    transition: 'opacity 0.15s',
  }

  if (variant === 'accent') {
    return { ...base, backgroundColor: 'var(--accent-dim)', borderColor: 'rgba(0,230,118,0.25)', color: 'var(--accent)' }
  }
  if (variant === 'blue') {
    return { ...base, backgroundColor: 'var(--accent-blue-dim)', borderColor: 'rgba(68,138,255,0.25)', color: 'var(--accent-blue)' }
  }
  return { ...base, backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }
}

// When we only have the saved list (no calcInput), we can't recalculate inline —
// the recalculate button will re-fetch from the server action instead.
function buildInputFromList(_list: MaterialList): Partial<MaterialCalcInput> {
  return {}
}
