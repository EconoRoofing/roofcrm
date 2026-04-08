'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/twilio'

export async function broadcastToTodayCrew(message: string): Promise<{ sent: number }> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: todayJobs } = await supabase
    .from('jobs')
    .select('assigned_crew_id, customer_name, users:users!jobs_assigned_crew_id_fkey(phone)')
    .eq('scheduled_date', today)
    .not('assigned_crew_id', 'is', null)

  const sent = new Set<string>()
  for (const job of todayJobs ?? []) {
    const phone = (job.users as { phone?: string } | null)?.phone
    if (phone && !sent.has(phone)) {
      await sendSMS(phone, message)
      sent.add(phone)
    }
  }

  return { sent: sent.size }
}
