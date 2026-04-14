'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, escapeHtml } from '@/lib/auth-helpers'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface CrewEntry {
  name: string
  hours: number
}

interface JobReportData {
  jobId: string
  jobNumber: string
  customerName: string
  address: string
  crew: CrewEntry[]
  totalHours: number
  photoCount: number
  equipment: string[]
  incidents: string[]
  notes: string[]
  weather: string | null
}

interface DailyReportResult {
  html: string
  jobCount: number
  totalHours: number
  crewCount: number
}

interface DailyReportSummary {
  date: string
  jobs: Array<{
    jobNumber: string
    customerName: string
    crew: string[]
    hours: number
    photoCount: number
  }>
  totalHours: number
  incidentCount: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/** Fetch weather from cached /api/weather or return null gracefully */
async function fetchWeatherForDate(date: string): Promise<string | null> {
  try {
    // Attempt to read from a weather_cache table if it exists
    const supabase = await createClient()
    const { data } = await (supabase as any)
      .from('weather_cache')
      .select('conditions, temp_high, temp_low')
      .eq('date', date)
      .limit(1)
      .maybeSingle()

    if (data) {
      const parts: string[] = []
      if (data.conditions) parts.push(data.conditions)
      if (data.temp_high != null && data.temp_low != null) {
        parts.push(`${data.temp_low}\u00B0F - ${data.temp_high}\u00B0F`)
      }
      return parts.length > 0 ? parts.join(', ') : null
    }
    return null
  } catch {
    return null
  }
}

/** Core data fetch used by both report functions */
async function fetchDailyData(
  date: string,
  companyId: string
): Promise<{ jobs: JobReportData[]; companyName: string; allCrewNames: Set<string> }> {
  const supabase = await createClient()

  // Phase 1: Fetch company name and time entries in parallel (both independent)
  const [companyResult, timeEntriesResult] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).single(),
    // Audit R2-#18: exclude payroll-excluded entries from daily reports.
    // These can appear in customer-facing output (crew hours summary),
    // so a fraudulent entry a manager rejected should NOT be shown.
    supabase
      .from('time_entries')
      .select('job_id, user_id, total_hours, clock_in, clock_out, jobs!inner(company_id)')
      .eq('jobs.company_id', companyId)
      .eq('excluded_from_payroll', false)
      .gte('clock_in', `${date}T00:00:00`)
      .lt('clock_in', `${date}T23:59:59`),
  ])

  const companyName = companyResult.data?.name ?? 'Roofing Company'
  const timeEntries = timeEntriesResult.data

  // Collect unique job IDs from time entries
  const jobIds = [...new Set((timeEntries ?? []).map((e) => e.job_id).filter(Boolean))]

  if (jobIds.length === 0) {
    return { jobs: [], companyName, allCrewNames: new Set() }
  }

  // Phase 2: All remaining queries are independent — run in parallel
  const userIds = [...new Set((timeEntries ?? []).map((e) => e.user_id))]

  const [
    jobRowsResult,
    userRowsResult,
    photoRowsResult,
    equipRowsResult,
    incidentRowsResult,
    noteRowsResult,
    weather,
  ] = await Promise.all([
    // Jobs
    supabase.from('jobs').select('id, job_number, customer_name, address, city').in('id', jobIds).eq('company_id', companyId),
    // Users
    supabase.from('users').select('id, name').in('id', userIds),
    // Photos
    supabase.from('job_photos').select('job_id').in('job_id', jobIds).gte('created_at', `${date}T00:00:00`).lt('created_at', `${date}T23:59:59`),
    // Equipment logs — correct columns: equipment_id, job_id, action, created_at (no 'date' or 'equipment_name')
    (supabase as any).from('equipment_logs').select('job_id, equipment_id, action').in('job_id', jobIds).gte('created_at', `${date}T00:00:00`).lt('created_at', `${date}T23:59:59`).then((r: any) => r).catch(() => ({ data: null })),
    // Incidents — correct column: reported_at (not 'date')
    (supabase as any).from('incidents').select('job_id, description').in('job_id', jobIds).gte('reported_at', `${date}T00:00:00`).lt('reported_at', `${date}T23:59:59`).then((r: any) => r).catch(() => ({ data: null })),
    // Activity log — correct columns: action, old_value, new_value (no 'note')
    (supabase as any).from('activity_log').select('job_id, action, new_value').in('job_id', jobIds).gte('created_at', `${date}T00:00:00`).lt('created_at', `${date}T23:59:59`).then((r: any) => r).catch(() => ({ data: null })),
    // Weather
    fetchWeatherForDate(date),
  ])

  const jobRows = jobRowsResult.data

  const userMap = new Map<string, string>()
  for (const u of userRowsResult.data ?? []) {
    userMap.set(u.id, u.name ?? 'Unknown')
  }

  const photoCountByJob = new Map<string, number>()
  for (const p of photoRowsResult.data ?? []) {
    photoCountByJob.set(p.job_id, (photoCountByJob.get(p.job_id) ?? 0) + 1)
  }

  const equipmentByJob = new Map<string, string[]>()
  for (const e of equipRowsResult.data ?? []) {
    const list = equipmentByJob.get(e.job_id) ?? []
    const label = `Equipment #${e.equipment_id?.slice(0, 8) ?? '?'} (${e.action ?? 'used'})`
    if (!list.includes(label)) list.push(label)
    equipmentByJob.set(e.job_id, list)
  }

  const incidentsByJob = new Map<string, string[]>()
  for (const i of incidentRowsResult.data ?? []) {
    const list = incidentsByJob.get(i.job_id) ?? []
    list.push(i.description ?? 'Incident reported')
    incidentsByJob.set(i.job_id, list)
  }

  const notesByJob = new Map<string, string[]>()
  for (const n of noteRowsResult.data ?? []) {
    const noteText = n.new_value || n.action || ''
    if (noteText) {
      const list = notesByJob.get(n.job_id) ?? []
      list.push(noteText)
      notesByJob.set(n.job_id, list)
    }
  }

  // Assemble per-job data
  const allCrewNames = new Set<string>()
  const jobs: JobReportData[] = (jobRows ?? []).map((job) => {
    // Crew hours for this job
    const crewMap = new Map<string, number>()
    for (const entry of timeEntries ?? []) {
      if (entry.job_id !== job.id) continue
      const name = userMap.get(entry.user_id) ?? 'Unknown'
      const hours = entry.total_hours ?? 0
      crewMap.set(name, (crewMap.get(name) ?? 0) + hours)
      allCrewNames.add(name)
    }

    const crew: CrewEntry[] = [...crewMap.entries()].map(([name, hours]) => ({
      name,
      hours: Math.round(hours * 100) / 100,
    }))

    const totalHours = crew.reduce((sum, c) => sum + c.hours, 0)
    const addr = [job.address, job.city].filter(Boolean).join(', ')

    return {
      jobId: job.id,
      jobNumber: job.job_number ?? job.id.slice(0, 8),
      customerName: job.customer_name ?? 'N/A',
      address: addr || 'N/A',
      crew,
      totalHours: Math.round(totalHours * 100) / 100,
      photoCount: photoCountByJob.get(job.id) ?? 0,
      equipment: equipmentByJob.get(job.id) ?? [],
      incidents: incidentsByJob.get(job.id) ?? [],
      notes: notesByJob.get(job.id) ?? [],
      weather,
    }
  })

  return { jobs, companyName, allCrewNames }
}

