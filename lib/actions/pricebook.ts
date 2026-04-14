'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, requireManager } from '@/lib/auth-helpers'
import {
  dollarsToCents,
  centsToDollars,
  multiplyCents,
  sumCents,
} from '@/lib/money'

export async function getPricebookItems(category?: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  let query = supabase
    .from('pricebook_items')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(200)

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  if (error) {
    console.error('Failed to fetch pricebook items:', error)
    return []
  }

  return data ?? []
}

export async function addPricebookItem(data: {
  name: string
  category?: string
  description?: string
  unit?: string
  base_price: number
  cost?: number
  sort_order?: number
}) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  if (data.base_price < 0) throw new Error('Price must be zero or greater')
  if (!data.name?.trim()) throw new Error('Name is required')

  const basePriceCents = dollarsToCents(data.base_price)
  const costCents = data.cost != null ? dollarsToCents(data.cost) : null

  // Audit R3-#2 follow-up: dropped legacy `base_price` / `cost` dual-writes.
  const { data: item, error } = await supabase
    .from('pricebook_items')
    .insert({
      company_id: companyId,
      name: data.name.trim(),
      category: data.category?.trim() || 'general',
      description: data.description?.trim() || null,
      unit: data.unit?.trim() || 'each',
      base_price_cents: basePriceCents,
      cost_cents: costCents,
      sort_order: data.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to add pricebook item:', error)
    throw new Error('Failed to add pricebook item')
  }

  return item
}

export async function updatePricebookItem(
  id: string,
  data: {
    name?: string
    category?: string
    description?: string
    unit?: string
    base_price?: number
    cost?: number | null
    sort_order?: number
  }
) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  if (data.base_price !== undefined && data.base_price < 0) {
    throw new Error('Price must be zero or greater')
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) updates.name = data.name.trim()
  if (data.category !== undefined) updates.category = data.category.trim()
  if (data.description !== undefined) updates.description = data.description?.trim() || null
  if (data.unit !== undefined) updates.unit = data.unit.trim()
  // Audit R3-#2 follow-up: dropped legacy `base_price` / `cost` dual-writes.
  if (data.base_price !== undefined) {
    updates.base_price_cents = dollarsToCents(data.base_price)
  }
  if (data.cost !== undefined) {
    updates.cost_cents = data.cost == null ? null : dollarsToCents(data.cost)
  }
  if (data.sort_order !== undefined) updates.sort_order = data.sort_order

  const { data: item, error } = await supabase
    .from('pricebook_items')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) {
    console.error('Failed to update pricebook item:', error)
    throw new Error('Failed to update pricebook item')
  }

  return item
}

export async function deletePricebookItem(id: string) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const { error } = await supabase
    .from('pricebook_items')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    console.error('Failed to delete pricebook item:', error)
    throw new Error('Failed to delete pricebook item')
  }

  return true
}

export async function getPricebookCategories() {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data, error } = await supabase
    .from('pricebook_items')
    .select('category')
    .eq('company_id', companyId)
    .eq('is_active', true)

  if (error) {
    console.error('Failed to fetch pricebook categories:', error)
    return []
  }

  // Extract distinct categories
  const categories = [...new Set((data ?? []).map((row) => row.category))].sort()
  return categories
}

export async function applyPricebookToEstimate(
  jobId: string,
  itemIds: Array<{ id: string; quantity: number }>
) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Verify job ownership
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single()

  if (jobError || !job) throw new Error('Job not found or access denied')

  // Audit R3-#2 follow-up: cents-only post-031.
  const ids = itemIds.map((i) => i.id)
  const { data: items, error: itemsError } = await supabase
    .from('pricebook_items')
    .select('id, name, base_price_cents, unit')
    .in('id', ids)
    .eq('company_id', companyId)
    .eq('is_active', true)

  if (itemsError || !items?.length) throw new Error('No valid pricebook items found')

  // Build a quantity lookup
  const qtyMap = new Map(itemIds.map((i) => [i.id, i.quantity]))

  // Calculate line totals and job total in integer cents. Each line is
  // `multiplyCents(unitPriceCents, qty)`, rounded once per line, so the
  // job total is the exact sum of displayed line totals (no float drift).
  const lineTotalsCents: number[] = []
  const lineItems = items.map((item) => {
    const qty = qtyMap.get(item.id) ?? 1
    const unitPriceCents = Number(
      (item as { base_price_cents?: number | null }).base_price_cents ?? 0
    )
    const lineTotalCents = multiplyCents(unitPriceCents, qty)
    lineTotalsCents.push(lineTotalCents)
    return {
      pricebook_item_id: item.id,
      name: item.name,
      unit: item.unit,
      unit_price_cents: unitPriceCents,
      quantity: qty,
      line_total_cents: lineTotalCents,
    }
  })
  const totalCents = sumCents(lineTotalsCents)

  // Audit R3-#2 follow-up: dropped legacy `total_amount` dual-write.
  // R2-#15 company_id scope retained for defense in depth.
  const { error: updateError } = await supabase
    .from('jobs')
    .update({
      total_amount_cents: totalCents,
    })
    .eq('id', jobId)
    .eq('company_id', companyId)

  if (updateError) {
    console.error('Failed to update job estimate:', updateError)
    throw new Error('Failed to apply pricebook to estimate')
  }

  return { total: centsToDollars(totalCents), totalCents, lineItems }
}
