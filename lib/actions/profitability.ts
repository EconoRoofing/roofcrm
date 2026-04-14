'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, requireManager } from '@/lib/auth-helpers'
import {
  centsToDollars,
  sumCents,
} from '@/lib/money'

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

  // ── Revenue: sum all invoices for this job — in cents, exact ──
  // Audit R3-#2 follow-up: cents-only after migration 031 cleanup.
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount_cents, paid_amount_cents, status')
    .eq('job_id', jobId)

  const invoicedCents = sumCents(
    (invoices ?? [])
      .filter((inv) => inv.status !== 'cancelled')
      .map((inv) => Number((inv as { total_amount_cents?: number | null }).total_amount_cents ?? 0))
  )
  const paidCents = sumCents(
    (invoices ?? [])
      .filter((inv) => inv.status === 'paid')
      .map((inv) => Number((inv as { paid_amount_cents?: number | null }).paid_amount_cents ?? 0))
  )
  const outstandingCents = invoicedCents - paidCents

  // ── Labor costs: sum time_entries total_cost_cents for this job ──
  // Exclude entries the manager has marked non-payroll (fraud/duplicates).
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('total_hours, total_cost_cents, hourly_rate_cents')
    .eq('job_id', jobId)
    .eq('excluded_from_payroll', false)
    .not('clock_out', 'is', null)

  const laborCostCents = sumCents(
    (timeEntries ?? []).map((te) =>
      Number((te as { total_cost_cents?: number | null }).total_cost_cents ?? 0)
    )
  )
  let laborHours = 0
  let rateSumCents = 0
  let rateCount = 0
  for (const te of timeEntries ?? []) {
    laborHours += Number(te.total_hours ?? 0)
    rateSumCents += Number((te as { hourly_rate_cents?: number | null }).hourly_rate_cents ?? 0)
    rateCount++
  }
  const avgLaborRateCents = rateCount > 0 ? Math.round(rateSumCents / rateCount) : 0

  // ── Material costs: from material_lists + purchase_orders ──
  // Audit R3-#2 follow-up: cents-only after migration 031 cleanup.
  const [{ data: materialLists }, { data: purchaseOrders }] = await Promise.all([
    supabase
      .from('material_lists')
      .select('total_estimated_cost_cents')
      .eq('job_id', jobId),
    supabase
      .from('purchase_orders')
      .select('total_estimated_cost_cents, status')
      .eq('job_id', jobId),
  ])

  const materialListsCents = sumCents(
    (materialLists ?? []).map((ml) =>
      Number((ml as { total_estimated_cost_cents?: number | null }).total_estimated_cost_cents ?? 0)
    )
  )
  const poCents = sumCents(
    (purchaseOrders ?? [])
      .filter((po) => po.status !== 'draft')
      .map((po) =>
        Number((po as { total_estimated_cost_cents?: number | null }).total_estimated_cost_cents ?? 0)
      )
  )
  const materialCostCents = materialListsCents + poCents

  // Equipment costs — placeholder (schema has no rental rates)
  const equipmentCostCents = 0

  // ── Profit calculations — integer cents, then convert at the boundary ──
  const totalCostsCents = laborCostCents + materialCostCents + equipmentCostCents
  const grossProfitCents = paidCents - totalCostsCents
  // Real margin, no silly clamp. Audit R2-#17: the old code did
  // `Math.max(-999, Math.min(100, rawMargin))` which hid extreme losses as
  // a flat -999%. If a $100 job actually cost $50,000 to deliver, managers
  // need to see -49,900% not a fake floor. The `paidCents > 0` guard already
  // handles division-by-zero; everything else is just the real number.
  const margin = paidCents > 0 ? (grossProfitCents / paidCents) * 100 : 0

  return {
    revenue: {
      invoiced: centsToDollars(invoicedCents),
      paid: centsToDollars(paidCents),
      outstanding: centsToDollars(outstandingCents),
    },
    costs: {
      labor: centsToDollars(laborCostCents),
      materials: centsToDollars(materialCostCents),
      equipment: centsToDollars(equipmentCostCents),
      total: centsToDollars(totalCostsCents),
    },
    profit: {
      gross: centsToDollars(grossProfitCents),
      margin: round2(margin),
    },
    breakdown: {
      laborHours: round2(laborHours),
      laborRate: centsToDollars(avgLaborRateCents),
      materialCost: centsToDollars(materialCostCents),
      equipmentCost: centsToDollars(equipmentCostCents),
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

  // Batch-fetch — pull both cents + legacy dollar columns
  const [
    { data: allInvoices },
    { data: allTimeEntries },
    { data: allMaterialLists },
    { data: allPurchaseOrders },
  ] = await Promise.all([
    // Audit R3-#2 follow-up: cents-only after migration 031 cleanup.
    supabase
      .from('invoices')
      .select('job_id, total_amount_cents, paid_amount_cents, status')
      .in('job_id', jobIds),
    supabase
      .from('time_entries')
      .select('job_id, total_cost_cents')
      .in('job_id', jobIds)
      .eq('excluded_from_payroll', false)
      .not('clock_out', 'is', null),
    supabase
      .from('material_lists')
      .select('job_id, total_estimated_cost_cents')
      .in('job_id', jobIds),
    supabase
      .from('purchase_orders')
      .select('job_id, total_estimated_cost_cents, status')
      .in('job_id', jobIds),
  ])

  // Per-job maps, all in integer cents
  const revenueMap = new Map<string, number>()
  const costMap = new Map<string, number>()

  // Revenue per job (paid invoices only)
  for (const inv of allInvoices ?? []) {
    if (inv.status === 'paid') {
      const cents = Number((inv as { paid_amount_cents?: number | null }).paid_amount_cents ?? 0)
      revenueMap.set(inv.job_id, (revenueMap.get(inv.job_id) ?? 0) + cents)
    }
  }

  // Labor costs per job
  for (const te of allTimeEntries ?? []) {
    const cents = Number((te as { total_cost_cents?: number | null }).total_cost_cents ?? 0)
    costMap.set(te.job_id, (costMap.get(te.job_id) ?? 0) + cents)
  }

  // Material costs per job
  for (const ml of allMaterialLists ?? []) {
    const cents = Number((ml as { total_estimated_cost_cents?: number | null }).total_estimated_cost_cents ?? 0)
    costMap.set(ml.job_id, (costMap.get(ml.job_id) ?? 0) + cents)
  }

  // Purchase order costs per job (non-draft)
  for (const po of allPurchaseOrders ?? []) {
    if (po.status !== 'draft') {
      const cents = Number((po as { total_estimated_cost_cents?: number | null }).total_estimated_cost_cents ?? 0)
      costMap.set(po.job_id, (costMap.get(po.job_id) ?? 0) + cents)
    }
  }

  // Calculate per-job profitability — all math in cents
  type JobProfit = { jobNumber: string; customerName: string; profit: number; margin: number }
  const jobProfits: JobProfit[] = []
  let totalRevenueCents = 0
  let totalCostsCents = 0

  for (const job of jobs) {
    const revCents = revenueMap.get(job.id) ?? 0
    const costCents = costMap.get(job.id) ?? 0

    if (revCents === 0 && costCents === 0) continue

    const profitCents = revCents - costCents
    const margin = revCents > 0 ? (profitCents / revCents) * 100 : 0

    totalRevenueCents += revCents
    totalCostsCents += costCents

    jobProfits.push({
      jobNumber: job.job_number ?? '',
      customerName: job.customer_name ?? '',
      profit: centsToDollars(profitCents),
      margin: round2(margin),
    })
  }

  const grossProfitCents = totalRevenueCents - totalCostsCents
  const averageMargin = totalRevenueCents > 0 ? (grossProfitCents / totalRevenueCents) * 100 : 0

  // Sort for top/bottom 5
  const sorted = [...jobProfits].sort((a, b) => b.profit - a.profit)
  const topJobs = sorted.slice(0, 5)
  const bottomJobs = sorted.slice(-5).reverse()

  return {
    totalRevenue: centsToDollars(totalRevenueCents),
    totalCosts: centsToDollars(totalCostsCents),
    grossProfit: centsToDollars(grossProfitCents),
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

  // Audit R3-#2 follow-up: cents-only after migration 031 cleanup.
  let query = supabase
    .from('jobs')
    .select('id, rep_id, total_amount_cents, commission_amount_cents, status, completed_date')
    .eq('company_id', companyId)
    .in('status', ['sold', 'completed'])

  if (startDate) query = query.gte('completed_date', startDate)
  if (endDate) query = query.lte('completed_date', endDate)

  const { data: jobs, error } = await query
  if (error) throw new Error('Failed to fetch jobs for commissions')

  // Group by rep — all sums in integer cents
  const repMap = new Map<
    string,
    { totalRevenueCents: number; commissionAmountCents: number; jobCount: number }
  >()

  for (const job of jobs ?? []) {
    if (!job.rep_id) continue
    const existing = repMap.get(job.rep_id) ?? {
      totalRevenueCents: 0,
      commissionAmountCents: 0,
      jobCount: 0,
    }
    existing.totalRevenueCents += Number(
      (job as { total_amount_cents?: number | null }).total_amount_cents ?? 0
    )
    existing.commissionAmountCents += Number(
      (job as { commission_amount_cents?: number | null }).commission_amount_cents ?? 0
    )
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
    const avgDealSizeCents = d.jobCount > 0 ? Math.round(d.totalRevenueCents / d.jobCount) : 0
    return {
      repId,
      repName: nameMap.get(repId) ?? 'Unknown',
      totalRevenue: centsToDollars(d.totalRevenueCents),
      commissionAmount: centsToDollars(d.commissionAmountCents),
      jobCount: d.jobCount,
      avgDealSize: centsToDollars(avgDealSizeCents),
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

  // Audit R3-#2 follow-up: cents-only after migration 031 cleanup.
  let query = supabase
    .from('jobs')
    .select(
      'job_number, customer_name, total_amount_cents, commission_amount_cents, commission_rate, status, completed_date'
    )
    .eq('company_id', companyId)
    .eq('rep_id', repId)
    .in('status', ['sold', 'completed'])

  if (startDate) query = query.gte('completed_date', startDate)
  if (endDate) query = query.lte('completed_date', endDate)

  const { data: jobs, error } = await query.order('completed_date', { ascending: false })
  if (error) throw new Error('Failed to fetch commission details')

  let totalRevenueCents = 0
  let totalCommissionCents = 0
  let rateSum = 0
  let rateCount = 0

  const mapped = (jobs ?? []).map((j) => {
    const totalCents = Number((j as { total_amount_cents?: number | null }).total_amount_cents ?? 0)
    const commissionCents = Number(
      (j as { commission_amount_cents?: number | null }).commission_amount_cents ?? 0
    )
    const rate = Number(j.commission_rate ?? 0)

    totalRevenueCents += totalCents
    totalCommissionCents += commissionCents
    if (rate > 0) {
      rateSum += rate
      rateCount++
    }

    return {
      jobNumber: j.job_number ?? '',
      customerName: j.customer_name ?? '',
      totalAmount: centsToDollars(totalCents),
      commissionAmount: centsToDollars(commissionCents),
      status: j.status ?? '',
      completedDate: j.completed_date ?? null,
    }
  })

  return {
    jobs: mapped,
    totals: {
      totalRevenue: centsToDollars(totalRevenueCents),
      totalCommission: centsToDollars(totalCommissionCents),
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
