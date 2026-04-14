'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, requireManager, verifyJobOwnership, localDateString } from '@/lib/auth-helpers'

interface CrewMember {
  id: string
  name: string
  email: string
}

interface JobAssignment {
  jobId: string
  jobNumber: string
  customerName: string
  crewId: string
  crewName: string
  date: string
  durationDays: number
}

interface UnassignedJob {
  id: string
  job_number: string
  customer_name: string
  status: string
}

/** Supabase doesn't always expose schedule_duration_days in the generated type.
 *  This interface covers the columns we SELECT so we can avoid `as any`. */
interface JobWithDuration {
  id: string
  job_number: string
  customer_name: string
  assigned_crew_id: string | null
  scheduled_date: string | null
  schedule_duration_days: number | null
  status?: string
}

// Internal helper: no auth check, called from getCrewAvailability which already verified
async function getCrewUnavailabilityInternal(
  supabase: ReturnType<typeof import('@/lib/supabase/server').createClient> extends Promise<infer T> ? T : never,
  weekStart: string,
  weekEnd: string
): Promise<Record<string, string[]>> {
  const { data } = await supabase
    .from('crew_unavailability')
    .select('user_id, date')
    .gte('date', weekStart)
    .lt('date', weekEnd)

  const result: Record<string, string[]> = {}
  for (const row of data ?? []) {
    if (!result[row.user_id]) result[row.user_id] = []
    result[row.user_id].push(row.date)
  }
  return result
}

export async function getCrewAvailability(weekStart: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Compute the week-end date as a local-tz date string (NOT toISOString,
  // which shifts to UTC and breaks scheduling near midnight in PST).
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndStr = localDateString(weekEnd)

  // Run all three independent queries in parallel
  const [crewResult, assignResult, unassignResult] = await Promise.all([
    // Get all crew members in this company
    supabase
      .from('users')
      .select('id, name, email')
      .eq('role', 'crew')
      .eq('primary_company_id', companyId)
      .order('name', { ascending: true }),
    // Get jobs assigned to crew this week (scoped to company)
    supabase
      .from('jobs')
      .select('id, job_number, customer_name, assigned_crew_id, scheduled_date, schedule_duration_days')
      .eq('company_id', companyId)
      .eq('status', 'scheduled')
      .gte('scheduled_date', weekStart)
      .lt('scheduled_date', weekEndStr),
    // Get unassigned jobs (scoped to company, scheduled status but no crew)
    supabase
      .from('jobs')
      .select('id, job_number, customer_name, status')
      .eq('company_id', companyId)
      .eq('status', 'scheduled')
      .is('assigned_crew_id', null)
      .order('scheduled_date', { ascending: true }),
  ])

  if (crewResult.error) throw new Error('Failed to fetch crew members')
  if (assignResult.error) throw new Error('Failed to fetch assignments')
  if (unassignResult.error) throw new Error('Failed to fetch unassigned jobs')

  const crew = crewResult.data
  // Cast to our known shape since Supabase generated types may omit schedule_duration_days
  const typedAssignments = (assignResult.data ?? []) as JobWithDuration[]
  const unassigned = unassignResult.data

  // Build crew assignments as a plain object (Map can't be serialized across server/client boundary)
  const crewAssignments: Record<string, JobAssignment[]> = {}
  crew?.forEach((member) => {
    crewAssignments[member.id] = []
  })

  // Populate assignments
  typedAssignments.forEach((job) => {
    if (job.assigned_crew_id && crewAssignments[job.assigned_crew_id] !== undefined) {
      const crewMember = crew?.find((c) => c.id === job.assigned_crew_id)
      if (crewMember) {
        crewAssignments[job.assigned_crew_id].push({
          jobId: job.id,
          jobNumber: job.job_number,
          customerName: job.customer_name,
          crewId: job.assigned_crew_id,
          crewName: crewMember.name,
          date: job.scheduled_date || '',
          durationDays: job.schedule_duration_days || 1,
        })
      }
    }
  })

  // Fetch unavailability for the week
  const unavailability = await getCrewUnavailabilityInternal(supabase, weekStart, weekEndStr)

  return {
    crew: crew || [],
    assignments: crewAssignments,
    unassignedJobs: unassigned || [],
    unavailability,
    weekStart,
    weekEnd: weekEndStr,
  }
}

export async function assignJobToCrew(jobId: string, crewId: string, date: string) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)
  await verifyJobOwnership(jobId, companyId)

  // Reject past dates (local timezone)
  const today = localDateString()
  if (date < today) {
    throw new Error('Cannot schedule in the past')
  }

  // Validate crew member exists, is active, AND belongs to the caller's company
  const { data: crewMember } = await supabase
    .from('users')
    .select('id, role, is_active, primary_company_id')
    .eq('id', crewId)
    .single()

  if (!crewMember) throw new Error('Crew member not found')
  if (!crewMember.is_active) throw new Error('Crew member is deactivated')
  if (crewMember.role !== 'crew') throw new Error('User is not a crew member')
  if (crewMember.primary_company_id !== companyId) {
    throw new Error('Crew member is not in your company')
  }

  // Check for double-booking (including multi-day jobs that span across the target date)
  // Only check jobs scheduled within the last 30 days — no need to check ancient jobs
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data: existing } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, scheduled_date, schedule_duration_days')
    .eq('assigned_crew_id', crewId)
    .not('status', 'in', '("cancelled","completed")')
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', localDateString(thirtyDaysAgo))

  const typedExisting = (existing ?? []) as JobWithDuration[]
  const conflicts = typedExisting.filter((job) => {
    const jobStart = new Date(job.scheduled_date! + 'T00:00:00')
    const duration = job.schedule_duration_days || 1
    const jobEnd = new Date(jobStart)
    jobEnd.setDate(jobEnd.getDate() + duration - 1)
    const targetDate = new Date(date)
    return targetDate >= jobStart && targetDate <= jobEnd
  })

  if (conflicts.length > 0) {
    throw new Error(
      `Crew member already assigned to Job ${conflicts[0].job_number} (${conflicts[0].customer_name}) on this date`
    )
  }

  const { data: updatedJob, error } = await supabase
    .from('jobs')
    .update({
      assigned_crew_id: crewId,
      scheduled_date: date,
    })
    .eq('id', jobId)
    .select()
    .single()

  if (error || !updatedJob) {
    console.error('Assignment error:', error)
    throw new Error('Failed to assign job to crew')
  }

  return true
}

