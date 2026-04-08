'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { logActivity } from '@/lib/actions/activity'

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
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  // Runtime validation of the status value
  if (!CLAIM_STATUSES.includes(new_status)) throw new Error('Invalid claim status')

  // Fetch current job and claim_status together
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, insurance_claim, claim_number, company_id, claim_status')
    .eq('id', job_id)
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

  // Get current claim timeline from notes
  const timeline: ClaimTimeline[] = []
  if (job.claim_number) {
    // Parse existing timeline from metadata if available
    // For now, just track status changes in activity logs
  }

  // Add new timeline entry
  const newEntry: ClaimTimeline = {
    status: new_status,
    timestamp: new Date().toISOString(),
    notes: notes,
  }

  // Update job status based on claim progression
  let jobStatus = 'pending'
  if (new_status === 'approved') jobStatus = 'sold'
  if (new_status === 'done') jobStatus = 'completed'

  // Update claim_status + conditionally update job status (do NOT touch notes)
  const updatePayload: Record<string, unknown> = {
    claim_status: new_status,  // Always persist the new claim status
  }
  if (new_status === 'approved') updatePayload.status = 'sold'
  if (new_status === 'done') updatePayload.status = 'completed'

  const { data: updatedJob, error: updateError } = await supabase
    .from('jobs')
    .update(updatePayload)
    .eq('id', job_id)
    .select()
    .single()

  if (updateError) throw new Error(`Failed to update claim status: ${updateError.message}`)

  // Log activity for audit trail
  await logActivity(job_id, user?.id ?? null, 'insurance_claim_update', '', new_status)

  return {
    job: updatedJob,
    timeline_entry: newEntry,
  }
}

export async function getClaimTimeline(job_id: string) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  // Fetch activity logs for this job filtered by insurance_claim_update
  const { data: activities, error } = await supabase
    .from('activity_logs')
    .select('id, action_type, old_value, new_value, created_at, user_id')
    .eq('job_id', job_id)
    .eq('action_type', 'insurance_claim_update')
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
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, customer_name, claim_number, insurance_company, adjuster_name, adjuster_phone, supplement_amount, notes')
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
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const payload: Record<string, unknown> = {}
  if (adjuster_name !== undefined) payload.adjuster_name = adjuster_name
  if (adjuster_phone !== undefined) payload.adjuster_phone = adjuster_phone
  if (adjuster_email !== undefined) payload.adjuster_email = adjuster_email

  const { data: job, error } = await supabase
    .from('jobs')
    .update(payload)
    .eq('id', job_id)
    .select()
    .single()

  if (error) throw new Error(`Failed to update adjuster info: ${error.message}`)
  return job
}

export async function updateSupplementAmount(job_id: string, amount: number) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')
  if (amount < 0) throw new Error('Supplement amount cannot be negative')
  if (amount > 500000) throw new Error('Supplement amount exceeds maximum ($500,000)')

  const { data: job, error } = await supabase
    .from('jobs')
    .update({ supplement_amount: amount })
    .eq('id', job_id)
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
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  // Get all active insurance claims (not done)
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, claim_status')
    .eq('insurance_claim', true)
    .neq('claim_status', 'done')
    .neq('status', 'cancelled')

  if (error || !jobs) return []

  // For each job, find last claim-related activity
  const results: Array<{ jobId: string; jobNumber: string; customerName: string; claimStatus: string; daysSinceLastUpdate: number }> = []

  for (const job of jobs) {
    const { data: lastActivity } = await supabase
      .from('activity_log')
      .select('created_at')
      .eq('job_id', job.id)
      .eq('action', 'insurance_claim_update')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const lastUpdateDate = lastActivity?.created_at
      ? new Date(lastActivity.created_at)
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
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Fetch current documents
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('claim_documents')
    .eq('id', job_id)
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

  if (error) throw new Error(`Failed to add document: ${error.message}`)

  await logActivity(job_id, user.id, 'claim_document_added', document.stage, document.name)

  return updated
}

export async function getClaimDocuments(job_id: string): Promise<ClaimDocument[]> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: job, error } = await supabase
    .from('jobs')
    .select('claim_documents')
    .eq('id', job_id)
    .single()

  if (error) return []

  const docs = (job as any).claim_documents
  return Array.isArray(docs) ? docs : []
}