// ─── Public Actions ─────────────────────────────────────────────────────────────

export async function generateDailyProjectReport(date: string): Promise<DailyReportResult> {
  const { companyId } = await getUserWithCompany()
  const { jobs, companyName, allCrewNames } = await fetchDailyData(date, companyId)

  const totalHours = jobs.reduce((sum, j) => sum + j.totalHours, 0)
  const formattedDate = formatDate(date)
  const reportGenerated = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  // Build job sections
  const jobSections = jobs
    .map((job) => {
      const crewLines = job.crew.map((c) => `${escapeHtml(c.name)} (${c.hours}h)`).join(', ')
      const equipmentLine =
        job.equipment.length > 0
          ? job.equipment.map((e) => escapeHtml(e)).join(', ')
          : 'None logged'
      const safetyLine =
        job.incidents.length > 0
          ? job.incidents.map((i) => escapeHtml(i)).join('; ')
          : 'No incidents'
      const notesLines =
        job.notes.length > 0
          ? job.notes.map((n) => `<li style="margin-bottom:4px;">${escapeHtml(n)}</li>`).join('')
          : '<li>No notes</li>'

      return `
      <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin-bottom:16px;break-inside:avoid;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <div style="width:4px;height:24px;border-radius:2px;background:#3b82f6;"></div>
          <h2 style="margin:0;font-size:17px;font-weight:700;color:#111;">
            Job: ${escapeHtml(job.jobNumber)} &mdash; ${escapeHtml(job.customerName)}
          </h2>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333;">
          <tr>
            <td style="padding:6px 12px 6px 0;font-weight:600;color:#666;white-space:nowrap;vertical-align:top;width:100px;">Address</td>
            <td style="padding:6px 0;">${escapeHtml(job.address)}</td>
          </tr>
          <tr>
            <td style="padding:6px 12px 6px 0;font-weight:600;color:#666;white-space:nowrap;vertical-align:top;">Crew</td>
            <td style="padding:6px 0;">${crewLines || 'None'} (${job.totalHours}h total)</td>
          </tr>
          <tr>
            <td style="padding:6px 12px 6px 0;font-weight:600;color:#666;white-space:nowrap;vertical-align:top;">Weather</td>
            <td style="padding:6px 0;">${escapeHtml(job.weather ?? 'Not available')}</td>
          </tr>
          <tr>
            <td style="padding:6px 12px 6px 0;font-weight:600;color:#666;white-space:nowrap;vertical-align:top;">Photos</td>
            <td style="padding:6px 0;">${job.photoCount} captured</td>
          </tr>
          <tr>
            <td style="padding:6px 12px 6px 0;font-weight:600;color:#666;white-space:nowrap;vertical-align:top;">Equipment</td>
            <td style="padding:6px 0;">${equipmentLine}</td>
          </tr>
          <tr>
            <td style="padding:6px 12px 6px 0;font-weight:600;color:#666;white-space:nowrap;vertical-align:top;">Safety</td>
            <td style="padding:6px 0;">${safetyLine}</td>
          </tr>
        </table>

        <div style="margin-top:12px;">
          <div style="font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Notes</div>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#333;">${notesLines}</ul>
        </div>
      </div>`
    })
    .join('\n')

  const noJobsMessage =
    jobs.length === 0
      ? '<div style="text-align:center;padding:40px 20px;color:#888;font-size:14px;">No time entries recorded for this date.</div>'
      : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily Project Report &mdash; ${escapeHtml(date)}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #222; }
  </style>
</head>
<body>
  <div style="max-width:900px;margin:0 auto;padding:32px 24px;">

    <!-- Print button -->
    <div class="no-print" style="text-align:right;margin-bottom:16px;">
      <button onclick="window.print()" style="padding:8px 20px;border-radius:6px;border:1px solid #ccc;background:#fff;font-size:13px;font-weight:600;cursor:pointer;">
        Print Report
      </button>
    </div>

    <!-- Header -->
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:24px;margin-bottom:24px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#111;">DAILY PROJECT REPORT</h1>
          <div style="font-size:14px;font-weight:600;color:#444;">${escapeHtml(formattedDate)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:#888;">Company</div>
          <div style="font-size:14px;font-weight:600;color:#222;">${escapeHtml(companyName)}</div>
        </div>
      </div>

      <div style="margin-top:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;">
        <div style="background:#f8f9fa;border-radius:6px;padding:12px;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px;">Jobs Worked</div>
          <div style="font-size:20px;font-weight:700;color:#222;">${jobs.length}</div>
        </div>
        <div style="background:#f8f9fa;border-radius:6px;padding:12px;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px;">Total Hours</div>
          <div style="font-size:20px;font-weight:700;color:#222;">${Math.round(totalHours * 100) / 100}</div>
        </div>
        <div style="background:#f8f9fa;border-radius:6px;padding:12px;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px;">Crew Members</div>
          <div style="font-size:20px;font-weight:700;color:#222;">${allCrewNames.size}</div>
        </div>
        <div style="background:#f8f9fa;border-radius:6px;padding:12px;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px;">Photos</div>
          <div style="font-size:20px;font-weight:700;color:#222;">${jobs.reduce((s, j) => s + j.photoCount, 0)}</div>
        </div>
      </div>
    </div>

    <!-- Job sections -->
    ${noJobsMessage}
    ${jobSections}

    <!-- Footer -->
    <div style="text-align:center;padding:24px 0 8px;border-top:1px solid #e0e0e0;margin-top:16px;">
      <div style="font-size:11px;color:#aaa;">Generated by ${escapeHtml(companyName)} on ${escapeHtml(reportGenerated)}</div>
    </div>
  </div>
</body>
</html>`

  return {
    html,
    jobCount: jobs.length,
    totalHours: Math.round(totalHours * 100) / 100,
    crewCount: allCrewNames.size,
  }
}

export async function getDailyReportSummary(date: string): Promise<DailyReportSummary> {
  const { companyId } = await getUserWithCompany()
  const { jobs } = await fetchDailyData(date, companyId)

  const totalHours = jobs.reduce((sum, j) => sum + j.totalHours, 0)
  const incidentCount = jobs.reduce((sum, j) => sum + j.incidents.length, 0)

  return {
    date,
    jobs: jobs.map((j) => ({
      jobNumber: j.jobNumber,
      customerName: j.customerName,
      crew: j.crew.map((c) => c.name),
      hours: j.totalHours,
      photoCount: j.photoCount,
    })),
    totalHours: Math.round(totalHours * 100) / 100,
    incidentCount,
  }
}
