'use client'

import { useState, useEffect, useCallback } from 'react'
import { createFollowUp, completeFollowUp, getMyFollowUps } from '@/lib/actions/follow-up-tasks'
import type { FollowUp } from '@/lib/actions/follow-up-tasks'

interface FollowUpWidgetProps {
  jobId: string
  currentUserId: string
}

export function FollowUpWidget({ jobId, currentUserId }: FollowUpWidgetProps) {
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [showForm, setShowForm] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // getMyFollowUps returns due/overdue; fetch all for this job
      // We use the user's follow-ups and filter by job
      const all = await getMyFollowUps(currentUserId)
      setFollowUps(all.filter(f => f.job_id === jobId))
    } finally {
      setLoading(false)
    }
  }, [currentUserId, jobId])

  useEffect(() => { load() }, [load])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dueDate) { setError('Due date is required'); return }
    if (!note.trim()) { setError('Note is required'); return }
    setError('')
    setSubmitting(true)
    try {
      await createFollowUp(jobId, currentUserId, dueDate, note.trim())
      setDueDate('')
      setNote('')
      setShowForm(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add follow-up')
    } finally {
      setSubmitting(false)
    }
  }

  const handleComplete = async (id: string) => {
    try {
      await completeFollowUp(id)
      load()
    } catch {
      // ignore
    }
  }

  const today = new Date().toISOString().split('T')[0]

  const isOverdue = (dueDate: string) => dueDate < today

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
          }}
        >
          Follow-Ups
        </span>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '4px 10px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + Add
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginBottom: '12px',
            padding: '12px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
          }}
        >
          <input
            type="date"
            value={dueDate}
            min={tomorrowStr}
            onChange={e => setDueDate(e.target.value)}
            style={{
              padding: '8px 10px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              outline: 'none',
            }}
          />
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note..."
            rows={2}
            style={{
              padding: '8px 10px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              outline: 'none',
              resize: 'vertical',
            }}
          />
          {error && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--accent-red)',
              }}
            >
              {error}
            </span>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError('') }}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 2,
                padding: '8px',
                backgroundColor: 'var(--accent)',
                border: 'none',
                borderRadius: '6px',
                color: '#000',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: submitting ? 'default' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          Loading...
        </div>
      ) : followUps.length === 0 ? (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          No follow-ups
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {followUps.map(f => {
            const overdue = isOverdue(f.due_date)
            return (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: `1px solid ${overdue ? 'var(--accent-red)' : 'var(--border-subtle)'}`,
                  borderRadius: '6px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      marginBottom: '2px',
                    }}
                  >
                    {f.note}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: overdue ? 'var(--accent-red)' : 'var(--text-muted)',
                    }}
                  >
                    Due {f.due_date}{overdue ? ' — OVERDUE' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleComplete(f.id)}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: 'var(--accent)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  Mark Done
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
