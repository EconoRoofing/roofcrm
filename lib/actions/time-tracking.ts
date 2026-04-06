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
      { cache: 'no-store' }
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
  photoUrl?: string
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
      flagged,
      flag_reason: flagReason,
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

  const clockOut = new Date()

  // Fetch all breaks for this entry
  const { data: breaks } = await supabase
    .from('breaks')
    .select('duration_minutes, end_time')
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

  const { regularHours, overtimeHours, doubletimeHours } = calcOvertime(workingHours)

  // Cost calculation
  const payType = entry.pay_type as string
  const hourlyRate = Number(entry.hourly_rate ?? 0)
  const dayRate = Number(entry.day_rate ?? 0)

  let totalCost: number
  if (payType === 'day_rate') {
    totalCost = dayRate
  } else {
    totalCost =
      regularHours * hourlyRate +
      overtimeHours * hourlyRate * 1.5 +
      doubletimeHours * hourlyRate * 2.0
  }

  // Anomaly flags
  let flagged = entry.flagged as boolean
  let flagReason = entry.flag_reason as string | null

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
    'Employee,Date,Job #,Clock In,Clock Out,Regular Hrs,OT Hrs,DT Hrs,Total Pay,Breaks',
  ]

  for (const entry of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = entry as any
    const employee = e.user?.name ?? ''
    const date = e.clock_in ? new Date(e.clock_in).toLocaleDateString() : ''
    const jobNumber = e.job?.job_number ?? ''
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
