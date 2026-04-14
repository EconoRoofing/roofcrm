'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'
import { listCalendarEvents, type OverlayEvent } from '@/lib/google-calendar'

/**
 * Flattened overlay event shape passed from server to client components.
 * `dateKey` is a local-tz YYYY-MM-DD string so the client's cell-keyed
 * rendering can index directly without reparsing Google's start/end union.
 *
 * Multi-day events get expanded into one per day — the client's overlay
 * map uses the same cell-per-day model as the job grid in calendar-view.tsx,
 * so a 3-day Days Off block has to appear in 3 cells.
 */
export interface FlatOverlayEvent {
  key: string              // system_calendars.key (stable purpose identifier)
  label: string            // display name for the chip
  color: string            // hex color
  summary: string          // event title from Google
  dateKey: string          // YYYY-MM-DD the chip should render under
  googleEventId: string    // for deep-linking into Google Calendar
  calendarId: string       // target calendar (for building the deep link)
}

interface SystemCalendarRow {
  key: string
  calendar_id: string
  label: string
  color: string
}

/**
 * Resolve a user ID whose google_refresh_token we can borrow to read
 * overlay calendars. Tries the currently-authenticated user first — if
 * they have their own Google OAuth, use it. Otherwise falls back to any
 * user in the same company with a refresh token (typically the owner).
 *
 * Returns null if nobody in the company has connected Google Calendar,
 * which is the "gracefully show no overlays" signal.
 */
async function resolveCalendarUser(): Promise<string | null> {
  const supabase = await createClient()

  try {
    const { userId, companyId } = await getUserWithCompany()

    // Path 1: current user has their own token
    const { data: self } = await supabase
      .from('users')
      .select('id, google_refresh_token')
      .eq('id', userId)
      .maybeSingle()

    if (self?.google_refresh_token) return self.id

    // Path 2: any user in this company with a token
    const { data: fallback } = await supabase
      .from('users')
      .select('id')
      .eq('primary_company_id', companyId)
      .not('google_refresh_token', 'is', null)
      .limit(1)
      .maybeSingle()

    return fallback?.id ?? null
  } catch {
    // Not authenticated or some other failure — return null so callers
    // render an empty overlay rather than crashing the calendar page.
    return null
  }
}

/**
 * Build the YYYY-MM-DD date keys covered by a Google Calendar event.
 * Handles both shapes:
 *   - All-day events: { date: 'YYYY-MM-DD' }  — end.date is EXCLUSIVE per Google spec
 *   - Timed events:   { dateTime: ISO8601 }
 *
 * For a 3-day Days Off starting Monday, Google returns
 *   start: { date: '2026-04-13' }, end: { date: '2026-04-16' }
 * (note end is the day AFTER the last day of the block). This function
 * expands that into ['2026-04-13', '2026-04-14', '2026-04-15'].
 */
function dateKeysForEvent(ev: OverlayEvent): string[] {
  const keys: string[] = []

  const startStr = ev.start.date ?? ev.start.dateTime
  const endStr = ev.end.date ?? ev.end.dateTime
  if (!startStr || !endStr) return keys

  // Parse as local dates — the `YYYY-MM-DD` form is timezone-naive, so
  // we anchor to local midnight to avoid UTC drift near month boundaries.
  // For timed events we use the date portion only (the chip renders as a
  // whole-day marker regardless).
  const start = new Date(startStr.slice(0, 10) + 'T00:00:00')
  const end = new Date(endStr.slice(0, 10) + 'T00:00:00')

  // For all-day events, Google's end.date is exclusive — stop one day
  // short. For timed events we treat end as inclusive. Heuristic: if the
  // event has a `date` (not `dateTime`) AND end.date is strictly after
  // start.date, subtract a day from the iteration upper bound.
  const endInclusive = new Date(end)
  if (ev.end.date && ev.start.date && end > start) {
    endInclusive.setDate(endInclusive.getDate() - 1)
  }

  const cursor = new Date(start)
  while (cursor <= endInclusive) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    keys.push(`${y}-${m}-${d}`)
    cursor.setDate(cursor.getDate() + 1)
  }

  return keys
}

/**
 * Fetch overlay events (Admin / Payroll, Days Off, etc.) for a date window,
 * flattened into per-day entries ready for the manager calendar view.
 *
 * Runs all overlay calendar fetches in parallel. Each one is independently
 * best-effort — a failure on one calendar doesn't take down the others.
 *
 * @param windowStartIso ISO 8601 start of window (inclusive, UTC or with offset)
 * @param windowEndIso   ISO 8601 end of window (exclusive)
 */
export async function getOverlayEvents(
  windowStartIso: string,
  windowEndIso: string
): Promise<FlatOverlayEvent[]> {
  const calendarUserId = await resolveCalendarUser()
  if (!calendarUserId) return []

  const supabase = await createClient()
  const { data: calendars, error } = await supabase
    .from('system_calendars')
    .select('key, calendar_id, label, color')

  if (error || !calendars || calendars.length === 0) return []

  const rows = calendars as SystemCalendarRow[]

  // Fetch all overlay calendars in parallel. Settle-all semantics (via
  // Promise.all with per-call error handling inside listCalendarEvents)
  // means one failing calendar returns [] rather than rejecting the whole
  // batch.
  const batches = await Promise.all(
    rows.map(async (cal) => {
      const events = await listCalendarEvents(
        calendarUserId,
        cal.calendar_id,
        windowStartIso,
        windowEndIso
      )
      return { cal, events }
    })
  )

  const flat: FlatOverlayEvent[] = []
  for (const { cal, events } of batches) {
    for (const ev of events) {
      const keys = dateKeysForEvent(ev)
      for (const dateKey of keys) {
        flat.push({
          key: cal.key,
          label: cal.label,
          color: cal.color,
          summary: ev.summary,
          dateKey,
          googleEventId: ev.id,
          calendarId: cal.calendar_id,
        })
      }
    }
  }

  return flat
}
