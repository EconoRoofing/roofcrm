'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership } from '@/lib/auth-helpers'
import { checkGeofence } from '@/lib/geo'
import type { TimeEntry, GeofenceResult } from '@/lib/types/time-tracking'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Calculate CA overtime breakdown from total working hours.
 * Regular: ≤ 8 hrs | OT (1.5×): 8–12 hrs | DT (2×): > 12 hrs
 */
function calcOvertime(workingHours: number): {
  regularHours: number
  overtimeHours: number
  doubletimeHours: number
} {
  const regular = Math.min(workingHours, 8)
  const overtime = Math.max(0, Math.min(workingHours - 8, 4)) // 8–12
  const doubletime = Math.max(0, workingHours - 12)
  return {
    regularHours: parseFloat(regular.toFixed(4)),
    overtimeHours: parseFloat(overtime.toFixed(4)),
    doubletimeHours: parseFloat(doubletime.toFixed(4)),
  }
}

/**
 * Full California labor law overtime calculation.
 * Handles daily 8hr OT threshold, daily 12hr doubletime threshold,
 * weekly 40hr OT threshold, 7th consecutive day rules, and split shift aggregation.
 */
function calculateCaliforniaOT(params: {
  sameDayHours: number
  weeklyHoursBeforeToday: number
  isSeventhConsecutiveDay: boolean
  workingHours: number
}): { regular: number; overtime: number; doubletime: number } {
  const { sameDayHours, weeklyHoursBeforeToday, isSeventhConsecutiveDay, workingHours } = params

  // Start from base calcOvertime result
  let { regularHours, overtimeHours, doubletimeHours } = calcOvertime(workingHours)

  // Split shift aggregation: if cumulative daily hours exceed 8, upgrade excess to OT
  const totalDailyHours = sameDayHours + workingHours
  if (totalDailyHours > 8 && regularHours > 0) {
    const priorRegularUsed = Math.min(sameDayHours, 8)
    const regularAllowedThisShift = Math.max(0, 8 - priorRegularUsed)

    if (regularHours > regularAllowedThisShift) {
      const excessRegular = regularHours - regularAllowedThisShift
      regularHours = regularAllowedThisShift
      overtimeHours = overtimeHours + excessRegular
    }

    // Check if cumulative > 12 for double-time
    if (totalDailyHours > 12) {
      const priorOtUsed = Math.max(0, Math.min(sameDayHours - 8, 4))
      const otAllowedThisShift = Math.max(0, 4 - priorOtUsed)

      if (overtimeHours > otAllowedThisShift) {
        const excessOt = overtimeHours - otAllowedThisShift
        overtimeHours = otAllowedThisShift
        doubletimeHours = doubletimeHours + excessOt
      }
    }
  }

  // Weekly OT: hours over 40/week at 1.5x
  const totalWeeklyHours = weeklyHoursBeforeToday + workingHours
  if (totalWeeklyHours > 40 && regularHours > 0) {
    const weeklyOtHours = Math.min(regularHours, totalWeeklyHours - 40)
    if (weeklyOtHours > 0) {
      regularHours = Math.max(0, regularHours - weeklyOtHours)
      overtimeHours = overtimeHours + weeklyOtHours
    }
  }

  // 7th consecutive day: all hours at minimum 1.5x, after 8hrs at 2x
  if (isSeventhConsecutiveDay) {
    regularHours = 0
    overtimeHours = Math.min(workingHours, 8)
    doubletimeHours = Math.max(0, workingHours - 8)
  }

  return { regular: regularHours, overtime: overtimeHours, doubletime: doubletimeHours }
}

/**
 * Fetch weather for a city directly from OpenWeatherMap API.
 * Avoids a self-referential HTTP call through the app's own route.
 */
