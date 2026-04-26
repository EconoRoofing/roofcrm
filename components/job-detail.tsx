import Link from 'next/link'
import { formatCurrency, formatJobType } from '@/lib/utils'
import { centsToDollars, halfCents, formatCents } from '@/lib/money'
import type { Job, Company, User } from '@/lib/types/database'
import { StatusBadge } from '@/components/status-badge'
import { JobActions } from '@/components/job-actions'
import { getJobLaborCost } from '@/lib/actions/time-tracking'
import { JobCostCard } from '@/components/manager/job-cost-card'
import { JobCalendarWarning } from '@/components/job-calendar-warning'
import { CompanyCamLinker } from '@/components/companycam-linker'
import { JobMessages } from '@/components/job-messages'
import { getJobMessages } from '@/lib/actions/messages'
import { JobAssignment } from '@/components/job-assignment'
import { ClaimWorkflow } from '@/components/insurance/claim-workflow'
import { PhotoAnnotator } from '@/components/photos/photo-annotator'
import { BeforeAfter } from '@/components/photos/before-after'
import { NavigateIcon, ClipboardListIcon, ChevronRightIcon, AlertTriangleIcon, DocumentIcon, PencilIcon, ExternalLinkIcon } from '@/components/icons'
import { createClient } from '@/lib/supabase/server'
import { ReviewReceivedToggle } from '@/components/review-received-toggle'
import { ReviewQR } from '@/components/crew/review-qr'
import { QuickPhoto } from '@/components/photos/quick-photo'
import { getUser } from '@/lib/auth'

type JobWithRelations = Job & { company?: Company; rep?: User }

// ─── Static style constants (defined outside component to avoid re-creation) ──

const styles = {
  outerContainer: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,

  sectionCard: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: '20px',
    border: '1px solid var(--border-subtle)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } as React.CSSProperties,

  sectionCardGap12: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: '20px',
    border: '1px solid var(--border-subtle)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,

  sectionCardPadOnly: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: '20px',
    border: '1px solid var(--border-subtle)',
    padding: '20px',
  } as React.CSSProperties,

  sectionHeading: {
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  } as React.CSSProperties,

  detailLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-sans)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: '500',
  } as React.CSSProperties,

  detailValue: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    fontWeight: '500',
  } as React.CSSProperties,

  monoValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontWeight: '500',
  } as React.CSSProperties,

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-subtle)',
  } as React.CSSProperties,

  financialRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,

  financialLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-sans)',
  } as React.CSSProperties,

  financialMonoValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    color: 'var(--text-primary)',
    fontWeight: '500',
  } as React.CSSProperties,

  inlineCodeBadge: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-elevated)',
    padding: '3px 8px',
    borderRadius: '8px',
    letterSpacing: '0.08em',
  } as React.CSSProperties,

  editLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: 'auto',
    padding: '4px 10px',
    borderRadius: '8px',
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontFamily: 'var(--font-sans)',
    fontWeight: '600',
    textDecoration: 'none',
  } as React.CSSProperties,

  navigateButton: {
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
  } as React.CSSProperties,

  phoneLink: {
    fontSize: '14px',
    color: 'var(--accent-blue)',
    fontFamily: 'var(--font-mono)',
    fontWeight: '500',
    textDecoration: 'none',
  } as React.CSSProperties,

  emailLink: {
    fontSize: '14px',
    color: 'var(--accent-blue)',
    fontFamily: 'var(--font-sans)',
    fontWeight: '500',
    textDecoration: 'none',
  } as React.CSSProperties,

  estimateButtonBlue: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--accent-blue)',
    color: 'var(--accent-blue)',
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
    fontWeight: '700',
    textDecoration: 'none',
    letterSpacing: '-0.01em',
  } as React.CSSProperties,

  estimateButtonGreen: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,230,118,0.06)',
    border: '1px solid rgba(0,230,118,0.2)',
    color: 'var(--accent)',
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
    fontWeight: '700',
    textDecoration: 'none',
    letterSpacing: '-0.01em',
  } as React.CSSProperties,

  createEstimateButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--accent-blue)',
    color: 'var(--accent-blue)',
    fontFamily: 'var(--font-sans)',
    fontSize: '15px',
    fontWeight: '800',
    textDecoration: 'none',
    letterSpacing: '-0.01em',
  } as React.CSSProperties,

  materialLinkCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-card)',
    borderRadius: '20px',
    border: '1px solid var(--border-subtle)',
    padding: '16px 20px',
    textDecoration: 'none',
  } as React.CSSProperties,

  siteNotesCard: {
    backgroundColor: 'rgba(255,82,82,0.06)',
    borderRadius: '20px',
    border: '1px solid rgba(255,82,82,0.2)',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,

  notesCard: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: '20px',
    border: '1px solid var(--border-subtle)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,
} as const

