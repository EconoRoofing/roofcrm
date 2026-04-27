/**
 * Google Calendar API v3 client (raw fetch, no googleapis package)
 * Calendar sync is best-effort — callers must wrap in try/catch.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

/**
 * Dry-run mode for WRITE operations only (create/update/delete).
 *
 * Set `CALENDAR_DRY_RUN=true` in the environment to make all three write
 * helpers log what they WOULD do to Google and return a fake result
 * without actually calling the Google API. Read helpers
 * (`listCalendarEvents`, `listCalendarEventsDebug`) are unaffected — they
 * only read, never mutate, so it's always safe to let them through.
 *
 * Use case: Mario wanted to verify migration 041's per-company routing
 * (pickCalendarId in lib/actions/jobs.ts) end-to-end before trusting it
 * against his real production calendars. The dry-run flag lets him walk
 * a test job through new_lead → estimate_scheduled → job_scheduled →
 * completed and watch the Vercel logs to confirm the right calendar ID
 * is being targeted at every step, with zero risk to real events.
 *
 * Create returns a synthetic event ID of the form `dry-run-<timestamp>`
 * so downstream updates/deletes can prove they read the same row that
 * create wrote — you can trace a single test job through all 4
 * transitions in the logs by matching on the synthetic ID.
 */
function isDryRun(): boolean {
  return process.env.CALENDAR_DRY_RUN === 'true'
}

// In-memory token cache with 55-minute TTL (Google tokens valid for 60 min)
// Resets on serverless cold starts — acceptable, as cache is perf-only, not correctness
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

// Color IDs mapped to job types
const JOB_TYPE_COLOR: Record<string, string> = {
  reroof: '9',        // blue
  repair: '6',        // orange
  maintenance: '2',   // green
  inspection: '5',    // yellow
  coating: '7',       // cyan
  new_construction: '11', // red
  gutters: '8',       // gray
  other: '8',         // gray
}

/**
 * Get a fresh Google access token for a user.
 * Uses the google_refresh_token stored on the users table.
 * Returns null if the user has no refresh token (Calendar not connected).
 *
 * RLS NOTE: `public.users` has an `auth.uid() IS NOT NULL` read floor
 * from migration 036's defensive_floor. When this helper is called from
 * a no-session context (cron, webhook), the anon client silently returns
 * zero rows from the users table because `auth.uid()` is NULL and the
 * RLS policy fails closed. The symptom was `syncDaysOff` reporting
 * `{synced: 0, skipped: false}` with zero log lines — invisible because
 * the "user not found" branch below returns null without logging.
 *
 * Fix: prefer the service-role client when available (always bypasses
 * RLS), fall back to the cookie-scoped anon client if the service key
 * isn't configured. This upgrades cron/webhook paths without changing
 * behavior for authenticated user contexts — both SELECTs succeed, just
 * via different code paths.
 *
 * The update/revoke path at the bottom has the same RLS problem for
 * writes (anon client can't UPDATE users in no-session context), so it
 * uses the same preferred-service-client pattern.
 */