async function fetchWeatherDirect(city: string): Promise<string> {
  try {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY
    if (!apiKey) return 'Unknown'

    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},CA,US&appid=${apiKey}&units=imperial`,
      { next: { revalidate: 900 }, signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) return 'Unknown'
    const data = await res.json()
    return `${data.weather?.[0]?.description ?? 'Unknown'}, ${Math.round(data.main?.temp ?? 0)}°F, wind ${Math.round(data.wind?.speed ?? 0)} mph`
  } catch {
    return 'Unknown'
  }
}

// ---------------------------------------------------------------------------
// Clock-in / Clock-out
// ---------------------------------------------------------------------------

export async function clockIn(
  jobId: string,
  lat: number | null,
  lng: number | null,
  photoUrl?: string,
  costCode?: string,
  ppeVerified?: Record<string, boolean>
): Promise<{ entry: TimeEntry; geofence: GeofenceResult | null }> {
  const supabase = await createClient()
  const { userId, companyId } = await getUserWithCompany()

  // Run dup-check, job fetch, and user pay data in parallel — all independent
  const [existingResult, jobResult, userDataResult] = await Promise.all([
    supabase.from('time_entries').select('id').eq('user_id', userId).is('clock_out', null).maybeSingle(),
    supabase.from('jobs').select('lat, lng, city, status, job_type, company_id').eq('id', jobId).single(),
    supabase.from('users').select('pay_type, hourly_rate, day_rate').eq('id', userId).single(),
  ])

  if (existingResult.data) throw new Error('Already clocked in. Clock out first.')
  if (jobResult.error || !jobResult.data) throw new Error('Job not found')
  if (userDataResult.error || !userDataResult.data) throw new Error('User pay data not found')

  // Verify crew member's company matches the job's company
  if (jobResult.data.company_id !== companyId) {
    throw new Error('Job not found or access denied')
  }

  const job = jobResult.data
  const userData = userDataResult.data

  // Geofence check
  let geofence: GeofenceResult | null = null
  let distanceFt: number | null = null

  if (lat !== null && lng !== null && job.lat && job.lng) {
    geofence = checkGeofence(lat, lng, Number(job.lat), Number(job.lng))
    distanceFt = geofence.distanceFt
  }

  // Weather — direct API call, no self-referential HTTP hop
  const weatherConditions = await fetchWeatherDirect(job.city ?? 'Fresno')

  // Anomaly check: clock-in before 5 AM or after 8 PM
  const clockInTime = new Date()
  const hour = clockInTime.getHours()
  const flagged = hour < 5 || hour >= 20
  const flagReason = flagged
    ? `Clock-in at unusual hour: ${clockInTime.toLocaleTimeString()}`
    : null

  // Create time entry
  const { data: entry, error: insertError } = await supabase
    .from('time_entries')
    .insert({
      user_id: userId,
      job_id: jobId,
      clock_in: clockInTime.toISOString(),
      clock_in_lat: lat,
      clock_in_lng: lng,
      clock_in_distance_ft: distanceFt,
      clock_in_photo_url: photoUrl ?? null,
      pay_type: userData.pay_type ?? 'hourly',
      hourly_rate: userData.hourly_rate ?? 0,
      day_rate: userData.day_rate ?? 0,
      weather_conditions: weatherConditions,
      cost_code: costCode ?? 'labor',
      flagged,
      flag_reason: flagReason,
      ppe_verified: ppeVerified ?? {},
    })
    .select()
    .single()

  if (insertError || !entry) throw new Error(`Failed to clock in: ${insertError?.message}`)

  // Update job status to in_progress if it's currently scheduled
  if (job.status === 'scheduled') {
    await supabase
      .from('jobs')
      .update({ status: 'in_progress' })
      .eq('id', jobId)
  }

  // Link today's completed safety inspection to this time entry (best-effort)
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: inspection } = await supabase
      .from('safety_inspections')
      .select('id')
      .eq('job_id', jobId)
      .eq('inspector_id', userId)
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (inspection) {
      await supabase
        .from('time_entries')
        .update({ safety_inspection_id: inspection.id })
        .eq('id', entry.id)
    } else {
      // Flag if this is a high-risk job type with no pre-work inspection
      // job.job_type already fetched in the parallel query above — no extra DB call needed
      const highRiskTypes = ['reroof', 'new_construction']
      if (highRiskTypes.includes(job.job_type)) {
        const existingReason = entry.flag_reason as string | null
        const noInspectionFlag = 'No pre-work safety inspection completed'
        await supabase
          .from('time_entries')
          .update({
            flagged: true,
            flag_reason: existingReason
              ? `${existingReason}; ${noInspectionFlag}`
              : noInspectionFlag,
          })
          .eq('id', entry.id)
      }
    }
  } catch (inspErr) {
    // Never block clock-in due to inspection linking failure
    console.error('Safety inspection link error:', inspErr)
  }

  return { entry: entry as TimeEntry, geofence }
}

export async function clockOut(
  lat: number | null,
  lng: number | null,
  photoUrl?: string
): Promise<TimeEntry> {
  const supabase = await createClient()
  const { userId, companyId } = await getUserWithCompany()

  // Find active time entry
  const { data: entry, error: fetchError } = await supabase
    .from('time_entries')
    .select('*, job:jobs!inner(company_id)')
    .eq('user_id', userId)
    .is('clock_out', null)
    .maybeSingle()

  if (fetchError) throw new Error(`Failed to fetch active entry: ${fetchError.message}`)
  if (!entry) throw new Error('No active clock-in found.')

  // Verify the time entry's job belongs to the user's company
  if ((entry as any).job?.company_id !== companyId) {
    throw new Error('No active clock-in found.')
  }

  const clockInTime = new Date(entry.clock_in as string)
  const hoursSinceClock = (Date.now() - clockInTime.getTime()) / 1000 / 3600
  if (hoursSinceClock > 24) {
    throw new Error('Cannot clock out — clock-in was more than 24 hours ago. Contact your manager.')
  }

  const clockOut = new Date()

  // Fetch all breaks for this entry
  const { data: breaks } = await supabase
    .from('breaks')
    .select('duration_minutes, end_time, type')
    .eq('time_entry_id', entry.id)

  // Only count completed breaks
  const totalBreakMinutes = (breaks ?? [])
    .filter((b) => b.end_time !== null)
    .reduce((sum, b) => sum + (b.duration_minutes ?? 0), 0)

  // Working hours = elapsed − breaks
  const clockInMs = new Date(entry.clock_in as string).getTime()
  const clockOutMs = clockOut.getTime()
  const elapsedHours = (clockOutMs - clockInMs) / 1000 / 3600
  const workingHours = Math.max(0, elapsedHours - totalBreakMinutes / 60)

  // Cost calculation
  const payType = entry.pay_type as string
  const hourlyRate = Number(entry.hourly_rate ?? 0)
  const dayRate = Number(entry.day_rate ?? 0)

  // Pre-compute day/week boundary variables needed for parallel queries
  const clockInDate = new Date(entry.clock_in as string)
  const dayStart = new Date(clockInDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(clockInDate)
  dayEnd.setHours(23, 59, 59, 999)

  const clockOutDate = new Date()
  const dayOfWeek = clockOutDate.getDay() // 0=Sun, 1=Mon…
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(clockOutDate)
  weekStart.setDate(clockOutDate.getDate() + mondayOffset)
  weekStart.setHours(0, 0, 0, 0)

  // Run same-day and weekly queries in parallel — both independent of each other
  const [sameDayResult, weekResult] = await Promise.all([
    payType !== 'day_rate'
      ? supabase
          .from('time_entries')
          .select('total_hours')
          .eq('user_id', userId)
          .not('id', 'eq', entry.id)
          .not('clock_out', 'is', null)
          .gte('clock_in', dayStart.toISOString())
          .lte('clock_in', dayEnd.toISOString())
      : Promise.resolve({ data: [] as { total_hours: unknown }[] | null }),
    supabase
      .from('time_entries')
      .select('total_hours, regular_hours, overtime_hours, doubletime_hours')
      .eq('user_id', userId)
      .gte('clock_in', weekStart.toISOString())
      .not('id', 'eq', entry.id),
  ])

  const sameDayHours = payType !== 'day_rate'
    ? (sameDayResult.data ?? []).reduce((sum, e) => sum + (Number(e.total_hours) || 0), 0)
    : 0

  const priorWeeklyHours = (weekResult.data ?? []).reduce(
    (sum, e) => sum + (Number(e.total_hours) || 0), 0
  )

  // Anomaly flags (initialize early so 7th-day check can augment them)
  let flagged = entry.flagged as boolean
  let flagReason = entry.flag_reason as string | null

  // 7th consecutive day check (CA law)
  let isSeventhConsecutiveDay = false
  if (dayOfWeek === 0 && payType !== 'day_rate') {
    const daysWorked = new Set<number>()
    const { data: weekDayEntries } = await supabase
      .from('time_entries')
      .select('clock_in')
      .eq('user_id', userId)
      .gte('clock_in', weekStart.toISOString())
      .lt('clock_in', clockOut.toISOString())

    for (const e of weekDayEntries ?? []) {
      const day = new Date(e.clock_in).getDay()
      if (day >= 1 && day <= 6) daysWorked.add(day)
    }

    if (daysWorked.size >= 6) {
      isSeventhConsecutiveDay = true
      flagged = true
      flagReason = (flagReason ? flagReason + '; ' : '') + '7th consecutive workday — CA premium pay applied'
    }
  }

  // Calculate CA overtime using extracted function
  let regularHours: number
  let overtimeHours: number
  let doubletimeHours: number

  if (payType !== 'day_rate') {
    const otResult = calculateCaliforniaOT({
      sameDayHours,
      weeklyHoursBeforeToday: priorWeeklyHours,
      isSeventhConsecutiveDay,
      workingHours,
    })
    regularHours = otResult.regular
    overtimeHours = otResult.overtime
    doubletimeHours = otResult.doubletime
  } else {
    const base = calcOvertime(workingHours)
    regularHours = base.regularHours
    overtimeHours = base.overtimeHours
    doubletimeHours = base.doubletimeHours
  }

  let totalCost: number
  if (payType === 'day_rate') {
    totalCost = dayRate
  } else {
    totalCost =
      regularHours * hourlyRate +
      overtimeHours * hourlyRate * 1.5 +
      doubletimeHours * hourlyRate * 2.0
  }

  if (workingHours > 12) {
    flagged = true
    flagReason = [flagReason, `Shift exceeds 12 hours (${workingHours.toFixed(2)} hrs)`]
      .filter(Boolean)
      .join('; ')
  }

  if (lat !== null && lng !== null && entry.clock_in_lat && entry.clock_in_lng) {
    // Flag if clock-out is more than 2000ft from clock-in location
    const { getDistanceFt } = await import('@/lib/geo')
    const dist = getDistanceFt(lat, lng, Number(entry.clock_in_lat), Number(entry.clock_in_lng))
    if (dist > 2000) {
      flagged = true
      flagReason = [flagReason, `Clock-out distance ${Math.round(dist)}ft from clock-in`]
        .filter(Boolean)
        .join('; ')
    }
  }

  // California break premium pay (Labor Code 226.7)
  // 1 hour premium for each missed required meal period and each missed required rest period
  let breakPremiumHours = 0
  let breakPremiumReason = ''

  if (payType !== 'day_rate') {
    const completedBreaks = (breaks ?? []).filter(b => b.end_time !== null)
    const mealBreaks = completedBreaks.filter(b => b.type === 'meal')
    const restBreaks = completedBreaks.filter(b => b.type === 'rest')

    // Meal period: required if shift > 5 hours. Second meal required if shift > 10 hours.
    const mealsRequired = workingHours > 10 ? 2 : workingHours > 5 ? 1 : 0
    const mealsMissed = Math.max(0, mealsRequired - mealBreaks.length)

    // Rest period: required for every 4 hours worked (or major fraction thereof)
    // "Major fraction" = more than 2 hours. So: 0-3.5hrs=0, 3.5-7.5hrs=1, 7.5-11.5hrs=2, etc.
    const restsRequired = workingHours > 3.5 ? Math.ceil((workingHours - 1.5) / 4) : 0
    const restsMissed = Math.max(0, restsRequired - restBreaks.length)

    breakPremiumHours = mealsMissed + restsMissed

    if (breakPremiumHours > 0) {
      const premiumPay = breakPremiumHours * hourlyRate
      totalCost = totalCost + premiumPay

      const reasons = []
      if (mealsMissed > 0) reasons.push(`${mealsMissed} missed meal period(s)`)
      if (restsMissed > 0) reasons.push(`${restsMissed} missed rest period(s)`)
      breakPremiumReason = `Break premium: ${reasons.join(', ')} — ${breakPremiumHours}hr at $${hourlyRate}/hr = $${premiumPay.toFixed(2)}`

      flagged = true
      flagReason = (flagReason ? flagReason + '; ' : '') + breakPremiumReason
    }
  }

  // Build notes with break premium info if applicable
  const updatedNotes = breakPremiumReason
    ? ((entry.notes as string | null) ? (entry.notes as string) + '\n' : '') + breakPremiumReason
    : (entry.notes as string | null) ?? undefined

  const { data: updated, error: updateError } = await supabase
    .from('time_entries')
    .update({
      clock_out: clockOut.toISOString(),
      clock_out_lat: lat,
      clock_out_lng: lng,
      clock_out_photo_url: photoUrl ?? null,
      regular_hours: regularHours,
      overtime_hours: overtimeHours,
      doubletime_hours: doubletimeHours,
      total_hours: parseFloat(workingHours.toFixed(4)),
      total_cost: parseFloat(totalCost.toFixed(2)),
      flagged,
      flag_reason: flagReason,
      ...(updatedNotes !== undefined ? { notes: updatedNotes } : {}),
    })
    .eq('id', entry.id)
    .select()
    .single()

  if (updateError || !updated) throw new Error(`Failed to clock out: ${updateError?.message}`)

  return updated as TimeEntry
}

// ---------------------------------------------------------------------------
// Query actions
// ---------------------------------------------------------------------------

export async function getActiveCrew(): Promise<Array<{
  id: string
  user_id: string
  job_id: string
  clock_in: string
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_in_distance_ft: number | null
  flagged: boolean
  flag_reason: string | null
  user: { name: string } | null
  job: { job_number: string; customer_name: string; address: string; city: string; company_id: string } | null
}>> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Use inner join to filter time entries by company's jobs in a single query
  const { data } = await supabase
    .from('time_entries')
    .select('id, user_id, job_id, clock_in, clock_in_lat, clock_in_lng, clock_in_distance_ft, flagged, flag_reason, user:users(name), job:jobs!inner(job_number, customer_name, address, city, company_id)')
    .is('clock_out', null)
    .eq('job.company_id', companyId)

  return (data ?? []) as any
}

export async function getActiveTimeEntry(userId: string): Promise<
  (TimeEntry & { job?: { job_number: string; customer_name: string; address: string; city: string } }) | null
> {
  const { userId: callerId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify the requested user belongs to the same company (or is the caller)
  if (userId !== callerId) {
    const { data: targetUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .eq('primary_company_id', companyId)
      .maybeSingle()
    if (!targetUser) throw new Error('User not found or not in your company')
  }

  const { data, error } = await supabase
    .from('time_entries')
    .select(`
      *,
      job:jobs(job_number, customer_name, address, city)
    `)
    .eq('user_id', userId)
    .is('clock_out', null)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch active entry: ${error.message}`)
  return data ?? null
}

