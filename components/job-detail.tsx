import Link from 'next/link'
import { formatCurrency, formatJobType } from '@/lib/utils'
import type { Job, Company, User } from '@/lib/types/database'
import { CompanyTag } from '@/components/company-tag'
import { StatusBadge } from '@/components/status-badge'
import { JobActions } from '@/components/job-actions'
import { getJobLaborCost } from '@/lib/actions/time-tracking'
import { JobCostCard } from '@/components/manager/job-cost-card'
import { JobCalendarWarning } from '@/components/job-calendar-warning'
import { CompanyCamLinker } from '@/components/companycam-linker'
import { JobMessages } from '@/components/job-messages'
import { NavigateIcon, ClipboardListIcon, ChevronRightIcon, AlertTriangleIcon } from '@/components/icons'

type JobWithRelations = Job & { company?: Company; rep?: User }

interface JobDetailProps {
  job: JobWithRelations
  role?: string | null
}

function fmt(amount: number | null): string {
  if (amount == null) return '—'
  return formatCurrency(amount)
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500' }}>
        {label}
      </span>
      <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontWeight: '500' }}>
        {value}
      </span>
    </div>
  )
}

function MonoValue({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>
      {children}
    </span>
  )
}

export async function JobDetail({ job, role }: JobDetailProps) {
  const company = job.company
  const rep = job.rep

  const isManager = role === 'manager'

  let laborCost = 0
  let laborHours = 0
  if (isManager) {
    try {
      const labor = await getJobLaborCost(job.id)
      laborCost = labor.totalCost
      laborHours = labor.totalHours
    } catch {
      // silently fall back to zeros
    }
  }

  const fullAddress = [job.address, job.city, job.state, job.zip].filter(Boolean).join(', ')
  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`

  const hasFinancials = (job.total_amount ?? 0) > 0

  const split50 = job.total_amount != null ? job.total_amount / 2 : null

  return (
    <div
      style={{
        maxWidth: '480px',
        margin: '0 auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Company + job number + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {company && (
            <CompanyTag name={company.name} color={company.color} />
          )}
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: '700',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-elevated)',
              padding: '3px 8px',
              borderRadius: '8px',
              letterSpacing: '0.08em',
            }}
          >
            {job.job_number}
          </code>
          <StatusBadge status={job.status} />
        </div>

        {/* Customer name */}
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '26px',
              fontWeight: '900',
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: '1.15',
              letterSpacing: '-0.02em',
            }}
          >
            {job.customer_name}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              margin: '4px 0 0',
              fontWeight: '500',
            }}
          >
            {formatJobType(job.job_type)}
          </p>
        </div>

        {/* Address + Navigate */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500' }}>
              Address
            </span>
            <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontWeight: '500', lineHeight: '1.4' }}>
              {job.address}
              <br />
              {[job.city, job.state, job.zip].filter(Boolean).join(', ')}
            </span>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(0,230,118,0.12)',
              border: '1px solid rgba(0,230,118,0.2)',
              color: 'var(--nav-gradient-2)',
              textDecoration: 'none',
              fontSize: '12px',
              fontFamily: 'var(--font-sans)',
              fontWeight: '700',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <NavigateIcon size={12} />
            Navigate
          </a>
        </div>

        {/* Contact */}
        {(job.phone || job.email) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {job.phone && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500' }}>
                    Phone
                  </span>
                  <a
                    href={`tel:${job.phone}`}
                    style={{ fontSize: '14px', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontWeight: '500', textDecoration: 'none' }}
                  >
                    {job.phone}
                  </a>
                </div>
              )}
              {job.email && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500' }}>
                    Email
                  </span>
                  <a
                    href={`mailto:${job.email}`}
                    style={{ fontSize: '14px', color: 'var(--accent-blue)', fontFamily: 'var(--font-sans)', fontWeight: '500', textDecoration: 'none' }}
                  >
                    {job.email}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Job Details Grid */}
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
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Details
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <DetailRow label="Referred By" value={job.referred_by} />
          <DetailRow label="Rep" value={rep?.name} />
          <DetailRow label="Material" value={job.material} />
          <DetailRow label="Color" value={job.material_color} />
          <DetailRow label="Squares" value={job.squares != null ? <MonoValue>{job.squares}</MonoValue> : null} />
          <DetailRow label="Layers" value={job.layers != null ? <MonoValue>{job.layers}</MonoValue> : null} />
          <DetailRow label="Felt" value={job.felt_type} />
          <DetailRow label="Ridge" value={job.ridge_type} />
          <DetailRow label="Ventilation" value={job.ventilation} />
          {job.permit_number && (
            <DetailRow label="Permit" value={<MonoValue>{job.permit_number}</MonoValue>} />
          )}
          {job.scheduled_date && (
            <DetailRow label="Scheduled" value={<MonoValue>{job.scheduled_date}</MonoValue>} />
          )}
        </div>
      </div>

      {/* Material List link — shown when job has squares */}
      {(job.squares ?? 0) > 0 && (
        <Link
          href={`/jobs/${job.id}/materials`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-card)',
            borderRadius: '20px',
            border: '1px solid var(--border-subtle)',
            padding: '16px 20px',
            textDecoration: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--accent)', display: 'flex' }}>
              <ClipboardListIcon size={16} />
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                Material List
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                Auto-calculated quantities
              </div>
            </div>
          </div>
          <span style={{ color: 'var(--text-muted)', display: 'flex' }}>
            <ChevronRightIcon size={14} />
          </span>
        </Link>
      )}

      {/* Financial Section */}
      {hasFinancials && (
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
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Financials
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {job.roof_amount != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Roof</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{fmt(job.roof_amount)}</span>
              </div>
            )}
            {job.gutters_amount != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Gutters</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{fmt(job.gutters_amount)}</span>
              </div>
            )}
            {job.options_amount != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Options</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{fmt(job.options_amount)}</span>
              </div>
            )}
            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontWeight: '700' }}>Total</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', color: 'var(--accent)', fontWeight: '700' }}>{fmt(job.total_amount)}</span>
            </div>
            {split50 != null && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontWeight: '500' }}>50/50 Split</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>{fmt(split50)}</span>
              </div>
            )}
            {isManager && (job.commission_rate ?? 0) > 0 && (job.total_amount ?? 0) > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0,230,118,0.06)',
                  border: '1px solid rgba(0,230,118,0.15)',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontWeight: '500' }}>
                  Commission ({job.commission_rate}%)
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--accent)', fontWeight: '500' }}>
                  {fmt(job.commission_amount ?? null)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profitability Card (manager only) */}
      {isManager && (
        <JobCostCard
          contractAmount={job.total_amount}
          materialCost={null}
          laborCost={laborCost}
          laborHours={laborHours}
        />
      )}

      {/* Insurance Section */}
      {job.insurance_claim && (
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
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Insurance Claim
            </h2>
            {job.claim_status && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  fontFamily: 'var(--font-sans)',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(0,230,118,0.1)',
                  border: '1px solid rgba(0,230,118,0.2)',
                  color: 'var(--accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {job.claim_status}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <DetailRow label="Insurance Carrier" value={job.insurance_company} />
            <DetailRow label="Claim Number" value={job.claim_number ? <MonoValue>{job.claim_number}</MonoValue> : null} />
            <DetailRow label="Adjuster" value={job.adjuster_name} />
            <DetailRow label="Adjuster Phone" value={job.adjuster_phone ? <a href={`tel:${job.adjuster_phone}`} style={{ fontSize: '14px', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontWeight: '500', textDecoration: 'none' }}>{job.adjuster_phone}</a> : null} />
            <DetailRow label="Date of Loss" value={job.date_of_loss ? <MonoValue>{job.date_of_loss}</MonoValue> : null} />
            <DetailRow label="Deductible" value={job.deductible != null ? <MonoValue>{fmt(job.deductible)}</MonoValue> : null} />
            <DetailRow label="Insurance Payout" value={job.insurance_payout != null ? <MonoValue>{fmt(job.insurance_payout)}</MonoValue> : null} />
            <DetailRow label="Supplement" value={job.supplement_amount != null ? <MonoValue>{fmt(job.supplement_amount)}</MonoValue> : null} />
          </div>
        </div>
      )}

      {/* Site Notes */}
      {job.site_notes && (
        <div
          style={{
            backgroundColor: 'rgba(255,82,82,0.06)',
            borderRadius: '20px',
            border: '1px solid rgba(255,82,82,0.2)',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-red)', display: 'flex' }}>
              <AlertTriangleIcon size={14} />
            </span>
            <span style={{ fontSize: '11px', color: 'var(--accent-red)', fontFamily: 'var(--font-sans)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Site Notes
            </span>
          </div>
          <p style={{ fontSize: '14px', color: '#ffbaba', fontFamily: 'var(--font-sans)', margin: 0, lineHeight: '1.5', fontWeight: '500' }}>
            {job.site_notes}
          </p>
        </div>
      )}

      {/* Notes */}
      {job.notes && (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '20px',
            border: '1px solid var(--border-subtle)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Notes
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', margin: 0, lineHeight: '1.6' }}>
            {job.notes}
          </p>
        </div>
      )}

      {/* Messages */}
      <JobMessages jobId={job.id} customerPhone={job.phone ?? null} />

      {/* Calendar deleted warning */}
      <JobCalendarWarning jobId={job.id} />

      {/* CompanyCam integration */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
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
          Photos
        </h2>
        <CompanyCamLinker
          jobId={job.id}
          address={[job.address, job.city, job.state].filter(Boolean).join(', ')}
          currentProjectId={job.companycam_project_id}
        />
      </div>

      {/* Actions */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          padding: '20px',
        }}
      >
        <JobActions job={job} />
      </div>
    </div>
  )
}