async function getGoogleAccessToken(userId: string): Promise<string | null> {
  // Check in-memory cache first — avoids a DB query + token exchange on every calendar op
  const cached = tokenCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token
  }

  // Try service-role client first (bypasses RLS, works in any context).
  // Fall back to anon/cookie client only if service key isn't configured.
  const { createServiceClient } = await import('@/lib/supabase/service')
  let supabase = createServiceClient()
  if (!supabase) {
    const { createClient } = await import('@/lib/supabase/server')
    supabase = await createClient()
  }

  const { data: userData, error } = await supabase
    .from('users')
    .select('google_refresh_token')
    .eq('id', userId)
    .single()

  if (error || !userData?.google_refresh_token) {
    // Log the lookup miss so we stop getting invisible `synced: 0` results
    // from cron callers. This used to be a silent return — the bug that
    // took half an hour to find because nothing ever made it to Vercel's
    // logs. Now every failure mode writes a log line.
    console.warn(
      `Calendar: getGoogleAccessToken user=${userId} lookup returned no refresh_token (error=${error?.message ?? 'none'})`
    )
    return null
  }

  const refreshToken = userData.google_refresh_token
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('Calendar sync: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set')
    return null
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    cache: 'no-store', // Token exchange is a mutation — never cache
    signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    if (res.status === 400 && body.includes('invalid_grant')) {
      // Token was revoked — clear it so we stop trying. Uses the same
      // preferred-service-client pattern as the SELECT above so it works
      // from cron/webhook contexts where the anon client can't UPDATE.
      const { createServiceClient: createServiceForRevoke } = await import('@/lib/supabase/service')
      let supabaseRevoke = createServiceForRevoke()
      if (!supabaseRevoke) {
        const { createClient: createClientForRevoke } = await import('@/lib/supabase/server')
        supabaseRevoke = await createClientForRevoke()
      }
      await supabaseRevoke.from('users').update({ google_refresh_token: null }).eq('id', userId)
      console.warn(`Calendar: refresh token revoked for user ${userId}, cleared from DB`)
      return null
    }
    console.error('Calendar: token refresh failed', res.status, body)
    return null
  }

  const json = await res.json()
  const accessToken: string | null = json.access_token ?? null

  // Cache the new token with a 55-minute TTL
  if (accessToken) {
    tokenCache.set(userId, {
      token: accessToken,
      expiresAt: Date.now() + 55 * 60 * 1000,
    })
  }

  return accessToken
}

// =============================================================================
// LOW-LEVEL GOOGLE CALENDAR HELPERS
//
// These deal in raw Google Calendar event bodies — no entity-specific knowledge.
// Use them when adding a new entity type that needs calendar sync (follow-ups,
// cert renewals, customer appointments, etc.). Build the body in your entity-
// specific module, then call createGoogleEvent / updateGoogleEvent / deleteGoogleEvent.
//
// `contextLabel` is for logs only — it tags every entry with what kind of entity
// triggered the call ('job', 'estimate', 'follow_up', 'cert_renewal') so you can
// trace a single entity through Vercel logs even when many event types coexist.
//
// CALENDAR_DRY_RUN handled here so EVERY entity type honors it, not just jobs.
// =============================================================================

export interface GoogleEventBody {
  summary: string
  location?: string
  description?: string
  start: { date?: string; dateTime?: string; timeZone?: string }
  end: { date?: string; dateTime?: string; timeZone?: string }
  colorId?: string
}

