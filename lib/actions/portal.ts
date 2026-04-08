'use server'

import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

export async function generatePortalToken(jobId: string, forceRegenerate = false): Promise<string> {
  const supabase = await createClient()

  // If not forcing, return existing token to avoid invalidating active portal sessions
  if (!forceRegenerate) {
    const { data: existing } = await supabase
      .from('jobs')
      .select('portal_token')
      .eq('id', jobId)
      .single()

    if (existing?.portal_token) return existing.portal_token
  }

  // Generate new 32-char hex token
  const token = randomBytes(16).toString('hex')

  const { error } = await supabase
    .from('jobs')
    .update({ portal_token: token })
    .eq('id', jobId)

  if (error) {
    console.error('Failed to save portal token:', error)
    throw new Error('Failed to generate portal token')
  }

  return token
}

export async function getJobByPortalToken(token: string) {
  const supabase = await createClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .select(`
      id,
      job_number,
      status,
      customer_name,
      address,
      city,
      scheduled_date,
      completed_date,
      companies(name, phone, color, address)
    `)
    .eq('portal_token', token)
    .not('status', 'eq', 'cancelled')
    .single()

  if (error || !job) {
    return null
  }

  return job as any
}

export async function getPortalInvoices(token: string) {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('portal_token', token)
    .single()

  if (!job) return []

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, type, total_amount, status, due_date, payment_link, pdf_url')
    .eq('job_id', job.id)
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })

  return invoices ?? []
}

export async function getPortalMessages(token: string) {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('portal_token', token)
    .single()

  if (!job) return []

  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, body, created_at, channel')
    .eq('job_id', job.id)
    .order('created_at', { ascending: true })

  return messages ?? []
}

export async function sendPortalMessage(token: string, messageText: string): Promise<boolean> {
  const supabase = await createClient()

  if (!messageText.trim()) return false

  const { data: job } = await supabase
    .from('jobs')
    .select('id, customer_name, companies(name)')
    .eq('portal_token', token)
    .single()

  if (!job) return false

  const companyName = (job as any).companies?.name || 'the team'

  await supabase.from('messages').insert({
    job_id: job.id,
    direction: 'inbound',
    channel: 'portal',
    body: messageText.trim(),
    status: 'received',
    auto_generated: false,
    from_number: null,
    to_number: null,
  })

  return true
}

export async function getPortalPhotos(token: string) {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, address, city, state, companycam_project_id')
    .eq('portal_token', token)
    .single()

  if (!job) return []

  // If we have a stored CompanyCam project ID use it directly
  const { getProjectPhotos, searchProjectsByAddress } = await import('@/lib/companycam')

  let projectId = (job as any).companycam_project_id as string | undefined

  if (!projectId) {
    const addressStr = [(job as any).address, (job as any).city, (job as any).state]
      .filter(Boolean)
      .join(', ')
    if (!addressStr) return []

    const { searchProjectsByAddress: search } = await import('@/lib/companycam')
    const projects = await search(addressStr)
    projectId = projects[0]?.id
  }

  if (!projectId) return []

  return getProjectPhotos(projectId, 30)
}
