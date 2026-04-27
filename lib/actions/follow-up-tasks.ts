'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/twilio'
import { getUserWithCompany, verifyJobOwnership } from '@/lib/auth-helpers'
import {
  syncFollowUpToCalendar,
  removeFollowUpFromCalendar,
} from '@/lib/calendar-sync-follow-ups'

export interface FollowUp {
  id: string
  job_id: string
  assigned_to: string
  due_date: string
  note: string
  completed_at: string | null
  created_at: string
  job?: { job_number: string; customer_name: string } | null
  assignee?: { name: string } | null
}

// Called from jobs.ts + automations — add auth since this is exported from 'use server'
export async function createFollowUp(
  jobId: string,
  assignedTo: string,
  dueDate: string,
  note: string
): Promise<FollowUp> {
  const { userId, companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('follow_ups')
    .insert({ job_id: jobId, assigned_to: assignedTo, due_date: dueDate, note })
    .select()
    .single()

  if (error) throw new Error(`Failed to create follow-up: ${error.message}`)

  // Calendar sync: best-effort, doesn't block the primary insert.
  // Stage 2 (2026-04-26): adds an event to the relevant company's jobs
  // calendar at due_date. Caller's userId is used to resolve the Google
  // refresh token; if the caller has no Calendar connected, the sync
  // logs a warning and the follow-up still saves.
  await syncFollowUpToCalendar({
    followUpId: data.id,
    jobId,
    dueDate,
    note,
    userId,
  })

  return data as FollowUp
}

// Returns follow-ups due today and overdue for a specific user
export async function getMyFollowUps(userId: string): Promise<FollowUp[]> {
  const { userId: callerId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify the requested user belongs to the caller's company
  if (userId !== callerId) {
    const { data: targetUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .eq('primary_company_id', companyId)
      .maybeSingle()
    if (!targetUser) throw new Error('User not found or not in your company')
  }

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('follow_ups')
    .select(`
      *,
      job:jobs!follow_ups_job_id_fkey(job_number, customer_name),
      assignee:users!follow_ups_assigned_to_fkey(name)
    `)
    .eq('assigned_to', userId)
    .lte('due_date', today)
    .is('completed_at', null)
    .order('due_date', { ascending: true })

  if (error) throw new Error(`Failed to fetch follow-ups: ${error.message}`)
  return (data ?? []) as FollowUp[]
}

// CRON-ONLY: Returns all follow-ups due today across all users.
// Should only be called from the cron route handler which verifies CRON_SECRET.
export async function getDueFollowUps(): Promise<FollowUp[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // Audit R3-#2: switched join from total_amount → total_amount_cents so
  // this cron survives migration 031.
  const { data, error } = await supabase
    .from('follow_ups')
    .select(`
      *,
      job:jobs!follow_ups_job_id_fkey(job_number, customer_name, address, job_type, total_amount_cents),
      assignee:users!follow_ups_assigned_to_fkey(name, phone_number)
    `)
    .eq('due_date', today)
    .is('completed_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch due follow-ups: ${error.message}`)
  return (data ?? []) as FollowUp[]
}

export async function completeFollowUp(id: string): Promise<void> {
  const { userId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify the follow-up's job belongs to the user's company
  const { data: followUp } = await supabase
    .from('follow_ups')
    .select('id, job:jobs!follow_ups_job_id_fkey(company_id)')
    .eq('id', id)
    .single()

  if (!followUp) throw new Error('Follow-up not found')
  // Supabase nested join types loosely as object | object[] | null; pick out
  // company_id defensively in either shape so we don't lean on `any`.
  const jobRel = followUp.job as { company_id?: string } | { company_id?: string }[] | null
  const jobCompanyId = Array.isArray(jobRel) ? jobRel[0]?.company_id : jobRel?.company_id
  if (jobCompanyId !== companyId) throw new Error('Follow-up not found or access denied')

  const { error } = await supabase
    .from('follow_ups')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Failed to complete follow-up: ${error.message}`)

  // Calendar sync: remove the event when the follow-up is done so it
  // disappears from the calendar (the action is no longer pending).
  // Best-effort; never blocks completion.
  await removeFollowUpFromCalendar(id, userId)
}

// CRON-ONLY: Called by daily cron — sends SMS reminders for today's due follow-ups.
// Should only be called from the cron route handler which verifies CRON_SECRET.
export async function processFollowUpTasks(): Promise<{ sent: number; skipped: number }> {
  const dueFollowUps = await getDueFollowUps()
  let sent = 0
  let skipped = 0

  for (const followUp of dueFollowUps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignee = followUp.assignee as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = followUp.job as any

    const phone = assignee?.phone_number
    if (!phone) { skipped++; continue }

    const customerName = job?.customer_name ?? 'a customer'
    const address = job?.address ?? ''
    const jobType = job?.job_type ? String(job.job_type).replace(/_/g, ' ') : ''
    // Audit R3-#2: format from cents directly via centsToDollars.
    const amountCents = Number(job?.total_amount_cents ?? 0)
    const amount = amountCents > 0 ? `$${(amountCents / 100).toLocaleString()}` : ''

    let message: string
    if (address && jobType && amount) {
      message = `Reminder: Follow up with ${customerName} at ${address} — ${jobType} estimate (${amount}) given 3 days ago.`
    } else {
      message = `Reminder: Follow up with ${customerName} — ${followUp.note}`
    }

    try {
      await sendSMS(phone, message)
      sent++
    } catch {
      skipped++
    }
  }

  return { sent, skipped }
}
