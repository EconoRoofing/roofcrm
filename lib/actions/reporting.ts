'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'

export async function getRevenueReport(
  startDate: string,
  endDate: string,
  groupBy: 'day' | 'week' | 'month' = 'month'
) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('total_amount, completed_date, status')
    .eq('company_id', companyId)
    .in('status', ['sold', 'scheduled', 'in_progress', 'completed'])
    .gte('completed_date', startDate)
    .lte('completed_date', endDate)
    .not('completed_date', 'is', null)

  if (!jobs?.length) return []

  // Group by period
  const periodMap = new Map<string, { revenue: number; jobCount: number }>()

  for (const job of jobs) {
    const date = new Date(job.completed_date)
    let periodKey: string

    if (groupBy === 'day') {
      periodKey = job.completed_date.slice(0, 10)
    } else if (groupBy === 'week') {
      // ISO week start (Monday)
      const day = date.getDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      const monday = new Date(date)
      monday.setDate(date.getDate() + mondayOffset)
      periodKey = `W${monday.toISOString().slice(0, 10)}`
    } else {
      periodKey = job.completed_date.slice(0, 7) // YYYY-MM
    }

    const existing = periodMap.get(periodKey) ?? { revenue: 0, jobCount: 0 }
    existing.revenue += job.total_amount ?? 0
    existing.jobCount += 1
    periodMap.set(periodKey, existing)
  }

  return Array.from(periodMap.entries())
    .map(([period, data]) => ({
      period,
      revenue: data.revenue,
      jobCount: data.jobCount,
      avgDealSize: data.jobCount > 0 ? Math.round(data.revenue / data.jobCount) : 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period))
}

