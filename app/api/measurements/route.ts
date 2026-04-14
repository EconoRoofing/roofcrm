import { NextRequest, NextResponse } from 'next/server'
import { getSatelliteImage, getRoofMeasurements } from '@/lib/roof-measurements'
import type { RoofMeasurements } from '@/lib/roof-measurements'
import { createClient } from '@/lib/supabase/server'

interface MeasurementsResponse {
  satellite_image_url: string | null
  measurements: RoofMeasurements | null
}

// In-memory cache: { key -> { data, expiresAt } }
// Bounded LRU-ish eviction prevents unbounded growth on warm serverless
// instances (#audit-item). On overflow we evict the OLDEST entry by insertion
// order (JS Maps preserve insertion order). For a true LRU we'd re-insert on
// hit, but for the 24h window that just adds cost without meaningful benefit.
const cache = new Map<string, { data: MeasurementsResponse; expiresAt: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours — addresses don't change
const MAX_CACHE_ENTRIES = 500

export async function GET(request: NextRequest) {
  // Auth check — prevent unauthenticated API cost abuse
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address') ?? ''
  const city = searchParams.get('city') ?? ''
  const state = searchParams.get('state') ?? ''

  if (!address || !city || !state) {
    return NextResponse.json(
      { error: 'address, city, and state are required' },
      { status: 400 }
    )
  }

  const cacheKey = `${address}|${city}|${state}`.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  const [satellite_image_url, measurements] = await Promise.all([
    getSatelliteImage(address, city, state),
    getRoofMeasurements(address, city, state),
  ])

  const data: MeasurementsResponse = { satellite_image_url, measurements }

  // Bound the cache so a warm instance can't grow without limit. Evict the
  // oldest insertion before writing a new entry. Also opportunistically
  // purge expired entries when we're at capacity to avoid churning the
  // eviction slot while valid cold entries still exist.
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now()
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt <= now) cache.delete(key)
    }
    // If still at capacity after expiry sweep, drop the oldest by insertion
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = cache.keys().next().value
      if (firstKey !== undefined) cache.delete(firstKey)
    }
  }
  cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })

  return NextResponse.json(data)
}
