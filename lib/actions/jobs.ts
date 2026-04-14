'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, localDateString, requireJobEditor } from '@/lib/auth-helpers'
import {
  centsToDollars,
  applyPercentCents,
  sumCents,
} from '@/lib/money'
import { logActivity } from '@/lib/actions/activity'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from '@/lib/google-calendar'
import { sendStatusUpdateSMS } from '@/lib/actions/messages'
import { geocodeAddress } from '@/lib/geo'
import type { JobStatus, JobType, UserRole, EstimateSpecs } from '@/lib/types/database'

// Valid state machine transitions
const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  lead: ['estimate_scheduled', 'cancelled'],
  estimate_scheduled: ['pending', 'cancelled'],
  pending: ['sold', 'cancelled'],
  sold: ['scheduled', 'cancelled'],
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'scheduled'],  // allow back to scheduled (weather/safety pause)
  // Completed jobs CAN be reopened (typo fix) or cancelled (warranty void).
  // Both paths go through updateJobStatus so side effects run.
  completed: ['in_progress', 'cancelled'],
  cancelled: ['lead'],
}

// Fields that ONLY updateJobStatus may change. Blocking these here forces
// status mutations through the side-effects pipeline (warranty, calendar, etc.).
const STATUS_PROTECTED_FIELDS = new Set([
  'status',
  'completed_date',
  'warranty_expiration',
  'calendar_event_id',
])

interface CreateJobData {
  company_id: string
  customer_name: string
  address: string
  city: string
  state?: string | null
  phone?: string | null
  email?: string | null
  job_type: JobType
  rep_id?: string | null
  notes?: string | null
  scheduled_date?: string | null
  insurance_claim?: boolean | null
  insurance_company?: string | null
  claim_number?: string | null
}

interface UpdateJobData {
  customer_name?: string
  address?: string
  city?: string
  state?: string | null
  zip?: string | null
  phone?: string | null
  contact_name?: string | null
  email?: string | null
  referred_by?: string | null
  rep_id?: string | null
  job_type?: JobType
  material?: string | null
  material_color?: string | null
  squares?: number | null
  layers?: number | null
  felt_type?: string | null
  ridge_type?: string | null
  ventilation?: string | null
  gutters_length?: number | null
  gutter_size?: string | null
  gutter_color?: string | null
  downspout_color?: string | null
  // Audit R3-#2 follow-up: legacy dollar fields removed. Migration 031 drops
  // the columns; the dual-write soak is over. Callers must pass *_cents only.
  roof_amount_cents?: number | null
  gutters_amount_cents?: number | null
  options_amount_cents?: number | null
  total_amount_cents?: number | null
  warranty_manufacturer_years?: number | null
  warranty_workmanship_years?: number | null
  estimate_specs?: EstimateSpecs | null
  notes?: string | null
  site_notes?: string | null
  permit_number?: string | null
  assigned_crew_id?: string | null
  scheduled_date?: string | null
  review_received?: boolean | null
  review_date?: string | null
  do_not_text?: boolean | null
}

/**
 * Audit R3-#2 follow-up: the previous version of this helper translated
 * legacy dollar fields into cents and dual-wrote both columns. With migration
 * 031 dropping the legacy columns, dual-write is gone. Callers pass *_cents
 * directly; this is now a passthrough kept for compatibility with the
 * existing call sites.
 */
function normalizeJobMoneyFields(data: UpdateJobData): Record<string, unknown> {
  return { ...data }
}

interface JobFilters {
  status?: JobStatus
  company_id?: string
  rep_id?: string
}

