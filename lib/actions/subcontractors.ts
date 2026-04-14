'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, requireManager } from '@/lib/auth-helpers'
import { dollarsToCents, centsToDollars } from '@/lib/money'

// ─── Subcontractor CRUD ─────────────────────────────────────────────────────

export async function getSubcontractors() {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data, error } = await supabase
    .from('subcontractors')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name')
    .limit(200)

  if (error) throw new Error('Failed to fetch subcontractors')
  return data ?? []
}

interface SubcontractorData {
  name: string
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  specialty?: string | null
  license_number?: string | null
  insurance_expiry?: string | null
  notes?: string | null
}

export async function addSubcontractor(data: SubcontractorData) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const { data: sub, error } = await supabase
    .from('subcontractors')
    .insert({ ...data, company_id: companyId })
    .select()
    .single()

  if (error) throw new Error('Failed to add subcontractor')
  return sub
}

export async function updateSubcontractor(id: string, data: Partial<SubcontractorData>) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const { data: sub, error } = await supabase
    .from('subcontractors')
    .update(data)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw new Error('Failed to update subcontractor')
  return sub
}

export async function deleteSubcontractor(id: string) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const { error } = await supabase
    .from('subcontractors')
    .update({ is_active: false })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) throw new Error('Failed to deactivate subcontractor')
  return { success: true }
}

// ─── Job ↔ Subcontractor Assignments ────────────────────────────────────────

export async function assignSubToJob(
  jobId: string,
  subId: string,
  scopeOfWork?: string,
  agreedAmount?: number
) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

  // Verify sub belongs to this company
  const { data: sub, error: subError } = await supabase
    .from('subcontractors')
    .select('id')
    .eq('id', subId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .single()

  if (subError || !sub) throw new Error('Subcontractor not found or access denied')

  const agreedAmountCents = agreedAmount != null ? dollarsToCents(agreedAmount) : null

  const { data: assignment, error } = await supabase
    .from('job_subcontractors')
    .insert({
      job_id: jobId,
      subcontractor_id: subId,
      scope_of_work: scopeOfWork ?? null,
      agreed_amount: agreedAmountCents == null ? null : centsToDollars(agreedAmountCents),
      agreed_amount_cents: agreedAmountCents,
    })
    .select()
    .single()

  if (error) throw new Error('Failed to assign subcontractor to job')
  return assignment
}

export async function getJobSubcontractors(jobId: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

  const { data, error } = await supabase
    .from('job_subcontractors')
    .select(`
      id,
      scope_of_work,
      agreed_amount,
      status,
      started_at,
      completed_at,
      created_at,
      subcontractor:subcontractors(id, name, contact_name, phone, email, specialty)
    `)
    .eq('job_id', jobId)
    .order('created_at')

  if (error) throw new Error('Failed to fetch job subcontractors')
  return data ?? []
}

const VALID_SUB_TRANSITIONS: Record<string, string[]> = {
  assigned: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
}

export async function updateJobSubStatus(
  assignmentId: string,
  status: string,
  notes?: string
) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Fetch assignment + verify through job ownership
  const { data: assignment, error: fetchError } = await supabase
    .from('job_subcontractors')
    .select('id, job_id, status')
    .eq('id', assignmentId)
    .single()

  if (fetchError || !assignment) throw new Error('Assignment not found')
  await verifyJobOwnership(assignment.job_id, companyId)

  // Validate state transition
  const allowed = VALID_SUB_TRANSITIONS[assignment.status] ?? []
  if (!allowed.includes(status)) {
    throw new Error(`Cannot transition from "${assignment.status}" to "${status}"`)
  }

  const updates: Record<string, unknown> = { status }
  if (status === 'in_progress') updates.started_at = new Date().toISOString()
  if (status === 'completed') updates.completed_at = new Date().toISOString()

  // Append notes to scope_of_work if provided
  if (notes) {
    const { data: current } = await supabase
      .from('job_subcontractors')
      .select('scope_of_work')
      .eq('id', assignmentId)
      .single()

    const existing = current?.scope_of_work ?? ''
    updates.scope_of_work = existing ? `${existing}\n---\n${notes}` : notes
  }

  const { data: updated, error } = await supabase
    .from('job_subcontractors')
    .update(updates)
    .eq('id', assignmentId)
    .select()
    .single()

  if (error) throw new Error('Failed to update assignment status')
  return updated
}

// ─── Subcontractor History ──────────────────────────────────────────────────

export async function getSubcontractorHistory(subId: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Verify sub belongs to this company
  const { data: sub, error: subError } = await supabase
    .from('subcontractors')
    .select('id')
    .eq('id', subId)
    .eq('company_id', companyId)
    .single()

  if (subError || !sub) throw new Error('Subcontractor not found or access denied')

  const { data, error } = await supabase
    .from('job_subcontractors')
    .select(`
      id,
      scope_of_work,
      agreed_amount,
      status,
      started_at,
      completed_at,
      created_at,
      job:jobs(id, job_number, customer_name, address, city, status)
    `)
    .eq('subcontractor_id', subId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error('Failed to fetch subcontractor history')
  return data ?? []
}
