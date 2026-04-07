import { NextRequest, NextResponse } from 'next/server'
import { getSatelliteImage, getRoofMeasurements } from '@/lib/roof-measurements'
import type { RoofMeasurements } from '@/lib/roof-measurements'

interface MeasurementsResponse {
  satellite_image_url: string | null
  measurements: RoofMeasurements | null
}

// In-memory cache: { key -> { data, expiresAt } }
const cache = new Map<string, { data: MeasurementsResponse; expiresAt: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours — addresses don't change

export async function GET(request: NextRequest) {
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
  cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })

  return NextResponse.json(data)
}