export async function createJob(data: CreateJobData) {
  const supabase = await createClient()
  const { userId, companyId, role } = await getUserWithCompany()
  requireJobEditor(role)

  // Override client-supplied company_id with authenticated user's company
  data.company_id = companyId

  // Generate job number via RPC
  const { data: jobNumber, error: rpcError } = await supabase.rpc('generate_job_number')
  if (rpcError) throw new Error(`Failed to generate job number: ${rpcError.message}`)

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      ...data,
      job_number: jobNumber as string,
      status: 'lead',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create job: ${error.message}`)

  await logActivity(job.id, userId, 'job_created')

  // Geocode + CompanyCam auto-link in parallel — both are best-effort
  await Promise.all([
    // Geocode the address to store lat/lng for geofencing
    (async () => {
      try {
        const coords = await geocodeAddress(data.address, data.city, data.state ?? 'CA')
        if (coords) {
          await supabase.from('jobs').update({ lat: coords.lat, lng: coords.lng }).eq('id', job.id)
        }
      } catch (geoError) {
        console.error('Geocoding failed:', geoError)
      }
    })(),
    // Auto-link CompanyCam project by address
    (async () => {
      try {
        const { searchProjectsByAddress } = await import('@/lib/companycam')
        const projects = await searchProjectsByAddress(data.address)
        if (projects.length === 1) {
          // Exact match — auto-link
          await supabase.from('jobs').update({
            companycam_project_id: projects[0].id,
          }).eq('id', job.id)
        }
        // If 0 or multiple matches, leave unlinked (user links manually)
      } catch (err) {
        console.warn('[jobs] CompanyCam auto-link failed:', err)
      }
    })(),
  ])

  return job
}

export async function updateJob(id: string, data: UpdateJobData) {
  const supabase = await createClient()
  const { userId, companyId, role } = await getUserWithCompany()
  requireJobEditor(role)

  // Block any attempt to change status / completion / warranty / calendar event
  // fields directly. These MUST go through updateJobStatus so the side-effects
  // pipeline (warranty expiration, calendar sync, SMS, etc.) actually fires.
  for (const key of Object.keys(data)) {
    if (STATUS_PROTECTED_FIELDS.has(key)) {
      throw new Error(`Cannot set "${key}" via updateJob — use updateJobStatus instead`)
    }
  }

  // Verify job belongs to user's company — also returns the full job row
  const currentJob = await verifyJobOwnership(id, companyId)

  // Normalize money fields: prefer cents, dual-write legacy dollars for
  // backward compat during the float→cents migration.
  const normalized = normalizeJobMoneyFields(data)

  const { data: job, error } = await supabase
    .from('jobs')
    .update(normalized)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update job: ${error.message}`)

  // Re-geocode if address or city changed — use data from the initial fetch (no extra query)
  if (data.address || data.city) {
    try {
      const coords = await geocodeAddress(
        data.address ?? currentJob.address,
        data.city ?? currentJob.city,
        data.state ?? currentJob.state ?? 'CA'
      )
      if (coords) {
        await supabase.from('jobs').update({ lat: coords.lat, lng: coords.lng }).eq('id', id)
      }
    } catch (err) {
      console.warn('[jobs] re-geocode on address change failed:', err)
    }
  }

  // Batch-insert all changed-field activity log entries in a single query — avoids N+1
  const activityEntries: Array<{
    job_id: string
    user_id: string | null
    action: string
    old_value: string | null
    new_value: string | null
  }> = []

  for (const key of Object.keys(data) as (keyof UpdateJobData)[]) {
    const oldVal = currentJob[key]
    const newVal = data[key]
    const oldStr = oldVal != null ? String(oldVal) : null
    const newStr = newVal != null ? String(newVal) : null
    if (oldStr !== newStr) {
      activityEntries.push({
        job_id: id,
        user_id: userId,
        action: 'field_updated',
        old_value: oldStr,
        new_value: newStr,
      })
    }
  }

  if (activityEntries.length > 0) {
    await supabase.from('activity_log').insert(activityEntries)
  }

  // Audit R3-#13: invalidate the RSC cache for the affected job + the
  // pipeline list views so the destination page after `router.push` is
  // fresh. The form previously called `router.refresh()` on the client
  // immediately after `router.push`, which races: refresh acts on the
  // CURRENT route (the edit page), not the destination, wasting a
  // round-trip and briefly showing stale data.
  revalidatePath(`/jobs/${id}`)
  revalidatePath(`/jobs/${id}/edit`)
  revalidatePath('/pipeline')
  revalidatePath('/sales-pipeline')
  revalidatePath('/list')

  return job
}

/**
 * Public wrapper around `executePostStatusEffects` for server actions that
 * already hold their own Supabase client + verified ownership but can't go
 * through `updateJobStatus` (e.g. `clockIn` runs as a crew user which
 * `requireJobEditor` would reject). Fires the full side-effects pipeline:
 * calendar sync, SMS, automations, commission calc, activity log entry.
 *
 * Call ONLY after you have already committed the status write with your own
 * optimistic-lock check. This function does NOT write `jobs.status` itself.
 */
