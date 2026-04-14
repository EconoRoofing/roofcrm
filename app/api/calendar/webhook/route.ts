/**
 * Google Calendar push notification webhook.
 *
 * Hardening (audit findings):
 *   1. Verifies X-Goog-Channel-Token against the per-user shared secret we
 *      stored when the watch was registered. Without this, anyone who
 *      learns a channel id can POST and rewrite scheduled dates.
 *   2. Queries the user's per-company calendar id (calendar_watch_calendar_id),
 *      not always 'primary'. Each company under econoroofing209@gmail.com has
 *      its own Google calendar — they all need to sync.
 *   3. Uses persisted syncToken for incremental sync. Eliminates duplicate
 *      processing across overlapping notifications and avoids re-scanning a
 *      1-hour window every push.
 *
 * Google sends a POST request with these headers:
 *   X-Goog-Channel-ID    — the watch channel ID we registered
 *   X-Goog-Resource-ID   — the calendar resource ID
 *   X-Goog-Resource-State — "sync" (initial handshake) or "exists" (change)
 *   X-Goog-Channel-Token — our shared secret, echoed back on every push
 */

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { localDateString } from '@/lib/auth-helpers'
import { reportError } from '@/lib/observability'

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

interface ChannelOwner {
  userId: string
  refreshToken: string
  watchToken: string | null
  calendarId: string
  syncToken: string | null
}

interface CalendarEvent {
  id: string
  status: string
  start?: { date?: string; dateTime?: string }
}

/**
 * Look up the user who owns this watch channel and pull everything the
 * webhook needs in a single query.
 */
async function getChannelOwner(channelId: string): Promise<ChannelOwner | null> {
  const supabase = await createClient()

  const { data: user, error } = await supabase
    .from('users')
    .select(
      'id, google_refresh_token, calendar_watch_token, calendar_watch_calendar_id, calendar_sync_token'
    )
    .eq('calendar_watch_channel_id', channelId)
    .single()

  if (error || !user?.google_refresh_token) {
    return null
  }

  // Audit R2-#22: refuse to fall back to 'primary'. The previous behavior
  // silently routed legacy watches (registered before the per-company calendar
  // column existed) at the auth user's 'primary' calendar, which under our
  // shared-Google-account model is a DIFFERENT company's calendar. That meant
  // a push for company A could rewrite company B's job dates. Forcing a null
  // here causes the caller to log + 200-ack the push and skip processing,
  // which makes the bad watch visible in logs and forces re-registration via
  // the daily renewal cron.
  const calendarId = (user as { calendar_watch_calendar_id?: string | null })
    .calendar_watch_calendar_id
  if (!calendarId) {
    console.warn('[calendar-webhook] legacy watch with no calendar_id, re-register required', channelId)
    return null
  }

  return {
    userId: user.id,
    refreshToken: user.google_refresh_token,
    watchToken: (user as { calendar_watch_token?: string | null }).calendar_watch_token ?? null,
    calendarId,
    syncToken: (user as { calendar_sync_token?: string | null }).calendar_sync_token ?? null,
  }
}

/**
 * Exchange the user's refresh token for a fresh access token.
 */
async function getAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null
  const json = await res.json()
  return json.access_token ?? null
}

/**
 * Pull events from the specific calendar the user's watch is registered for,
 * using the persisted syncToken when available. Returns the events plus the
 * NEW syncToken to persist for the next push.
 *
 * Google's syncToken protocol:
 *   - First call: pass `updatedMin` to bootstrap the window
 *   - Response includes `nextSyncToken`
 *   - Subsequent calls: pass `syncToken` and Google returns ONLY changes since
 *   - If syncToken is invalidated (410), reset and start fresh
 */
