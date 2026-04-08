'use server'

import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

export async function generatePortalToken(jobId: string): Promise<string> {
  const supabase = await createClient()
  
  // Generate 32-char hex token
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
      scheduled_date,
      company_id,
      companies(id, name)
    `)
    .eq('portal_token', token)
    .single()
  
  if (error || !job) {
    return null
  }
  
  return job as any
}
