'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'
import { centsToDollars, readMoneyFromRow } from '@/lib/money'

export interface DashboardData {
  // Pipeline KPIs
  pipelineValue: number
  closeRate: number
  revenueThisMonth: number
  jobsCompletedThisMonth: number
  avgDaysInPipeline: number
  staleLeadCount: number

  // Revenue breakdown
  revenueByRep: Array<{ repName: string; revenue: number; jobCount: number; commission: number }>
  revenueByCompany: Array<{ companyName: string; companyColor: string; revenue: number; jobCount: number }>

  // Lead source breakdown
  leadsBySource: Array<{ source: string; count: number; convertedCount: number }>

  // Time tracking KPIs
  avgHoursPerJob: number
  totalLaborCostThisMonth: number
  overtimeHoursThisWeek: number

  // Job type breakdown
  jobsByType: Array<{ type: string; count: number; revenue: number }>

  // Profitability trend — last 20 completed jobs
  // margin is a placeholder (100%) until time_entries join is available
  profitabilityTrend: Array<{ jobNumber: string; contractAmount: number; completedDate: string }>
}

export async function getDashboardData(filters?: {
  startDate?: string
  endDate?: string
}): Promise<DashboardData> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Build base job query — always scoped to authenticated user's company
  let jobQuery = supabase
    .from('jobs')
    .select(
      'id, status, total_amount, total_amount_cents, job_type, referred_by, rep_id, created_at, completed_date, company_id, commission_amount, commission_amount_cents'
    )
    .eq('company_id', companyId)
  if (filters?.startDate) {
    jobQuery = jobQuery.gte('created_at', filters.startDate)
  }
  if (filters?.endDate) {
    jobQuery = jobQuery.lte('created_at', filters.endDate)
  }

  const [jobsResult, companiesResult, usersResult] = await Promise.all([
    jobQuery,
    supabase.from('companies').select('id, name, color').eq('id', companyId),
    supabase.from('users').select('id, name').eq('role', 'sales').eq('primary_company_id', companyId),
  ])

  const jobs = jobsResult.data ?? []
  const companies = companiesResult.data ?? []
  const users = usersResult.data ?? []

  const companyMap = new Map(companies.map((c) => [c.id, c]))
  const userMap = new Map(users.map((u) => [u.id, u]))

  // ── Pipeline KPIs ──────────────────────────────────────────────────────────

  // Helper: per-job total in integer cents (prefer cents, fall back to legacy)
  const jobTotalCents = (j: typeof jobs[number]): number =>
    readMoneyFromRow(
      (j as { total_amount_cents?: number | null }).total_amount_cents,
      j.total_amount
    )
  const jobCommissionCents = (j: typeof jobs[number]): number =>
    readMoneyFromRow(
      (j as { commission_amount_cents?: number | null }).commission_amount_cents,
      (j as { commission_amount?: number | null }).commission_amount
    )

  const pipelineStatuses = ['pending', 'sold', 'estimate_scheduled', 'lead', 'scheduled', 'in_progress']
  const pipelineValueCents = jobs
    .filter((j) => pipelineStatuses.includes(j.status))
    .reduce((sum, j) => sum + jobTotalCents(j), 0)
  const pipelineValue = centsToDollars(pipelineValueCents)

  const totalEstimates = jobs.filter((j) =>
    ['pending', 'sold', 'scheduled', 'in_progress', 'completed', 'cancelled'].includes(j.status)
  ).length
  const soldOrCompleted = jobs.filter((j) => ['sold', 'scheduled', 'in_progress', 'completed'].includes(j.status)).length
  const closeRate = totalEstimates > 0 ? (soldOrCompleted / totalEstimates) * 100 : 0

  const now = new Date()
  // Audit R2-#25: half-open interval [monthStart, nextMonthStart). The
  // previous monthEnd built `...23:59:59.000Z` which excludes any record
  // created in the last 999 ms of the month — a real bug at midnight on
  // payday batches. Comparing against next month's start with strict `<`
  // is the canonical fix and avoids the millisecond cliff entirely.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const revenueThisMonthCents = jobs
    .filter(
      (j) =>
        ['sold', 'scheduled', 'in_progress', 'completed'].includes(j.status) &&
        j.created_at >= monthStart &&
        j.created_at < nextMonthStart
    )
    .reduce((sum, j) => sum + jobTotalCents(j), 0)
  const revenueThisMonth = centsToDollars(revenueThisMonthCents)

  const jobsCompletedThisMonth = jobs.filter(
    (j) =>
      j.status === 'completed' &&
      j.completed_date &&
      j.completed_date >= monthStart &&
      j.completed_date < nextMonthStart
  ).length

  // Avg days from created_at to sold/completed
  const soldJobs = jobs.filter((j) => ['sold', 'scheduled', 'in_progress', 'completed'].includes(j.status))
  const avgDaysInPipeline =
    soldJobs.length > 0
      ? soldJobs.reduce((sum, j) => {
          const created = new Date(j.created_at).getTime()
          const resolved = j.completed_date
            ? new Date(j.completed_date).getTime()
            : now.getTime()
          return sum + (resolved - created) / (1000 * 60 * 60 * 24)
        }, 0) / soldJobs.length
      : 0

  const staleCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const staleLeadCount = jobs.filter(
    (j) => ['lead', 'pending'].includes(j.status) && j.created_at < staleCutoff
  ).length

  // ── Revenue by Rep ─────────────────────────────────────────────────────────

  // Per-rep totals — sum in integer cents, convert for the wire format
  const repCentsMap = new Map<string, { repName: string; revenueCents: number; jobCount: number; commissionCents: number }>()
  for (const job of jobs) {
    if (!['sold', 'scheduled', 'in_progress', 'completed'].includes(job.status)) continue
    const repId = job.rep_id ?? 'unknown'
    const repName = job.rep_id ? (userMap.get(job.rep_id)?.name ?? 'Unknown Rep') : 'Unassigned'
    const existing = repCentsMap.get(repId) ?? { repName, revenueCents: 0, jobCount: 0, commissionCents: 0 }
    existing.revenueCents += jobTotalCents(job)
    existing.jobCount += 1
    existing.commissionCents += jobCommissionCents(job)
    repCentsMap.set(repId, existing)
  }
  const revenueByRep = Array.from(repCentsMap.values())
    .map((r) => ({
      repName: r.repName,
      revenue: centsToDollars(r.revenueCents),
      jobCount: r.jobCount,
      commission: centsToDollars(r.commissionCents),
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── Revenue by Company ─────────────────────────────────────────────────────

  const coCentsMap = new Map<string, { companyName: string; companyColor: string; revenueCents: number; jobCount: number }>()
  for (const job of jobs) {
    if (!['sold', 'scheduled', 'in_progress', 'completed'].includes(job.status)) continue
    const co = companyMap.get(job.company_id)
    if (!co) continue
    const existing = coCentsMap.get(job.company_id) ?? {
      companyName: co.name,
      companyColor: co.color,
      revenueCents: 0,
      jobCount: 0,
    }
    existing.revenueCents += jobTotalCents(job)
    existing.jobCount += 1
    coCentsMap.set(job.company_id, existing)
  }
  const revenueByCompany = Array.from(coCentsMap.values())
    .map((c) => ({
      companyName: c.companyName,
      companyColor: c.companyColor,
      revenue: centsToDollars(c.revenueCents),
      jobCount: c.jobCount,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── Lead Sources ───────────────────────────────────────────────────────────

  const sourceMap = new Map<string, { count: number; convertedCount: number }>()
  for (const job of jobs) {
    const source = job.referred_by?.trim() || 'Direct'
    const existing = sourceMap.get(source) ?? { count: 0, convertedCount: 0 }
    existing.count += 1
    if (['sold', 'scheduled', 'in_progress', 'completed'].includes(job.status)) {
      existing.convertedCount += 1
    }
    sourceMap.set(source, existing)
  }
  const leadsBySource = Array.from(sourceMap.entries())
    .map(([source, data]) => ({ source, ...data }))
    .sort((a, b) => b.count - a.count)

  // ── Job Type Breakdown ─────────────────────────────────────────────────────

  const typeCentsMap = new Map<string, { count: number; revenueCents: number }>()
  for (const job of jobs) {
    const t = job.job_type ?? 'other'
    const existing = typeCentsMap.get(t) ?? { count: 0, revenueCents: 0 }
    existing.count += 1
    existing.revenueCents += jobTotalCents(job)
    typeCentsMap.set(t, existing)
  }
  const jobsByType = Array.from(typeCentsMap.entries())
    .map(([type, data]) => ({ type, count: data.count, revenue: centsToDollars(data.revenueCents) }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── Time Tracking KPIs ─────────────────────────────────────────────────────

  let avgHoursPerJob = 0
  let totalLaborCostThisMonth = 0
  let overtimeHoursThisWeek = 0

  try {
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + mondayOffset)
    weekStart.setHours(0, 0, 0, 0)

    // Scope time entries to this company's jobs
    const companyJobIds = jobs.map(j => j.id)

    // Skip time tracking queries if no jobs exist for this company
    if (companyJobIds.length === 0) throw new Error('no jobs')

    // All three time-entry rollups exclude entries marked non-payroll.
    const [timeEntriesResult, monthlyLaborResult, weeklyOTResult] = await Promise.all([
      supabase
        .from('time_entries')
        .select('job_id, total_hours')
        .in('job_id', companyJobIds)
        .eq('excluded_from_payroll', false)
        .not('clock_out', 'is', null),
      supabase
        .from('time_entries')
        .select('total_cost, total_cost_cents')
        .in('job_id', companyJobIds)
        .eq('excluded_from_payroll', false)
        .gte('clock_in', monthStart)
        .lt('clock_in', nextMonthStart)
        .not('clock_out', 'is', null),
      supabase
        .from('time_entries')
        .select('overtime_hours, doubletime_hours')
        .in('job_id', companyJobIds)
        .eq('excluded_from_payroll', false)
        .gte('clock_in', weekStart.toISOString())
        .not('clock_out', 'is', null),
    ])

    const timeEntries = timeEntriesResult.data ?? []
    if (timeEntries.length > 0) {
      const jobHoursMap = new Map<string, number>()
      for (const e of timeEntries) {
        const jobId = (e as any).job_id ?? ''
        jobHoursMap.set(jobId, (jobHoursMap.get(jobId) ?? 0) + (Number(e.total_hours) ?? 0))
      }
      const uniqueJobCount = jobHoursMap.size
      const totalHoursAll = Array.from(jobHoursMap.values()).reduce((a, b) => a + b, 0)
      avgHoursPerJob = uniqueJobCount > 0 ? Math.round((totalHoursAll / uniqueJobCount) * 10) / 10 : 0
    }

    const totalLaborCostCents = (monthlyLaborResult.data ?? []).reduce(
      (sum, e) => sum + readMoneyFromRow(
        (e as { total_cost_cents?: number | null }).total_cost_cents,
        e.total_cost
      ),
      0
    )
    totalLaborCostThisMonth = centsToDollars(totalLaborCostCents)

    overtimeHoursThisWeek = (weeklyOTResult.data ?? []).reduce(
      (sum, e) => sum + (e.overtime_hours ?? 0) + (e.doubletime_hours ?? 0),
      0
    )
  } catch {
    // time_entries table may be empty or unavailable — gracefully return zeros
  }

  // ── Profitability Trend ────────────────────────────────────────────────────
  // Last 20 completed jobs by contract amount.
  // Full margin (labor cost vs revenue) requires joining time_entries — deferred for a future query.

  // Audit R3-#2: cents-only — migration 031 will drop the legacy
  // `total_amount` column and any reference here would error out on read.
  // The defensive backfill at the top of 031 ensures every row has cents
  // populated before the legacy column is dropped, so this filter is safe.
  let jobQueryForTrend = supabase
    .from('jobs')
    .select('job_number, total_amount_cents, completed_date')
    .eq('status', 'completed')
    .gt('total_amount_cents', 0)
    .order('completed_date', { ascending: false })
    .limit(20)

  jobQueryForTrend = jobQueryForTrend.eq('company_id', companyId)

  const { data: trendJobs } = await jobQueryForTrend

  const profitabilityTrend = (trendJobs ?? []).map((j) => ({
    jobNumber: j.job_number ?? '',
    contractAmount: centsToDollars(
      (j as { total_amount_cents?: number | null }).total_amount_cents ?? 0
    ),
    completedDate: j.completed_date ?? '',
  }))

  return {
    pipelineValue,
    closeRate,
    revenueThisMonth,
    jobsCompletedThisMonth,
    avgDaysInPipeline,
    staleLeadCount,
    revenueByRep,
    revenueByCompany,
    leadsBySource,
    avgHoursPerJob,
    totalLaborCostThisMonth,
    overtimeHoursThisWeek,
    jobsByType,
    profitabilityTrend,
  }
}
