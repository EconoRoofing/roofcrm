'use server'

import { createClient } from '@/lib/supabase/server'

// Simple in-process cache — prevents redundant aggregation queries within a 2-minute window
const dashboardCache = new Map<string, { data: DashboardData; expiresAt: number }>()

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
  companyId?: string
  startDate?: string
  endDate?: string
}): Promise<DashboardData> {
  // Check cache first — 2 minute TTL
  const cacheKey = JSON.stringify(filters ?? {})
  const cached = dashboardCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const supabase = await createClient()

  // Build base job query
  let jobQuery = supabase
    .from('jobs')
    .select(
      'id, status, total_amount, job_type, referred_by, rep_id, created_at, completed_date, company_id, commission_amount'
    )

  if (filters?.companyId) {
    jobQuery = jobQuery.eq('company_id', filters.companyId)
  }
  if (filters?.startDate) {
    jobQuery = jobQuery.gte('created_at', filters.startDate)
  }
  if (filters?.endDate) {
    jobQuery = jobQuery.lte('created_at', filters.endDate)
  }

  const [jobsResult, companiesResult, usersResult] = await Promise.all([
    jobQuery,
    supabase.from('companies').select('id, name, color'),
    supabase.from('users').select('id, name').eq('role', 'sales'),
  ])

  const jobs = jobsResult.data ?? []
  const companies = companiesResult.data ?? []
  const users = usersResult.data ?? []

  const companyMap = new Map(companies.map((c) => [c.id, c]))
  const userMap = new Map(users.map((u) => [u.id, u]))

  // ── Pipeline KPIs ──────────────────────────────────────────────────────────

  const pipelineStatuses = ['pending', 'sold', 'estimate_scheduled', 'lead', 'scheduled', 'in_progress']
  const pipelineValue = jobs
    .filter((j) => pipelineStatuses.includes(j.status))
    .reduce((sum, j) => sum + (j.total_amount ?? 0), 0)

  const totalEstimates = jobs.filter((j) =>
    ['pending', 'sold', 'scheduled', 'in_progress', 'completed', 'cancelled'].includes(j.status)
  ).length
  const soldOrCompleted = jobs.filter((j) => ['sold', 'scheduled', 'in_progress', 'completed'].includes(j.status)).length
  const closeRate = totalEstimates > 0 ? (soldOrCompleted / totalEstimates) * 100 : 0

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  const revenueThisMonth = jobs
    .filter(
      (j) =>
        ['sold', 'scheduled', 'in_progress', 'completed'].includes(j.status) &&
        j.created_at >= monthStart &&
        j.created_at <= monthEnd
    )
    .reduce((sum, j) => sum + (j.total_amount ?? 0), 0)

  const jobsCompletedThisMonth = jobs.filter(
    (j) =>
      j.status === 'completed' &&
      j.completed_date &&
      j.completed_date >= monthStart &&
      j.completed_date <= monthEnd
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

  const repMap = new Map<string, { repName: string; revenue: number; jobCount: number; commission: number }>()
  for (const job of jobs) {
    if (!['sold', 'scheduled', 'in_progress', 'completed'].includes(job.status)) continue
    const repId = job.rep_id ?? 'unknown'
    const repName = job.rep_id ? (userMap.get(job.rep_id)?.name ?? 'Unknown Rep') : 'Unassigned'
    const existing = repMap.get(repId) ?? { repName, revenue: 0, jobCount: 0, commission: 0 }
    existing.revenue += job.total_amount ?? 0
    existing.jobCount += 1
    existing.commission += (job as { commission_amount?: number | null }).commission_amount ?? 0
    repMap.set(repId, existing)
  }
  const revenueByRep = Array.from(repMap.values()).sort((a, b) => b.revenue - a.revenue)

  // ── Revenue by Company ─────────────────────────────────────────────────────

  const coMap = new Map<string, { companyName: string; companyColor: string; revenue: number; jobCount: number }>()
  for (const job of jobs) {
    if (!['sold', 'scheduled', 'in_progress', 'completed'].includes(job.status)) continue
    const co = companyMap.get(job.company_id)
    if (!co) continue
    const existing = coMap.get(job.company_id) ?? {
      companyName: co.name,
      companyColor: co.color,
      revenue: 0,
      jobCount: 0,
    }
    existing.revenue += job.total_amount ?? 0
    existing.jobCount += 1
    coMap.set(job.company_id, existing)
  }
  const revenueByCompany = Array.from(coMap.values()).sort((a, b) => b.revenue - a.revenue)

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

  const typeMap = new Map<string, { count: number; revenue: number }>()
  for (const job of jobs) {
    const t = job.job_type ?? 'other'
    const existing = typeMap.get(t) ?? { count: 0, revenue: 0 }
    existing.count += 1
    existing.revenue += job.total_amount ?? 0
    typeMap.set(t, existing)
  }
  const jobsByType = Array.from(typeMap.entries())
    .map(([type, data]) => ({ type, ...data }))
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

    const [timeEntriesResult, monthlyLaborResult, weeklyOTResult] = await Promise.all([
      supabase
        .from('time_entries')
        .select('job_id, total_hours')
        .not('clock_out', 'is', null),
      supabase
        .from('time_entries')
        .select('total_cost')
        .gte('clock_in', monthStart)
        .lte('clock_in', monthEnd)
        .not('clock_out', 'is', null),
      supabase
        .from('time_entries')
        .select('overtime_hours, doubletime_hours')
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

    totalLaborCostThisMonth = (monthlyLaborResult.data ?? []).reduce(
      (sum, e) => sum + (e.total_cost ?? 0),
      0
    )

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

  let jobQueryForTrend = supabase
    .from('jobs')
    .select('job_number, total_amount, completed_date')
    .eq('status', 'completed')
    .not('total_amount', 'is', null)
    .gt('total_amount', 0)
    .order('completed_date', { ascending: false })
    .limit(20)

  if (filters?.companyId) {
    jobQueryForTrend = jobQueryForTrend.eq('company_id', filters.companyId)
  }

  const { data: trendJobs } = await jobQueryForTrend

  const profitabilityTrend = (trendJobs ?? []).map((j) => ({
    jobNumber: j.job_number ?? '',
    contractAmount: j.total_amount ?? 0,
    completedDate: j.completed_date ?? '',
  }))

  const result: DashboardData = {
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

  // Cache for 2 minutes
  dashboardCache.set(cacheKey, { data: result, expiresAt: Date.now() + 120_000 })

  return result
}