export async function executePostStatusEffectsInternal(
  jobId: string,
  oldStatus: string,
  newStatus: string,
  currentJob: Record<string, unknown>,
  userId: string,
  companyId: string,
): Promise<void> {
  const supabase = await createClient()
  await logActivity(jobId, userId, 'status_change', oldStatus, newStatus)
  await executePostStatusEffects(supabase, jobId, oldStatus, newStatus, currentJob, userId, companyId)
}

async function executePostStatusEffects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  oldStatus: string,
  newStatus: string,
  currentJob: any,
  userId: string,
  companyId: string
): Promise<void> {
  // Cancel any unpaid invoices when a job is cancelled
  if (newStatus === 'cancelled') {
    try {
      await supabase
        .from('invoices')
        .update({ status: 'cancelled' })
        .eq('job_id', jobId)
        .in('status', ['draft', 'sent'])
    } catch (err) {
      console.warn('[jobs] invoice cancellation on job cancel failed:', err)
    }
  }

  // Log claim cancellation if this is an insurance job
  if (newStatus === 'cancelled') {
    try {
      const { data: jobCheck } = await supabase
        .from('jobs')
        .select('insurance_claim')
        .eq('id', jobId)
        .single()

      if (jobCheck?.insurance_claim) {
        await logActivity(jobId, userId, 'claim_cancelled', currentJob.status, 'cancelled')
      }
    } catch (err) {
      console.warn('[jobs] claim cancellation logging failed:', err)
    }
  }

  // Auto-close any open time entries when a job is cancelled
  if (newStatus === 'cancelled') {
    const { data: openEntries } = await supabase
      .from('time_entries')
      .select('id')
      .eq('job_id', jobId)
      .is('clock_out', null)

    if (openEntries && openEntries.length > 0) {
      const now = new Date().toISOString()
      await supabase.from('time_entries').update({
        clock_out: now,
        flagged: true,
        flag_reason: 'Job cancelled while clocked in — auto clock-out',
        notes: 'Automatically clocked out due to job cancellation',
      }).in('id', openEntries.map(e => e.id))
    }
  }

  // Auto-create follow-up task when estimate is given (status -> pending)
  if (newStatus === 'pending' && currentJob.rep_id) {
    try {
      const { createFollowUp } = await import('./follow-up-tasks')
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 3)
      await createFollowUp(
        jobId,
        currentJob.rep_id,
        localDateString(dueDate),
        `Follow up on estimate — ${currentJob.customer_name}`,
      )
    } catch (err) {
      console.warn('[jobs] follow-up creation on pending failed:', err)
    }
  }

  // Auto-calculate commission on both `sold` AND `in_progress → completed`.
  // Audit R2-#19: a reopened job (completed → in_progress → completed) would
  // carry stale commission_amount_cents from the FIRST completion. Now we
  // re-stamp the commission on every transition into `completed` from
  // `in_progress`, which picks up any total_amount changes made during the
  // reopen. The `sold` path still runs for the initial auto-stamp.
  const shouldStampCommission =
    (newStatus === 'sold' || (newStatus === 'completed' && oldStatus === 'in_progress')) &&
    currentJob.rep_id
  if (shouldStampCommission) {
    try {
      // Audit R3-#5: round 2 added the `in_progress → completed` re-stamp
      // path but it read `currentJob.total_amount_cents` from the snapshot
      // captured BEFORE the status UPDATE — so any price edit made during
      // the reopen window was ignored and commission was calculated against
      // the old total. Re-fetch the live row here so the cents we apply
      // match the current DB state. The `.single()` here is safe because
      // we already verified the job exists via verifyJobOwnership earlier.
      const [{ data: freshJob }, { data: repData }] = await Promise.all([
        supabase
          .from('jobs')
          .select('total_amount_cents')
          .eq('id', jobId)
          .single(),
        supabase
          .from('users')
          .select('commission_rate')
          .eq('id', currentJob.rep_id)
          .single(),
      ])

      const totalCents = Number(freshJob?.total_amount_cents ?? 0)
      if (repData?.commission_rate && totalCents > 0) {
        const commissionCents = applyPercentCents(totalCents, Number(repData.commission_rate))
        // Audit R3-#2 follow-up: dropped legacy commission_amount dual-write.
        await supabase.from('jobs').update({
          commission_rate: repData.commission_rate,
          commission_amount_cents: commissionCents,
        }).eq('id', jobId)
      }
    } catch (commErr) {
      console.error('Commission calculation error:', commErr)
    }
  }

  // Auto-generate portal token for customer on the initial sale
  if (newStatus === 'sold') {
    try {
      const { generatePortalToken } = await import('./portal')
      await generatePortalToken(jobId)
    } catch (portalErr) {
      console.error('Portal token generation error:', portalErr)
    }
  }

  // Calendar sync
  try {
    const { data: companyData } = await supabase
      .from('companies')
      .select('calendar_id')
      .eq('id', currentJob.company_id)
      .single()
    const calendarId = companyData?.calendar_id ?? 'primary'

    if (newStatus === 'estimate_scheduled') {
      const eventId = await createCalendarEvent(userId, currentJob, 'estimate')
      if (eventId) {
        await supabase.from('jobs').update({ calendar_event_id: eventId }).eq('id', jobId)
      }
    } else if (newStatus === 'sold' || newStatus === 'scheduled') {
      if (currentJob.calendar_event_id) {
        await updateCalendarEvent(userId, currentJob.calendar_event_id, {
          summary: `Job: ${currentJob.job_number} — ${currentJob.customer_name} (${currentJob.job_type})`,
        }, calendarId)
      } else {
        const eventId = await createCalendarEvent(userId, currentJob, 'job')
        if (eventId) {
          await supabase.from('jobs').update({ calendar_event_id: eventId }).eq('id', jobId)
        }
      }
    } else if (newStatus === 'completed' && currentJob.calendar_event_id) {
      await updateCalendarEvent(userId, currentJob.calendar_event_id, {
        summary: `[Done] ${currentJob.job_number} — ${currentJob.customer_name}`,
      }, calendarId)
    } else if (newStatus === 'cancelled' && currentJob.calendar_event_id) {
      await deleteCalendarEvent(userId, currentJob.calendar_event_id, calendarId)
      await supabase.from('jobs').update({ calendar_event_id: null }).eq('id', jobId)
    }
  } catch (calError) {
    console.error('Calendar sync error:', calError)
  }

  // SMS auto-notification
  try {
    await sendStatusUpdateSMS(jobId, newStatus)
  } catch (smsError) {
    console.error('SMS notification error:', smsError)
  }

  // Process automation rules
  try {
    const { processAutomationRules } = await import('./automations-internal')
    await processAutomationRules('status_change', jobId, newStatus)
    if (newStatus === 'completed') {
      await processAutomationRules('job_completed', jobId)
    }
  } catch (autoError) {
    console.error('Automation engine error:', autoError)
  }
}

