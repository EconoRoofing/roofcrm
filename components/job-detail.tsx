import Link from 'next/link'
import type { Job, Company, User } from '@/lib/types/database'
import { CompanyTag } from '@/components/company-tag'
import { StatusBadge } from '@/components/status-badge'
import { JobActions } from '@/components/job-actions'
import { getJobLaborCost } from '@/lib/actions/time-tracking'
import { JobCostCard } from '@/components/manager/job-cost-card'
import { JobCalendarWarning } from '@/components/job-calendar-warning'
import { CompanyCamLinker } from '@/components/companycam-linker'
import { JobMessages } from '@/components/job-messages'

type JobWithRelations = Job & { company?: Company; rep?: User }

interface JobDetailProps {
  job: JobWithRelations
  role?: string | null
}

function formatCurrency(amount: number | null): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

function formatJobType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
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
              borderRadius: '6px',
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
              color: '#00e676',
              textDecoration: 'none',
              fontSize: '12px',
              fontFamily: 'var(--font-sans)',
              fontWeight: '700',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
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
                    style={{ fontSize: '14px', color: '#448aff', fontFamily: 'var(--font-mono)', fontWeight: '500', textDecoration: 'none' }}
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
                    style={{ fontSize: '14px', color: '#448aff', fontFamily: 'var(--font-sans)', fontWeight: '500', textDecoration: 'none' }}
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="2" width="6" height="4" rx="1" />
              <path d="M5 4h2a1 1 0 0 1 1 1v1H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4V5a1 1 0 0 1 1-1h2" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="13" y2="17" />
            </svg>
            <div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                Material List
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                Auto-calculated quantities
              </div>
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{formatCurrency(job.roof_amount)}</span>
              </div>
            )}
            {job.gutters_amount != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Gutters</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{formatCurrency(job.gutters_amount)}</span>
              </div>
            )}
            {job.options_amount != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Options</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>{formatCurrency(job.options_amount)}</span>
              </div>
            )}
            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontWeight: '700' }}>Total</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', color: 'var(--accent)', fontWeight: '700' }}>{formatCurrency(job.total_amount)}</span>
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>{formatCurrency(split50)}</span>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff5252" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ fontSize: '11px', color: '#ff5252', fontFamily: 'var(--font-sans)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
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
