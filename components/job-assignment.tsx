'use client'

import { useState } from 'react'
import { updateJob } from '@/lib/actions/jobs'

interface JobAssignmentProps {
  jobId: string
  currentCrewId: string | null
  currentDate: string | null
  crewMembers: Array<{ id: string; name: string }>
}

export function JobAssignment({ jobId, currentCrewId, currentDate, crewMembers }: JobAssignmentProps) {
  const [crewId, setCrewId] = useState(currentCrewId ?? '')
  const [schedDate, setSchedDate] = useState(currentDate ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentCrewName = crewMembers.find((c) => c.id === currentCrewId)?.name

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateJob(jobId, {
        assigned_crew_id: crewId || null,
        scheduled_date: schedDate || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save assignment')
    } finally {
      setSaving(false)
    }
  }

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
    outline: 'none',
    appearance: 'none',
    cursor: 'pointer',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    outline: 'none',
    colorScheme: 'dark',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-sans)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: '600',
    marginBottom: '6px',
    display: 'block',
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '20px',
        border: '1px solid var(--border-subtle)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: '700',
            color: 'var(--text-muted)',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Assignment
        </h2>
        {currentCrewName && currentDate && (
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
            }}
          >
            {currentCrewName} &middot; {currentDate}
          </span>
        )}
      </div>

      {/* Crew dropdown */}
      <div>
        <label style={labelStyle}>Assign Crew</label>
        <select
          value={crewId}
          onChange={(e) => setCrewId(e.target.value)}
          style={selectStyle}
        >
          <option value="">Unassigned</option>
          {crewMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>

      {/* Schedule date */}
      <div>
        <label style={labelStyle}>Install Date</label>
        <input
          type="date"
          value={schedDate}
          onChange={(e) => setSchedDate(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.3)',
            color: '#ff5252',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {error}
        </div>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '12px 16px',
          borderRadius: '8px',
          border: saved
            ? '1px solid rgba(0,230,118,0.3)'
            : '1px solid var(--border-subtle)',
          backgroundColor: saved
            ? 'rgba(0,230,118,0.15)'
            : 'var(--bg-elevated)',
          color: saved ? 'var(--accent)' : saving ? 'var(--text-muted)' : 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          fontWeight: '700',
          cursor: saving ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          letterSpacing: '0.02em',
        }}
      >
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Assignment'}
      </button>
    </div>
  )
}
