'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
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
 * Fetch weather for a city via the internal API route.
 */
async function fetchWeather(city: string): Promise<string> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(
      `${baseUrl}/api/weather?city=${encodeURIComponent(city)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) return 'Unknown'
    const data = await res.json()
    return `${data.description}, ${data.temp}°F, wind ${data.windSpeed} mph`
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
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Guard: user must not already be clocked in
  const { data: existing } = await supabase
    .from('time_entries')
    .select('id')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .maybeSingle()

  if (existing) throw new Error('Already clocked in. Clock out first.')

  // Fetch job for geofence + city
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('lat, lng, city, status')
    .eq('id', jobId)
    .single()

  if (jobError || !job) throw new Error('Job not found')

  // Geofence check
  let geofence: GeofenceResult | null = null
  let distanceFt: number | null = null

  if (lat !== null && lng !== null && job.lat && job.lng) {
    geofence = checkGeofence(lat, lng, Number(job.lat), Number(job.lng))
    distanceFt = geofence.distanceFt
  }

  // Fetch user pay info
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('pay_type, hourly_rate, day_rate')
    .eq('id', user.id)
    .single()

  if (userError || !userData) throw new Error('User pay data not found')

  // Weather
  const weatherConditions = await fetchWeather(job.city ?? 'Fresno')

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
      user_id: user.id,
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
      .eq('inspector_id', user.id)
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
      const { data: jobDetail } = await supabase
        .from('jobs')
        .select('job_type')
        .eq('id', jobId)
        .single()

      const highRiskTypes = ['reroof', 'new_construction']
      if (jobDetail && highRiskTypes.includes(jobDetail.job_type)) {
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
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Find active time entry
  const { data: entry, error: fetchError } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .maybeSingle()

  if (fetchError) throw new Error(`Failed to fetch active entry: ${fetchError.message}`)
  if (!entry) throw new Error('No active clock-in found.')

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

  let { regularHours, overtimeHours, doubletimeHours } = calcOvertime(workingHours)

  // Cost calculation
  const payType = entry.pay_type as string
  const hourlyRate = Number(entry.hourly_rate ?? 0)
  const dayRate = Number(entry.day_rate ?? 0)

  // Split shift aggregation: check for other completed entries today (CA law)
  // If cumulative daily hours exceed 8, upgrade the excess from regular to OT
  if (payType !== 'day_rate') {
    const clockInDate = new Date(entry.clock_in as string)
    const dayStart = new Date(clockInDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(clockInDate)
    dayEnd.setHours(23, 59, 59, 999)

    const { data: sameDayEntries } = await supabase
      .from('time_entries')
      .select('total_hours')
      .eq('user_id', user.id)
      .not('id', 'eq', entry.id)
      .not('clock_out', 'is', null)
      .gte('clock_in', dayStart.toISOString())
      .lte('clock_in', dayEnd.toISOString())

    const priorDailyHours = (sameDayEntries ?? []).reduce(
      (sum, e) => sum + (Number(e.total_hours) || 0), 0
    )

    const totalDailyHours = priorDailyHours + workingHours
    if (totalDailyHours > 8 && regularHours > 0) {
      // How many of the 8 regular hours were already used by prior shifts
      const priorRegularUsed = Math.min(priorDailyHours, 8)
      const regularAllowedThisShift = Math.max(0, 8 - priorRegularUsed)

      if (regularHours > regularAllowedThisShift) {
        const excessRegular = regularHours - regularAllowedThisShift
        regularHours = regularAllowedThisShift
        overtimeHours = overtimeHours + excessRegular
      }

      // Also check if cumulative > 12 for double-time
      if (totalDailyHours > 12) {
        const priorOtUsed = Math.max(0, Math.min(priorDailyHours - 8, 4))
        const otAllowedThisShift = Math.max(0, 4 - priorOtUsed)

        if (overtimeHours > otAllowedThisShift) {
          const excessOt = overtimeHours - otAllowedThisShift
          overtimeHours = otAllowedThisShift
          doubletimeHours = doubletimeHours + excessOt
        }
      }
    }
  }

  // Weekly OT check (CA law: hours over 40/week at 1.5×)
  // Fetch all completed entries for this user in the current work week (Mon–Sun)
  const clockOutDate = new Date()
  const dayOfWeek = clockOutDate.getDay() // 0=Sun, 1=Mon…
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(clockOutDate)
  weekStart.setDate(clockOutDate.getDate() + mondayOffset)
  weekStart.setHours(0, 0, 0, 0)

  const { data: weekEntries } = await supabase
    .from('time_entries')
    .select('total_hours, regular_hours, overtime_hours, doubletime_hours')
    .eq('user_id', user.id)
    .gte('clock_in', weekStart.toISOString())
    .not('id', 'eq', entry.id)  // exclude current entry

  const priorWeeklyHours = (weekEntries ?? []).reduce(
    (sum, e) => sum + (Number(e.total_hours) || 0), 0
  )

  const totalWeeklyHours = priorWeeklyHours + workingHours

  // If total weekly hours > 40, any hours counted as "regular" above the 40hr threshold
  // should be upgraded to OT (1.5×)
  if (totalWeeklyHours > 40 && regularHours > 0 && payType !== 'day_rate') {
    const weeklyOtHours = Math.min(regularHours, totalWeeklyHours - 40)
    if (weeklyOtHours > 0) {
      regularHours = Math.max(0, regularHours - weeklyOtHours)
      overtimeHours = overtimeHours + weeklyOtHours
    }
  }

  // Anomaly flags (initialize early so 7th-day check can augment them)
  let flagged = entry.flagged as boolean
  let flagReason = entry.flag_reason as string | null

  // 7th consecutive day check (CA law)
  // A "workweek" is Mon-Sun. If the employee has worked all 6 prior days (Mon-Sat)
  // and this is Sunday (day 7), all hours are at minimum 1.5×
  // dayOfWeek already declared above from clockOutDate.getDay()
  if (dayOfWeek === 0 && payType !== 'day_rate') {
    // Check if they worked all 6 prior days (Mon-Sat)
    const daysWorked = new Set<number>()
    const { data: weekDayEntries } = await supabase
      .from('time_entries')
      .select('clock_in')
      .eq('user_id', user.id)
      .gte('clock_in', weekStart.toISOString())
      .lt('clock_in', clockOut.toISOString())

    for (const e of weekDayEntries ?? []) {
      const day = new Date(e.clock_in).getDay()
      if (day >= 1 && day <= 6) {  // Only count Mon-Sat
        daysWorked.add(day)
      }
    }

    // If they worked Mon(1) through Sat(6) = 6 unique days, Sunday is the 7th consecutive day
    if (daysWorked.size >= 6) {
      // 7th day: first 8hrs at 1.5×, after 8hrs at 2×
      // Override the regular/OT split (takes priority over weekly OT calc)
      regularHours = 0
      overtimeHours = Math.min(workingHours, 8)    // first 8 at 1.5×
      doubletimeHours = Math.max(0, workingHours - 8)  // after 8 at 2×

      flagged = true
      flagReason = (flagReason ? flagReason + '; ' : '') + '7th consecutive workday — CA premium pay applied'
    }
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

export async function getActiveTimeEntry(userId: string): Promise<
  (TimeEntry & { job?: { job_number: string; customer_name: string; address: string; city: string } }) | null
> {
  const supabase = await createClient()

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
  const supabase = await createClient()

  let query = supabase
    .from('time_entries')
    .select(`
      *,
      job:jobs(job_number, customer_name, address, city),
      user:users(id, name, email)
    `)
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

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch time entries: ${error.message}`)
  return (data ?? []) as TimeEntry[]
}