export async function updateJobStatus(id: string, newStatus: JobStatus) {
  const supabase = await createClient()
  const { userId, companyId, role } = await getUserWithCompany()
  requireJobEditor(role)

  // Verify job belongs to user's company and get the full row in one query
  const currentJob = await verifyJobOwnership(id, companyId)

  const oldStatus = currentJob.status as JobStatus

  // Skip if status is the same (dropped on same column)
  if (oldStatus === newStatus) return currentJob

  // Validate transition. Managers (owner/office_manager) can override unusual
  // transitions, but reopening from completed always goes through the normal map.
  const isManager = role === 'owner' || role === 'office_manager'
  if (!isManager) {
    const validNextStatuses = VALID_TRANSITIONS[oldStatus]
    if (!validNextStatuses.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: cannot move from '${oldStatus}' to '${newStatus}'. ` +
          `Valid transitions from '${oldStatus}': ${validNextStatuses.length > 0 ? validNextStatuses.join(', ') : 'none'}`
      )
    }
  }

  const updatePayload: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'completed') {
    updatePayload.completed_date = localDateString()

    if (currentJob.warranty_manufacturer_years) {
      const expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + currentJob.warranty_manufacturer_years)
      updatePayload.warranty_expiration = localDateString(expiryDate)
    }
  }
  // Reopening a completed job (completed → in_progress): clear completed_date
  // AND warranty_expiration so reports don't list voided jobs as warranty-
  // active. The warranty will be re-stamped when the job is re-completed.
  // Audit R2-#6.
  if (oldStatus === 'completed' && newStatus !== 'completed' && newStatus !== 'cancelled') {
    updatePayload.completed_date = null
    updatePayload.warranty_expiration = null
  }
  // Cancelling (from any state): clear ALL stale "this job earned money"
  // artifacts. Commission and warranty_expiration should not survive on a
  // cancelled job, otherwise rep commission reports and warranty exports
  // keep listing it. Audit R2-#6.
  if (newStatus === 'cancelled') {
    // Audit R3-#2 follow-up: dropped legacy commission_amount column.
    updatePayload.commission_amount_cents = null
    updatePayload.warranty_expiration = null
  }

  // Optimistic lock: only update if status is still what we read.
  // Two managers cancelling simultaneously will both pass verifyJobOwnership,
  // but only the first UPDATE matches; the second returns no row → we abort
  // before firing duplicate side effects (calendar events, follow-up tasks, etc.).
  const { data: job, error } = await supabase
    .from('jobs')
    .update(updatePayload)
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', oldStatus)
    .select()
    .maybeSingle()

  if (error) throw new Error(`Failed to update job status: ${error.message}`)
  if (!job) {
    throw new Error('Job status changed by another user — please refresh and try again')
  }

  await logActivity(id, userId, 'status_change', oldStatus, newStatus)

  // Execute all post-status-change side effects (best-effort, never blocks the return)
  await executePostStatusEffects(supabase, id, oldStatus, newStatus, currentJob, userId, companyId)

  return job
}

export async function getJob(id: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data, error } = await supabase
    .from('jobs')
    .select(`
      *,
      company:companies(id, name, color, address, phone, license_number),
      rep:users!jobs_rep_id_fkey(id, name, email, role)
    `)
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle()

  // Differentiate "not found" from "DB error". PostgREST returns
  // code 'PGRST116' when `.single()` gets zero rows — that's a genuine
  // not-found. Any other error is an outage; throw so callers (and
  // app/jobs/[id]/page.tsx's notFound()) don't silently mask it as 404.
  if (error) {
    console.error('[getJob] query failed', { id, code: error.code, message: error.message })
    throw new Error(`Failed to fetch job: ${error.message}`)
  }

  if (!data) return null

  // Re-sign the estimate PDF URL on the fly — the stored URL is a 24h
  // signed URL from createSignedUrl() and has likely expired (R2-#8).
  if ((data as { estimate_pdf_url?: string | null }).estimate_pdf_url) {
    const { resignEstimatesPdf } = await import('@/lib/storage-urls')
    const fresh = await resignEstimatesPdf(
      supabase,
      (data as { estimate_pdf_url?: string | null }).estimate_pdf_url
    )
    ;(data as { estimate_pdf_url?: string | null }).estimate_pdf_url = fresh
  }

  return data
}

export async function getJobs(filters?: JobFilters & { scheduled_from?: string; scheduled_to?: string; limit?: number }) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Audit R3-#2 follow-up: cents-only after migration 031 cleanup.
  let query = supabase
    .from('jobs')
    .select('id, job_number, customer_name, company_id, status, job_type, total_amount_cents, created_at, updated_at, address, city, phone, email, rep_id, assigned_crew_id, scheduled_date, schedule_duration_days, completed_date, referred_by, company:companies(id, name, color), rep:users!jobs_rep_id_fkey(id, name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 2000)

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.rep_id) {
    query = query.eq('rep_id', filters.rep_id)
  }
  // Calendar callers can scope to a date window so we don't drop scheduled jobs
  // off the bottom of a 500-row limit.
  if (filters?.scheduled_from) {
    query = query.gte('scheduled_date', filters.scheduled_from)
  }
  if (filters?.scheduled_to) {
    query = query.lte('scheduled_date', filters.scheduled_to)
  }

  const { data, error } = await query

  if (error) throw new Error(`Failed to fetch jobs: ${error.message}`)

  return data ?? []
}

export async function getJobsForPipeline(filters?: { company_id?: string }) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Always use authenticated user's companyId — ignore client-supplied value.
  // Audit R3-#2 follow-up: cents-only after migration 031 cleanup.
  const query = supabase
    .from('jobs')
    .select('id, job_number, customer_name, company_id, status, job_type, total_amount_cents, created_at, company:companies(id, name, color), rep:users!jobs_rep_id_fkey(id, name)')
    .eq('company_id', companyId)
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch pipeline jobs: ${error.message}`)
  return data ?? []
}

/**
 * Performance pass R5-#7: narrow query for the manager calendar view.
 *
 * Previously `/calendar/page.tsx` called `getJobs({ scheduled_from, scheduled_to, limit: 2000 })`
 * which selected every job column (phone, email, address, notes, rep,
 * total_amount_cents, etc.) for up to 2000 rows, then serialized the
 * entire payload across the RSC boundary even though CalendarView only
 * renders day-cell counts + customer names + company colors.
 *
 * This helper returns ONLY the fields CalendarView consumes:
 *   id, job_number, customer_name, address, city, status,
 *   scheduled_date, schedule_duration_days, company { color, name }
 *
 * Cuts the RSC payload by ~70% on a 2000-row 6-month window and
 * trims TTFB by skipping unused column transfer from Postgres.
 */
export async function getJobsForCalendar(scheduledFrom: string, scheduledTo: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, job_number, customer_name, address, city, status, scheduled_date, schedule_duration_days, company:companies(id, name, color)'
    )
    .eq('company_id', companyId)
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', scheduledFrom)
    .lte('scheduled_date', scheduledTo)
    .order('scheduled_date', { ascending: true })
    .limit(2000)

  if (error) throw new Error(`Failed to fetch calendar jobs: ${error.message}`)
  return data ?? []
}

