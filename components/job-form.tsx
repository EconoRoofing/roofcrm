'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createJob, updateJob } from '@/lib/actions/jobs'
import { FormInput, FormTextarea, FormSelect, labelStyle, fieldStyle } from '@/components/ui/form-field'
import { APP_CONFIG } from '@/lib/config'
import type { Company, User, JobType, UserRole, Job } from '@/lib/types/database'

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

interface JobFormProps {
  companies: Company[]
  currentUserRole: UserRole
  currentUserId: string
  salesUsers?: User[]
  existingJob?: Job
}

export function JobForm({ companies, currentUserRole, currentUserId, salesUsers = [], existingJob }: JobFormProps) {
  const router = useRouter()
  const isEditing = Boolean(existingJob)

  const [companyId, setCompanyId] = useState<string>(existingJob?.company_id ?? '')
  const [customerName, setCustomerName] = useState(existingJob?.customer_name ?? '')
  const [address, setAddress] = useState(existingJob?.address ?? '')
  const [city, setCity] = useState<string>(existingJob?.city ?? APP_CONFIG.DEFAULT_CITY)
  const [phone, setPhone] = useState(existingJob?.phone ?? '')
  const [email, setEmail] = useState(existingJob?.email ?? '')
  const [jobType, setJobType] = useState<JobType | ''>(existingJob?.job_type ?? '')
  const [repId, setRepId] = useState<string>(
    existingJob?.rep_id ?? ((currentUserRole === 'owner' || currentUserRole === 'office_manager') ? '' : currentUserId)
  )
  const [scheduledDate, setScheduledDate] = useState(existingJob?.scheduled_date ?? '')
  const [notes, setNotes] = useState(existingJob?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Audit R2-#23: synchronous double-submit guard. setLoading is async, so a
  // fast double-tap (or Enter-spam) on iPhone can fire two handleSubmit calls
  // before React has a chance to disable the button. The ref flips
  // synchronously and lets the second invocation early-return.
  const submittingRef = useRef(false)
  const [isInsuranceClaim, setIsInsuranceClaim] = useState(existingJob?.insurance_claim ?? false)
  const [insuranceCompany, setInsuranceCompany] = useState(existingJob?.insurance_company ?? '')
  const [claimNumber, setClaimNumber] = useState(existingJob?.claim_number ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    setError(null)

    if (!companyId) { setError('Please select a company.'); return }
    if (!jobType) { setError('Please select a job type.'); return }

    submittingRef.current = true
    setLoading(true)
    try {
      if (isEditing && existingJob) {
        await updateJob(existingJob.id, {
          customer_name: customerName,
          address,
          city,
          phone: phone || null,
          email: email || null,
          job_type: jobType as JobType,
          rep_id: ((currentUserRole === 'owner' || currentUserRole === 'office_manager') ? repId : currentUserId) || null,
          notes: notes || null,
          scheduled_date: scheduledDate || null,
          ...(isInsuranceClaim && {
            insurance_company: insuranceCompany || null,
            claim_number: claimNumber || null,
          }),
        })
        // Audit R3-#13: dropped the trailing router.refresh(). The App
        // Router refresh invalidates the CURRENT route's RSC payload, but
        // the push hasn't committed yet — so refresh wastes a round trip
        // on the edit page AND the detail page can briefly show pre-edit
        // values before the push-driven RSC fetch lands. updateJob already
        // calls revalidatePath for the affected job + list pages on the
        // server, so the push lands on a freshly-invalidated cache.
        router.push(`/jobs/${existingJob.id}`)
      } else {
        const newJob = await createJob({
          company_id: companyId,
          customer_name: customerName,
          address,
          city,
          phone: phone || null,
          email: email || null,
          job_type: jobType as JobType,
          rep_id: ((currentUserRole === 'owner' || currentUserRole === 'office_manager') ? repId : currentUserId) || null,
          notes: notes || null,
          scheduled_date: scheduledDate || null,
          ...(isInsuranceClaim && {
            insurance_claim: true,
            insurance_company: insuranceCompany || null,
            claim_number: claimNumber || null,
          }),
        })
        router.push(`/jobs/${newJob.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job. Please try again.')
      submittingRef.current = false
      setLoading(false)
    }
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
                  padding: '16px 8px',
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
          <FormInput
            type="text"
            required
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Full name"
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Address <span style={{ color: 'var(--accent)' }}>*</span></label>
          <FormInput
            type="text"
            required
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Street address"
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>City <span style={{ color: 'var(--accent)' }}>*</span></label>
          <FormInput
            type="text"
            required
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="City"
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Phone</label>
          <FormInput
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(555) 555-5555"
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Email</label>
          <FormInput
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
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
      {(currentUserRole === 'owner' || currentUserRole === 'office_manager') && salesUsers.length > 0 && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Assigned Rep</label>
          <FormSelect
            value={repId}
            onChange={e => setRepId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {salesUsers.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </FormSelect>
        </div>
      )}

      {/* Schedule Estimate */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Schedule Estimate</label>
        <FormInput
          type="date"
          value={scheduledDate}
          onChange={e => setScheduledDate(e.target.value)}
          extraStyle={{ colorScheme: 'dark' }}
        />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Creates a Google Calendar event
        </div>
      </div>

      {/* Notes */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Notes</label>
        <FormTextarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional notes..."
          rows={4}
        />
      </div>

      {/* Insurance Claim Toggle */}
      <div style={{ marginBottom: '24px' }}>
        <div
          role="switch"
          aria-checked={isInsuranceClaim}
          aria-label="Insurance Claim"
          tabIndex={0}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px',
            borderRadius: '8px',
            border: `1px solid ${isInsuranceClaim ? 'rgba(0,230,118,0.3)' : 'var(--border-subtle)'}`,
            background: isInsuranceClaim ? 'rgba(0,230,118,0.05)' : 'var(--bg-elevated)',
            cursor: 'pointer',
            outline: 'none',
          }}
          onClick={() => setIsInsuranceClaim(v => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsInsuranceClaim(v => !v) } }}
        >
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
            Insurance Claim?
          </span>
          <div
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '11px',
              backgroundColor: isInsuranceClaim ? 'var(--accent)' : 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              position: 'relative',
              transition: 'background-color 0.15s ease',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '2px',
                left: isInsuranceClaim ? '20px' : '2px',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: isInsuranceClaim ? '#0a0a0a' : 'var(--text-muted)',
                transition: 'left 0.15s ease',
              }}
            />
          </div>
        </div>

        {isInsuranceClaim && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Insurance Carrier</label>
              <FormInput
                type="text"
                value={insuranceCompany}
                onChange={e => setInsuranceCompany(e.target.value)}
                placeholder="e.g. State Farm"
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Claim Number</label>
              <FormInput
                type="text"
                value={claimNumber}
                onChange={e => setClaimNumber(e.target.value)}
                placeholder="Claim #"
              />
            </div>
          </div>
        )}
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
          transition: 'all var(--transition-fast)',
          letterSpacing: '0.3px',
          // Refinement Task 3: inline spinner next to the label during
          // async save. Previously the button just said "Saving..." with
          // no motion, which on a slow network felt broken. The spinner
          // gives immediate motion feedback that the app is working.
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
        }}
      >
        {loading && (
          <span
            aria-hidden="true"
            style={{
              width: '14px',
              height: '14px',
              border: '2px solid var(--text-muted)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}
        <span>{loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Lead'}</span>
      </button>
    </form>
  )
}
