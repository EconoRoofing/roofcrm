'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
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
  const user = await getUser()

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

  await logActivity(job.id, user?.id ?? null, 'job_created')

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
      } catch {}
    })(),
  ])

  return job
}

export async function updateJob(id: string, data: UpdateJobData) {
  const supabase = await createClient()
  const user = await getUser()

  // Fetch current job to compare fields for activity logging
  const { data: currentJob, error: fetchError } = await supabase
    .from('jobs')
    .select()
    .eq('id', id)
    .single()

  if (fetchError || !currentJob) throw new Error('Job not found')

  const { data: job, error } = await supabase
    .from('jobs')
    .update(data)
    .eq('id', id)
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
    } catch {}
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
        user_id: user?.id ?? null,
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

export async function updateJobStatus(id: string, newStatus: JobStatus) {
  const supabase = await createClient()
  const user = await getUser()

  const { data: currentJob, error: fetchError } = await supabase
    .from('jobs')
    .select('id, status, job_number, customer_name, address, city, job_type, scheduled_date, notes, calendar_event_id, rep_id, total_amount, warranty_manufacturer_years, company_id')
    .eq('id', id)
    .single()

  if (fetchError || !currentJob) throw new Error('Job not found')

  const oldStatus = currentJob.status as JobStatus

  // Skip if status is the same (dropped on same column)
  if (oldStatus === newStatus) return currentJob

  // Get user role — managers can move to any status
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user?.id ?? '')
    .single()

  const isManager = userData?.role === 'manager'

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
    updatePayload.completed_date = new Date().toISOString()

    // Auto-calculate warranty expiration
    if (currentJob.warranty_manufacturer_years) {
      const expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + currentJob.warranty_manufacturer_years)
      updatePayload.warranty_expiration = expiryDate.toISOString().split('T')[0]
    }
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`Failed to update job status: ${error.message}`)

  await logActivity(id, user?.id ?? null, 'status_change', oldStatus, newStatus)

  // Auto-close any open time entries when a job is cancelled — prevents orphaned clock-ins
  if (newStatus === 'cancelled') {
    const { data: openEntries } = await supabase
      .from('time_entries')
      .select('id, clock_in')
      .eq('job_id', id)
      .is('clock_out', null)

    if (openEntries && openEntries.length > 0) {
      const now = new Date().toISOString()
      for (const entry of openEntries) {
        await supabase.from('time_entries').update({
          clock_out: now,
          flagged: true,
          flag_reason: 'Job cancelled while clocked in — auto clock-out',
          notes: 'Automatically clocked out due to job cancellation',
        }).eq('id', entry.id)
      }
    }
  }

  // Auto-create follow-up task when estimate is given (status -> pending) — best-effort
  if (newStatus === 'pending' && currentJob.rep_id) {
    try {
      const { createFollowUp } = await import('./follow-up-tasks')
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 3)
      await createFollowUp(
        id,
        currentJob.rep_id,
        dueDate.toISOString().split('T')[0],
        `Follow up on estimate — ${currentJob.customer_name}`,
      )
    } catch {}
  }

  // Auto-calculate commission when job is sold — best-effort
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
        }).eq('id', id)
      }
    } catch (commErr) {
      console.error('Commission calculation error:', commErr)
    }
  }

  // Calendar sync — best-effort, never blocks the status change
  if (user?.id) {
    try {
      // Fetch the company's calendar_id so update/delete hit the right calendar
      const { data: companyData } = await supabase
        .from('companies')
        .select('calendar_id')
        .eq('id', currentJob.company_id)
        .single()
      const calendarId = companyData?.calendar_id ?? 'primary'

      if (newStatus === 'estimate_scheduled') {
        // Create an estimate calendar event
        const eventId = await createCalendarEvent(user.id, currentJob, 'estimate')
        if (eventId) {
          await supabase.from('jobs').update({ calendar_event_id: eventId }).eq('id', id)
        }
      } else if (newStatus === 'sold' || newStatus === 'scheduled') {
        // Create or update a job calendar event
        if (currentJob.calendar_event_id) {
          await updateCalendarEvent(user.id, currentJob.calendar_event_id, {
            summary: `Job: ${currentJob.job_number} — ${currentJob.customer_name} (${currentJob.job_type})`,
          }, calendarId)
        } else {
          const eventId = await createCalendarEvent(user.id, currentJob, 'job')
          if (eventId) {
            await supabase.from('jobs').update({ calendar_event_id: eventId }).eq('id', id)
          }
        }
      } else if (newStatus === 'completed' && currentJob.calendar_event_id) {
        // Mark event as completed
        await updateCalendarEvent(user.id, currentJob.calendar_event_id, {
          summary: `[Done] ${currentJob.job_number} — ${currentJob.customer_name}`,
        }, calendarId)
      } else if (newStatus === 'cancelled' && currentJob.calendar_event_id) {
        // Delete the calendar event
        await deleteCalendarEvent(user.id, currentJob.calendar_event_id, calendarId)
        await supabase.from('jobs').update({ calendar_event_id: null }).eq('id', id)
      }
    } catch (calError) {
      // Calendar sync is best-effort — don't fail the status change
      console.error('Calendar sync error:', calError)
    }
  }

  // SMS auto-notification — best-effort
  try {
    await sendStatusUpdateSMS(id, newStatus)
  } catch (smsError) {
    console.error('SMS notification error:', smsError)
  }

  return job
}

export async function getJob(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('jobs')
    .select(`
      *,
      company:companies(*),
      rep:users!jobs_rep_id_fkey(id, name, email, role)
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null

  return data
}

export async function getJobs(filters?: JobFilters) {
  const supabase = await createClient()

  let query = supabase
    .from('jobs')
    .select(`
      *,
      company:companies(id, name, color),
      rep:users!jobs_rep_id_fkey(id, name)
    `)
    .order('created_at', { ascending: false })

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id)
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

  let query = supabase
    .from('jobs')
    .select('id, job_number, customer_name, company_id, status, job_type, total_amount, created_at, company:companies(id, name, color), rep:users!jobs_rep_id_fkey(id, name)')
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch pipeline jobs: ${error.message}`)
  return data ?? []
}

export async function getJobsByDate(date: string, userId: string, role: UserRole) {
  const supabase = await createClient()

  let query = supabase
    .from('jobs')
    .select(`
      *,
      company:companies(id, name, color)
    `)
    .order('scheduled_date', { ascending: true })

  if (role === 'crew') {
    // Crew sees only jobs assigned to them on the given date
    query = query.eq('assigned_crew_id', userId).eq('scheduled_date', date)
  } else if (role === 'sales_crew') {
    // sales_crew sees their assigned crew jobs AND their sales jobs on the date
    query = query.or(
      `and(assigned_crew_id.eq.${userId},scheduled_date.eq.${date}),` +
        `and(rep_id.eq.${userId},scheduled_date.eq.${date})`
    )
  } else if (role === 'sales') {
    // Sales sees their own jobs on the date (scheduled) or estimate_scheduled on that date
    query = query
      .eq('rep_id', userId)
      .or(
        `scheduled_date.eq.${date},` +
          `and(status.eq.estimate_scheduled,scheduled_date.eq.${date})`
      )
  } else {
    // manager or other — default: all jobs on that date
    query = query.eq('scheduled_date', date)
  }

  const { data, error } = await query

  if (error) throw new Error(`Failed to fetch jobs by date: ${error.message}`)

  return data ?? []
}

export async function deleteJob(id: string) {
  return updateJobStatus(id, 'cancelled')
}
