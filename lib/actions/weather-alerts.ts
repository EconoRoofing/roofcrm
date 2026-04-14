'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, requireManager } from '@/lib/auth-helpers'
import { logActivity } from '@/lib/actions/activity'
import { sendSMS } from '@/lib/twilio'

// ─── Types ──────────────────────────────────────────────────────────────────

interface WeatherInfo {
  temp: number
  description: string
  rain_probability: number
  wind_speed: number
  icon: string
}

interface AtRiskJob {
  jobId: string
  jobNumber: string
  customerName: string
  crewName: string
  city: string
  address: string
  weather: {
    rain: number
    wind: number
    description: string
  }
}

interface WeatherAlertResult {
  atRisk: AtRiskJob[]
  safe: AtRiskJob[]
  totalJobs: number
}

interface RescheduleResult {
  rescheduled: number
  jobs: Array<{ jobId: string; jobNumber: string; oldDate: string; newDate: string }>
}

interface AlertResult {
  sent: number
  skipped: number
}

// ─── Weather Fetch Helper ───────────────────────────────────────────────────

export async function getWeatherForecast(city: string): Promise<WeatherInfo> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY

  if (!apiKey) {
    return {
      temp: 78,
      description: 'Clear',
      rain_probability: 0,
      wind_speed: 5,
      icon: '01d',
    }
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},US&appid=${apiKey}&units=imperial`
    const res = await fetch(url, { next: { revalidate: 900 } })

    if (!res.ok) throw new Error(`OWM ${res.status}`)

    const raw: Record<string, any> = await res.json()
    const rainMm = raw.rain?.['1h'] ?? 0

    return {
      temp: Math.round(raw.main?.temp ?? 78),
      description: raw.weather?.[0]?.main ?? 'Clear',
      rain_probability: rainMm > 2.5 ? 100 : rainMm > 0.5 ? 70 : rainMm > 0 ? 30 : 0,
      wind_speed: Math.round(raw.wind?.speed ?? 0),
      icon: raw.weather?.[0]?.icon ?? '01d',
    }
  } catch {
    return {
      temp: 78,
      description: 'Clear',
      rain_probability: 0,
      wind_speed: 5,
      icon: '01d',
    }
  }
}

// ─── 1. Check Weather and Identify At-Risk Jobs ─────────────────────────────

export async function checkWeatherAndAlert(date: string): Promise<WeatherAlertResult> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Fetch all scheduled jobs for this date with crew info
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(
      'id, job_number, customer_name, address, city, assigned_crew_id, scheduled_date, schedule_duration_days'
    )
    .eq('company_id', companyId)
    .not('status', 'in', '("cancelled","completed")')
    .not('scheduled_date', 'is', null)

  if (error) throw new Error('Failed to fetch jobs for weather check')

  // Filter to jobs that span the target date (same multi-day logic as scheduling.ts).
  // Audit R2-#26: parse YYYY-MM-DD as local midnight so jobs on the boundary
  // day don't get misclassified as "the day before" in west-of-UTC zones.
  const targetMs = new Date(date + 'T00:00:00').getTime()
  const jobsOnDate = (jobs ?? []).filter((job) => {
    const startMs = new Date(job.scheduled_date! + 'T00:00:00').getTime()
    const duration = (job as any).schedule_duration_days || 1
    const endMs = startMs + (duration - 1) * 86400000
    return targetMs >= startMs && targetMs <= endMs
  })

  if (jobsOnDate.length === 0) {
    return { atRisk: [], safe: [], totalJobs: 0 }
  }

  // Get crew member names
  const crewIds = [...new Set(jobsOnDate.map((j) => j.assigned_crew_id).filter(Boolean))]
  const { data: crewMembers } = await supabase
    .from('users')
    .select('id, name')
    .in('id', crewIds.length > 0 ? crewIds : ['__none__'])

  const crewMap: Record<string, string> = {}
  for (const c of crewMembers ?? []) {
    crewMap[c.id] = c.name
  }

  // Get unique cities and fetch weather for each
  const cities = [...new Set(jobsOnDate.map((j) => j.city).filter(Boolean))]
  const weatherCache: Record<string, WeatherInfo> = {}

  await Promise.all(
    cities.map(async (city) => {
      weatherCache[city.toLowerCase()] = await getWeatherForecast(city)
    })
  )

  // Classify jobs
  const atRisk: AtRiskJob[] = []
  const safe: AtRiskJob[] = []

  for (const job of jobsOnDate) {
    const city = job.city ?? ''
    const weather = weatherCache[city.toLowerCase()] ?? {
      rain_probability: 0,
      wind_speed: 0,
      description: 'Unknown',
    }

    const entry: AtRiskJob = {
      jobId: job.id,
      jobNumber: job.job_number,
      customerName: job.customer_name,
      crewName: crewMap[job.assigned_crew_id ?? ''] ?? 'Unassigned',
      city,
      address: job.address ?? '',
      weather: {
        rain: weather.rain_probability,
        wind: weather.wind_speed,
        description: weather.description,
      },
    }

    if (weather.rain_probability > 50 || weather.wind_speed > 25) {
      atRisk.push(entry)
    } else {
      safe.push(entry)
    }
  }

  return { atRisk, safe, totalJobs: jobsOnDate.length }
}

// ─── 2. Auto-Reschedule Rainy Jobs ──────────────────────────────────────────

export async function autoRescheduleRainyJobs(
  date: string,
  newDate: string
): Promise<RescheduleResult> {
  const supabase = await createClient()
  const { userId, companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Validate newDate is in the future
  const today = new Date().toISOString().split('T')[0]
  if (new Date(newDate) < new Date(today)) {
    throw new Error('Cannot reschedule to a past date')
  }

  // Get at-risk jobs using the weather check
  const { atRisk } = await checkWeatherAndAlert(date)

  if (atRisk.length === 0) {
    return { rescheduled: 0, jobs: [] }
  }

  const rescheduled: RescheduleResult['jobs'] = []

  for (const job of atRisk) {
    const { error } = await supabase
      .from('jobs')
      .update({ scheduled_date: newDate })
      .eq('id', job.jobId)
      .eq('company_id', companyId)

    if (!error) {
      rescheduled.push({
        jobId: job.jobId,
        jobNumber: job.jobNumber,
        oldDate: date,
        newDate,
      })

      // Log activity for each rescheduled job
      await logActivity(job.jobId, userId, 'weather_reschedule', date, newDate)
    }
  }

  return { rescheduled: rescheduled.length, jobs: rescheduled }
}

// ─── 2b. Reschedule a Single Job ────────────────────────────────────────────

export async function rescheduleSingleJob(
  jobId: string,
  newDate: string
): Promise<{ success: boolean; jobNumber: string }> {
  const supabase = await createClient()
  const { userId, companyId, role } = await getUserWithCompany()
  requireManager(role)

  const today = new Date().toISOString().split('T')[0]
  if (new Date(newDate) < new Date(today)) {
    throw new Error('Cannot reschedule to a past date')
  }

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, job_number, scheduled_date')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single()

  if (fetchErr || !job) throw new Error('Job not found or access denied')

  const oldDate = job.scheduled_date ?? 'unscheduled'

  const { error } = await supabase
    .from('jobs')
    .update({ scheduled_date: newDate })
    .eq('id', jobId)
    .eq('company_id', companyId)

  if (error) throw new Error('Failed to reschedule job')

  await logActivity(jobId, userId, 'weather_reschedule', oldDate, newDate)

  return { success: true, jobNumber: job.job_number }
}

// ─── 3. Send Weather Alerts to Crews ────────────────────────────────────────

export async function sendWeatherAlertToCrews(date: string): Promise<AlertResult> {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Get at-risk jobs
  const { atRisk } = await checkWeatherAndAlert(date)

  if (atRisk.length === 0) {
    return { sent: 0, skipped: 0 }
  }

  // Get all crew IDs with at-risk jobs
  const crewIds = [...new Set(atRisk.map((j) => j.crewName))]
  // Fetch crew phone numbers (look up by name since we have names from the check)
  const { data: crewWithPhones } = await supabase
    .from('users')
    .select('id, name, phone')
    .eq('role', 'crew')
    .eq('primary_company_id', companyId)

  let sent = 0
  let skipped = 0
  const alreadySent = new Set<string>()

  for (const job of atRisk) {
    // Find the crew member for this job
    const crewMember = (crewWithPhones ?? []).find((c) => c.name === job.crewName)
    if (!crewMember) { skipped++; continue }
    if (alreadySent.has(crewMember.id)) continue // one SMS per crew member

    const phone = (crewMember as { phone?: string }).phone
    if (!phone) { skipped++; alreadySent.add(crewMember.id); continue }

    // Build the message
    const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    const weatherDesc =
      job.weather.rain > 50
        ? `${job.weather.rain}% rain chance`
        : `${job.weather.wind}mph winds`

    const message = `Weather alert: ${weatherDesc} expected at ${job.address || job.city} on ${dateFormatted}. Check with your manager for schedule changes.`

    const result = await sendSMS(phone, message)
    if (result.success) {
      sent++
    } else {
      skipped++
    }
    alreadySent.add(crewMember.id)
  }

  return { sent, skipped }
}
