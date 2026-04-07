'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/twilio'

// Auto-text templates by status
const STATUS_TEMPLATES: Record<string, (vars: TemplateVars) => string> = {
  estimate_scheduled: (v) =>
    `Hi ${v.customerName}, your roofing estimate with ${v.companyName} is confirmed for ${v.date}. ${v.repName} will be your estimator. If you need to reschedule, reply to this text or call us at ${v.officePhone}.`,

  pending: (v) =>
    `Hi ${v.customerName}, thanks for meeting with ${v.repName} from ${v.companyName}. Your estimate is ready — check your email for the full proposal. Feel free to reply with any questions!`,

  sold: (v) =>
    `Great news ${v.customerName}! Your ${v.jobType} project with ${v.companyName} is confirmed. We'll be in touch soon to schedule your installation date.`,

  scheduled: (v) =>
    `Hi ${v.customerName}, your ${v.jobType} with ${v.companyName} is scheduled for ${v.date}. Our crew will arrive between 7-8 AM. Please clear the driveway for our trucks and dumpster. Questions? Call ${v.officePhone}.`,

  in_progress: (v) =>
    `Hi ${v.customerName}, our ${v.companyName} crew has arrived and started work on your ${v.jobType} at ${v.address}. We'll text you when the job is complete.`,

  completed: (v) =>
    `Hi ${v.customerName}, your ${v.jobType} is complete! Thank you for choosing ${v.companyName}. Your ${v.warrantyYears}-year warranty is now active. We'll send your warranty details by email.`,
}

interface TemplateVars {
  customerName: string
  companyName: string
  repName: string
  jobType: string
  address: string
  date: string
  officePhone: string      // company phone number
  warrantyYears: string    // for completion message
}

export interface Message {
  id: string
  job_id: string
  direction: 'inbound' | 'outbound'
  channel: 'sms' | 'email'
  from_number: string | null
  to_number: string | null
  body: string
  status: string
  auto_generated: boolean
  created_at: string
}

export async function sendStatusUpdateSMS(jobId: string, newStatus: string): Promise<boolean> {
  const template = STATUS_TEMPLATES[newStatus]
  if (!template) return false

  const supabase = await createClient()

  // Check do-not-text flag
  const { data: jobCheck } = await supabase
    .from('jobs')
    .select('do_not_text')
    .eq('id', jobId)
    .single()

  if ((jobCheck as { do_not_text?: boolean } | null)?.do_not_text) return false

  const { data: job, error } = await supabase
    .from('jobs')
    .select(`
      id, phone, customer_name, address, city, job_type, scheduled_date,
      warranty_manufacturer_years,
      company:companies(name, phone),
      rep:users!jobs_rep_id_fkey(name)
    `)
    .eq('id', jobId)
    .single()

  if (error || !job) return false

  const phone = job.phone
  if (!phone) return false

  const companyRaw = job.company as unknown
  const repRaw = job.rep as unknown
  const companyName =
    companyRaw && typeof companyRaw === 'object' && 'name' in companyRaw
      ? String((companyRaw as { name: unknown }).name)
      : 'your contractor'
  const repName =
    repRaw && typeof repRaw === 'object' && 'name' in repRaw
      ? String((repRaw as { name: unknown }).name)
      : 'your rep'
  const jobType = (job.job_type as string).replace(/_/g, ' ')
  const address = [job.address, job.city].filter(Boolean).join(', ')
  const date = job.scheduled_date
    ? new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : 'a scheduled date'
  const officePhone =
    companyRaw && typeof companyRaw === 'object' && 'phone' in companyRaw
      ? String((companyRaw as { phone: unknown }).phone ?? '')
      : ''
  const warrantyYears = (job as { warranty_manufacturer_years?: number | null }).warranty_manufacturer_years
    ? String((job as { warranty_manufacturer_years: number }).warranty_manufacturer_years)
    : '25'

  const vars: TemplateVars = {
    customerName: job.customer_name,
    companyName,
    repName,
    jobType,
    address,
    date,
    officePhone,
    warrantyYears,
  }

  const body = template(vars)
  const result = await sendSMS(phone, body)

  // If Twilio flagged the number as opted out, mark it in our system
  if (result.error === 'opted_out') {
    await supabase.from('jobs').update({ do_not_text: true }).eq('id', jobId)
  }

  // Store message record regardless of send result (so we have a log)
  await supabase.from('messages').insert({
    job_id: jobId,
    direction: 'outbound',
    channel: 'sms',
    to_number: phone,
    body,
    status: result.success ? 'sent' : 'failed',
    auto_generated: true,
  })

  return result.success
}

export async function sendCustomMessage(jobId: string, body: string): Promise<boolean> {
  const supabase = await createClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .select('phone')
    .eq('id', jobId)
    .single()

  if (error || !job?.phone) return false

  const result = await sendSMS(job.phone, body)

  await supabase.from('messages').insert({
    job_id: jobId,
    direction: 'outbound',
    channel: 'sms',
    to_number: job.phone,
    body,
    status: result.success ? 'sent' : 'failed',
    auto_generated: false,
  })

  return result.success
}

export async function getJobMessages(jobId: string): Promise<Message[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  if (error) return []

  return (data ?? []) as Message[]
}
