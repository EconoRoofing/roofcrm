'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import type { Break, BreakType } from '@/lib/types/time-tracking'

export async function startBreak(timeEntryId: string, type: BreakType): Promise<Break> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify the time entry belongs to the caller
  const { data: entry } = await supabase
    .from('time_entries')
    .select('id, user_id')
    .eq('id', timeEntryId)
    .eq('user_id', user.id)
    .single()

  if (!entry) throw new Error('Time entry not found or access denied')

  // Guard: no active break already in progress
  const { data: existing } = await supabase
    .from('breaks')
    .select('id')
    .eq('time_entry_id', timeEntryId)
    .is('end_time', null)
    .maybeSingle()

  if (existing) throw new Error('A break is already in progress.')

  const { data, error } = await supabase
    .from('breaks')
    .insert({
      time_entry_id: timeEntryId,
      type,
      start_time: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to start break: ${error?.message}`)
  return data as Break
}

export async function endBreak(breakId: string): Promise<Break> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Fetch the break and verify ownership through time_entry
  const { data: existing, error: fetchError } = await supabase
    .from('breaks')
    .select('*, time_entry:time_entries!inner(user_id)')
    .eq('id', breakId)
    .single()

  if (fetchError || !existing) throw new Error('Break not found')
  if ((existing.time_entry as any)?.user_id !== user.id) throw new Error('Access denied')
  if (existing.end_time) throw new Error('Break already ended')

  const endTime = new Date()
  const startTime = new Date(existing.start_time as string)
  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 1000 / 60)

  const { data, error } = await supabase
    .from('breaks')
    .update({
      end_time: endTime.toISOString(),
      duration_minutes: durationMinutes,
    })
    .eq('id', breakId)
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to end break: ${error?.message}`)
  return data as Break
}

export async function getBreaksDue(timeEntryId: string): Promise<{
  restBreakDue: boolean
  mealBreakDue: boolean
  hoursWorked: number
  violations: string[]
}> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify caller owns this time entry
  const { data: entry, error: entryError } = await supabase
    .from('time_entries')
    .select('clock_in, user_id')
    .eq('id', timeEntryId)
    .eq('user_id', user.id)
    .single()

  if (entryError || !entry) throw new Error('Time entry not found or access denied')

  const now = new Date()
  const clockIn = new Date(entry.clock_in as string)
  const hoursWorked = (now.getTime() - clockIn.getTime()) / 1000 / 3600

  // Fetch existing breaks for this entry
  const { data: breaks } = await supabase
    .from('breaks')
    .select('type, end_time')
    .eq('time_entry_id', timeEntryId)

  const completedBreaks = (breaks ?? []).filter((b) => b.end_time !== null)
  const hasRestBreak = completedBreaks.some((b) => b.type === 'rest')
  const hasMealBreak = completedBreaks.some((b) => b.type === 'meal')

  // CA labor law: rest at 4hrs, meal at 5hrs
  const restBreakDue = hoursWorked >= 4 && !hasRestBreak
  const mealBreakDue = hoursWorked >= 5 && !hasMealBreak

  const violations: string[] = []
  if (restBreakDue) violations.push('Rest break due (4-hour threshold reached)')
  if (mealBreakDue) violations.push('Meal break due (5-hour threshold reached)')

  return {
    restBreakDue,
    mealBreakDue,
    hoursWorked: parseFloat(hoursWorked.toFixed(2)),
    violations,
  }
}

export async function getActiveBreak(timeEntryId: string): Promise<Break | null> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify caller owns this time entry
  const { data: ownerCheck } = await supabase
    .from('time_entries')
    .select('id')
    .eq('id', timeEntryId)
    .eq('user_id', user.id)
    .single()

  if (!ownerCheck) throw new Error('Time entry not found or access denied')

  const { data, error } = await supabase
    .from('breaks')
    .select('*')
    .eq('time_entry_id', timeEntryId)
    .is('end_time', null)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch active break: ${error.message}`)
  return (data as Break) ?? null
}