async function fetchChangedEvents(
  accessToken: string,
  calendarId: string,
  syncToken: string | null
): Promise<{ events: CalendarEvent[]; newSyncToken: string | null; expired: boolean }> {
  const params = new URLSearchParams({ maxResults: '50' })
  if (syncToken) {
    params.set('syncToken', syncToken)
  } else {
    // No sync token yet — bootstrap with a 1-hour window
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    params.set('updatedMin', oneHourAgo)
    params.set('singleEvents', 'true')
  }

  const url = `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })

  // 410 Gone = syncToken was invalidated (too old or scope changed). Caller
  // should clear it and bootstrap fresh on the next push.
  if (res.status === 410) {
    return { events: [], newSyncToken: null, expired: true }
  }

  if (!res.ok) {
    reportError(new Error(`events.list ${res.status}`), {
      route: '/api/calendar/webhook',
      step: 'fetch-events',
      status: res.status,
      body: await res.text().catch(() => ''),
    })
    return { events: [], newSyncToken: syncToken, expired: false }
  }

  const json = await res.json()
  return {
    events: json.items ?? [],
    newSyncToken: json.nextSyncToken ?? syncToken,
    expired: false,
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate that this is a legitimate Google push notification
  const channelId = req.headers.get('x-goog-channel-id')
  const resourceId = req.headers.get('x-goog-resource-id')
  const resourceState = req.headers.get('x-goog-resource-state')
  const channelToken = req.headers.get('x-goog-channel-token')

  if (!channelId || !resourceId) {
    return NextResponse.json({ error: 'Missing required headers' }, { status: 400 })
  }

  // "sync" state is the initial handshake — just acknowledge it
  if (resourceState === 'sync') {
    return new NextResponse(null, { status: 200 })
  }

  // Look up the channel owner BEFORE doing anything else — this also gives us
  // the shared secret we need to verify the push
  const owner = await getChannelOwner(channelId)
  if (!owner) {
    // Unknown channel — could be a stale watch or a forged request.
    // Acknowledge with 200 so Google doesn't retry, but log for visibility.
    console.warn('[calendar-webhook] unknown channel id', channelId)
    return new NextResponse(null, { status: 200 })
  }

  // SECURITY: verify X-Goog-Channel-Token matches the secret we registered.
  // Google echoes whatever `token` we passed when calling watch(). Without
  // this check, anyone who learns a channelId can POST forged notifications.
  // Audit R2-#28: use timingSafeEqual instead of `!==` so a remote attacker
  // can't recover the watchToken byte-by-byte via timing analysis.
  if (owner.watchToken) {
    const presented = Buffer.from(channelToken ?? '')
    const expected = Buffer.from(owner.watchToken)
    const ok =
      presented.length === expected.length && timingSafeEqual(presented, expected)
    if (!ok) {
      console.warn('[calendar-webhook] channel token mismatch', channelId)
      return NextResponse.json({ error: 'Invalid channel token' }, { status: 401 })
    }
  }

  // Get a fresh access token
  const accessToken = await getAccessToken(owner.refreshToken)
  if (!accessToken) {
    console.warn('[calendar-webhook] no access token for user', owner.userId)
    return new NextResponse(null, { status: 200 })
  }

  // Fetch changed events from the user's actual calendar (per-company), using
  // the persisted syncToken for incremental sync
  const { events, newSyncToken, expired } = await fetchChangedEvents(
    accessToken,
    owner.calendarId,
    owner.syncToken
  )

  const supabase = await createClient()

  // Persist the new syncToken (or clear it if expired)
  if (expired || newSyncToken !== owner.syncToken) {
    await supabase
      .from('users')
      .update({ calendar_sync_token: expired ? null : newSyncToken })
      .eq('id', owner.userId)
  }

  if (events.length === 0) {
    return new NextResponse(null, { status: 200 })
  }

  // Process each changed event idempotently — re-running this loop on the
  // same event is a no-op because we only write when scheduled_date differs.
  for (const event of events) {
    if (!event.id) continue

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, scheduled_date, calendar_deleted')
      .eq('calendar_event_id', event.id)
      .single()

    if (jobError || !job) continue

    if (event.status === 'cancelled') {
      // Calendar event deleted externally — flag it on the job (if not already)
      if (!job.calendar_deleted) {
        await supabase
          .from('jobs')
          .update({ calendar_deleted: true })
          .eq('id', job.id)
      }
    } else {
      // Event updated — sync the date back if it changed.
      // event.start.date is YYYY-MM-DD for all-day events; dateTime is ISO 8601.
      // For dateTime, we need the LOCAL date, not the UTC slice (otherwise
      // a 9pm-PST event on Apr 13 lands on Apr 14 in the DB).
      let rawDate: string | null = null
      if (event.start?.date) {
        rawDate = event.start.date
      } else if (event.start?.dateTime) {
        rawDate = localDateString(new Date(event.start.dateTime))
      }
      if (rawDate && rawDate !== job.scheduled_date) {
        await supabase
          .from('jobs')
          .update({ scheduled_date: rawDate, calendar_deleted: false })
          .eq('id', job.id)
      }
    }
  }

  return new NextResponse(null, { status: 200 })
}
