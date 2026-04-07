'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'

export interface Equipment {
  id: string
  name: string
  type: string
  company_id: string | null
  status: 'available' | 'in_use' | 'maintenance'
  current_job_id: string | null
  current_user_id: string | null
  notes: string | null
  created_at: string
  job?: { job_number: string; customer_name: string; address: string } | null
  user?: { name: string } | null
}

export async function getEquipment(): Promise<Equipment[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('equipment')
    .select(`
      *,
      job:jobs(job_number, customer_name, address),
      user:users(name)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch equipment: ${error.message}`)
  return (data ?? []) as Equipment[]
}

export async function getEquipmentForJob(jobId: string): Promise<Equipment[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('equipment')
    .select(`
      *,
      user:users(name)
    `)
    .eq('current_job_id', jobId)
    .eq('status', 'in_use')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch job equipment: ${error.message}`)
  return (data ?? []) as Equipment[]
}

export async function checkOutEquipment(equipmentId: string, jobId: string): Promise<void> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('equipment')
    .update({
      status: 'in_use',
      current_job_id: jobId,
      current_user_id: user.id,
    })
    .eq('id', equipmentId)
    .eq('status', 'available')

  if (error) throw new Error(`Failed to check out equipment: ${error.message}`)

  await supabase.from('equipment_logs').insert({
    equipment_id: equipmentId,
    user_id: user.id,
    job_id: jobId,
    action: 'checked_out',
  })
}

export async function returnEquipment(equipmentId: string): Promise<void> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('equipment')
    .update({
      status: 'available',
      current_job_id: null,
      current_user_id: null,
    })
    .eq('id', equipmentId)

  if (error) throw new Error(`Failed to return equipment: ${error.message}`)

  await supabase.from('equipment_logs').insert({
    equipment_id: equipmentId,
    user_id: user.id,
    action: 'returned',
  })
}

export async function getOverdueEquipment(daysThreshold = 7): Promise<Equipment[]> {
  const supabase = await createClient()
  const threshold = new Date()
  threshold.setDate(threshold.getDate() - daysThreshold)

  const { data } = await supabase
    .from('equipment')
    .select('*, current_user:users(name), current_job:jobs(job_number, customer_name)')
    .eq('status', 'in_use')
    .lt('created_at', threshold.toISOString())

  return (data ?? []) as Equipment[]
}

export async function addEquipment(data: {
  name: string
  type: string
  notes?: string
}): Promise<void> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('equipment').insert({
    name: data.name,
    type: data.type,
    notes: data.notes ?? null,
    status: 'available',
  })

  if (error) throw new Error(`Failed to add equipment: ${error.message}`)
}