export async function getLeadConversionReport(startDate: string, endDate: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('status, created_at, completed_date, total_amount')
    .eq('company_id', companyId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  if (!jobs?.length) {
    return {
      leads: 0,
      estimates: 0,
      sold: 0,
      completed: 0,
      leadToEstimateRate: 0,
      estimateToSoldRate: 0,
      soldToCompletedRate: 0,
      overallConversionRate: 0,
      avgDaysToEstimate: 0,
      avgDaysToSold: 0,
      avgDaysToCompleted: 0,
    }
  }

  const total = jobs.length
  const estimates = jobs.filter((j) =>
    ['pending', 'estimate_scheduled', 'sold', 'scheduled', 'in_progress', 'completed'].includes(j.status)
  ).length
  const sold = jobs.filter((j) =>
    ['sold', 'scheduled', 'in_progress', 'completed'].includes(j.status)
  ).length
  const completed = jobs.filter((j) => j.status === 'completed').length

  // Average days between stages (using completed_date as proxy for completion timing)
  const completedJobs = jobs.filter((j) => j.status === 'completed' && j.completed_date)
  let avgDaysToCompleted = 0
  if (completedJobs.length > 0) {
    const totalDays = completedJobs.reduce((sum, j) => {
      const created = new Date(j.created_at).getTime()
      const done = new Date(j.completed_date).getTime()
      return sum + (done - created) / (1000 * 60 * 60 * 24)
    }, 0)
    avgDaysToCompleted = Math.round(totalDays / completedJobs.length)
  }

  return {
    leads: total,
    estimates,
    sold,
    completed,
    leadToEstimateRate: total > 0 ? Math.round((estimates / total) * 100) : 0,
    estimateToSoldRate: estimates > 0 ? Math.round((sold / estimates) * 100) : 0,
    soldToCompletedRate: sold > 0 ? Math.round((completed / sold) * 100) : 0,
    overallConversionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    avgDaysToEstimate: 0, // Requires estimate_date column — placeholder
    avgDaysToSold: 0, // Requires sold_date column — placeholder
    avgDaysToCompleted,
  }
}

export async function getCrewProductivityReport(startDate: string, endDate: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Get company jobs in date range (bounded)
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('company_id', companyId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .limit(1000)

  if (!jobs?.length) return []

  const jobIds = jobs.map((j) => j.id)

  const { data: entries } = await supabase
    .from('time_entries')
    .select('user_id, job_id, total_hours, overtime_hours, doubletime_hours, total_cost')
    .in('job_id', jobIds)
    .gte('clock_in', startDate)
    .lte('clock_in', endDate)
    .not('clock_out', 'is', null)

  if (!entries?.length) return []

  // Get user names
  const userIds = [...new Set(entries.map((e) => e.user_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, name')
    .in('id', userIds)

  const userMap = new Map((users ?? []).map((u) => [u.id, u.name]))

  // Aggregate per user
  const crewMap = new Map<
    string,
    { name: string; hours: number; overtime: number; jobs: Set<string>; revenue: number; cost: number }
  >()

  for (const entry of entries) {
    const uid = entry.user_id
    const existing = crewMap.get(uid) ?? {
      name: userMap.get(uid) ?? 'Unknown',
      hours: 0,
      overtime: 0,
      jobs: new Set<string>(),
      revenue: 0,
      cost: 0,
    }
    existing.hours += Number(entry.total_hours) || 0
    existing.overtime += (Number(entry.overtime_hours) || 0) + (Number(entry.doubletime_hours) || 0)
    existing.jobs.add(entry.job_id)
    existing.cost += Number(entry.total_cost) || 0
    crewMap.set(uid, existing)
  }

  // Get job revenue for revenue-per-hour calc
  const completedJobIds = [...new Set(entries.map((e) => e.job_id))]
  const { data: completedJobs } = await supabase
    .from('jobs')
    .select('id, total_amount')
    .in('id', completedJobIds)

  const jobRevenueMap = new Map((completedJobs ?? []).map((j) => [j.id, j.total_amount ?? 0]))

  return Array.from(crewMap.entries()).map(([, data]) => {
    const jobCount = data.jobs.size
    const jobRevenue = Array.from(data.jobs).reduce((sum, jid) => sum + (jobRevenueMap.get(jid) ?? 0), 0)
    return {
      crewMember: data.name,
      hoursWorked: Math.round(data.hours * 10) / 10,
      jobsCompleted: jobCount,
      avgHoursPerJob: jobCount > 0 ? Math.round((data.hours / jobCount) * 10) / 10 : 0,
      revenuePerHour: data.hours > 0 ? Math.round(jobRevenue / data.hours) : 0,
      overtimePercentage: data.hours > 0 ? Math.round((data.overtime / data.hours) * 100) : 0,
    }
  }).sort((a, b) => b.hoursWorked - a.hoursWorked)
}

export async function getJobTypeReport(startDate: string, endDate: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('job_type, total_amount, status')
    .eq('company_id', companyId)
    .in('status', ['sold', 'scheduled', 'in_progress', 'completed'])
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  if (!jobs?.length) return []

  const typeMap = new Map<string, { count: number; revenue: number }>()

  for (const job of jobs) {
    const type = job.job_type ?? 'other'
    const existing = typeMap.get(type) ?? { count: 0, revenue: 0 }
    existing.count += 1
    existing.revenue += job.total_amount ?? 0
    typeMap.set(type, existing)
  }

  const totalRevenue = jobs.reduce((sum, j) => sum + (j.total_amount ?? 0), 0)

  return Array.from(typeMap.entries())
    .map(([type, data]) => ({
      type,
      count: data.count,
      revenue: data.revenue,
      avgDealSize: data.count > 0 ? Math.round(data.revenue / data.count) : 0,
      revenueShare: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

export async function getSourceROIReport(startDate: string, endDate: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('referred_by, total_amount, status')
    .eq('company_id', companyId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  if (!jobs?.length) return []

  const sourceMap = new Map<
    string,
    { count: number; converted: number; revenue: number }
  >()

  for (const job of jobs) {
    const source = job.referred_by?.trim() || 'Direct'
    const existing = sourceMap.get(source) ?? { count: 0, converted: 0, revenue: 0 }
    existing.count += 1
    if (['sold', 'scheduled', 'in_progress', 'completed'].includes(job.status)) {
      existing.converted += 1
      existing.revenue += job.total_amount ?? 0
    }
    sourceMap.set(source, existing)
  }

  return Array.from(sourceMap.entries())
    .map(([source, data]) => ({
      source,
      leadCount: data.count,
      conversionRate: data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0,
      totalRevenue: data.revenue,
      avgDealSize: data.converted > 0 ? Math.round(data.revenue / data.converted) : 0,
      costPerLead: 0, // Requires marketing spend tracking — placeholder
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
}

export async function getAgingReport() {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, status, created_at, address')
    .eq('company_id', companyId)
    .not('status', 'in', '("completed","cancelled")')

  if (!jobs?.length) return { statuses: [], staleJobs: [] }

  const now = new Date()
  const staleCutoffMs = 14 * 24 * 60 * 60 * 1000

  // Group by status
  const statusMap = new Map<string, { count: number; avgDays: number; totalDays: number }>()
  const staleJobs: Array<{
    jobNumber: string
    customerName: string
    status: string
    address: string
    daysStuck: number
  }> = []

  for (const job of jobs) {
    const daysInStatus = Math.round(
      (now.getTime() - new Date(job.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    const existing = statusMap.get(job.status) ?? { count: 0, avgDays: 0, totalDays: 0 }
    existing.count += 1
    existing.totalDays += daysInStatus
    statusMap.set(job.status, existing)

    if (now.getTime() - new Date(job.created_at).getTime() > staleCutoffMs) {
      staleJobs.push({
        jobNumber: job.job_number ?? '',
        customerName: job.customer_name ?? '',
        status: job.status,
        address: job.address ?? '',
        daysStuck: daysInStatus,
      })
    }
  }

  const statuses = Array.from(statusMap.entries())
    .map(([status, data]) => ({
      status,
      count: data.count,
      avgDays: data.count > 0 ? Math.round(data.totalDays / data.count) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    statuses,
    staleJobs: staleJobs.sort((a, b) => b.daysStuck - a.daysStuck),
  }
}
