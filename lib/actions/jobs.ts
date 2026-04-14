'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, localDateString } from '@/lib/auth-helpers'
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
  completed: [],
  cancelled: ['lead'],
}

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
  roof_amount?: number | null
  gutters_amount?: number | null
  options_amount?: number | null
  total_amount?: number | null
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

interface JobFilters {
  status?: JobStatus
  company_id?: string
  rep_id?: string
}

export async function createJob(data: CreateJobData) {
  const supabase = await createClient()
  const { userId, companyId } = await getUserWithCompany()

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
  const { userId, companyId } = await getUserWithCompany()

  // Verify job belongs to user's company — also returns the full job row
  const currentJob = await verifyJobOwnership(id, companyId)

  const { data: job, error } = await supabase
    .from('jobs')
    .update(data)
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

  return job
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
        dueDate.toISOString().split('T')[0],
        `Follow up on estimate — ${currentJob.customer_name}`,
      )
    } catch (err) {
      console.warn('[jobs] follow-up creation on pending failed:', err)
    }
  }

  // Auto-calculate commission when job is sold
  if (newStatus === 'sold') {
    try {
      const { data: repData } = await supabase
        .from('users')
        .select('commission_rate')
        .eq('id', currentJob.rep_id)
        .single()

      if (repData?.commission_rate && currentJob.total_amount) {
        const commissionAmount = currentJob.total_amount * (repData.commission_rate / 100)
        await supabase.from('jobs').update({
          commission_rate: repData.commission_rate,
          commission_amount: commissionAmount,
        }).eq('id', jobId)
      }
    } catch (commErr) {
      console.error('Commission calculation error:', commErr)
    }

    // Auto-generate portal token for customer
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

  // Verify job belongs to user's company and get the full row in one query
  const currentJob = await verifyJobOwnership(id, companyId)

  const oldStatus = currentJob.status as JobStatus

  // Skip if status is the same (dropped on same column)
  if (oldStatus === newStatus) return currentJob

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

  const { data: job, error } = await supabase
    .from('jobs')
    .update(updatePayload)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update job status: ${error.message}`)

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
    .single()

  if (error || !data) return null

  return data
}

export async function getJobs(filters?: JobFilters) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  let query = supabase
    .from('jobs')
    .select('id, job_number, customer_name, company_id, status, job_type, total_amount, created_at, updated_at, address, city, phone, email, rep_id, assigned_crew_id, scheduled_date, completed_date, referred_by, company:companies(id, name, color), rep:users!jobs_rep_id_fkey(id, name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.rep_id) {
    query = query.eq('rep_id', filters.rep_id)
  }

  const { data, error } = await query

  if (error) throw new Error(`Failed to fetch jobs: ${error.message}`)

  return data ?? []
}

export async function getJobsForPipeline(filters?: { company_id?: string }) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Always use authenticated user's companyId — ignore client-supplied value
  const query = supabase
    .from('jobs')
    .select('id, job_number, customer_name, company_id, status, job_type, total_amount, created_at, company:companies(id, name, color), rep:users!jobs_rep_id_fkey(id, name)')
    .eq('company_id', companyId)
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch pipeline jobs: ${error.message}`)
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
  monthlyRevenue: number
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
    // Monthly revenue from sold jobs
    supabase.from('jobs').select('total_amount').eq('rep_id', repId).eq('company_id', companyId).eq('status', 'sold').gte('created_at', monthStart),
    // Stale leads: pending/lead, older than 14 days
    supabase.from('jobs').select('id, job_number, customer_name, job_type, created_at, company:companies(name, color)').eq('rep_id', repId).eq('company_id', companyId).in('status', ['pending', 'lead']).lt('created_at', fourteenDaysAgo.toISOString()).order('created_at', { ascending: true }),
  ])

  const pendingCount = pendingResult.count ?? 0
  const monthlyRevenue = (revenueResult.data ?? []).reduce((sum, j) => sum + (Number(j.total_amount) ?? 0), 0)
  const staleJobs = (staleResult.data ?? []) as any

  return { pendingCount, monthlyRevenue, staleJobs }
}

export async function deleteJob(id: string) {
  return updateJobStatus(id, 'cancelled')
}
