'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, requireManager } from '@/lib/auth-helpers'

// ─── Job-Level Profitability ─────────────────────────────────────────────────

export async function getJobProfitability(jobId: string): Promise<{
  revenue: { invoiced: number; paid: number; outstanding: number }
  costs: { labor: number; materials: number; equipment: number; total: number }
  profit: { gross: number; margin: number }
  breakdown: {
    laborHours: number
    laborRate: number
    materialCost: number
    equipmentCost: number
  }
}> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

  // ── Revenue: sum all invoices for this job ──
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount, paid_amount, status')
    .eq('job_id', jobId)

  let invoiced = 0
  let paid = 0
  for (const inv of invoices ?? []) {
    if (inv.status !== 'cancelled') {
      invoiced += Number(inv.total_amount ?? 0)
    }
    if (inv.status === 'paid') {
      paid += Number(inv.paid_amount ?? 0)
    }
  }
  const outstanding = invoiced - paid

  // ── Labor costs: sum time_entries total_cost for this job ──
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('total_hours, total_cost, hourly_rate')
    .eq('job_id', jobId)
    .not('clock_out', 'is', null)

  let laborCost = 0
  let laborHours = 0
  let rateSum = 0
  let rateCount = 0
  for (const te of timeEntries ?? []) {
    laborCost += Number(te.total_cost ?? 0)
    laborHours += Number(te.total_hours ?? 0)
    rateSum += Number(te.hourly_rate ?? 0)
    rateCount++
  }
  const avgLaborRate = rateCount > 0 ? rateSum / rateCount : 0

  // ── Material costs: from material_lists + purchase_orders ──
  const [{ data: materialLists }, { data: purchaseOrders }] = await Promise.all([
    supabase
      .from('material_lists')
      .select('total_estimated_cost')
      .eq('job_id', jobId),
    supabase
      .from('purchase_orders')
      .select('total_estimated_cost, status')
      .eq('job_id', jobId),
  ])

  let materialCost = 0
  for (const ml of materialLists ?? []) {
    materialCost += Number(ml.total_estimated_cost ?? 0)
  }
  // Add purchase orders that aren't drafts (actual orders placed)
  for (const po of purchaseOrders ?? []) {
    if (po.status !== 'draft') {
      materialCost += Number(po.total_estimated_cost ?? 0)
    }
  }

  // ── Equipment costs: count checkout days from equipment_logs ──
  // Equipment_logs don't have a cost field, so we estimate based on checkout duration.
  // For now, equipment cost = 0 since the schema has no daily_rate on equipment.
  // This is a placeholder for future enhancement when equipment rental rates are added.
  const equipmentCost = 0

  // ── Profit calculations ──
  const totalCosts = laborCost + materialCost + equipmentCost
  const grossProfit = paid - totalCosts
  const rawMargin = paid > 0 ? (grossProfit / paid) * 100 : 0
  const margin = Math.max(-999, Math.min(100, rawMargin)) // Clamp to reasonable range

  return {
    revenue: {
      invoiced: round2(invoiced),
      paid: round2(paid),
      outstanding: round2(outstanding),
    },
    costs: {
      labor: round2(laborCost),
      materials: round2(materialCost),
      equipment: round2(equipmentCost),
      total: round2(totalCosts),
    },
    profit: {
      gross: round2(grossProfit),
      margin: round2(margin),
    },
    breakdown: {
      laborHours: round2(laborHours),
      laborRate: round2(avgLaborRate),
      materialCost: round2(materialCost),
      equipmentCost: round2(equipmentCost),
    },
  }
}

// ─── Company-Wide Profitability Summary ──────────────────────────────────────

