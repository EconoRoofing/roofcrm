'use server'

import { createClient } from '@/lib/supabase/server'

export async function logActivity(
  jobId: string,
  userId: string | null,
  action: string,
  oldValue?: string | null,
  newValue?: string | null
) {
  try {
    const supabase = await createClient()
    await supabase.from('activity_log').insert({
      job_id: jobId,
      user_id: userId,
      action,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
    })
  } catch {
    // Activity logging should never crash the calling action
  }
}
