'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/twilio'

// CRON-ONLY: Should only be called from the cron route handler which verifies CRON_SECRET.
// No user auth context is available in cron jobs.
export async function processPostJobAutomation(): Promise<{ sent: number }> {
  const supabase = await createClient()
  const now = new Date()
  let sent = 0

  // Find recently completed jobs for post-job automation (30-day lookback to avoid re-processing old jobs)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: completedJobs } = await supabase
    .from('jobs')
    .select('id, customer_name, phone, completed_date, company_id, job_type, company:companies(name, google_review_link)')
    .eq('status', 'completed')
    .not('completed_date', 'is', null)
    .gte('completed_date', thirtyDaysAgo.toISOString().split('T')[0])

  if (!completedJobs) return { sent: 0 }

  // Batch-fetch all auto-generated messages for completed jobs in ONE query — avoids N+1
  const jobIds = completedJobs.map(j => j.id)
  const { data: allMessages } = await supabase
    .from('messages')
    .select('job_id, body, direction')
    .in('job_id', jobIds)
    .eq('auto_generated', true)
    .eq('direction', 'outbound')

  // Group message bodies by job_id for O(1) lookup in the loop
  const messagesByJob = new Map<string, string[]>()
  for (const msg of allMessages ?? []) {
    const existing = messagesByJob.get(msg.job_id) ?? []
    existing.push(msg.body)
    messagesByJob.set(msg.job_id, existing)
  }

  for (const job of completedJobs) {
    if (!job.phone || !job.completed_date) continue

    const daysSinceCompleted = Math.floor(
      (now.getTime() - new Date(job.completed_date).getTime()) / (1000 * 60 * 60 * 24)
    )

    const company = job.company as unknown as { name: string; google_review_link?: string }
    const companyName = company?.name ?? 'your roofer'

    // Look up pre-fetched bodies — no per-job DB query
    const bodies = messagesByJob.get(job.id) ?? []

    // Day 3: Review request
    if (daysSinceCompleted >= 3 && !bodies.some(b => b.includes('feedback'))) {
      const reviewLink = company?.google_review_link ?? ''
      const reviewText = reviewLink
        ? `We'd love your feedback! Leave us a review: ${reviewLink}`
        : `We'd love your feedback!`
      const msg = `Hi ${job.customer_name}, how was your experience with ${companyName}? ${reviewText}`
      const result = await sendSMS(job.phone, msg)
      await supabase.from('messages').insert({
        job_id: job.id, direction: 'outbound', channel: 'sms',
        to_number: job.phone, body: msg,
        status: result.success ? 'sent' : 'failed', auto_generated: true,
      })
      if (result.success) sent++
    }

    // Day 7: Referral ask
    if (daysSinceCompleted >= 7 && !bodies.some(b => b.includes('refer') || b.includes('Refer'))) {
      const msg = `Hi ${job.customer_name}, know someone who needs a new roof? Refer them to ${companyName} — we appreciate the word of mouth!`
      const result = await sendSMS(job.phone, msg)
      await supabase.from('messages').insert({
        job_id: job.id, direction: 'outbound', channel: 'sms',
        to_number: job.phone, body: msg,
        status: result.success ? 'sent' : 'failed', auto_generated: true,
      })
      if (result.success) sent++
    }
  }

  return { sent }
}