export async function createGoogleEvent(
  userId: string,
  calendarId: string,
  body: GoogleEventBody,
  contextLabel: string
): Promise<string | null> {
  if (isDryRun()) {
    const syntheticId = `dry-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    console.log(
      `[CALENDAR_DRY_RUN] createGoogleEvent: userId=${userId} type=${contextLabel} calendarId=${calendarId} → synthetic eventId=${syntheticId} summary="${body.summary}"`
    )
    return syntheticId
  }

  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return null

  const res = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.status === 429) {
    console.warn(`Calendar: rate limited on createGoogleEvent (${contextLabel})`)
    return null
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error(`Calendar: createGoogleEvent failed (${contextLabel})`, res.status, errText)
    return null
  }

  const event = await res.json()
  return event.id ?? null
}

export async function updateGoogleEvent(
  userId: string,
  calendarId: string,
  eventId: string,
  updates: Partial<GoogleEventBody>,
  contextLabel: string
): Promise<boolean> {
  if (isDryRun()) {
    console.log(
      `[CALENDAR_DRY_RUN] updateGoogleEvent: userId=${userId} type=${contextLabel} eventId=${eventId} calendarId=${calendarId} updates=${JSON.stringify(updates)}`
    )
    return true
  }

  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return false

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    }
  )

  if (res.status === 429) {
    console.warn(`Calendar: rate limited on updateGoogleEvent (${contextLabel})`)
    return false
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error(`Calendar: updateGoogleEvent failed (${contextLabel})`, res.status, errText)
    return false
  }

  return true
}

export async function deleteGoogleEvent(
  userId: string,
  calendarId: string,
  eventId: string,
  contextLabel: string
): Promise<boolean> {
  if (isDryRun()) {
    console.log(
      `[CALENDAR_DRY_RUN] deleteGoogleEvent: userId=${userId} type=${contextLabel} eventId=${eventId} calendarId=${calendarId}`
    )
    return true
  }

  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return false

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (res.status === 429) {
    console.warn(`Calendar: rate limited on deleteGoogleEvent (${contextLabel})`)
    return false
  }

  // 404 = already gone, treat as success (e.g. user manually deleted in Google,
  // or we're cleaning up a stale dry-run synthetic ID)
  if (!res.ok && res.status !== 404) {
    const errText = await res.text()
    console.error(`Calendar: deleteGoogleEvent failed (${contextLabel})`, res.status, errText)
    return false
  }

  return true
}

// =============================================================================
// JOB-SPECIFIC WRAPPERS (kept for backward compat; thin wrappers over low-level)
// =============================================================================

interface JobForCalendar {
  id: string
  job_number: string
  customer_name: string
  address: string
  city: string
  job_type: string
  scheduled_date?: string | null
  notes?: string | null
}

function buildEventBody(
  job: JobForCalendar,
  eventType: 'estimate' | 'job'
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const deepLink = `${appUrl}/jobs/${job.id}`
  const colorId = JOB_TYPE_COLOR[job.job_type] ?? '8'

  const summary =
    eventType === 'estimate'
      ? `Estimate: ${job.job_number} — ${job.customer_name}`
      : `Job: ${job.job_number} — ${job.customer_name} (${job.job_type})`

  const location = `${job.address}, ${job.city}, CA`

  const description = [
    `Job #: ${job.job_number}`,
    `Customer: ${job.customer_name}`,
    `Type: ${job.job_type}`,
    `Address: ${location}`,
    job.notes ? `Notes: ${job.notes}` : null,
    ``,
    `View in CRM: ${deepLink}`,
  ]
    .filter((line) => line !== null)
    .join('\n')

  let start: object
  let end: object

  if (job.scheduled_date) {
    // Timed event: scheduled_date is a date string (YYYY-MM-DD), default 8 AM – 9 AM
    const startDateTime = `${job.scheduled_date}T08:00:00`
    const endDateTime = `${job.scheduled_date}T09:00:00`
    start = { dateTime: startDateTime, timeZone: 'America/Los_Angeles' }
    end = { dateTime: endDateTime, timeZone: 'America/Los_Angeles' }
  } else {
    // All-day event for today
    const today = new Date().toISOString().slice(0, 10)
    start = { date: today }
    end = { date: today }
  }

  return { summary, location, description, start, end, colorId }
}

/**
 * Create a Google Calendar event for a job.
 * The calendar is resolved by the caller (see pickCalendarId in lib/actions/jobs.ts)
 * which routes estimates and jobs to different per-company calendars. Defaults to
 * 'primary' if the caller doesn't specify — matches updateCalendarEvent/deleteCalendarEvent.
 * Returns the event ID, or null if Calendar is not connected for this user.
 */
export async function createCalendarEvent(
  userId: string,
  job: JobForCalendar,
  eventType: 'estimate' | 'job',
  calendarId = 'primary'
): Promise<string | null> {
  const body = buildEventBody(job, eventType)
  return createGoogleEvent(userId, calendarId, body, `${eventType}:${job.job_number}`)
}

/**
 * Update fields on an existing Google Calendar event.
 * Returns true on success, false on failure.
 */
export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  updates: {
    summary?: string
    start?: { dateTime: string; timeZone?: string }
    end?: { dateTime: string; timeZone?: string }
    colorId?: string
  },
  calendarId = 'primary'
): Promise<boolean> {
  return updateGoogleEvent(userId, calendarId, eventId, updates, 'job-update')
}

/**
 * Shape of a calendar event as returned by listCalendarEvents.
 * This is a normalized subset of Google's Events.list response — the raw
 * response has ~30 fields and we only need a handful for overlay display
 * and the Days Off guardrail. Both `start` and `end` can be either all-day
 * (`date: 'YYYY-MM-DD'`) or timed (`dateTime: ISO 8601`), matching Google's
 * own union.
 */
export interface OverlayEvent {
  id: string
  summary: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
}

