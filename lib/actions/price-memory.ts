'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'
import { readMoneyFromRow, centsToDollars } from '@/lib/money'

/**
 * Returns the per-square price from the last completed job with the given material.
 * Used by the estimate wizard to pre-fill pricing fields.
 *
 * Both values are returned as DOLLARS (UI inputs accept dollars). The
 * division is done in cents first to avoid float drift, then converted.
 */
export async function getLastUsedPrices(
  material: string
): Promise<{ roofAmount?: number; total?: number } | null> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data } = await supabase
    .from('jobs')
    .select('roof_amount, total_amount, roof_amount_cents, total_amount_cents, squares')
    .eq('company_id', companyId)
    .eq('material', material)
    .not('total_amount_cents', 'is', null)
    .gt('total_amount_cents', 0)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data || !data.squares || data.squares === 0) return null

  const roofCents = readMoneyFromRow(
    (data as { roof_amount_cents?: number | null }).roof_amount_cents,
    data.roof_amount
  )
  const totalCents = readMoneyFromRow(
    (data as { total_amount_cents?: number | null }).total_amount_cents,
    data.total_amount
  )

  return {
    roofAmount: centsToDollars(Math.round(roofCents / data.squares)),
    total: centsToDollars(Math.round(totalCents / data.squares)),
  }
}

/**
 * Returns specs and pricing from a previous job at the same address.
 * Used to offer "Use previous specs?" when opening the estimate wizard.
 */
export async function getPreviousJobAtAddress(
  address: string
): Promise<{ specs: unknown; pricing: unknown } | null> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const escaped = address.replace(/%/g, '\\%').replace(/_/g, '\\_')

  const { data } = await supabase
    .from('jobs')
    .select(
      'material, material_color, felt_type, squares, layers, ridge_type, ventilation, roof_amount, gutters_amount, options_amount, total_amount, roof_amount_cents, gutters_amount_cents, options_amount_cents, total_amount_cents, estimate_specs, warranty_manufacturer_years, warranty_workmanship_years'
    )
    .eq('company_id', companyId)
    .ilike('address', `%${escaped}%`)
    .not('total_amount_cents', 'is', null)
    .gt('total_amount_cents', 0)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) return null
  return { specs: (data as Record<string, unknown>).estimate_specs, pricing: data }
}
