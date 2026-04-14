'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, requireJobEditor } from '@/lib/auth-helpers'
import { logActivity } from '@/lib/actions/activity'
import { dollarsToCents, centsToDollars } from '@/lib/money'

export type ClaimStatus = 'filed' | 'inspection' | 'approved' | 'supplement' | 'done'

const CLAIM_STATUSES: ClaimStatus[] = ['filed', 'inspection', 'approved', 'supplement', 'done']

const VALID_CLAIM_TRANSITIONS: Record<string, string[]> = {
  filed: ['inspection'],
  inspection: ['approved', 'filed'], // can go back to filed for re-inspection
  approved: ['supplement', 'done'],
  supplement: ['approved', 'done'],  // supplement approved or go to done
  done: [],                          // terminal state
}

export interface ClaimTimeline {
  status: ClaimStatus
  timestamp: string
  notes?: string
}

export async function updateClaimStatus(
  job_id: string,
  new_status: ClaimStatus,
  notes?: string
) {
  const { userId, companyId, role } = await getUserWithCompany()
  // Audit R2-#4: role gate. Previously crew could flip insurance jobs to
  // completed via this action and bypass the entire status-change pipeline
  // (warranty, calendar, SMS, commission, audit log). requireJobEditor
  // matches the rest of the job-mutation surface.
  requireJobEditor(role)

  // Runtime validation of the status value
  if (!CLAIM_STATUSES.includes(new_status)) throw new Error('Invalid claim status')

  // Verify job belongs to user's company
  await verifyJobOwnership(job_id, companyId)

  const supabase = await createClient()

  // Fetch current claim_status
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, insurance_claim, claim_number, company_id, claim_status')
    .eq('id', job_id)
    .eq('company_id', companyId)
    .single()

  if (jobError || !job || !job.insurance_claim) {
    throw new Error('Job not found or is not an insurance claim')
  }

  // Enforce valid state transition
  const currentStatus = (job as any).claim_status ?? 'filed'
  const validNext = VALID_CLAIM_TRANSITIONS[currentStatus] ?? []
  if (!validNext.includes(new_status)) {
    throw new Error(`Cannot move claim from '${currentStatus}' to '${new_status}'`)
  }

  // Add new timeline entry
  const newEntry: ClaimTimeline = {
    status: new_status,
    timestamp: new Date().toISOString(),
    notes: notes,
  }

  // Update only the claim_status column here — NEVER write jobs.status
  // directly. Audit R2-#4: the previous version bypassed updateJobStatus,
  // skipping warranty/calendar/SMS/commission/audit-log side effects.
  // Route any implied job-status transition through the gated action below.
  const { data: updatedJob, error: updateError } = await supabase
    .from('jobs')
    .update({ claim_status: new_status })
    .eq('id', job_id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (updateError) throw new Error(`Failed to update claim status: ${updateError.message}`)

  // Implied job-status transitions go through updateJobStatus so the full
  // side-effects pipeline runs. Best-effort: if the transition is invalid
  // (e.g. job is already completed), we swallow the error and leave the
  // claim_status update in place — the manager can correct via /jobs/[id].
  if (new_status === 'approved' || new_status === 'done') {
    try {
      const { updateJobStatus } = await import('./jobs')
      const targetStatus = new_status === 'approved' ? 'sold' : 'completed'
      await updateJobStatus(job_id, targetStatus)
    } catch (err) {
      console.warn('[insurance] implied job status transition failed:', err)
    }
  }

  // Log activity for audit trail — pass currentStatus as old_value
  await logActivity(job_id, userId, 'insurance_claim_update', currentStatus, new_status)

  return {
    job: updatedJob,
    timeline_entry: newEntry,
  }
}

export async function getClaimTimeline(job_id: string) {
  const { companyId } = await getUserWithCompany()

  // Verify job belongs to user's company
  await verifyJobOwnership(job_id, companyId)

  const supabase = await createClient()

  // Use correct table name (activity_log) and column name (action)
  const { data: activities, error } = await supabase
    .from('activity_log')
    .select('id, action, old_value, new_value, created_at, user_id')
    .eq('job_id', job_id)
    .eq('action', 'insurance_claim_update')
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch claim timeline: ${error.message}`)

  // Transform activity logs into timeline
  const timeline: ClaimTimeline[] = (activities || []).map((activity) => ({
    status: activity.new_value as ClaimStatus,
    timestamp: activity.created_at,
  }))

  return timeline
}

export async function getInsuranceClaims(company_id: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Ensure user can only query their own company
  if (company_id !== companyId) throw new Error('Access denied')

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, customer_name, claim_number, insurance_company, adjuster_name, adjuster_phone, supplement_amount, notes, claim_status')
    .eq('company_id', company_id)
    .eq('insurance_claim', true)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch insurance claims: ${error.message}`)
  return jobs || []
}

