import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { sendDailyDigest } from '@/lib/actions/digest'
import { reportError, logSpan } from '@/lib/observability'
import { processFollowUps } from '@/lib/actions/follow-ups'
import { processPostJobAutomation } from '@/lib/actions/post-job'
import { processFollowUpTasks } from '@/lib/actions/follow-up-tasks'
import { detectUnclosedClockIns } from '@/lib/actions/time-tracking'
import { renewExpiringCalendarWatches } from '@/lib/calendar-sync'

// Single daily cron that runs all automations sequentially
// Vercel Hobby plan allows 2 cron jobs — this consolidates 3 into 1
// Audit R2-#28: replaces a `===` string compare on CRON_SECRET. The previous
// check returned in the first character that differed, which over many calls
// from a malicious actor leaks the secret one byte at a time via timing.
// timingSafeEqual is constant-time. Length-mismatch is handled before the
// call so the comparison itself sees equal-length buffers.
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  // Refuse if CRON_SECRET is unset — fail closed, never grant access on empty.
  if (!process.env.CRON_SECRET || !safeEqual(authHeader, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Audit R2-#29: timed span for the whole cron run so log search can
  // surface latency regressions and tie individual step failures back to
  // a single requestId.
  const span = logSpan('cron:daily', '/api/cron/daily')

  const results: Record<string, unknown> = {
    digest: false,
    followUps: { sent: 0, skipped: 0 },
    postJob: { sent: 0 },
    followUpTasks: { sent: 0, skipped: 0 },
    unclosedClockIns: { flagged: 0 },
    overdueEquipment: 0,
    certStatusUpdates: false,
  }

  // 0. Check for unclosed clock-ins from yesterday (run first)
  try {
    results.unclosedClockIns = await detectUnclosedClockIns()
  } catch (error) {
    reportError(error, { route: '/api/cron/daily', step: 'unclosed-clock-ins' })
  }

  // 1. Daily digest email to manager
  try {
    results.digest = await sendDailyDigest()
  } catch (error) {
    reportError(error, { route: '/api/cron/daily', step: 'digest' })
  }

  // 2. Follow-up texts for stale leads (3/7/14 day)
  try {
    results.followUps = await processFollowUps()
  } catch (error) {
    reportError(error, { route: '/api/cron/daily', step: 'follow-ups' })
  }

  // 3. Post-job automation (review requests, referrals)
  try {
    results.postJob = await processPostJobAutomation()
  } catch (error) {
    reportError(error, { route: '/api/cron/daily', step: 'post-job' })
  }

  // 4. Follow-up task reminders (SMS to assigned reps)
  try {
    results.followUpTasks = await processFollowUpTasks()
  } catch (error) {
    reportError(error, { route: '/api/cron/daily', step: 'follow-up-tasks' })
  }

  // 5. Check for overdue equipment
  try {
    const { getOverdueEquipment } = await import('@/lib/actions/equipment')
    const overdue = await getOverdueEquipment()
    results.overdueEquipment = overdue.length
  } catch (error) {
    reportError(error, { route: '/api/cron/daily', step: 'overdue-equipment' })
  }

  // 7. Invoice payment reminders
  try {
    const { processInvoiceReminders } = await import('@/lib/actions/invoicing')
    results.invoiceReminders = await processInvoiceReminders()
  } catch (error) {
    reportError(error, { route: '/api/cron/daily', step: 'invoice-reminders' })
  }

  // 8. Renew Google Calendar watch channels before they expire.
  // Google push channels expire after ~7 days. This pass finds watches
  // expiring in the next 48 hours and re-registers them. Without this,
  // external Google Calendar edits silently stop syncing back after a week.
  try {
    results.calendarWatchesRenewed = await renewExpiringCalendarWatches()
  } catch (error) {
    reportError(error, { route: '/api/cron/daily', step: 'calendar-watch-renewal' })
    results.calendarWatchesRenewed = { renewed: 0, failed: -1 }
  }

  // 6. Update expired certifications
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    // Mark expired certs
    await supabase
      .from('certifications')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expiry_date', today)

    // Mark expiring-soon certs (within 30 days)
    const thirtyDaysOut = new Date()
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
    await supabase
      .from('certifications')
      .update({ status: 'expiring_soon' })
      .eq('status', 'active')
      .lte('expiry_date', thirtyDaysOut.toISOString().split('T')[0])
      .gte('expiry_date', today)

    results.certStatusUpdates = true
  } catch (error) {
    reportError(error, { route: '/api/cron/daily', step: 'cert-status' })
  }

  span.done({ steps: Object.keys(results).length })
  return NextResponse.json(results)
}