/**
 * List events from a Google Calendar in a date window.
 *
 * Used by the manager calendar view to pull overlay events (Admin / Payroll,
 * Days Off) from calendars that aren't tied to `jobs` rows. Also used by
 * the daily cron to mirror the Days Off calendar into the local `days_off`
 * table for the scheduling guardrail.
 *
 * - `timeMin`/`timeMax` are ISO 8601 strings (RFC 3339). Google's
 *   events.list treats them as UTC unless they carry an explicit offset.
 * - `singleEvents=true` expands recurring events into individual
 *   occurrences. Without this, a weekly payroll event would return ONE
 *   event with a `recurrence` rule the overlay view can't render.
 * - Google caps at 2500 per page; for a monthly window we're nowhere
 *   near that, so we don't paginate. If this ever changes we'd need a
 *   nextPageToken loop.
 *
 * Returns an empty array on any failure (best-effort, same convention
 * as create/update/delete). Callers should render an empty overlay
 * rather than break the whole calendar view.
 */
export async function listCalendarEvents(
  userId: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<OverlayEvent[]> {
  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return []

  const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '250')

  const res = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (res.status === 429) {
    console.warn('Calendar: rate limited by Google on listCalendarEvents', calendarId)
    return []
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error('Calendar: listCalendarEvents failed', res.status, errText)
    return []
  }

  const json = await res.json() as {
    items?: Array<{
      id?: string
      summary?: string
      start?: { date?: string; dateTime?: string }
      end?: { date?: string; dateTime?: string }
    }>
  }

  const items = json.items ?? []
  return items
    .filter((e) => e.id && e.start && e.end)
    .map((e) => ({
      id: e.id as string,
      summary: e.summary ?? '(no title)',
      start: e.start as { date?: string; dateTime?: string },
      end: e.end as { date?: string; dateTime?: string },
    }))
}

/**
 * Diagnostic variant of listCalendarEvents.
 *
 * Returns the same events plus structured debug info so callers can surface
 * exactly why a sync came back empty. The regular `listCalendarEvents` swallows
 * every failure mode into `[]` — great for the overlay render path (degrade
 * gracefully), terrible for the cron sync (invisible `synced: 0`).
 *
 * This exists specifically to debug `syncDaysOff` returning zero with no log
 * trail. Once the root cause is fixed, this can stay behind a debug flag or
 * be removed entirely — see the "Fix Guide" plan in chat history.
 */
export async function listCalendarEventsDebug(
  userId: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<{
  events: OverlayEvent[]
  tokenPresent: boolean
  httpStatus: number | null
  googleError: string | null
  rawItemCount: number
}> {
  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) {
    return {
      events: [],
      tokenPresent: false,
      httpStatus: null,
      googleError: 'getGoogleAccessToken returned null',
      rawItemCount: 0,
    }
  }

  const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '250')

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (err) {
    return {
      events: [],
      tokenPresent: true,
      httpStatus: null,
      googleError: `fetch threw: ${err instanceof Error ? err.message : String(err)}`,
      rawItemCount: 0,
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '(unreadable response body)')
    return {
      events: [],
      tokenPresent: true,
      httpStatus: res.status,
      googleError: errText.slice(0, 500),
      rawItemCount: 0,
    }
  }

  const json = (await res.json()) as {
    items?: Array<{
      id?: string
      summary?: string
      start?: { date?: string; dateTime?: string }
      end?: { date?: string; dateTime?: string }
    }>
  }

  const items = json.items ?? []
  const events: OverlayEvent[] = items
    .filter((e) => e.id && e.start && e.end)
    .map((e) => ({
      id: e.id as string,
      summary: e.summary ?? '(no title)',
      start: e.start as { date?: string; dateTime?: string },
      end: e.end as { date?: string; dateTime?: string },
    }))

  return {
    events,
    tokenPresent: true,
    httpStatus: res.status,
    googleError: null,
    rawItemCount: items.length,
  }
}

/**
 * Delete a Google Calendar event.
 * Returns true on success, false on failure.
 */
export async function deleteCalendarEvent(userId: string, eventId: string, calendarId = 'primary'): Promise<boolean> {
  return deleteGoogleEvent(userId, calendarId, eventId, 'job-delete')
}