export async function assignJobToCrewMultiDay(
  jobId: string,
  crewId: string,
  startDate: string,
  durationDays: number
) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)
  await verifyJobOwnership(jobId, companyId)

  // Clamp duration
  const duration = Math.max(1, Math.min(durationDays, 14))

  // Reject past dates (local timezone)
  const todayMulti = localDateString()
  if (startDate < todayMulti) {
    throw new Error('Cannot schedule in the past')
  }

  // Validate crew (and verify company membership)
  const { data: crewMember } = await supabase
    .from('users')
    .select('id, role, is_active, primary_company_id')
    .eq('id', crewId)
    .single()

  if (!crewMember) throw new Error('Crew member not found')
  if (!crewMember.is_active) throw new Error('Crew member is deactivated')
  if (crewMember.role !== 'crew') throw new Error('User is not a crew member')
  if (crewMember.primary_company_id !== companyId) {
    throw new Error('Crew member is not in your company')
  }

  // Check for double-booking across ALL dates in the multi-day range
  // Only check jobs scheduled within the last 30 days — no need to check ancient jobs
  const thirtyDaysAgoMulti = new Date()
  thirtyDaysAgoMulti.setDate(thirtyDaysAgoMulti.getDate() - 30)
  const { data: existing } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, scheduled_date, schedule_duration_days')
    .eq('assigned_crew_id', crewId)
    .not('status', 'in', '("cancelled","completed")')
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', localDateString(thirtyDaysAgoMulti))

  // Audit R2-#26: parse YYYY-MM-DD as LOCAL midnight so getDate() and the
  // setDate arithmetic operate on the user's calendar day, not UTC.
  const newStart = new Date(startDate + 'T00:00:00')
  const newEnd = new Date(newStart)
  newEnd.setDate(newEnd.getDate() + duration - 1)

  const typedExistingMulti = (existing ?? []) as JobWithDuration[]
  const conflicts = typedExistingMulti.filter((job) => {
    const jobStart = new Date(job.scheduled_date! + 'T00:00:00')
    const jobDuration = job.schedule_duration_days || 1
    const jobEnd = new Date(jobStart)
    jobEnd.setDate(jobEnd.getDate() + jobDuration - 1)
    // Two ranges overlap if one starts before the other ends and vice versa
    return newStart <= jobEnd && newEnd >= jobStart
  })

  if (conflicts.length > 0) {
    throw new Error(
      `Crew member already assigned to Job ${conflicts[0].job_number} (${conflicts[0].customer_name}) during this date range`
    )
  }

  const { data: updatedJob, error } = await supabase
    .from('jobs')
    .update({
      assigned_crew_id: crewId,
      scheduled_date: startDate,
      schedule_duration_days: duration,
    })
    .eq('id', jobId)
    .select()
    .single()

  if (error || !updatedJob) {
    console.error('Multi-day assignment error:', error)
    throw new Error('Failed to assign job to crew')
  }

  return true
}

export async function unassignJobFromCrew(jobId: string) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)
  await verifyJobOwnership(jobId, companyId)

  // Intentionally PRESERVE scheduled_date and schedule_duration_days.
  // Previous behavior nulled them, which had two bad side effects:
  //   1. The job disappeared from the calendar entirely (no date → no cell)
  //   2. If the manager just wanted to re-assign a different crew member,
  //      they lost the schedule and had to re-enter it.
  // Now "unassign" means "open the slot back up" — the date stays so the
  // job still shows in the day's dispatch list as unassigned.
  const { error } = await supabase
    .from('jobs')
    .update({ assigned_crew_id: null })
    .eq('id', jobId)
    .eq('company_id', companyId)

  if (error) {
    console.error('Unassignment error:', error)
    throw new Error('Failed to unassign job')
  }

  return true
}

