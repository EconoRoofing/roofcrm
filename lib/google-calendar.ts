/**
 * Google Calendar API v3 client (raw fetch, no googleapis package)
 * Calendar sync is best-effort — callers must wrap in try/catch.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

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
 */
async function getGoogleAccessToken(userId: string): Promise<string | null> {
  // Check in-memory cache first — avoids a DB query + token exchange on every calendar op
  const cached = tokenCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: userData, error } = await supabase
    .from('users')
    .select('google_refresh_token')
    .eq('id', userId)
    .single()

  if (error || !userData?.google_refresh_token) {
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
      // Token was revoked — clear it so we stop trying
      const { createClient: createClientForRevoke } = await import('@/lib/supabase/server')
      const supabaseRevoke = await createClientForRevoke()
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
  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return null

  const body = buildEventBody(job, eventType)

  const res = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    cache: 'no-store', // Calendar mutations must never be cached
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.status === 429) {
    console.warn('Calendar: rate limited by Google')
    return null
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error('Calendar sync: createCalendarEvent failed', res.status, errText)
    return null
  }

  const event = await res.json()
  return event.id ?? null
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
  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return false

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      cache: 'no-store', // Calendar mutations must never be cached
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    }
  )

  if (res.status === 429) {
    console.warn('Calendar: rate limited by Google')
    return false
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error('Calendar sync: updateCalendarEvent failed', res.status, errText)
    return false
  }

  return true
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
 * Delete a Google Calendar event.
 * Returns true on success, false on failure.
 */
export async function deleteCalendarEvent(userId: string, eventId: string, calendarId = 'primary'): Promise<boolean> {
  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return false

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      cache: 'no-store', // Calendar mutations must never be cached
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (res.status === 429) {
    console.warn('Calendar: rate limited by Google')
    return false
  }

  if (!res.ok && res.status !== 404) {
    const errText = await res.text()
    console.error('Calendar sync: deleteCalendarEvent failed', res.status, errText)
    return false
  }

  return true
}
