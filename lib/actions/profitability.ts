'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, requireManager } from '@/lib/auth-helpers'
import {
  centsToDollars,
  readMoneyFromRow,
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
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount, total_amount_cents, paid_amount, paid_amount_cents, status')
    .eq('job_id', jobId)

  const invoicedCents = sumCents(
    (invoices ?? [])
      .filter((inv) => inv.status !== 'cancelled')
      .map((inv) => readMoneyFromRow(
        (inv as { total_amount_cents?: number | null }).total_amount_cents,
        inv.total_amount
      ))
  )
  const paidCents = sumCents(
    (invoices ?? [])
      .filter((inv) => inv.status === 'paid')
      .map((inv) => readMoneyFromRow(
        (inv as { paid_amount_cents?: number | null }).paid_amount_cents,
        inv.paid_amount
      ))
  )
  const outstandingCents = invoicedCents - paidCents

  // ── Labor costs: sum time_entries total_cost_cents for this job ──
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('total_hours, total_cost, total_cost_cents, hourly_rate, hourly_rate_cents')
    .eq('job_id', jobId)
    .not('clock_out', 'is', null)

  const laborCostCents = sumCents(
    (timeEntries ?? []).map((te) =>
      readMoneyFromRow(
        (te as { total_cost_cents?: number | null }).total_cost_cents,
        te.total_cost
      )
    )
  )
  let laborHours = 0
  let rateSumCents = 0
  let rateCount = 0
  for (const te of timeEntries ?? []) {
    laborHours += Number(te.total_hours ?? 0)
    rateSumCents += readMoneyFromRow(
      (te as { hourly_rate_cents?: number | null }).hourly_rate_cents,
      te.hourly_rate
    )
    rateCount++
  }
  const avgLaborRateCents = rateCount > 0 ? Math.round(rateSumCents / rateCount) : 0

  // ── Material costs: from material_lists + purchase_orders ──
  const [{ data: materialLists }, { data: purchaseOrders }] = await Promise.all([
    supabase
      .from('material_lists')
      .select('total_estimated_cost, total_estimated_cost_cents')
      .eq('job_id', jobId),
    supabase
      .from('purchase_orders')
      .select('total_estimated_cost, total_estimated_cost_cents, status')
      .eq('job_id', jobId),
  ])

  const materialListsCents = sumCents(
    (materialLists ?? []).map((ml) =>
      readMoneyFromRow(
        (ml as { total_estimated_cost_cents?: number | null }).total_estimated_cost_cents,
        ml.total_estimated_cost
      )
    )
  )
  const poCents = sumCents(
    (purchaseOrders ?? [])
      .filter((po) => po.status !== 'draft')
      .map((po) =>
        readMoneyFromRow(
          (po as { total_estimated_cost_cents?: number | null }).total_estimated_cost_cents,
          po.total_estimated_cost
        )
      )
  )
  const materialCostCents = materialListsCents + poCents

  // Equipment costs — placeholder (schema has no rental rates)
  const equipmentCostCents = 0

  // ── Profit calculations — integer cents, then convert at the boundary ──
  const totalCostsCents = laborCostCents + materialCostCents + equipmentCostCents
  const grossProfitCents = paidCents - totalCostsCents
  const rawMargin = paidCents > 0 ? (grossProfitCents / paidCents) * 100 : 0
  const margin = Math.max(-999, Math.min(100, rawMargin))

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
    supabase
      .from('invoices')
      .select('job_id, total_amount, total_amount_cents, paid_amount, paid_amount_cents, status')
      .in('job_id', jobIds),
    supabase
      .from('time_entries')
      .select('job_id, total_cost, total_cost_cents')
      .in('job_id', jobIds)
      .not('clock_out', 'is', null),
    supabase
      .from('material_lists')
      .select('job_id, total_estimated_cost, total_estimated_cost_cents')
      .in('job_id', jobIds),
    supabase
      .from('purchase_orders')
      .select('job_id, total_estimated_cost, total_estimated_cost_cents, status')
      .in('job_id', jobIds),
  ])

  // Per-job maps, all in integer cents
  const revenueMap = new Map<string, number>()
  const costMap = new Map<string, number>()

  // Revenue per job (paid invoices only)
  for (const inv of allInvoices ?? []) {
    if (inv.status === 'paid') {
      const cents = readMoneyFromRow(
        (inv as { paid_amount_cents?: number | null }).paid_amount_cents,
        inv.paid_amount
      )
      revenueMap.set(inv.job_id, (revenueMap.get(inv.job_id) ?? 0) + cents)
    }
  }

  // Labor costs per job
  for (const te of allTimeEntries ?? []) {
    const cents = readMoneyFromRow(
      (te as { total_cost_cents?: number | null }).total_cost_cents,
      te.total_cost
    )
    costMap.set(te.job_id, (costMap.get(te.job_id) ?? 0) + cents)
  }

  // Material costs per job
  for (const ml of allMaterialLists ?? []) {
    const cents = readMoneyFromRow(
      (ml as { total_estimated_cost_cents?: number | null }).total_estimated_cost_cents,
      ml.total_estimated_cost
    )
    costMap.set(ml.job_id, (costMap.get(ml.job_id) ?? 0) + cents)
  }

  // Purchase order costs per job (non-draft)
  for (const po of allPurchaseOrders ?? []) {
    if (po.status !== 'draft') {
      const cents = readMoneyFromRow(
        (po as { total_estimated_cost_cents?: number | null }).total_estimated_cost_cents,
        po.total_estimated_cost
      )
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

  // Fetch sold/completed jobs for the company — pull cents + legacy dollars
  let query = supabase
    .from('jobs')
    .select('id, rep_id, total_amount, total_amount_cents, commission_amount, commission_amount_cents, status, completed_date')
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
    existing.totalRevenueCents += readMoneyFromRow(
      (job as { total_amount_cents?: number | null }).total_amount_cents,
      job.total_amount
    )
    existing.commissionAmountCents += readMoneyFromRow(
      (job as { commission_amount_cents?: number | null }).commission_amount_cents,
      job.commission_amount
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

  // Fetch jobs for this rep — pull cents + legacy
  let query = supabase
    .from('jobs')
    .select(
      'job_number, customer_name, total_amount, total_amount_cents, commission_amount, commission_amount_cents, commission_rate, status, completed_date'
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
    const totalCents = readMoneyFromRow(
      (j as { total_amount_cents?: number | null }).total_amount_cents,
      j.total_amount
    )
    const commissionCents = readMoneyFromRow(
      (j as { commission_amount_cents?: number | null }).commission_amount_cents,
      j.commission_amount
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
