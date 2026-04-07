/**
 * Calendar watch channel utilities.
 *
 * NOTE: These are placeholder implementations for Phase 1.
 * They will be activated after Vercel deployment, when the webhook URL
 * at /api/calendar/webhook is publicly reachable.
 */

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

interface WatchChannelResult {
  channelId: string
  resourceId: string
  expiration: string
}

async function getAccessToken(userId: string): Promise<string | null> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: userData } = await supabase
    .from('users')
    .select('google_refresh_token')
    .eq('id', userId)
    .single()

  if (!userData?.google_refresh_token) return null

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: userData.google_refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null
  const json = await res.json()
  return json.access_token ?? null
}

/**
 * Register a Google Calendar push notification watch channel.
 * The webhook URL must be publicly reachable (i.e. deployed to Vercel).
 * Returns null in local dev where APP_URL is localhost.
 */
export async function registerCalendarWatch(
  userId: string,
  calendarId: string = 'primary'
): Promise<WatchChannelResult | null> {
  if (!APP_URL || APP_URL.includes('localhost')) {
    console.info('Calendar sync: skipping watch registration — no public URL configured')
    return null
  }

  const accessToken = await getAccessToken(userId)
  if (!accessToken) return null

  const channelId = `roofcrm-${userId}-${Date.now()}`
  const webhookUrl = `${APP_URL}/api/calendar/webhook`

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    console.error('Calendar sync: registerCalendarWatch failed', res.status, body)
    return null
  }

  const json = await res.json()
  return {
    channelId: json.id,
    resourceId: json.resourceId,
    expiration: json.expiration,
  }
}

/**
 * Renew an existing watch channel before it expires.
 * Google watch channels expire after ~7 days — this should be called via a cron job.
 * Stops the old channel and registers a new one.
 */
export async function renewCalendarWatch(
  userId: string,
  calendarId: string = 'primary',
  channelId: string
): Promise<WatchChannelResult | null> {
  if (!APP_URL || APP_URL.includes('localhost')) {
    return null
  }

  const accessToken = await getAccessToken(userId)
  if (!accessToken) return null

  // Stop the old channel (best-effort — don't fail if it's already expired)
  await fetch(`${GOOGLE_CALENDAR_BASE}/channels/stop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: channelId }),
  }).catch(() => null)

  // Register a fresh channel
  return registerCalendarWatch(userId, calendarId)
}
