/**
 * Calendar watch channel utilities.
 *
 * Google Calendar push notifications require registering a watch channel
 * per (user, calendar) pair. Channels expire after ~7 days; `renewCalendarWatch`
 * is called by the daily cron to stop the old channel and register a fresh one.
 *
 * All state is persisted to `users.calendar_watch_*` so the webhook can
 * look up the owner + verify the shared-secret token on incoming pushes.
 */

import { randomBytes } from 'crypto'

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

interface WatchChannelResult {
  channelId: string
  resourceId: string
  expiration: string
  watchToken: string
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
 * Register a Google Calendar push notification watch channel AND persist
 * all fields to users.calendar_watch_*. Returns null in local dev.
 *
 * Persistence is the whole point: the webhook at /api/calendar/webhook
 * looks the channel up via calendar_watch_channel_id, verifies the shared
 * secret via calendar_watch_token, and queries the per-company calendar
 * via calendar_watch_calendar_id. Skipping any of these breaks the sync.
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
  // Shared secret that Google echoes back as X-Goog-Channel-Token on every
  // push. The webhook verifies it against users.calendar_watch_token to
  // confirm the notification is actually from Google and not forged.
  const watchToken = randomBytes(24).toString('hex')

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
        token: watchToken,
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    console.error('Calendar sync: registerCalendarWatch failed', res.status, body)
    return null
  }

  const json = await res.json()
  const result: WatchChannelResult = {
    channelId: json.id,
    resourceId: json.resourceId,
    expiration: json.expiration, // Google returns an ms epoch string
    watchToken,
  }

  // Persist everything so the webhook + renewal cron can find it
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const expirationIso = result.expiration
    ? new Date(Number(result.expiration)).toISOString()
    : null
  const { error } = await supabase
    .from('users')
    .update({
      calendar_watch_channel_id: result.channelId,
      calendar_watch_token: result.watchToken,
      calendar_watch_calendar_id: calendarId,
      calendar_watch_expiration: expirationIso,
      calendar_sync_token: null, // reset — new channel starts fresh
    })
    .eq('id', userId)

  if (error) {
    console.error('Calendar sync: failed to persist watch fields', error)
    return null
  }

  return result
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

  // Register a fresh channel (this also persists the new ids + expiration)
  return registerCalendarWatch(userId, calendarId)
}

/**
 * Daily cron entry point. Finds every user whose calendar watch expires in
 * the next 48 hours and renews it. Runs as best-effort: errors on one user
 * don't block the rest. Safe to call when no users have watches — returns 0.
 *
 * Audit R2-#11: without this, Google watch channels expired silently after
 * ~7 days and the external-edit sync quietly stopped working.
 */
export async function renewExpiringCalendarWatches(): Promise<{
  renewed: number
  failed: number
}> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  // Find watches that will expire in the next 48 hours. 48h gives us two
  // daily cron cycles of runway in case one fails — safer than a tight
  // just-in-time window.
  const cutoff = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  const { data: users, error } = await supabase
    .from('users')
    .select('id, calendar_watch_channel_id, calendar_watch_calendar_id')
    .not('calendar_watch_channel_id', 'is', null)
    .lt('calendar_watch_expiration', cutoff)

  if (error || !users || users.length === 0) {
    return { renewed: 0, failed: 0 }
  }

  let renewed = 0
  let failed = 0

  for (const user of users) {
    const u = user as {
      id: string
      calendar_watch_channel_id: string | null
      calendar_watch_calendar_id: string | null
    }
    if (!u.calendar_watch_channel_id) continue
    try {
      const result = await renewCalendarWatch(
        u.id,
        u.calendar_watch_calendar_id ?? 'primary',
        u.calendar_watch_channel_id
      )
      if (result) {
        renewed++
      } else {
        failed++
      }
    } catch (err) {
      console.error(`[calendar-sync] renew failed for user ${u.id}:`, err)
      failed++
    }
  }

  return { renewed, failed }
}
