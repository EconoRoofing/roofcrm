'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'
import { centsToDollars } from '@/lib/money'

export interface CommandCenterData {
  // Today
  todayJobCount: number
  todayJobs: Array<{ id: string; customer_name: string; address: string; city: string; status: string; company: { name: string; color: string } | null }>
  // Active crew (clocked in today)
  activeCrewCount: number
  totalCrewToday: number
  // Stale leads (14+ days pending/lead)
  staleLeadCount: number
  // Follow-ups due today
  dueFollowUpCount: number
  dueFollowUps: Array<{ id: string; job?: { customer_name: string; phone?: string | null } | null; note: string }>
  // Revenue
  revenueThisMonth: number
  pipelineValue: number
  // Yesterday
  yesterdayCompletedCount: number
  // Alerts
  openIncidentCount: number
  expiringCertCount: number
  overdueEquipmentCount: number
}

export async function getCommandCenterData(): Promise<CommandCenterData> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const now = new Date()
  const today = now.toISOString().split('T')[0]

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const staleCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [
    todayJobsResult,
    activeTimeEntriesResult,
    todayCrewResult,
    staleLeadsResult,
    dueFollowUpsResult,
    revenueResult,
    pipelineResult,
    yesterdayResult,
    incidentResult,
  ] = await Promise.all([
    // Today's jobs with company
    supabase
      .from('jobs')
      .select('id, customer_name, address, city, status, company:companies(name, color)')
      .eq('company_id', companyId)
      .eq('scheduled_date', today)
      .not('status', 'in', '("cancelled")'),

    // Currently clocked-in crew (open time entries) — scoped via job join
    supabase
      .from('time_entries')
      .select('user_id, job:jobs!inner(company_id)', { count: 'exact', head: true })
      .is('clock_out', null)
      .eq('jobs.company_id', companyId),

    // Total crew with jobs today
    supabase
      .from('jobs')
      .select('assigned_crew_id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('scheduled_date', today)
      .not('assigned_crew_id', 'is', null),

    // Stale leads count
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['lead', 'pending'])
      .lt('created_at', staleCutoff),

    // Due follow-ups — scoped via job join
    supabase
      .from('follow_ups')
      .select(`
        id,
        note,
        job:jobs!inner(customer_name, phone, company_id)
      `)
      .eq('job.company_id', companyId)
      .lte('due_date', today)
      .is('completed_at', null)
      .order('due_date', { ascending: true })
      .limit(10),

    // Revenue this month (sold/scheduled/in_progress/completed).
    // Audit R3-#2 follow-up: cents-only, 031-safe.
    // Performance pass R5-#3: explicit limit prevents unbounded
    // payload growth as Mario's company history accrues. The query is
    // already date-bounded to the current month, so 5000 is more than
    // any realistic month would produce. Belt-and-suspenders.
    // (Long-term fix: move sum() into a Postgres RPC so we transfer
    // one row instead of N. Deferred — fix value vs. dev cost is poor
    // at current scale.)
    supabase
      .from('jobs')
      .select('total_amount_cents')
      .eq('company_id', companyId)
      .in('status', ['sold', 'scheduled', 'in_progress', 'completed'])
      .gte('created_at', monthStart)
      .limit(5000),

    // Pipeline value — every active job. Bounded by status filter
    // (no historical completed/cancelled), so growth is proportional
    // to current pipeline depth. 5000 is generous.
    supabase
      .from('jobs')
      .select('total_amount_cents')
      .eq('company_id', companyId)
      .in('status', ['lead', 'estimate_scheduled', 'pending', 'sold', 'scheduled', 'in_progress'])
      .limit(5000),

    // Yesterday completed
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .eq('completed_date', yesterdayStr),

    // Open incidents (safety) — scoped by company
    supabase
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'open'),
  ])

  const todayJobs = (todayJobsResult.data ?? []) as unknown as CommandCenterData['todayJobs']
  const activeCrewCount = activeTimeEntriesResult.count ?? 0
  const totalCrewToday = todayCrewResult.count ?? 0
  const staleLeadCount = staleLeadsResult.count ?? 0
  const dueFollowUpCount = dueFollowUpsResult.count ?? 0
  const dueFollowUps = (dueFollowUpsResult.data ?? []) as unknown as CommandCenterData['dueFollowUps']

  // Sums in integer cents, return as dollars at the wire boundary.
  // Audit R3-#2 follow-up: cents-only after migration 031 cleanup.
  const revenueThisMonthCents = (revenueResult.data ?? []).reduce(
    (sum, j) => sum + Number((j as { total_amount_cents?: number | null }).total_amount_cents ?? 0),
    0
  )
  const pipelineValueCents = (pipelineResult.data ?? []).reduce(
    (sum, j) => sum + Number((j as { total_amount_cents?: number | null }).total_amount_cents ?? 0),
    0
  )
  const revenueThisMonth = centsToDollars(revenueThisMonthCents)
  const pipelineValue = centsToDollars(pipelineValueCents)

  const yesterdayCompletedCount = yesterdayResult.count ?? 0
  const openIncidentCount = incidentResult.count ?? 0

  return {
    todayJobCount: todayJobs.length,
    todayJobs,
    activeCrewCount,
    totalCrewToday,
    staleLeadCount,
    dueFollowUpCount,
    dueFollowUps,
    revenueThisMonth,
    pipelineValue,
    yesterdayCompletedCount,
    openIncidentCount,
    // These tables may not exist — default to 0
    expiringCertCount: 0,
    overdueEquipmentCount: 0,
  }
}
