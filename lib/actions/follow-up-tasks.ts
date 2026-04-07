'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/twilio'

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

export async function createFollowUp(
  jobId: string,
  assignedTo: string,
  dueDate: string,
  note: string
): Promise<FollowUp> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('follow_ups')
    .insert({ job_id: jobId, assigned_to: assignedTo, due_date: dueDate, note })
    .select()
    .single()

  if (error) throw new Error(`Failed to create follow-up: ${error.message}`)
  return data as FollowUp
}

// Returns follow-ups due today and overdue for a specific user
export async function getMyFollowUps(userId: string): Promise<FollowUp[]> {
  const supabase = await createClient()
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

// Returns all follow-ups due today across all users (for cron)
export async function getDueFollowUps(): Promise<FollowUp[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('follow_ups')
    .select(`
      *,
      job:jobs!follow_ups_job_id_fkey(job_number, customer_name),
      assignee:users!follow_ups_assigned_to_fkey(name, phone_number)
    `)
    .eq('due_date', today)
    .is('completed_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch due follow-ups: ${error.message}`)
  return (data ?? []) as FollowUp[]
}

export async function completeFollowUp(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('follow_ups')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Failed to complete follow-up: ${error.message}`)
}

// Called by daily cron — sends SMS reminders for today's due follow-ups
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
    const message = `Reminder: Follow up with ${customerName} — ${followUp.note}`

    try {
      await sendSMS(phone, message)
      sent++
    } catch {
      skipped++
    }
  }

  return { sent, skipped }
}
