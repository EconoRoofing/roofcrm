'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createJob } from '@/lib/actions/jobs'
import type { Company, User, JobType, UserRole } from '@/lib/types/database'

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'reroof', label: 'Reroof' },
  { value: 'repair', label: 'Repair' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'coating', label: 'Coating' },
  { value: 'new_construction', label: 'New Construction' },
  { value: 'gutters', label: 'Gutters' },
  { value: 'other', label: 'Other' },
]

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface JobFormProps {
  companies: Company[]
  currentUserRole: UserRole
  currentUserId: string
  salesUsers?: User[]
}

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
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const fieldStyle: React.CSSProperties = {
  marginBottom: '16px',
}

export function JobForm({ companies, currentUserRole, currentUserId, salesUsers = [] }: JobFormProps) {
  const router = useRouter()

  const [companyId, setCompanyId] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('Fresno')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [jobType, setJobType] = useState<JobType | ''>('')
  const [repId, setRepId] = useState<string>(currentUserRole === 'manager' ? '' : currentUserId)
  const [scheduledDate, setScheduledDate] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!companyId) { setError('Please select a company.'); return }
    if (!jobType) { setError('Please select a job type.'); return }

    setLoading(true)
    try {
      const newJob = await createJob({
        company_id: companyId,
        customer_name: customerName,
        address,
        city,
        phone: phone || null,
        email: email || null,
        job_type: jobType as JobType,
        rep_id: (currentUserRole === 'manager' ? repId : currentUserId) || null,
        notes: notes || null,
        scheduled_date: scheduledDate || null,
      })
      router.push(`/jobs/${newJob.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job. Please try again.')
      setLoading(false)
    }
  }

  function getFocusStyle(fieldName: string): React.CSSProperties {
    return focusedField === fieldName
      ? { ...inputStyle, borderColor: 'var(--accent)' }
      : inputStyle
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '520px', margin: '0 auto', padding: '16px' }}>

      {/* Company Selector */}
      <div style={{ marginBottom: '24px' }}>
        <span style={labelStyle}>Company</span>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          {companies.map((company) => {
            const selected = companyId === company.id
            return (
              <button
                key={company.id}
                type="button"
                onClick={() => setCompanyId(company.id)}
                style={{
                  flex: 1,
                  padding: '14px 8px',
                  borderRadius: '8px',
                  border: `1px solid ${selected ? company.color : 'var(--border-subtle)'}`,
                  background: selected ? company.color : 'var(--bg-elevated)',
                  color: selected ? '#0a0a0a' : company.color,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'center',
                }}
              >
                {company.name.replace(' Roofing', '')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Customer Info */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
          Customer Info
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Customer Name <span style={{ color: 'var(--accent)' }}>*</span></label>
          <input
            type="text"
            required
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            onFocus={() => setFocusedField('customerName')}
            onBlur={() => setFocusedField(null)}
            placeholder="Full name"
            style={getFocusStyle('customerName')}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Address <span style={{ color: 'var(--accent)' }}>*</span></label>
          <input
            type="text"
            required
            value={address}
            onChange={e => setAddress(e.target.value)}
            onFocus={() => setFocusedField('address')}
            onBlur={() => setFocusedField(null)}
            placeholder="Street address"
            style={getFocusStyle('address')}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>City <span style={{ color: 'var(--accent)' }}>*</span></label>
          <input
            type="text"
            required
            value={city}
            onChange={e => setCity(e.target.value)}
            onFocus={() => setFocusedField('city')}
            onBlur={() => setFocusedField(null)}
            placeholder="City"
            style={getFocusStyle('city')}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onFocus={() => setFocusedField('phone')}
            onBlur={() => setFocusedField(null)}
            placeholder="(555) 555-5555"
            style={getFocusStyle('phone')}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            placeholder="email@example.com"
            style={getFocusStyle('email')}
          />
        </div>
      </div>

      {/* Job Type */}
      <div style={{ marginBottom: '24px' }}>
        <span style={labelStyle}>Job Type <span style={{ color: 'var(--accent)' }}>*</span></span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
          {JOB_TYPES.map(({ value, label }) => {
            const selected = jobType === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setJobType(value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${selected ? 'transparent' : 'var(--border-subtle)'}`,
                  background: selected ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: selected ? '#0a0a0a' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: selected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Rep Assignment — manager only */}
      {currentUserRole === 'manager' && salesUsers.length > 0 && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Assigned Rep</label>
          <select
            value={repId}
            onChange={e => setRepId(e.target.value)}
            onFocus={() => setFocusedField('repId')}
            onBlur={() => setFocusedField(null)}
            style={{ ...getFocusStyle('repId'), appearance: 'none' }}
          >
            <option value="">Unassigned</option>
            {salesUsers.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Schedule Estimate */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Schedule Estimate</label>
        <input
          type="date"
          value={scheduledDate}
          onChange={e => setScheduledDate(e.target.value)}
          onFocus={() => setFocusedField('scheduledDate')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...getFocusStyle('scheduledDate'),
            colorScheme: 'dark',
          }}
        />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Creates a Google Calendar event
        </div>
      </div>

      {/* Notes */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onFocus={() => setFocusedField('notes')}
          onBlur={() => setFocusedField(null)}
          placeholder="Any additional notes..."
          rows={4}
          style={{
            ...getFocusStyle('notes'),
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            borderRadius: '8px',
            background: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.3)',
            color: '#ff5252',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%',
          padding: '16px',
          borderRadius: '8px',
          border: 'none',
          background: loading ? 'var(--bg-elevated)' : 'var(--accent)',
          color: loading ? 'var(--text-muted)' : '#0a0a0a',
          fontSize: '15px',
          fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          letterSpacing: '0.3px',
        }}
      >
        {loading ? 'Saving...' : 'Add Lead'}
      </button>
    </form>
  )
}
