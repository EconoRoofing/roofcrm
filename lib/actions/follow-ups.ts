'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/twilio'

// Follow-up templates
const FOLLOW_UP_TEMPLATES = {
  day3: (name: string, company: string) =>
    `Hi ${name}, just checking in on your roofing estimate from ${company}. Any questions we can answer? Reply to this text or give us a call!`,
  day7: (name: string, company: string) =>
    `Hi ${name}, your estimate from ${company} is valid for 15 days. Let us know if you'd like to move forward or if you have any questions.`,
  day14: (name: string, company: string) =>
    `Hi ${name}, last check-in on your roofing estimate from ${company}. We're here whenever you're ready. Thanks for considering us!`,
}

// Check for and send due follow-ups
// This should be called by a cron job (Vercel Cron or external scheduler)
export async function processFollowUps(): Promise<{ sent: number; skipped: number }> {
  const supabase = await createClient()
  const now = new Date()
  let sent = 0
  let skipped = 0

  // Find pending/lead jobs that need follow-up
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, customer_name, phone, company_id, created_at, status, do_not_text, company:companies(name)')
    .in('status', ['pending'])

  if (!jobs) return { sent: 0, skipped: 0 }

  // Batch-fetch all auto-generated messages for these jobs in ONE query — avoids N+1
  const jobIds = jobs.map(j => j.id)
  const { data: allMessages } = await supabase
    .from('messages')
    .select('job_id, id')
    .in('job_id', jobIds)
    .eq('auto_generated', true)
    .eq('direction', 'outbound')

  // Group message counts by job_id for O(1) lookup in the loop
  const messageCountByJob = new Map<string, number>()
  for (const msg of allMessages ?? []) {
    messageCountByJob.set(msg.job_id, (messageCountByJob.get(msg.job_id) ?? 0) + 1)
  }

  for (const job of jobs) {
    if (!job.phone || job.do_not_text) { skipped++; continue }

    const daysSinceCreated = Math.floor(
      (now.getTime() - new Date(job.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    const companyName = (job.company as unknown as { name: string })?.name ?? 'your roofer'

    // Look up pre-fetched count — no per-job DB query
    const followUpCount = messageCountByJob.get(job.id) ?? 0

    let template: string | null = null
    if (daysSinceCreated >= 14 && followUpCount < 3) {
      template = FOLLOW_UP_TEMPLATES.day14(job.customer_name, companyName)
    } else if (daysSinceCreated >= 7 && followUpCount < 2) {
      template = FOLLOW_UP_TEMPLATES.day7(job.customer_name, companyName)
    } else if (daysSinceCreated >= 3 && followUpCount < 1) {
      template = FOLLOW_UP_TEMPLATES.day3(job.customer_name, companyName)
    }

    if (template) {
      const result = await sendSMS(job.phone, template)
      await supabase.from('messages').insert({
        job_id: job.id,
        direction: 'outbound',
        channel: 'sms',
        to_number: job.phone,
        body: template,
        status: result.success ? 'sent' : 'failed',
        auto_generated: true,
      })
      sent++
    } else {
      skipped++
    }
  }

  return { sent, skipped }
}