export async function getJobLaborCost(jobId: string): Promise<{
  totalHours: number
  totalCost: number
  entries: TimeEntry[]
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
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
  const supabase = await createClient()

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
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify manager role
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'manager') throw new Error('Manager access required')

  const { error } = await supabase
    .from('time_entries')
    .update({ flagged: true, flag_reason: reason })
    .eq('id', entryId)

  if (error) throw new Error(`Failed to flag entry: ${error.message}`)
}

export async function unflagEntry(entryId: string): Promise<void> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'manager') throw new Error('Manager access required')

  const { error } = await supabase
    .from('time_entries')
    .update({ flagged: false, flag_reason: null })
    .eq('id', entryId)

  if (error) throw new Error(`Failed to unflag entry: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Unclosed clock-in detection (called by daily cron)
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

  // Flag each entry
  for (const entry of unclosed) {
    await supabase.from('time_entries').update({
      flagged: true,
      flag_reason: 'Forgot to clock out — entry still open from ' + new Date(entry.clock_in as string).toLocaleDateString(),
    }).eq('id', entry.id)
  }

  return { flagged: unclosed.length }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export async function exportTimeEntriesCSV(startDate: string, endDate: string): Promise<string> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('time_entries')
    .select(`
      *,
      job:jobs(job_number, customer_name),
      user:users(name)
    `)
    .gte('clock_in', startDate)
    .lte('clock_in', endDate)
    .order('clock_in', { ascending: true })

  if (error) throw new Error(`Failed to fetch entries for export: ${error.message}`)

  const rows: string[] = [
    'Employee,Date,Job #,Cost Code,Clock In,Clock Out,Regular Hrs,OT Hrs,DT Hrs,Total Pay,Breaks',
  ]

  for (const entry of data ?? []) {
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

    // Fetch breaks for this entry
    const { data: breaks } = await supabase
      .from('breaks')
      .select('type, duration_minutes')
      .eq('time_entry_id', e.id)

    const breakSummary = (breaks ?? [])
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
