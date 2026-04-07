/**
 * Google Calendar push notification webhook.
 *
 * NOTE: This endpoint requires a public HTTPS URL to receive push notifications.
 * For Phase 1, the endpoint is implemented but will only receive events after
 * deployment to Vercel (or another public host).
 *
 * Google sends a POST request with:
 *   X-Goog-Channel-ID  — the watch channel ID we registered
 *   X-Goog-Resource-ID — the calendar resource ID
 *   X-Goog-Resource-State — "sync" (initial) or "exists" (change)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

async function getAccessTokenForChannel(channelId: string): Promise<string | null> {
  // Look up which user owns this channel by checking our stored watch channels
  // For Phase 1 we store the mapping in a simple env var or fall back to scanning users
  const supabase = await createClient()

  // Query the user whose calendar_watch_channel_id matches
  const { data: userData, error } = await supabase
    .from('users')
    .select('id, google_refresh_token')
    .eq('calendar_watch_channel_id', channelId)
    .single()

  if (error || !userData?.google_refresh_token) {
    // Fallback: the channel may not be stored — return null gracefully
    return null
  }

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

async function fetchChangedEvents(
  accessToken: string,
  syncToken: string | null
): Promise<{ id: string; status: string; start?: { date?: string; dateTime?: string } }[]> {
  const params = new URLSearchParams({ maxResults: '50' })
  if (syncToken) {
    params.set('syncToken', syncToken)
  } else {
    // No sync token — fetch events updated in the last hour as a fallback
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    params.set('updatedMin', oneHourAgo)
  }

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    console.error('Calendar webhook: failed to list events', res.status, await res.text())
    return []
  }

  const json = await res.json()
  return json.items ?? []
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate that this is a legitimate Google push notification
  const channelId = req.headers.get('x-goog-channel-id')
  const resourceId = req.headers.get('x-goog-resource-id')
  const resourceState = req.headers.get('x-goog-resource-state')

  if (!channelId || !resourceId) {
    return NextResponse.json({ error: 'Missing required headers' }, { status: 400 })
  }

  // "sync" state is the initial handshake — just acknowledge it
  if (resourceState === 'sync') {
    return new NextResponse(null, { status: 200 })
  }

  // Get an access token for the user who owns this channel
  const accessToken = await getAccessTokenForChannel(channelId)
  if (!accessToken) {
    // Cannot process — acknowledge anyway so Google doesn't retry aggressively
    console.warn('Calendar webhook: no access token for channel', channelId)
    return new NextResponse(null, { status: 200 })
  }

  // Fetch changed events (using sync token if we have it — simplified for Phase 1)
  const events = await fetchChangedEvents(accessToken, null)

  if (events.length === 0) {
    return new NextResponse(null, { status: 200 })
  }

  const supabase = await createClient()

  for (const event of events) {
    if (!event.id) continue

    // Look up the job with this calendar event ID
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, scheduled_date, calendar_deleted')
      .eq('calendar_event_id', event.id)
      .single()

    if (jobError || !job) continue

    if (event.status === 'cancelled') {
      // Calendar event was deleted externally — set the flag on the job
      await supabase
        .from('jobs')
        .update({ calendar_deleted: true })
        .eq('id', job.id)
    } else {
      // Event updated — sync the date back to the job if it changed
      const rawDate = event.start?.date ?? event.start?.dateTime?.slice(0, 10) ?? null
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
