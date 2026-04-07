'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createInspection,
  updateInspectionItem,
  completeInspection,
} from '@/lib/actions/safety'
import type { SafetyInspection } from '@/lib/actions/safety'
import { ROOFING_CHECKLIST_ITEMS, type ChecklistItem } from '@/lib/safety-constants'

const ROOFING_CHECKLIST = ROOFING_CHECKLIST_ITEMS
import { CheckIcon, ClipboardCheckIcon } from '@/components/icons'

const CATEGORY_LABELS: Record<string, string> = {
  fall_protection: 'Fall Protection',
  access: 'Access',
  surface: 'Surface',
  electrical: 'Electrical',
  site: 'Site',
  ppe: 'PPE',
  housekeeping: 'Housekeeping',
  emergency: 'Emergency',
  environment: 'Environment',
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  fall_protection: { bg: 'var(--accent-red-dim)', color: 'var(--accent-red)' },
  access: { bg: 'var(--accent-amber-dim)', color: 'var(--accent-amber)' },
  surface: { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
  electrical: { bg: 'rgba(255,213,0,0.12)', color: '#ffd500' },
  site: { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
  ppe: { bg: 'var(--accent-dim)', color: 'var(--accent)' },
  housekeeping: { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
  emergency: { bg: 'rgba(255,107,53,0.12)', color: '#ff6b35' },
  environment: { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
}

interface Props {
  jobId: string
  existingInspection?: SafetyInspection | null
  onComplete?: () => void
}

export function InspectionChecklist({ jobId, existingInspection, onComplete }: Props) {
  const router = useRouter()
  const [inspection, setInspection] = useState<SafetyInspection | null>(existingInspection ?? null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    existingInspection?.checklist ?? ROOFING_CHECKLIST.map((item) => ({ ...item }))
  )
  const [overallNotes, setOverallNotes] = useState(existingInspection?.overall_notes ?? '')
  const [expandedNote, setExpandedNote] = useState<number | null>(null)
  const [noteText, setNoteText] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isComplete, setIsComplete] = useState(
    existingInspection?.status === 'passed' || existingInspection?.status === 'failed'
  )

  async function ensureInspection(): Promise<string> {
    if (inspection) return inspection.id
    const created = await createInspection(jobId, 'pre_work')
    setInspection(created)
    return created.id
  }

  function handleToggle(index: number) {
    if (isComplete) return
    const updated = checklist.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item
    )
    setChecklist(updated)

    startTransition(async () => {
      try {
        const id = await ensureInspection()
        await updateInspectionItem(id, index, { checked: !checklist[index].checked })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update item')
        // Revert on error
        setChecklist(checklist)
      }
    })
  }

  function handleSaveNote(index: number) {
    const note = noteText[index] ?? ''
    const updated = checklist.map((item, i) => (i === index ? { ...item, note } : item))
    setChecklist(updated)
    setExpandedNote(null)

    startTransition(async () => {
      try {
        const id = await ensureInspection()
        await updateInspectionItem(id, index, { note })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save note')
      }
    })
  }

  function handleComplete() {
    startTransition(async () => {
      try {
        const id = await ensureInspection()
        const result = await completeInspection(id, overallNotes)
        setInspection(result)
        setIsComplete(true)
        onComplete?.()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to complete inspection')
      }
    })
  }

  const checkedCount = checklist.filter((item) => item.checked).length
  const totalCount = checklist.length
  const allChecked = checkedCount === totalCount
  const progressPct = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0

  // Group items by category
  const grouped = checklist.reduce<Record<string, { item: ChecklistItem; index: number }[]>>(
    (acc, item, index) => {
      const cat = item.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push({ item, index })
      return acc
    },
    {}
  )

  // ─── Complete state ───────────────────────────────────────────────────────

  if (isComplete && inspection) {
    const passed = inspection.status === 'passed'
    const failed = !passed
    const uncheckedItems = checklist.filter((item) => !item.checked)

    return (
      <div
        style={{
          padding: '20px',
          backgroundColor: passed ? 'rgba(34,197,94,0.08)' : 'var(--accent-red-dim)',
          border: `1px solid ${passed ? 'rgba(34,197,94,0.3)' : 'rgba(255,82,82,0.3)'}`,
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: passed ? 'rgba(34,197,94,0.2)' : 'rgba(255,82,82,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: passed ? '#22c55e' : 'var(--accent-red)',
              flexShrink: 0,
            }}
          >
            <ClipboardCheckIcon size={20} />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '16px',
                fontWeight: 800,
                color: passed ? '#22c55e' : 'var(--accent-red)',
              }}
            >
              Inspection {passed ? 'PASSED' : 'FAILED'}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-muted)',
              }}
            >
              {checkedCount}/{totalCount} items checked
            </div>
          </div>
        </div>

        {failed && uncheckedItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--accent-red)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Unresolved Items:
            </div>
            {uncheckedItems.map((item, i) => (
              <div
                key={i}
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  padding: '4px 0 4px 10px',
                  borderLeft: '2px solid var(--accent-red)',
                }}
              >
                {item.item}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Active checklist ─────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header + progress */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Pre-Work Safety Inspection
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              color: allChecked ? '#22c55e' : 'var(--text-secondary)',
            }}
          >
            {checkedCount}/{totalCount}
          </div>
        </div>
        <div
          style={{
            height: '6px',
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              backgroundColor: allChecked ? '#22c55e' : 'var(--accent)',
              borderRadius: '3px',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--accent-red-dim)',
            border: '1px solid rgba(255,82,82,0.2)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--accent-red)',
          }}
        >
          {error}
        </div>
      )}

      {/* Grouped checklist items */}
      {Object.entries(grouped).map(([category, items]) => {
        const catStyle = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.site
        return (
          <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Category header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  padding: '2px 8px',
                  backgroundColor: catStyle.bg,
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: catStyle.color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {CATEGORY_LABELS[category] ?? category}
              </span>
            </div>

            {/* Items */}
            {items.map(({ item, index }) => {
              const isExpanded = expandedNote === index
              return (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '16px',
                      backgroundColor: item.checked ? 'rgba(34,197,94,0.06)' : 'var(--bg-surface)',
                      border: `1px solid ${item.checked ? 'rgba(34,197,94,0.2)' : 'var(--border-subtle)'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s, border-color 0.15s',
                    }}
                    onClick={() => handleToggle(index)}
                  >
                    {/* Checkbox */}
                    <div
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '8px',
                        border: `2px solid ${item.checked ? '#22c55e' : 'var(--border-subtle)'}`,
                        backgroundColor: item.checked ? '#22c55e' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '1px',
                        transition: 'background-color 0.15s, border-color 0.15s',
                      }}
                    >
                      {item.checked && <CheckIcon size={12} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '14px',
                          fontWeight: 500,
                          color: item.checked ? 'var(--text-muted)' : 'var(--text-primary)',
                          textDecoration: item.checked ? 'line-through' : 'none',
                          lineHeight: 1.4,
                        }}
                      >
                        {item.item}
                      </div>
                      {item.note && (
                        <div
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                            marginTop: '4px',
                            fontStyle: 'italic',
                          }}
                        >
                          Note: {item.note}
                        </div>
                      )}
                    </div>

                    {/* Add note button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedNote(isExpanded ? null : index)
                        setNoteText((prev) => ({ ...prev, [index]: item.note ?? '' }))
                      }}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {item.note ? 'Edit note' : 'Add note'}
                    </button>
                  </div>

                  {/* Note expansion */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: '10px 12px',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <textarea
                        value={noteText[index] ?? ''}
                        onChange={(e) => setNoteText((prev) => ({ ...prev, [index]: e.target.value }))}
                        placeholder="Add a note about this item..."
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          resize: 'none',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedNote(null)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            fontFamily: 'var(--font-sans)',
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveNote(index)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: 'var(--accent-dim)',
                            border: '1px solid var(--accent)',
                            borderRadius: '8px',
                            fontFamily: 'var(--font-sans)',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--accent)',
                            cursor: 'pointer',
                          }}
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Overall notes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Overall Notes
        </label>
        <textarea
          value={overallNotes}
          onChange={(e) => setOverallNotes(e.target.value)}
          placeholder="Any additional safety observations or concerns..."
          rows={3}
          style={{
            width: '100%',
            padding: '12px 14px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: 'var(--text-primary)',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Complete button */}
      <button
        type="button"
        onClick={handleComplete}
        disabled={isPending}
        style={{
          width: '100%',
          padding: '16px',
          background: allChecked
            ? 'linear-gradient(135deg, #16a34a, #22c55e)'
            : 'linear-gradient(135deg, var(--accent-red), #ef5350)',
          border: 'none',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 800,
          color: '#fff',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending
          ? 'Saving...'
          : allChecked
            ? 'Complete Inspection — PASS'
            : `Complete Inspection — ${totalCount - checkedCount} item${totalCount - checkedCount !== 1 ? 's' : ''} unchecked`}
      </button>
    </div>
  )
}
