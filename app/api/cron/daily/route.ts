import { NextResponse } from 'next/server'
import { sendDailyDigest } from '@/lib/actions/digest'
import { processFollowUps } from '@/lib/actions/follow-ups'
import { processPostJobAutomation } from '@/lib/actions/post-job'
import { processFollowUpTasks } from '@/lib/actions/follow-up-tasks'
import { detectUnclosedClockIns } from '@/lib/actions/time-tracking'
import { renewExpiringCalendarWatches } from '@/lib/calendar-sync'

// Single daily cron that runs all automations sequentially
// Vercel Hobby plan allows 2 cron jobs — this consolidates 3 into 1
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    console.error('Cron: unclosed clock-in check failed', error)
  }

  // 1. Daily digest email to manager
  try {
    results.digest = await sendDailyDigest()
  } catch (error) {
    console.error('Cron: digest failed', error)
  }

  // 2. Follow-up texts for stale leads (3/7/14 day)
  try {
    results.followUps = await processFollowUps()
  } catch (error) {
    console.error('Cron: follow-ups failed', error)
  }

  // 3. Post-job automation (review requests, referrals)
  try {
    results.postJob = await processPostJobAutomation()
  } catch (error) {
    console.error('Cron: post-job failed', error)
  }

  // 4. Follow-up task reminders (SMS to assigned reps)
  try {
    results.followUpTasks = await processFollowUpTasks()
  } catch (error) {
    console.error('Cron: follow-up tasks failed', error)
  }

  // 5. Check for overdue equipment
  try {
    const { getOverdueEquipment } = await import('@/lib/actions/equipment')
    const overdue = await getOverdueEquipment()
    results.overdueEquipment = overdue.length
  } catch (error) {
    console.error('Cron: overdue equipment check failed', error)
  }

  // 7. Invoice payment reminders
  try {
    const { processInvoiceReminders } = await import('@/lib/actions/invoicing')
    results.invoiceReminders = await processInvoiceReminders()
  } catch (error) {
    console.error('Cron: invoice reminders failed', error)
  }

  // 8. Renew Google Calendar watch channels before they expire.
  // Google push channels expire after ~7 days. This pass finds watches
  // expiring in the next 48 hours and re-registers them. Without this,
  // external Google Calendar edits silently stop syncing back after a week.
  try {
    results.calendarWatchesRenewed = await renewExpiringCalendarWatches()
  } catch (error) {
    console.error('Cron: calendar watch renewal failed', error)
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
    console.error('Cron: cert status update failed', error)
  }

  return NextResponse.json(results)
}