export async function getCompanyProfitSummary(): Promise<{
  totalRevenue: number
  totalCosts: number
  grossProfit: number
  averageMargin: number
  jobCount: number
  topJobs: Array<{ jobNumber: string; customerName: string; profit: number; margin: number }>
  bottomJobs: Array<{ jobNumber: string; customerName: string; profit: number; margin: number }>
}> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Get recent company jobs (bounded to prevent massive queries)
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name')
    .eq('company_id', companyId)
    .in('status', ['sold', 'scheduled', 'in_progress', 'completed'])
    .order('created_at', { ascending: false })
    .limit(500)

  if (!jobs || jobs.length === 0) {
    return {
      totalRevenue: 0,
      totalCosts: 0,
      grossProfit: 0,
      averageMargin: 0,
      jobCount: 0,
      topJobs: [],
      bottomJobs: [],
    }
  }

  const jobIds = jobs.map((j) => j.id)

  // Batch-fetch all invoices, time entries, material lists, and POs for company jobs
  const [
    { data: allInvoices },
    { data: allTimeEntries },
    { data: allMaterialLists },
    { data: allPurchaseOrders },
  ] = await Promise.all([
    supabase
      .from('invoices')
      .select('job_id, total_amount, paid_amount, status')
      .in('job_id', jobIds),
    supabase
      .from('time_entries')
      .select('job_id, total_cost')
      .in('job_id', jobIds)
      .not('clock_out', 'is', null),
    supabase
      .from('material_lists')
      .select('job_id, total_estimated_cost')
      .in('job_id', jobIds),
    supabase
      .from('purchase_orders')
      .select('job_id, total_estimated_cost, status')
      .in('job_id', jobIds),
  ])

  // Build per-job maps
  const revenueMap = new Map<string, number>()
  const costMap = new Map<string, number>()

  // Revenue per job (paid invoices only)
  for (const inv of allInvoices ?? []) {
    if (inv.status === 'paid') {
      revenueMap.set(inv.job_id, (revenueMap.get(inv.job_id) ?? 0) + Number(inv.paid_amount ?? 0))
    }
  }

  // Labor costs per job
  for (const te of allTimeEntries ?? []) {
    costMap.set(te.job_id, (costMap.get(te.job_id) ?? 0) + Number(te.total_cost ?? 0))
  }

  // Material costs per job
  for (const ml of allMaterialLists ?? []) {
    costMap.set(ml.job_id, (costMap.get(ml.job_id) ?? 0) + Number(ml.total_estimated_cost ?? 0))
  }

  // Purchase order costs per job (non-draft)
  for (const po of allPurchaseOrders ?? []) {
    if (po.status !== 'draft') {
      costMap.set(po.job_id, (costMap.get(po.job_id) ?? 0) + Number(po.total_estimated_cost ?? 0))
    }
  }

  // Calculate per-job profitability
  type JobProfit = { jobNumber: string; customerName: string; profit: number; margin: number }
  const jobProfits: JobProfit[] = []
  let totalRevenue = 0
  let totalCosts = 0

  for (const job of jobs) {
    const rev = revenueMap.get(job.id) ?? 0
    const cost = costMap.get(job.id) ?? 0

    // Only include jobs that have revenue or costs
    if (rev === 0 && cost === 0) continue

    const profit = rev - cost
    const margin = rev > 0 ? (profit / rev) * 100 : 0

    totalRevenue += rev
    totalCosts += cost

    jobProfits.push({
      jobNumber: job.job_number ?? '',
      customerName: job.customer_name ?? '',
      profit: round2(profit),
      margin: round2(margin),
    })
  }

  const grossProfit = totalRevenue - totalCosts
  const averageMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // Sort for top/bottom 5
  const sorted = [...jobProfits].sort((a, b) => b.profit - a.profit)
  const topJobs = sorted.slice(0, 5)
  const bottomJobs = sorted.slice(-5).reverse()

  return {
    totalRevenue: round2(totalRevenue),
    totalCosts: round2(totalCosts),
    grossProfit: round2(grossProfit),
    averageMargin: round2(averageMargin),
    jobCount: jobProfits.length,
    topJobs,
    bottomJobs,
  }
}

// ─── Sales Commission Tracking ──────────────────────────────────────────────

export async function getRepCommissions(
  startDate?: string,
  endDate?: string
): Promise<
  Array<{
    repId: string
    repName: string
    totalRevenue: number
    commissionAmount: number
    jobCount: number
    avgDealSize: number
  }>
> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Fetch sold/completed jobs for the company
  let query = supabase
    .from('jobs')
    .select('id, rep_id, total_amount, commission_amount, status, completed_date')
    .eq('company_id', companyId)
    .in('status', ['sold', 'completed'])

  if (startDate) query = query.gte('completed_date', startDate)
  if (endDate) query = query.lte('completed_date', endDate)

  const { data: jobs, error } = await query
  if (error) throw new Error('Failed to fetch jobs for commissions')

  // Group by rep
  const repMap = new Map<
    string,
    { totalRevenue: number; commissionAmount: number; jobCount: number }
  >()

  for (const job of jobs ?? []) {
    if (!job.rep_id) continue
    const existing = repMap.get(job.rep_id) ?? {
      totalRevenue: 0,
      commissionAmount: 0,
      jobCount: 0,
    }
    existing.totalRevenue += Number(job.total_amount ?? 0)
    existing.commissionAmount += Number(job.commission_amount ?? 0)
    existing.jobCount++
    repMap.set(job.rep_id, existing)
  }

  if (repMap.size === 0) return []

  // Fetch rep names
  const repIds = Array.from(repMap.keys())
  const { data: reps } = await supabase
    .from('users')
    .select('id, name')
    .in('id', repIds)

  const nameMap = new Map<string, string>()
  for (const r of reps ?? []) nameMap.set(r.id, r.name)

  const results = repIds.map((repId) => {
    const d = repMap.get(repId)!
    return {
      repId,
      repName: nameMap.get(repId) ?? 'Unknown',
      totalRevenue: round2(d.totalRevenue),
      commissionAmount: round2(d.commissionAmount),
      jobCount: d.jobCount,
      avgDealSize: round2(d.jobCount > 0 ? d.totalRevenue / d.jobCount : 0),
    }
  })

  // Sort by commission descending
  results.sort((a, b) => b.commissionAmount - a.commissionAmount)
  return results
}

export async function getCommissionDetail(
  repId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  jobs: Array<{
    jobNumber: string
    customerName: string
    totalAmount: number
    commissionAmount: number
    status: string
    completedDate: string | null
  }>
  totals: {
    totalRevenue: number
    totalCommission: number
    avgCommissionRate: number
  }
}> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Verify rep belongs to this company
  const { data: rep, error: repError } = await supabase
    .from('users')
    .select('id, company_id, primary_company_id')
    .eq('id', repId)
    .single()

  if (repError || !rep) throw new Error('Rep not found')
  const repCompany = rep.primary_company_id ?? rep.company_id
  if (repCompany !== companyId) throw new Error('Rep does not belong to your company')

  // Fetch jobs for this rep
  let query = supabase
    .from('jobs')
    .select(
      'job_number, customer_name, total_amount, commission_amount, commission_rate, status, completed_date'
    )
    .eq('company_id', companyId)
    .eq('rep_id', repId)
    .in('status', ['sold', 'completed'])

  if (startDate) query = query.gte('completed_date', startDate)
  if (endDate) query = query.lte('completed_date', endDate)

  const { data: jobs, error } = await query.order('completed_date', { ascending: false })
  if (error) throw new Error('Failed to fetch commission details')

  let totalRevenue = 0
  let totalCommission = 0
  let rateSum = 0
  let rateCount = 0

  const mapped = (jobs ?? []).map((j) => {
    const total = Number(j.total_amount ?? 0)
    const commission = Number(j.commission_amount ?? 0)
    const rate = Number(j.commission_rate ?? 0)

    totalRevenue += total
    totalCommission += commission
    if (rate > 0) {
      rateSum += rate
      rateCount++
    }

    return {
      jobNumber: j.job_number ?? '',
      customerName: j.customer_name ?? '',
      totalAmount: round2(total),
      commissionAmount: round2(commission),
      status: j.status ?? '',
      completedDate: j.completed_date ?? null,
    }
  })

  return {
    jobs: mapped,
    totals: {
      totalRevenue: round2(totalRevenue),
      totalCommission: round2(totalCommission),
      avgCommissionRate: round2(rateCount > 0 ? rateSum / rateCount : 0),
    },
  }
}

export async function updateCommissionRate(repId: string, rate: number) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  if (rate < 0 || rate > 50) throw new Error('Commission rate must be between 0 and 50 percent')

  // Verify rep belongs to this company
  const { data: rep, error: repError } = await supabase
    .from('users')
    .select('id, company_id, primary_company_id')
    .eq('id', repId)
    .single()

  if (repError || !rep) throw new Error('Rep not found')
  const repCompany = rep.primary_company_id ?? rep.company_id
  if (repCompany !== companyId) throw new Error('Rep does not belong to your company')

  const { error } = await supabase
    .from('users')
    .update({ commission_rate: rate })
    .eq('id', repId)

  if (error) throw new Error('Failed to update commission rate')

  return { success: true }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