interface TimeEntryFilters {
  userId?: string
  jobId?: string
  date?: string
  startDate?: string
  endDate?: string
}

export async function getTimeEntries(filters: TimeEntryFilters = {}): Promise<TimeEntry[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  let query = supabase
    .from('time_entries')
    .select('id, user_id, job_id, clock_in, clock_out, regular_hours, overtime_hours, doubletime_hours, total_hours, total_cost, cost_code, pay_type, hourly_rate, day_rate, flagged, flag_reason, weather_conditions, clock_in_distance_ft, clock_in_photo_url, clock_out_photo_url, notes, created_at, job:jobs!inner(job_number, customer_name, address, city, company_id), user:users(id, name, email)')
    .eq('job.company_id', companyId)
    .order('clock_in', { ascending: false })

  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.jobId) query = query.eq('job_id', filters.jobId)

  if (filters.date) {
    const start = `${filters.date}T00:00:00.000Z`
    const end = `${filters.date}T23:59:59.999Z`
    query = query.gte('clock_in', start).lte('clock_in', end)
  } else {
    if (filters.startDate) query = query.gte('clock_in', filters.startDate)
    if (filters.endDate) query = query.lte('clock_in', filters.endDate)
  }

  query = query.limit(500)

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch time entries: ${error.message}`)
  return (data ?? []) as unknown as TimeEntry[]
}

/** Fetch only currently clocked-in entries (clock_out IS NULL) */
export async function getClockedInEntries(): Promise<TimeEntry[]> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('time_entries')
    .select('id, user_id, job_id, clock_in, clock_out, regular_hours, overtime_hours, doubletime_hours, total_hours, total_cost, cost_code, pay_type, hourly_rate, day_rate, flagged, flag_reason, weather_conditions, clock_in_distance_ft, clock_in_photo_url, clock_out_photo_url, notes, created_at, job:jobs!inner(job_number, customer_name, address, city, company_id), user:users(id, name, email)')
    .eq('job.company_id', companyId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })

  if (error) throw new Error(`Failed to fetch clocked-in entries: ${error.message}`)
  return (data ?? []) as unknown as TimeEntry[]
}

export async function getJobLaborCost(jobId: string): Promise<{
  totalHours: number
  totalCost: number
  entries: TimeEntry[]
}> {
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('time_entries')
    .select('id, total_hours, total_cost')
    .eq('job_id', jobId)
    .order('clock_in', { ascending: true })

  if (error) throw new Error(`Failed to fetch job labor cost: ${error.message}`)

  const entries = (data ?? []) as TimeEntry[]
  const totalHours = entries.reduce((sum, e) => sum + (e.total_hours ?? 0), 0)
  const totalCost = entries.reduce((sum, e) => sum + (e.total_cost ?? 0), 0)

  return {
    totalHours: parseFloat(totalHours.toFixed(4)),
    totalCost: parseFloat(totalCost.toFixed(2)),
    entries,
  }
}

export async function getWeeklyHours(
  userId: string,
  weekStartDate: string
): Promise<{ totalHours: number; overtimeWarning: boolean }> {
  const { userId: callerId, companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify the requested user belongs to the same company (or is the caller)
  if (userId !== callerId) {
    const { data: targetUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .eq('primary_company_id', companyId)
      .maybeSingle()
    if (!targetUser) throw new Error('User not found or not in your company')
  }

  // Week start (Monday) to end (Sunday)
  const start = new Date(weekStartDate)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('time_entries')
    .select('total_hours')
    .eq('user_id', userId)
    .gte('clock_in', start.toISOString())
    .lte('clock_in', end.toISOString())
    .not('clock_out', 'is', null)

  if (error) throw new Error(`Failed to fetch weekly hours: ${error.message}`)

  const totalHours = (data ?? []).reduce((sum, e) => sum + (Number(e.total_hours) ?? 0), 0)

  return {
    totalHours: parseFloat(totalHours.toFixed(4)),
    overtimeWarning: totalHours >= 32, // warn at 32+ hrs (approaching 40)
  }
}

// ---------------------------------------------------------------------------
// Flag management (manager only)
// ---------------------------------------------------------------------------

export async function flagEntry(entryId: string, reason: string): Promise<void> {
  const { companyId, role } = await getUserWithCompany()
  if (role !== 'manager') throw new Error('Manager access required')
  const supabase = await createClient()

  // Verify the time entry's job belongs to the user's company
  const { data: entry } = await supabase
    .from('time_entries')
    .select('id, job:jobs!inner(company_id)')
    .eq('id', entryId)
    .eq('job.company_id', companyId)
    .single()

  if (!entry) throw new Error('Time entry not found or access denied')

  const { error } = await supabase
    .from('time_entries')
    .update({ flagged: true, flag_reason: reason })
    .eq('id', entryId)

  if (error) throw new Error(`Failed to flag entry: ${error.message}`)
}

export async function unflagEntry(entryId: string): Promise<void> {
  const { companyId, role } = await getUserWithCompany()
  if (role !== 'manager') throw new Error('Manager access required')
  const supabase = await createClient()

  // Verify the time entry's job belongs to the user's company
  const { data: entry } = await supabase
    .from('time_entries')
    .select('id, job:jobs!inner(company_id)')
    .eq('id', entryId)
    .eq('job.company_id', companyId)
    .single()

  if (!entry) throw new Error('Time entry not found or access denied')

  const { error } = await supabase
    .from('time_entries')
    .update({ flagged: false, flag_reason: null })
    .eq('id', entryId)

  if (error) throw new Error(`Failed to unflag entry: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Unclosed clock-in detection (called by daily cron)
