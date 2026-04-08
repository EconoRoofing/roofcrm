'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { getUserWithCompany, verifyJobOwnership } from '@/lib/auth-helpers'

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
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('equipment')
    .select(`
      *,
      job:jobs(job_number, customer_name, address),
      user:users(name)
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch equipment: ${error.message}`)
  return (data ?? []) as Equipment[]
}

export async function getEquipmentForJob(jobId: string): Promise<Equipment[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify the job belongs to the user's company
  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!job) throw new Error('Job not found or not in your company')

  const { data, error } = await supabase
    .from('equipment')
    .select(`
      *,
      user:users(name)
    `)
    .eq('current_job_id', jobId)
    .eq('status', 'in_use')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch job equipment: ${error.message}`)
  return (data ?? []) as Equipment[]
}

export async function checkOutEquipment(equipmentId: string, jobId: string): Promise<void> {
  const supabase = await createClient()
  const { userId, companyId } = await getUserWithCompany()

  // Verify both equipment and job belong to user's company
  await verifyJobOwnership(jobId, companyId)

  const { data: updated, error } = await supabase
    .from('equipment')
    .update({
      status: 'in_use',
      current_job_id: jobId,
      current_user_id: userId,
    })
    .eq('id', equipmentId)
    .eq('company_id', companyId)
    .eq('status', 'available')
    .select()
    .maybeSingle()

  if (error || !updated) throw new Error('Equipment is not available for checkout')

  await supabase.from('equipment_logs').insert({
    equipment_id: equipmentId,
    user_id: userId,
    job_id: jobId,
    action: 'checked_out',
  })
}

export async function returnEquipment(equipmentId: string): Promise<void> {
  const { userId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify the equipment belongs to the user's company and is currently in use
  const { data: equipment } = await supabase
    .from('equipment')
    .select('id, status, company_id')
    .eq('id', equipmentId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!equipment) throw new Error('Equipment not found or not in your company')
  if (equipment.status !== 'in_use') throw new Error('Equipment is not currently in use')

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
    user_id: userId,
    action: 'returned',
  })
}

export async function getOverdueEquipment(daysThreshold = 7): Promise<Equipment[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Get all in-use equipment scoped to company
  const { data: inUseEquipment } = await supabase
    .from('equipment')
    .select('*, current_user:users(name), current_job:jobs(job_number, customer_name)')
    .eq('status', 'in_use')
    .eq('company_id', companyId)

  if (!inUseEquipment || inUseEquipment.length === 0) return []

  const threshold = new Date()
  threshold.setDate(threshold.getDate() - daysThreshold)

  // Batch query: get all checkout logs for in-use equipment in one query
  const equipmentIds = inUseEquipment.map(eq => eq.id)
  const { data: allLogs } = await supabase
    .from('equipment_logs')
    .select('equipment_id, created_at')
    .in('equipment_id', equipmentIds)
    .eq('action', 'checked_out')
    .order('created_at', { ascending: false })

  // Group by equipment_id, take the most recent checkout per item
  const lastCheckoutMap = new Map<string, Date>()
  for (const log of allLogs ?? []) {
    if (!lastCheckoutMap.has(log.equipment_id)) {
      lastCheckoutMap.set(log.equipment_id, new Date(log.created_at))
    }
  }

  // Filter to equipment checked out before the threshold
  const overdue = inUseEquipment.filter(eq => {
    const checkoutDate = lastCheckoutMap.get(eq.id)
    return checkoutDate && checkoutDate < threshold
  })

  return overdue as Equipment[]
}

export async function addEquipment(data: {
  name: string
  type: string
  notes?: string
}): Promise<void> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Set company_id from authenticated user's company, not from client data
  const { error } = await supabase.from('equipment').insert({
    name: data.name,
    type: data.type,
    notes: data.notes ?? null,
    status: 'available',
    company_id: companyId,
  })

  if (error) throw new Error(`Failed to add equipment: ${error.message}`)
}
