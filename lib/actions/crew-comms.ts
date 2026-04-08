'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, requireManager, verifyJobOwnership } from '@/lib/auth-helpers'
import { getDailyDispatchSummary } from '@/lib/actions/scheduling'
import { sendSMS } from '@/lib/twilio'
import { logActivity } from '@/lib/actions/activity'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DispatchResult {
  sent: number
  skipped: number
  errors: number
}

interface BulkMessageResult {
  sent: number
  skipped: number
}

interface JobUpdateResult {
  crewNotified: boolean
  customerNotified: boolean
}

interface CrewContact {
  id: string
  name: string
  phone: string | null
  do_not_text: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ─── 1. Daily Dispatch SMS ───────────────────────────────────────────────────

export async function sendDailyDispatchSMS(
  date: string
): Promise<DispatchResult> {
  const supabase = await createClient()
  const { userId, role, companyId } = await getUserWithCompany()
  requireManager(role)

  const dispatch = await getDailyDispatchSummary(date)
  const friendlyDate = formatDate(date)

  // Fetch phone + do_not_text for all crew in the company
  const { data: crewProfiles } = await supabase
    .from('users')
    .select('id, name, phone, do_not_text')
    .eq('role', 'crew')
    .eq('primary_company_id', companyId)

  const phoneMap = new Map<string, { phone: string | null; doNotText: boolean; name: string }>()
  for (const p of crewProfiles ?? []) {
    phoneMap.set(p.id, {
      phone: p.phone ?? null,
      doNotText: !!(p as any).do_not_text,
      name: p.name,
    })
  }

  let sent = 0
  let skipped = 0
  let errors = 0

  for (const crew of dispatch.crews) {
    if (crew.jobs.length === 0) continue

    const profile = phoneMap.get(crew.crewId)
    if (!profile?.phone || profile.doNotText) {
      skipped++
      continue
    }

    // Build the schedule message
    const jobLines = crew.jobs.map((j, i) => {
      const addr = [j.address, j.city].filter(Boolean).join(', ')
      return `${i + 1}. ${j.customerName} - ${addr}`
    })

    const body = [
      `Good morning ${profile.name}! Your jobs for ${friendlyDate}:`,
      ...jobLines,
      'Reply STOP to opt out.',
    ].join('\n')

    const result = await sendSMS(profile.phone, body)

    if (result.success) {
      sent++
      // Log against the first job for audit trail
      await logActivity(crew.jobs[0].jobId, userId, 'dispatch_sms_sent', null, `Sent daily dispatch to ${profile.name}`)
    } else {
      errors++
    }
  }

  return { sent, skipped, errors }
}

// ─── 2. Custom Crew Message ──────────────────────────────────────────────────

export async function sendCrewMessage(
  crewIds: string[],
  message: string
): Promise<BulkMessageResult> {
  const supabase = await createClient()
  const { userId, role, companyId } = await getUserWithCompany()
  requireManager(role)

  const trimmed = message.trim()
  if (!trimmed) throw new Error('Message cannot be empty')
  if (trimmed.length > 320) throw new Error('Message exceeds 320 character limit (2 SMS segments)')
  if (crewIds.length === 0) throw new Error('No crew members selected')

  // Fetch crew profiles scoped to company
  const { data: crewProfiles } = await supabase
    .from('users')
    .select('id, name, phone, do_not_text')
    .in('id', crewIds)
    .eq('primary_company_id', companyId)

  let sent = 0
  let skipped = 0

  for (const crew of crewProfiles ?? []) {
    if (!crew.phone || (crew as any).do_not_text) {
      skipped++
      continue
    }

    const result = await sendSMS(crew.phone, trimmed)
    if (result.success) {
      sent++
    } else {
      skipped++
    }
  }

  return { sent, skipped }
}

// ─── 3. Job Update to Crew + Customer ────────────────────────────────────────

export async function sendJobUpdateToCrewAndCustomer(
  jobId: string,
  message: string
): Promise<JobUpdateResult> {
  const supabase = await createClient()
  const { userId, companyId } = await getUserWithCompany()

  const trimmed = message.trim()
  if (!trimmed) throw new Error('Message cannot be empty')

  const job = await verifyJobOwnership(jobId, companyId)

  let crewNotified = false
  let customerNotified = false

  // Notify assigned crew member
  if (job.assigned_crew_id) {
    const { data: crewProfile } = await supabase
      .from('users')
      .select('id, name, phone, do_not_text')
      .eq('id', job.assigned_crew_id)
      .single()

    if (crewProfile?.phone && !(crewProfile as any).do_not_text) {
      const result = await sendSMS(crewProfile.phone, trimmed)
      crewNotified = result.success
    }
  }

  // Notify customer
  if (job.phone && !job.do_not_text) {
    const result = await sendSMS(job.phone, trimmed)
    customerNotified = result.success
  }

  // Audit log
  const targets = [
    crewNotified ? 'crew' : null,
    customerNotified ? 'customer' : null,
  ].filter(Boolean).join(', ')

  await logActivity(
    jobId,
    userId,
    'job_update_sms',
    null,
    targets ? `Notified: ${targets}` : 'No recipients reached'
  )

  return { crewNotified, customerNotified }
}

// ─── 4. Crew Contact List ────────────────────────────────────────────────────

export async function getCrewContactList(): Promise<CrewContact[]> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data, error } = await supabase
    .from('users')
    .select('id, name, phone, do_not_text')
    .eq('role', 'crew')
    .eq('primary_company_id', companyId)
    .order('name', { ascending: true })

  if (error) throw new Error('Failed to fetch crew contacts')

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone ?? null,
    do_not_text: !!(row as any).do_not_text,
  }))
}