export async function updateAdjusterInfo(
  job_id: string,
  adjuster_name?: string,
  adjuster_phone?: string,
  adjuster_email?: string
) {
  const { companyId } = await getUserWithCompany()

  // Verify job belongs to user's company
  await verifyJobOwnership(job_id, companyId)

  const supabase = await createClient()

  const payload: Record<string, unknown> = {}
  if (adjuster_name !== undefined) payload.adjuster_name = adjuster_name
  if (adjuster_phone !== undefined) payload.adjuster_phone = adjuster_phone
  if (adjuster_email !== undefined) payload.adjuster_email = adjuster_email

  const { data: job, error } = await supabase
    .from('jobs')
    .update(payload)
    .eq('id', job_id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update adjuster info: ${error.message}`)
  return job
}

export async function updateSupplementAmount(job_id: string, amount: number) {
  const { companyId } = await getUserWithCompany()

  // Verify job belongs to user's company
  await verifyJobOwnership(job_id, companyId)

  if (amount <= 0) throw new Error('Supplement amount must be greater than zero')
  if (amount > 500000) throw new Error('Supplement amount exceeds maximum ($500,000)')

  const amountCents = dollarsToCents(amount)
  const supabase = await createClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .update({
      supplement_amount: centsToDollars(amountCents),
      supplement_amount_cents: amountCents,
    })
    .eq('id', job_id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update supplement amount: ${error.message}`)
  return job
}

export async function getAgingClaims(): Promise<Array<{
  jobId: string
  jobNumber: string
  customerName: string
  claimStatus: string
  daysSinceLastUpdate: number
}>> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Get all active insurance claims for this company (not done)
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, claim_status')
    .eq('company_id', companyId)
    .eq('insurance_claim', true)
    .neq('claim_status', 'done')
    .neq('status', 'cancelled')

  if (error || !jobs || jobs.length === 0) return []

  // Batch query: get last claim-related activity for all jobs at once
  const jobIds = jobs.map((j) => j.id)
  const { data: activities } = await supabase
    .from('activity_log')
    .select('job_id, created_at')
    .in('job_id', jobIds)
    .eq('action', 'insurance_claim_update')
    .order('created_at', { ascending: false })

  // Build a map of job_id -> last activity date (first occurrence per job is latest)
  const lastActivityMap = new Map<string, string>()
  for (const activity of activities || []) {
    if (!lastActivityMap.has(activity.job_id)) {
      lastActivityMap.set(activity.job_id, activity.created_at)
    }
  }

  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const results: Array<{ jobId: string; jobNumber: string; customerName: string; claimStatus: string; daysSinceLastUpdate: number }> = []

  for (const job of jobs) {
    const lastCreatedAt = lastActivityMap.get(job.id)
    const lastUpdateDate = lastCreatedAt
      ? new Date(lastCreatedAt)
      : fourteenDaysAgo // if no activity, treat as stale

    const daysSince = Math.floor((Date.now() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysSince >= 14) {
      results.push({
        jobId: job.id,
        jobNumber: job.job_number ?? '-',
        customerName: job.customer_name,
        claimStatus: job.claim_status ?? 'filed',
        daysSinceLastUpdate: daysSince,
      })
    }
  }

  return results.sort((a, b) => b.daysSinceLastUpdate - a.daysSinceLastUpdate)
}

export interface ClaimDocument {
  stage: string
  url: string
  name: string
  uploaded_at: string
}

export async function addClaimDocument(
  job_id: string,
  document: ClaimDocument
): Promise<ClaimDocument[]> {
  const { userId, companyId } = await getUserWithCompany()

  // Verify job belongs to user's company
  await verifyJobOwnership(job_id, companyId)

  const supabase = await createClient()

  // Fetch current documents
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('claim_documents')
    .eq('id', job_id)
    .eq('company_id', companyId)
    .single()

  if (fetchError) throw new Error('Job not found')

  const current: ClaimDocument[] = Array.isArray((job as any).claim_documents)
    ? (job as any).claim_documents
    : []

  const updated = [...current, document]

  const { error } = await supabase
    .from('jobs')
    .update({ claim_documents: updated })
    .eq('id', job_id)
    .eq('company_id', companyId)

  if (error) throw new Error(`Failed to add document: ${error.message}`)

  await logActivity(job_id, userId, 'claim_document_added', document.stage, document.name)

  return updated
}

// ---------------------------------------------------------------------------
// Multi-round supplement tracking
// ---------------------------------------------------------------------------

