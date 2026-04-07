'use client'

import { useState, useTransition } from 'react'
import { checkOutEquipment, returnEquipment } from '@/lib/actions/equipment'
import type { Equipment } from '@/lib/actions/equipment'

interface EquipmentCheckoutProps {
  jobId: string
  jobEquipment: Equipment[]
  allAvailableEquipment: Equipment[]
}

export function EquipmentCheckout({
  jobId,
  jobEquipment,
  allAvailableEquipment,
}: EquipmentCheckoutProps) {
  const [expanded, setExpanded] = useState(false)
  const [checkedOut, setCheckedOut] = useState<Equipment[]>(jobEquipment)
  const [available, setAvailable] = useState<Equipment[]>(allAvailableEquipment)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCheckOut(equipment: Equipment) {
    setError(null)
    startTransition(async () => {
      try {
        await checkOutEquipment(equipment.id, jobId)
        setCheckedOut((prev) => [...prev, { ...equipment, status: 'in_use', current_job_id: jobId }])
        setAvailable((prev) => prev.filter((e) => e.id !== equipment.id))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check out')
      }
    })
  }

  function handleReturn(equipment: Equipment) {
    setError(null)
    startTransition(async () => {
      try {
        await returnEquipment(equipment.id)
        setCheckedOut((prev) => prev.filter((e) => e.id !== equipment.id))
        setAvailable((prev) => [...prev, { ...equipment, status: 'available', current_job_id: null }])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to return')
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '10px 14px',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>Equipment ({checkedOut.length} checked out)</span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {error && (
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: '#ff5252',
                padding: '6px 10px',
                backgroundColor: 'rgba(255,82,82,0.08)',
                borderRadius: '6px',
              }}
            >
              {error}
            </div>
          )}

          {/* Checked out on this job */}
          {checkedOut.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                On This Job
              </div>
              {checkedOut.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-elevated)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {item.type}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReturn(item)}
                    disabled={isPending}
                    style={{
                      padding: '5px 12px',
                      backgroundColor: 'var(--accent-amber-dim)',
                      border: '1px solid rgba(255,171,0,0.3)',
                      borderRadius: '6px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#ffab00',
                      cursor: isPending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Return
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Available to check out */}
          {available.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Available
              </div>
              {available.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-elevated)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {item.type}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCheckOut(item)}
                    disabled={isPending}
                    style={{
                      padding: '5px 12px',
                      backgroundColor: 'var(--accent-dim)',
                      border: '1px solid var(--accent-glow)',
                      borderRadius: '6px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--accent)',
                      cursor: isPending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Check Out
                  </button>
                </div>
              ))}
            </div>
          )}

          {checkedOut.length === 0 && available.length === 0 && (
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '12px',
              }}
            >
              No equipment available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