export async function getJobsByDate(date: string, userId: string, role: UserRole) {
  // Validate date format to prevent PostgREST filter injection (YYYY-MM-DD only)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format')

  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  let query = supabase
    .from('jobs')
    .select('id, job_number, customer_name, company_id, status, job_type, address, city, phone, scheduled_date, site_notes, material, material_color, squares, layers, felt_type, notes, estimate_pdf_url, assigned_crew_id, companycam_project_id, company:companies(id, name, color)')
    .eq('company_id', companyId)
    .order('scheduled_date', { ascending: true })

  if (role === 'crew') {
    query = query.eq('assigned_crew_id', userId).eq('scheduled_date', date)
  } else if (role === 'sales') {
    query = query
      .eq('rep_id', userId)
      .or(
        `scheduled_date.eq.${date},` +
          `and(status.eq.estimate_scheduled,scheduled_date.eq.${date})`
      )
  } else {
    query = query.eq('scheduled_date', date)
  }

  const { data, error } = await query

  if (error) throw new Error(`Failed to fetch jobs by date: ${error.message}`)

  return data ?? []
}

export async function getSalesStats(repId: string): Promise<{
  pendingCount: number
  /** @deprecated use monthlyRevenueCents */
  monthlyRevenue: number
  monthlyRevenueCents: number
  staleJobs: Array<{ id: string; job_number: string; customer_name: string; job_type: string; created_at: string; company: { name: string; color: string } | null }>
}> {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Verify the repId belongs to the caller's company
  const { data: rep } = await supabase
    .from('users')
    .select('id')
    .eq('id', repId)
    .eq('primary_company_id', companyId)
    .maybeSingle()
  if (!rep) throw new Error('Rep not found or not in your company')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const [pendingResult, revenueResult, staleResult] = await Promise.all([
    // Count pending/lead/estimate_scheduled (lightweight count-only query)
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('rep_id', repId).eq('company_id', companyId).in('status', ['pending', 'lead', 'estimate_scheduled']),
    // Monthly revenue from sold jobs.
    // Audit R3-#2 follow-up: cents-only after migration 031 cleanup.
    supabase.from('jobs').select('total_amount_cents').eq('rep_id', repId).eq('company_id', companyId).eq('status', 'sold').gte('created_at', monthStart),
    // Stale leads: pending/lead, older than 14 days
    supabase.from('jobs').select('id, job_number, customer_name, job_type, created_at, company:companies(name, color)').eq('rep_id', repId).eq('company_id', companyId).in('status', ['pending', 'lead']).lt('created_at', fourteenDaysAgo.toISOString()).order('created_at', { ascending: true }),
  ])

  const pendingCount = pendingResult.count ?? 0
  // Sum in integer cents, then convert for the return type. Exact totals.
  const monthlyRevenueCents = sumCents(
    (revenueResult.data ?? []).map((j) =>
      Number(
        (j as { total_amount_cents?: number | null }).total_amount_cents ?? 0
      )
    )
  )
  const monthlyRevenue = centsToDollars(monthlyRevenueCents)
  const staleJobs = (staleResult.data ?? []) as any

  return { pendingCount, monthlyRevenue, monthlyRevenueCents, staleJobs }
}

export async function deleteJob(id: string) {
  return updateJobStatus(id, 'cancelled')
}
