'use server'

import { createClient } from '@/lib/supabase/server'
import { calculateMaterials, type MaterialCalcInput } from '@/lib/material-calculator'
import { getUserWithCompany, verifyJobOwnership } from '@/lib/auth-helpers'
import type { MaterialList } from '@/lib/types/database'

export async function generateMaterialList(jobId: string): Promise<MaterialList> {
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)
  const supabase = await createClient()

  // Fetch job data
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, squares, material, felt_type, layers, job_type, estimate_specs, gutters_length, pitch')
    .eq('id', jobId)
    .single()

  if (jobError || !job) throw new Error('Job not found')

  // Build calc input from job fields
  // Pitch: prefer direct job field, fall back to estimate_specs
  const pitch = (job as any).pitch ?? job.estimate_specs?.pitch ?? undefined

  const input: MaterialCalcInput = {
    squares: job.squares ?? 0,
    job_type: job.job_type,
    material: job.material ?? undefined,
    felt_type: job.felt_type ?? undefined,
    layers: job.layers ?? undefined,
    gutter_length_ft: job.gutters_length ?? undefined,
    ridge_vent_ft: job.estimate_specs?.ridge_vent_ft ?? undefined,
    pitch,
  }

  const items = calculateMaterials(input)

  // Upsert — one material list per job
  const { data: existing } = await supabase
    .from('material_lists')
    .select('id')
    .eq('job_id', jobId)
    .maybeSingle()

  let result: MaterialList | null = null

  if (existing) {
    const { data, error } = await supabase
      .from('material_lists')
      .update({ items, waste_factor: input.waste_factor ?? 0.10 })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw new Error(`Failed to update material list: ${error.message}`)
    result = data as MaterialList
  } else {
    const { data, error } = await supabase
      .from('material_lists')
      .insert({
        job_id: jobId,
        items,
        waste_factor: input.waste_factor ?? 0.10,
        total_estimated_cost: 0,
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to create material list: ${error.message}`)
    result = data as MaterialList
  }

  return result!
}

export async function getMaterialList(jobId: string): Promise<MaterialList | null> {
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('material_lists')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch material list: ${error.message}`)

  return (data as MaterialList) ?? null
}

export async function exportMaterialListCSV(jobId: string): Promise<string> {
  // Auth is handled by getMaterialList -> verifyJobOwnership
  const list = await getMaterialList(jobId)

  if (!list || !list.items || list.items.length === 0) {
    return 'Material,Quantity,Unit,Formula\n'
  }

  const header = 'Material,Quantity,Unit,Formula'
  const rows = list.items.map((item) => {
    const name = `"${item.name.replace(/"/g, '""')}"`
    const formula = `"${item.formula.replace(/"/g, '""')}"`
    return `${name},${item.quantity},${item.unit},${formula}`
  })

  return [header, ...rows].join('\n')
}
