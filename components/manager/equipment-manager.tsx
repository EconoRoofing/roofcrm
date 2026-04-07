'use client'

import { useState, useTransition } from 'react'
import { addEquipment, returnEquipment, checkOutEquipment } from '@/lib/actions/equipment'
import type { Equipment } from '@/lib/actions/equipment'

const EQUIPMENT_TYPES = ['truck', 'trailer', 'dumpster', 'lift', 'tools', 'other']

const STATUS_COLORS: Record<string, string> = {
  available: 'var(--accent)',
  in_use: '#ffab00',
  maintenance: '#ff5252',
}

const STATUS_BG: Record<string, string> = {
  available: 'var(--accent-dim)',
  in_use: 'var(--accent-amber-dim)',
  maintenance: 'rgba(255,82,82,0.1)',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '20px',
        backgroundColor: STATUS_BG[status] ?? 'var(--bg-elevated)',
        color: STATUS_COLORS[status] ?? 'var(--text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'capitalize',
      }}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

interface EquipmentManagerProps {
  initialEquipment: Equipment[]
}

export default function EquipmentManager({ initialEquipment }: EquipmentManagerProps) {
  const [equipment, setEquipment] = useState<Equipment[]>(initialEquipment)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('truck')
  const [newNotes, setNewNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    if (!newName.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        await addEquipment({ name: newName.trim(), type: newType, notes: newNotes || undefined })
        setNewName('')
        setNewType('truck')
        setNewNotes('')
        setShowAddForm(false)
        // Refresh list
        const { getEquipment } = await import('@/lib/actions/equipment')
        setEquipment(await getEquipment())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add equipment')
      }
    })
  }

  function handleReturn(equipmentId: string) {
    setError(null)
    startTransition(async () => {
      try {
        await returnEquipment(equipmentId)
        const { getEquipment } = await import('@/lib/actions/equipment')
        setEquipment(await getEquipment())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to return equipment')
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Error */}
      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.25)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: '#ff5252',
          }}
        >
          {error}
        </div>
      )}

      {/* Add Equipment button */}
      <div>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          style={{
            padding: '10px 20px',
            backgroundColor: 'var(--accent-dim)',
            border: '1px solid var(--accent-glow)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--accent)',
            cursor: 'pointer',
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add Equipment'}
        </button>
      </div>

      {/* Add Equipment Form */}
      {showAddForm && (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            New Equipment
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g., F-250 Truck)"
              style={{
                flex: '1 1 200px',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              style={{
                flex: '0 1 140px',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            >
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t} value={t} style={{ textTransform: 'capitalize' }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Notes (optional)"
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />

          <button
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim() || isPending}
            style={{
              padding: '12px',
              backgroundColor: newName.trim() && !isPending ? 'var(--accent)' : 'var(--bg-elevated)',
              border: 'none',
              borderRadius: '8px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 700,
              color: newName.trim() && !isPending ? '#000' : 'var(--text-muted)',
              cursor: newName.trim() && !isPending ? 'pointer' : 'not-allowed',
            }}
          >
            {isPending ? 'Adding...' : 'Add Equipment'}
          </button>
        </div>
      )}

      {/* Equipment list */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
        }}
      >
        {equipment.length === 0 ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--text-muted)',
            }}
          >
            No equipment added yet
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-elevated)',
                }}
              >
                {['Name', 'Type', 'Status', 'Assigned To', 'Job', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      textAlign: 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipment.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom:
                      idx < equipment.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <td
                    style={{
                      padding: '14px 16px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {item.name}
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {item.type}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {item.user?.name ?? '—'}
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {item.job ? `#${item.job.job_number}` : '—'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {item.status === 'in_use' && (
                      <button
                        type="button"
                        onClick={() => handleReturn(item.id)}
                        disabled={isPending}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: 'var(--accent-amber-dim)',
                          border: '1px solid rgba(255,171,0,0.3)',
                          borderRadius: '6px',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#ffab00',
                          cursor: isPending ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Return
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