// NOTE: This function should only be called from the cron route handler,
// which verifies CRON_SECRET. No user context is available in cron jobs.
// ---------------------------------------------------------------------------

export async function detectUnclosedClockIns(): Promise<{ flagged: number }> {
  const supabase = await createClient()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Find time entries from yesterday with no clock_out
  const { data: unclosed } = await supabase
    .from('time_entries')
    .select('id, user_id, job_id, clock_in')
    .is('clock_out', null)
    .lt('clock_in', today.toISOString())

  if (!unclosed || unclosed.length === 0) return { flagged: 0 }

  // Bulk update all unclosed entries in a single query
  const unclosedIds = unclosed.map(e => e.id)
  await supabase.from('time_entries').update({
    flagged: true,
    flag_reason: 'Forgot to clock out — entry still open',
  }).in('id', unclosedIds)

  return { flagged: unclosed.length }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export async function exportTimeEntriesCSV(startDate: string, endDate: string): Promise<string> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('time_entries')
    .select(`
      *,
      job:jobs!inner(job_number, customer_name, company_id),
      user:users(name)
    `)
    .gte('clock_in', startDate)
    .lte('clock_in', endDate)
    .eq('job.company_id', companyId)
    .order('clock_in', { ascending: true })

  if (error) throw new Error(`Failed to fetch entries for export: ${error.message}`)

  const entries = data ?? []

  // Batch-fetch ALL breaks for these entries in a single query — avoids N+1
  const entryIds = entries.map((e) => (e as any).id)
  const { data: allBreaks } = await supabase
    .from('breaks')
    .select('time_entry_id, type, duration_minutes')
    .in('time_entry_id', entryIds)

  // Group breaks by time_entry_id for O(1) lookup in the row loop
  const breaksByEntry = new Map<string, typeof allBreaks>()
  for (const b of allBreaks ?? []) {
    const existing = breaksByEntry.get(b.time_entry_id) ?? []
    existing.push(b)
    breaksByEntry.set(b.time_entry_id, existing)
  }

  const rows: string[] = [
    'Employee,Date,Job #,Cost Code,Clock In,Clock Out,Regular Hrs,OT Hrs,DT Hrs,Total Pay,Breaks',
  ]

  for (const entry of entries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = entry as any
    const employee = e.user?.name ?? ''
    const date = e.clock_in ? new Date(e.clock_in).toLocaleDateString() : ''
    const jobNumber = e.job?.job_number ?? ''
    const costCode = e.cost_code ?? 'labor'
    const clockIn = e.clock_in ? new Date(e.clock_in).toLocaleTimeString() : ''
    const clockOut = e.clock_out ? new Date(e.clock_out).toLocaleTimeString() : ''
    const regularHrs = Number(e.regular_hours ?? 0).toFixed(2)
    const otHrs = Number(e.overtime_hours ?? 0).toFixed(2)
    const dtHrs = Number(e.doubletime_hours ?? 0).toFixed(2)
    const totalPay = Number(e.total_cost ?? 0).toFixed(2)

    // Look up breaks from the pre-fetched Map — no per-entry DB query
    const entryBreaks = breaksByEntry.get(e.id) ?? []
    const breakSummary = entryBreaks
      .map((b) => `${b.type} ${b.duration_minutes}min`)
      .join(' | ')

    const col = (v: string) => `"${v.replace(/"/g, '""')}"`
    rows.push(
      [
        col(employee),
        col(date),
        col(jobNumber),
        col(costCode),
        col(clockIn),
        col(clockOut),
        regularHrs,
        otHrs,
        dtHrs,
        totalPay,
        col(breakSummary),
      ].join(',')
    )
  }

  return rows.join('\n')
}
