'use client'

import { useState } from 'react'
import { CheckIcon, HardHatIcon } from '@/components/icons'

const PPE_ITEMS = [
  { id: 'hard_hat', label: 'Hard hat', note: 'Required near overhead activity' },
  { id: 'safety_glasses', label: 'Safety glasses', note: 'Required when cutting, nailing, or grinding' },
  { id: 'work_boots', label: 'Work boots', note: 'Steel-toe or composite-toe, slip-resistant' },
  { id: 'gloves', label: 'Gloves', note: 'Leather or cut-resistant for materials' },
  { id: 'harness', label: 'Fall protection harness', note: 'Required on all steep-slope roofs' },
  { id: 'n95', label: 'N95 respirator', note: 'Required for tear-off and cutting work' },
] as const

type PpeId = typeof PPE_ITEMS[number]['id']

interface Props {
  onConfirm: (ppeVerified: Record<PpeId, boolean>) => void
  onBack: () => void
}

export function PpeChecklist({ onConfirm, onBack }: Props) {
  const [checked, setChecked] = useState<Record<PpeId, boolean>>(() => {
    const initial = {} as Record<PpeId, boolean>
    PPE_ITEMS.forEach(({ id }) => { initial[id] = false })
    return initial
  })

  function toggle(id: PpeId) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleConfirm() {
    onConfirm(checked)
  }

  const checkedCount = Object.values(checked).filter(Boolean).length
  const allChecked = checkedCount === PPE_ITEMS.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 14px',
          backgroundColor: 'var(--accent-amber-dim)',
          border: '1px solid rgba(255,171,0,0.25)',
          borderRadius: '8px',
        }}
      >
        <div style={{ color: 'var(--accent-amber)', flexShrink: 0 }}>
          <HardHatIcon size={20} />
        </div>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--accent-amber)',
            }}
          >
            PPE Verification Required
          </div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            Confirm you are wearing the following before clocking in
          </div>
        </div>
      </div>

      {/* PPE items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {PPE_ITEMS.map(({ id, label, note }) => {
          const isChecked = checked[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '16px',
                backgroundColor: isChecked ? 'rgba(34,197,94,0.06)' : 'var(--bg-surface)',
                border: `1px solid ${isChecked ? 'rgba(34,197,94,0.25)' : 'var(--border-subtle)'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background-color 0.15s, border-color 0.15s',
              }}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '8px',
                  border: `2px solid ${isChecked ? '#22c55e' : 'var(--border-subtle)'}`,
                  backgroundColor: isChecked ? '#22c55e' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background-color 0.15s, border-color 0.15s',
                }}
              >
                {isChecked && <CheckIcon size={12} />}
              </div>

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isChecked ? 'var(--text-muted)' : 'var(--text-primary)',
                    textDecoration: isChecked ? 'line-through' : 'none',
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginTop: '2px',
                  }}
                >
                  {note}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Progress indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: allChecked ? '#22c55e' : 'var(--text-muted)',
        }}
      >
        <span>{checkedCount}/{PPE_ITEMS.length} items verified</span>
        {!allChecked && (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            Check all items to proceed
          </span>
        )}
      </div>

      {/* Buttons */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!allChecked}
        style={{
          width: '100%',
          padding: '16px',
          background: allChecked
            ? 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))'
            : 'var(--bg-elevated)',
          border: allChecked ? 'none' : '1px solid var(--border-subtle)',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 800,
          color: allChecked ? 'var(--nav-text)' : 'var(--text-muted)',
          cursor: allChecked ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        PPE Confirmed — Continue
      </button>

      <button
        type="button"
        onClick={onBack}
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
        Back
      </button>
    </div>
  )
}
