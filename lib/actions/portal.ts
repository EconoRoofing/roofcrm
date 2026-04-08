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
      job_number,
      status,
      customer_name,
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
