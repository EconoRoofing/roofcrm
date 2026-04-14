'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { listCalendarEvents } from '@/lib/google-calendar'

/**
 * Sync the Days Off Google Calendar into the local `days_off` table.
 *
 * Runs nightly from /api/cron/daily. Pulls a 90-day forward window of
 * events, upserts by google_event_id, and deletes rows whose upstream
 * event no longer exists — so deleting a Days Off block in Google
 * removes it from the scheduling guardrail on the next cron run.
 *
 * This is the only place in the codebase where Google Calendar is the
 * source of truth and Supabase is the replica — every other sync goes
 * the other direction (CRM writes, webhook back-channel for edits).
 *
 * Idempotent: re-running the sync in the same window produces no net
 * DB change. Safe to invoke on every cron tick without state drift.
 *
 * RLS NOTE: Uses the service-role client because the cron route runs
 * without a user session, and both `system_calendars` and `days_off`
 * have `auth.uid() IS NOT NULL` read policies (from migration 042).
 * The anon client would silently return zero rows for both the calendar
 * lookup and the orphan scan, making the whole sync a no-op. The
 * service client bypasses RLS entirely, which is the correct pattern
 * for system tasks with no user context. See lib/supabase/service.ts
 * for the security rationale.
 *
 * Returns a summary counting rows synced + rows deleted, for cron logs.
 */
export async function syncDaysOff(): Promise<{
  synced: number
  deleted: number
  skipped: boolean
  reason?: string
}> {
  const supabase = createServiceClient()
  if (!supabase) {
    return {
      synced: 0,
      deleted: 0,
      skipped: true,
      reason: 'SUPABASE_SERVICE_ROLE_KEY not configured in server environment',
    }
  }

  // 1. Look up the Days Off calendar ID from system_calendars (set in
  //    migration 042). Bail if it's not configured — don't hard-code.
  const { data: calRow, error: calErr } = await supabase
    .from('system_calendars')
    .select('calendar_id')
    .eq('key', 'days_off')
    .maybeSingle()

  if (calErr || !calRow?.calendar_id) {
    return { synced: 0, deleted: 0, skipped: true, reason: 'days_off calendar not configured' }
  }
  const calendarId = calRow.calendar_id as string

  // 2. Pick a user whose google_refresh_token we can borrow. The cron
  //    runs with no session, so we fall back to any user that has a
  //    refresh token. In practice this is the owner (Mario).
  const { data: userRow } = await supabase
    .from('users')
    .select('id')
    .not('google_refresh_token', 'is', null)
    .limit(1)
    .maybeSingle()

  if (!userRow?.id) {
    return { synced: 0, deleted: 0, skipped: true, reason: 'no user has google_refresh_token' }
  }
  const calendarUserId = userRow.id as string

  // 3. Fetch the 90-day forward window. Days Off further out than that
  //    isn't useful for scheduling decisions — we'd re-pull it on a
  //    subsequent cron run as the window slides.
  const now = new Date()
  const windowStart = new Date(now)
  windowStart.setDate(windowStart.getDate() - 1) // include today even at 11:59pm
  const windowEnd = new Date(now)
  windowEnd.setDate(windowEnd.getDate() + 90)

  const events = await listCalendarEvents(
    calendarUserId,
    calendarId,
    windowStart.toISOString(),
    windowEnd.toISOString()
  )

  // 4. Normalize Google's start/end shape into plain YYYY-MM-DD dates.
  //    All-day events use `start.date` and `end.date` where end.date is
  //    EXCLUSIVE per the iCal spec — subtract a day to make end_date
  //    inclusive in our local table (more natural for range overlap
  //    checks in SQL and the scheduling guardrail).
  const rows: Array<{
    google_event_id: string
    start_date: string
    end_date: string
    label: string | null
  }> = []

  for (const ev of events) {
    const startStr = ev.start.date ?? ev.start.dateTime?.slice(0, 10)
    const endStr = ev.end.date ?? ev.end.dateTime?.slice(0, 10)
    if (!startStr || !endStr) continue

    let endInclusive = endStr
    if (ev.end.date && ev.start.date && endStr > startStr) {
      // All-day event: Google end.date is exclusive, subtract one day
      const endDate = new Date(endStr + 'T00:00:00')
      endDate.setDate(endDate.getDate() - 1)
      const y = endDate.getFullYear()
      const m = String(endDate.getMonth() + 1).padStart(2, '0')
      const d = String(endDate.getDate()).padStart(2, '0')
      endInclusive = `${y}-${m}-${d}`
    }

    rows.push({
      google_event_id: ev.id,
      start_date: startStr,
      end_date: endInclusive,
      label: ev.summary || null,
    })
  }

  // 5. Upsert all current events by google_event_id. Adds new rows,
  //    updates existing ones if Mario edited dates or labels in Google.
  let syncedCount = 0
  if (rows.length > 0) {
    const { error: upsertErr, count } = await supabase
      .from('days_off')
      .upsert(rows, { onConflict: 'google_event_id', count: 'exact' })
    if (upsertErr) {
      console.error('[days-off sync] upsert failed:', upsertErr)
    } else {
      syncedCount = count ?? rows.length
    }
  }

  // 6. Delete local rows whose upstream event no longer exists in the
  //    window. This handles the case where Mario deletes a Days Off
  //    event in Google — the row should disappear from the guardrail.
  //    Scope the delete to the sync window so we don't wipe historical
  //    rows that have aged out of the fetch range.
  const windowStartKey = (() => {
    const y = windowStart.getFullYear()
    const m = String(windowStart.getMonth() + 1).padStart(2, '0')
    const d = String(windowStart.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })()
  const windowEndKey = (() => {
    const y = windowEnd.getFullYear()
    const m = String(windowEnd.getMonth() + 1).padStart(2, '0')
    const d = String(windowEnd.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })()

  const currentIds = rows.map((r) => r.google_event_id)

  // Find rows in-window whose IDs aren't in the current fetch — those
  // are the orphans to delete. Use `gte/lte` on start_date to scope.
  const { data: localRows } = await supabase
    .from('days_off')
    .select('google_event_id, start_date')
    .gte('start_date', windowStartKey)
    .lte('start_date', windowEndKey)

  const orphans = (localRows ?? [])
    .filter((r: { google_event_id: string }) => !currentIds.includes(r.google_event_id))
    .map((r: { google_event_id: string }) => r.google_event_id)

  let deletedCount = 0
  if (orphans.length > 0) {
    const { error: delErr } = await supabase
      .from('days_off')
      .delete()
      .in('google_event_id', orphans)
    if (delErr) {
      console.error('[days-off sync] orphan delete failed:', delErr)
    } else {
      deletedCount = orphans.length
    }
  }

  return { synced: syncedCount, deleted: deletedCount, skipped: false }
}