export async function addSupplementRound(
  jobId: string,
  amount: number,
  notes?: string
) {
  const { userId, companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

  if (amount <= 0) throw new Error('Supplement amount must be greater than zero')
  if (amount > 500000) throw new Error('Supplement amount exceeds maximum ($500,000)')

  const amountCents = dollarsToCents(amount)
  const supabase = await createClient()

  // Determine next round number
  const { data: existing } = await supabase
    .from('supplement_rounds')
    .select('round_number')
    .eq('job_id', jobId)
    .order('round_number', { ascending: false })
    .limit(1)

  const nextRound = (existing && existing.length > 0) ? existing[0].round_number + 1 : 1

  const { data: round, error } = await supabase
    .from('supplement_rounds')
    .insert({
      job_id: jobId,
      round_number: nextRound,
      amount: centsToDollars(amountCents),
      amount_cents: amountCents,
      status: 'submitted',
      notes: notes ?? null,
      created_by: userId,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create supplement round: ${error.message}`)

  await logActivity(jobId, userId, 'supplement_round_added', null, `Round ${nextRound}: $${amount}`)

  return round
}

export async function getSupplementRounds(jobId: string) {
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

  const supabase = await createClient()

  const { data: rounds, error } = await supabase
    .from('supplement_rounds')
    .select('*')
    .eq('job_id', jobId)
    .order('round_number', { ascending: true })

  if (error) throw new Error(`Failed to fetch supplement rounds: ${error.message}`)
  return rounds || []
}

export async function updateSupplementRoundStatus(
  roundId: string,
  status: 'submitted' | 'approved' | 'denied',
  notes?: string
) {
  const { userId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Fetch the round and verify ownership through the job
  const { data: round, error: fetchError } = await supabase
    .from('supplement_rounds')
    .select('*, jobs!inner(company_id)')
    .eq('id', roundId)
    .single()

  if (fetchError || !round) throw new Error('Supplement round not found')
  if ((round as any).jobs.company_id !== companyId) throw new Error('Access denied')

  const updatePayload: Record<string, unknown> = { status }
  if (notes !== undefined) updatePayload.notes = notes
  if (status === 'approved') updatePayload.approved_at = new Date().toISOString()
  if (status === 'denied') updatePayload.denied_at = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from('supplement_rounds')
    .update(updatePayload)
    .eq('id', roundId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update supplement round: ${error.message}`)

  await logActivity(
    round.job_id,
    userId,
    'supplement_round_status',
    round.status,
    `Round ${round.round_number}: ${status}`
  )

  return updated
}

export async function getSupplementSummary(jobId: string) {
  const { companyId } = await getUserWithCompany()
  const job = await verifyJobOwnership(jobId, companyId)

  const supabase = await createClient()

  const { data: rounds, error } = await supabase
    .from('supplement_rounds')
    .select('*')
    .eq('job_id', jobId)
    .order('round_number', { ascending: true })

  if (error) throw new Error(`Failed to fetch supplement summary: ${error.message}`)

  // Audit R3-#2: was summing legacy `r.amount` (float dollars) and reading
  // `job.total_amount` — both are dropped by migration 031. Sum cents now,
  // and convert at the boundary so the public return shape stays in dollars
  // for backward compatibility with existing UI consumers.
  const allRounds = rounds || []
  let totalSupplementedCents = 0
  let totalApprovedCents = 0
  let totalDeniedCents = 0

  for (const r of allRounds) {
    const cents = Number((r as { amount_cents?: number | null }).amount_cents ?? 0)
    totalSupplementedCents += cents
    if (r.status === 'approved') totalApprovedCents += cents
    if (r.status === 'denied') totalDeniedCents += cents
  }

  const originalEstimateCents = Number(
    (job as { total_amount_cents?: number | null }).total_amount_cents ?? 0
  )

  return {
    originalEstimate: originalEstimateCents / 100,
    totalSupplemented: totalSupplementedCents / 100,
    totalApproved: totalApprovedCents / 100,
    totalDenied: totalDeniedCents / 100,
    rounds: allRounds,
  }
}

export async function getClaimDocuments(job_id: string): Promise<ClaimDocument[]> {
  const { companyId } = await getUserWithCompany()

  // Verify job belongs to user's company
  await verifyJobOwnership(job_id, companyId)

  const supabase = await createClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .select('claim_documents')
    .eq('id', job_id)
    .eq('company_id', companyId)
    .single()

  if (error) return []

  const docs: ClaimDocument[] = Array.isArray((job as any).claim_documents)
    ? (job as any).claim_documents
    : []

  // Generate fresh signed URLs for documents stored as paths
  if (docs.length > 0) {
    const paths = docs.map(d => d.url).filter(u => !u.startsWith('http'))
    if (paths.length > 0) {
      const { data: signedData } = await supabase.storage
        .from('claim-documents')
        .createSignedUrls(paths, 3600)

      if (signedData) {
        const urlMap = new Map(signedData.map(s => [s.path, s.signedUrl]))
        return docs.map(d => ({
          ...d,
          url: urlMap.get(d.url) || d.url,
        }))
      }
    }
  }

  return docs
}