interface JobDetailProps {
  job: JobWithRelations
  role?: string | null
}

function fmt(amount: number | null): string {
  if (amount == null) return '—'
  return formatCurrency(amount)
}

/* Audit R3-#2 follow-up: removed fmtMoney helper (cents-only post-031). */

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={styles.detailLabel}>
        {label}
      </span>
      <span style={styles.detailValue}>
        {value}
      </span>
    </div>
  )
}

function MonoValue({ children }: { children: React.ReactNode }) {
  return (
    <span style={styles.monoValue}>
      {children}
    </span>
  )
}

export async function JobDetail({ job, role }: JobDetailProps) {
  const company = job.company
  const rep = job.rep

  // Owner + office_manager can edit everything; sales can manage estimates; crew is read-only
  const isManager = role === 'owner' || role === 'office_manager'
  const canManageEstimate = isManager || role === 'sales'

  // Performance pass R5-#2: parallelize 4 sequential awaits.
  // Previously these ran one after the other in a serial chain:
  //   getJobLaborCost → getJobMessages → users select (crew) → getUser
  // None depend on each other's results. On a real connection that's
  // ~80–200ms each → ~300–800ms of avoidable serial latency on the
  // highest-traffic detail page. Promise.all collapses them into one
  // round-trip's worth of latency.
  //
  // Branches that only run conditionally (`isManager`) are handled by
  // resolving to identity values when the gate is closed, keeping the
  // Promise.all shape uniform without wasted DB calls.
  const supabase = isManager ? await createClient() : null
  const [laborResult, initialMessagesResult, crewMembersResult, userResult] = await Promise.all([
    isManager
      ? getJobLaborCost(job.id).catch(() => ({ totalCost: 0, totalHours: 0 }))
      : Promise.resolve({ totalCost: 0, totalHours: 0 }),
    getJobMessages(job.id).catch(() => [] as Awaited<ReturnType<typeof getJobMessages>>),
    isManager && supabase
      ? Promise.resolve(
          supabase
            .from('users')
            .select('id, name')
            .eq('role', 'crew')
            .eq('is_active', true)
            .order('name')
        )
          .then((res) => (res.data as Array<{ id: string; name: string }> | null) ?? [])
          .catch(() => [] as Array<{ id: string; name: string }>)
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    getUser().catch(() => null),
  ])

  const laborCost = laborResult.totalCost
  const laborHours = laborResult.totalHours
  const initialMessages = initialMessagesResult
  const crewMembers = crewMembersResult
  const currentUserId = userResult?.id ?? ''

  // Audit R3-#6: twilioConfigured was previously read from process.env in the
  // client component, where TWILIO_ACCOUNT_SID is `undefined` (server-only env
  // vars are not inlined into the client bundle), so the SMS UI was hidden
  // for everyone unless someone also set NEXT_PUBLIC_TWILIO_CONFIGURED.
  // Compute it here in the server parent and pass as a prop.
  const twilioConfigured = !!process.env.TWILIO_ACCOUNT_SID

  const fullAddress = [job.address, job.city, job.state, job.zip].filter(Boolean).join(', ')
  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`

  // Audit R3-#2 follow-up: cents-only post-031.
  const totalCents = Number((job as { total_amount_cents?: number | null }).total_amount_cents ?? 0)
  const hasFinancials = totalCents > 0
  // 50/50 split in cents — exact, no $0.005 rounding artifacts
  const split50Cents = totalCents > 0 ? halfCents(totalCents) : null
  const split50 = split50Cents != null ? centsToDollars(split50Cents) : null

  const companyColor = company?.color

  return (
    <>
      {/* Company color accent bar */}
      {companyColor && (
        <div
          style={{
            height: '4px',
            backgroundColor: companyColor,
            width: '100%',
          }}
        />
      )}
    <div style={styles.outerContainer}>
      {/* Header */}
      <div style={styles.sectionCardGap12}>
        {/* Company + job number + status + edit link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {company && (
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                color: company.color,
                backgroundColor: company.color + '22',
                border: `1px solid ${company.color}44`,
              }}
            >
              {company.name}
            </span>
          )}
          <code style={styles.inlineCodeBadge}>
            {job.job_number}
          </code>
          <StatusBadge status={job.status} />
          {canManageEstimate && (
            <Link
              href={`/jobs/${job.id}/edit`}
              style={styles.editLink}
            >
              <PencilIcon size={11} />
              Edit
            </Link>
          )}
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
            <span style={styles.detailLabel}>
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
            style={styles.navigateButton}
          >
            <NavigateIcon size={12} />
            Navigate
          </a>
        </div>

        {/* Contact */}
        {(job.phone || job.email) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={styles.divider} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {job.phone && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={styles.detailLabel}>
                    Phone
                  </span>
                  <a href={`tel:${job.phone}`} style={styles.phoneLink}>
                    {job.phone}
                  </a>
                </div>
              )}
              {job.email && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={styles.detailLabel}>
                    Email
                  </span>
                  <a href={`mailto:${job.email}`} style={styles.emailLink}>
                    {job.email}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Job Details Grid */}
      <div style={styles.sectionCard}>
        <h2 style={styles.sectionHeading}>
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
          style={styles.materialLinkCard}
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
        <div style={styles.sectionCard}>
          <h2 style={styles.sectionHeading}>
            Financials
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Audit R3-#2 follow-up: cents-only post-031. */}
            {(job as { roof_amount_cents?: number | null }).roof_amount_cents != null && (
              <div style={styles.financialRow}>
                <span style={styles.financialLabel}>Roof</span>
                <span style={styles.financialMonoValue}>{formatCents((job as { roof_amount_cents?: number | null }).roof_amount_cents ?? 0)}</span>
              </div>
            )}
            {(job as { gutters_amount_cents?: number | null }).gutters_amount_cents != null && (
              <div style={styles.financialRow}>
                <span style={styles.financialLabel}>Gutters</span>
                <span style={styles.financialMonoValue}>{formatCents((job as { gutters_amount_cents?: number | null }).gutters_amount_cents ?? 0)}</span>
              </div>
            )}
            {(job as { options_amount_cents?: number | null }).options_amount_cents != null && (
              <div style={styles.financialRow}>
                <span style={styles.financialLabel}>Options</span>
                <span style={styles.financialMonoValue}>{formatCents((job as { options_amount_cents?: number | null }).options_amount_cents ?? 0)}</span>
              </div>
            )}
            <div style={styles.divider} />
            <div style={styles.financialRow}>
              <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontWeight: '700' }}>Total</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', color: 'var(--accent)', fontWeight: '700' }}>{formatCents(totalCents)}</span>
            </div>
            {split50Cents != null && (
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>{formatCents(split50Cents)}</span>
              </div>
            )}
            {isManager && (job.commission_rate ?? 0) > 0 && totalCents > 0 && (
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
                  {formatCents((job as { commission_amount_cents?: number | null }).commission_amount_cents ?? 0)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profitability Card (manager only) */}
      {isManager && (
        <JobCostCard
          contractAmount={centsToDollars(totalCents)}
          materialCost={null}
          laborCost={laborCost}
          laborHours={laborHours}
        />
      )}

      {/* Insurance Section */}
      {job.insurance_claim && (
        <>
          <ClaimWorkflow
            jobId={job.id}
            claimNumber={job.claim_number ?? undefined}
            currentStatus={'filed'}
            adjusterName={job.adjuster_name ?? undefined}
            adjusterPhone={job.adjuster_phone ?? undefined}
            adjusterEmail={job.adjuster_email ?? undefined}
            // Audit R3-#2 follow-up: convert cents → dollars at the boundary
            // since ClaimWorkflow's prop signature is still dollars-based.
            supplementAmount={
              (job as { supplement_amount_cents?: number | null }).supplement_amount_cents != null
                ? Number((job as { supplement_amount_cents?: number | null }).supplement_amount_cents) / 100
                : undefined
            }
          />
          <div style={styles.sectionCard}>
            <h2 style={styles.sectionHeading}>Claim Details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <DetailRow label="Insurance Carrier" value={job.insurance_company} />
              <DetailRow label="Date of Loss" value={job.date_of_loss ? <MonoValue>{job.date_of_loss}</MonoValue> : null} />
              {/* Audit R3-#2 follow-up: cents-only post-031. */}
              <DetailRow
                label="Deductible"
                value={
                  (job as { deductible_cents?: number | null }).deductible_cents != null
                    ? <MonoValue>{formatCents(Number((job as { deductible_cents?: number | null }).deductible_cents))}</MonoValue>
                    : null
                }
              />
              <DetailRow
                label="Insurance Payout"
                value={
                  (job as { insurance_payout_cents?: number | null }).insurance_payout_cents != null
                    ? <MonoValue>{formatCents(Number((job as { insurance_payout_cents?: number | null }).insurance_payout_cents))}</MonoValue>
                    : null
                }
              />
            </div>
          </div>
        </>
      )}

      {/* Site Notes */}
      {job.site_notes && (
        <div style={styles.siteNotesCard}>
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
        <div style={styles.notesCard}>
          <h2 style={styles.sectionHeading}>
            Notes
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', margin: 0, lineHeight: '1.6' }}>
            {job.notes}
          </p>
        </div>
      )}

      {/* Messages */}
      <JobMessages jobId={job.id} customerPhone={job.phone ?? null} initialMessages={initialMessages} twilioConfigured={twilioConfigured} />

      {/* Calendar deleted warning */}
      <JobCalendarWarning jobId={job.id} />

      {/* CompanyCam integration + Photo tools */}
      <div style={styles.sectionCardGap12}>
        <h2 style={styles.sectionHeading}>
          Photos
        </h2>
        <CompanyCamLinker
          jobId={job.id}
          address={[job.address, job.city, job.state].filter(Boolean).join(', ')}
          currentProjectId={job.companycam_project_id}
        />

        {/* Before / After comparison — shown when both photos are present */}
        {(job as any).before_photo_url && (job as any).after_photo_url && (
          <BeforeAfter
            beforeImage={(job as any).before_photo_url}
            afterImage={(job as any).after_photo_url}
          />
        )}

        {/* Quick photo capture button */}
        {currentUserId && (
          <QuickPhoto
            jobId={job.id}
            userId={currentUserId}
          />
        )}

        {/* Photo annotator — shown when a primary photo URL is present.
            Audit 2026-04-25: was passing an inline onSaveAnnotations callback
            for placeholder console.log. That's a Server→Client handler-prop
            violation in Next.js 16. PhotoAnnotator's own internal save logic
            persists the annotations; the callback was never load-bearing.
            Removed. If we need parent-side reaction in the future, wrap this
            usage in a small `'use client'` component. */}
        {(job as any).photo_url && (
          <PhotoAnnotator imageUrl={(job as any).photo_url} />
        )}
      </div>

      {/* Crew Assignment — manager only */}
      {isManager && (
        <JobAssignment
          jobId={job.id}
          currentCrewId={job.assigned_crew_id ?? null}
          currentDate={job.scheduled_date ?? null}
          crewMembers={crewMembers}
        />
      )}

      {/* Estimate — sales/manager only */}
      {canManageEstimate && (
        <div style={styles.sectionCardGap12}>
          <h2 style={styles.sectionHeading}>
            Estimate
          </h2>

          {job.estimate_pdf_url ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a
                href={job.estimate_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.estimateButtonGreen}
              >
                <ExternalLinkIcon size={14} />
                View Signed Agreement
              </a>
              <Link
                href={`/jobs/${job.id}/estimate`}
                style={styles.estimateButtonBlue}
              >
                <DocumentIcon size={14} />
                Edit Estimate
              </Link>
            </div>
          ) : (
            <Link
              href={`/jobs/${job.id}/estimate`}
              style={styles.createEstimateButton}
            >
              <DocumentIcon size={16} />
              Create Estimate
            </Link>
          )}
        </div>
      )}

      {/* Invoices section
          Audit 2026-04-25: was using inline onMouseEnter/onMouseLeave to swap
          background color on hover. Inline event handlers on a Server Component
          throw "Event handlers cannot be passed to Client Component props" in
          Next.js 16, crashing every job detail page with digest 1407542458.
          Replaced JS hover with the `job-detail-link-hover` CSS class (defined
          in app/globals.css) which uses :hover for the same effect, no JS needed,
          works inside a Server Component. */}
      <Link
        href={`/jobs/${job.id}/invoices`}
        className="job-detail-link-hover"
        style={{
          ...styles.sectionCard,
          textDecoration: 'none',
          color: 'inherit',
          transition: 'all 0.15s',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ ...styles.sectionHeading, margin: 0 }}>Invoices</h2>
          <span style={{ color: 'var(--text-secondary)' }}><ChevronRightIcon size={16} /></span>
        </div>
      </Link>

      {/* Review section — completed jobs */}
      {job.status === 'completed' && job.company && (
        <div style={styles.sectionCardGap12}>
          <h2 style={styles.sectionHeading}>
            Review
          </h2>
          {/* QR code shown to any role for completed jobs */}
          <ReviewQR
            jobId={job.id}
            companyId={job.company_id}
            companyName={job.company.name}
            customerPhone={job.phone ?? null}
          />
          {/* Review received toggle — manager only */}
          {isManager && (
            <ReviewReceivedToggle
              jobId={job.id}
              initialValue={job.review_received ?? false}
            />
          )}
        </div>
      )}

      {/* Actions */}
      <div style={styles.sectionCardPadOnly}>
        <JobActions job={job} role={role} />
      </div>
    </div>
    </>
  )
}
