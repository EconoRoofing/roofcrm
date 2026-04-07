/**
 * Google Calendar API v3 client (raw fetch, no googleapis package)
 * Calendar sync is best-effort — callers must wrap in try/catch.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

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
  return json.access_token ?? null
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
  company_calendar_id?: string | null  // Google Calendar ID for this company's events
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
 * Uses the company-specific calendar if configured (via job.company_calendar_id),
 * otherwise falls back to 'primary'. This allows events for DeHart, Econo, and
 * Nushake to land on separate, color-coded calendars.
 * Returns the event ID, or null if Calendar is not connected for this user.
 */
export async function createCalendarEvent(
  userId: string,
  job: JobForCalendar,
  eventType: 'estimate' | 'job'
): Promise<string | null> {
  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return null

  const body = buildEventBody(job, eventType)

  // Use company-specific calendar if configured, otherwise fall back to primary
  const calendarId = job.company_calendar_id ?? 'primary'

  const res = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
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
  }
): Promise<boolean> {
  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return false

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
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
 * Delete a Google Calendar event.
 * Returns true on success, false on failure.
 */
export async function deleteCalendarEvent(userId: string, eventId: string): Promise<boolean> {
  const accessToken = await getGoogleAccessToken(userId)
  if (!accessToken) return false

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
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
