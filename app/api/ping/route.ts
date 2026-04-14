import { NextResponse } from 'next/server'

// Audit R4-#13: lightweight HEAD-friendly health endpoint used by
// components/ui/offline-banner.tsx to distinguish real connectivity
// from "iPhone sees Wi-Fi bars but has no internet" false positives.
//
// Deliberately minimal: no auth, no DB hit, no observability. The
// banner fetches this ~once per 30s while visible, so any work here
// would bloat the cost for zero gain. The *existence* of a 200 response
// is the entire signal.
//
// force-dynamic guarantees the response is never cached by Next.js or
// any upstream proxy — a cached 200 during an actual outage would
// defeat the whole point of the probe.

export const dynamic = 'force-dynamic'
export const runtime = 'edge'

export async function GET() {
  return new NextResponse(null, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
