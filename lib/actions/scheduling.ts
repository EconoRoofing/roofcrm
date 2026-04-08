'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'

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
}

interface UnassignedJob {
  id: string
  job_number: string
  customer_name: string
  status: string
}

export async function getCrewAvailability(weekStart: string) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Get all crew members
  const { data: crew, error: crewError } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('role', 'crew')
    .order('name', { ascending: true })

  if (crewError) throw new Error('Failed to fetch crew members')

  // Get jobs assigned to crew this week
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const { data: assignments, error: assignError } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, assigned_crew_id, scheduled_date')
    .eq('status', 'scheduled')
    .gte('scheduled_date', weekStart)
    .lt('scheduled_date', weekEnd.toISOString().split('T')[0])

  if (assignError) throw new Error('Failed to fetch assignments')

  // Get unassigned jobs (scheduled status but no crew assigned)
  const { data: unassigned, error: unassignError } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, status')
    .eq('status', 'scheduled')
    .is('assigned_crew_id', null)
    .order('scheduled_date', { ascending: true })

  if (unassignError) throw new Error('Failed to fetch unassigned jobs')

  // Build crew assignments as a plain object (Map can't be serialized across server/client boundary)
  const crewAssignments: Record<string, JobAssignment[]> = {}
  crew?.forEach((member) => {
    crewAssignments[member.id] = []
  })

  // Populate assignments
  assignments?.forEach((job) => {
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
        })
      }
    }
  })

  return {
    crew: crew || [],
    assignments: crewAssignments,
    unassignedJobs: unassigned || [],
    weekStart,
    weekEnd: weekEnd.toISOString().split('T')[0],
  }
}

export async function assignJobToCrew(jobId: string, crewId: string, date: string) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Reject past dates
  const today = new Date().toISOString().split('T')[0]
  if (new Date(date) < new Date(today)) {
    throw new Error('Cannot schedule in the past')
  }

  // Validate crew member exists and is active
  const { data: crewMember } = await supabase
    .from('users')
    .select('id, role, is_active')
    .eq('id', crewId)
    .single()

  if (!crewMember) throw new Error('Crew member not found')
  if (!crewMember.is_active) throw new Error('Crew member is deactivated')
  if (!['crew', 'sales_crew'].includes(crewMember.role)) throw new Error('User is not a crew member')

  // Check for double-booking
  const { data: existing } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name')
    .eq('assigned_crew_id', crewId)
    .eq('scheduled_date', date)
    .not('status', 'in', '("cancelled","completed")')

  if (existing && existing.length > 0) {
    throw new Error(
      `Crew member already assigned to Job ${existing[0].job_number} (${existing[0].customer_name}) on this date`
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

export async function unassignJobFromCrew(jobId: string) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('jobs')
    .update({
      assigned_crew_id: null,
    })
    .eq('id', jobId)

  if (error) {
    console.error('Unassignment error:', error)
    throw new Error('Failed to unassign job')
  }

  return true
}