// ─── Crew Availability ────────────────────────────────────────────────────────

export async function getCrewUnavailability(weekStart: string): Promise<Record<string, string[]>> {
  const supabase = await createClient()
  await getUserWithCompany() // auth + company validation

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const { data } = await supabase
    .from('crew_unavailability')
    .select('user_id, date, reason')
    .gte('date', weekStart)
    .lt('date', localDateString(weekEnd))

  // Returns: { userId: ['2024-01-15', '2024-01-16'] }
  const result: Record<string, string[]> = {}
  for (const row of data ?? []) {
    if (!result[row.user_id]) result[row.user_id] = []
    result[row.user_id].push(row.date)
  }
  return result
}

export async function markCrewUnavailable(userId: string, date: string, reason?: string) {
  const supabase = await createClient()
  const { user, companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Verify target user belongs to manager's company
  const { data: targetUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .eq('primary_company_id', companyId)
    .single()
  if (!targetUser) throw new Error('Crew member not found in your company')

  const { error } = await supabase
    .from('crew_unavailability')
    .upsert({ user_id: userId, date, reason, created_by: user.id }, { onConflict: 'user_id,date' })

  if (error) throw new Error(`Failed to mark unavailable: ${error.message}`)
}

export async function clearCrewUnavailable(userId: string, date: string) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Verify target user belongs to manager's company
  const { data: targetUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .eq('primary_company_id', companyId)
    .single()
  if (!targetUser) throw new Error('Crew member not found in your company')

  const { error } = await supabase
    .from('crew_unavailability')
    .delete()
    .eq('user_id', userId)
    .eq('date', date)

  if (error) throw new Error(`Failed to clear unavailability: ${error.message}`)
}

// ─── Daily Dispatch Summary ──────────────────────────────────────────────────

interface DispatchJob {
  jobId: string
  jobNumber: string
  customerName: string
  address: string
  city: string
  scheduledDate: string
}

interface DispatchCrew {
  crewId: string
  crewName: string
  jobs: DispatchJob[]
  totalJobs: number
  isUnavailable: boolean
}

interface DailyDispatchSummary {
  crews: DispatchCrew[]
  unassignedJobs: number
  date: string
}

export async function getDailyDispatchSummary(date: string): Promise<DailyDispatchSummary> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // 1. Fetch all crew members for the company
  const { data: crew, error: crewError } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'crew')
    .eq('primary_company_id', companyId)
    .order('name', { ascending: true })

  if (crewError) throw new Error('Failed to fetch crew members')

  // 2. Fetch scheduled/in-progress jobs for the company within a bounded date range.
  //    A job overlaps the target date if:  scheduled_date <= date < scheduled_date + duration
  //    We fetch a ±30-day window and filter in JS (same pattern as conflict checking).
  const thirtyDaysAgo = new Date(date)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysFromNow = new Date(date)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  const { data: allJobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, address, city, assigned_crew_id, scheduled_date, schedule_duration_days')
    .eq('company_id', companyId)
    .not('status', 'in', '("cancelled","completed")')
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', localDateString(thirtyDaysAgo))
    .lte('scheduled_date', localDateString(thirtyDaysFromNow))

  if (jobsError) throw new Error('Failed to fetch jobs for dispatch')

  const typedJobs = (allJobs ?? []) as (JobWithDuration & { address: string; city: string })[]
  const targetMs = new Date(date).getTime()

  // Filter to jobs that span the target date
  const jobsOnDate = typedJobs.filter((job) => {
    const startMs = new Date(job.scheduled_date! + 'T00:00:00').getTime()
    const duration = job.schedule_duration_days || 1
    const endMs = startMs + (duration - 1) * 86400000
    return targetMs >= startMs && targetMs <= endMs
  })

  // 3. Fetch unavailability for this single date
  const { data: unavailRows } = await supabase
    .from('crew_unavailability')
    .select('user_id')
    .eq('date', date)

  const unavailSet = new Set<string>((unavailRows ?? []).map((r: { user_id: string }) => r.user_id))

  // 4. Build per-crew dispatch
  const crews: DispatchCrew[] = (crew ?? []).map((member) => {
    const crewJobs = jobsOnDate
      .filter((j) => j.assigned_crew_id === member.id)
      .map((j) => ({
        jobId: j.id,
        jobNumber: j.job_number,
        customerName: j.customer_name,
        address: j.address ?? '',
        city: j.city ?? '',
        scheduledDate: j.scheduled_date!,
      }))

    return {
      crewId: member.id,
      crewName: member.name,
      jobs: crewJobs,
      totalJobs: crewJobs.length,
      isUnavailable: unavailSet.has(member.id),
    }
  })

  // 5. Count unassigned jobs (scheduled but no crew, across all dates)
  const { count, error: countError } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'scheduled')
    .is('assigned_crew_id', null)

  if (countError) throw new Error('Failed to count unassigned jobs')

  return {
    crews,
    unassignedJobs: count ?? 0,
    date,
  }
}
