import type { GeofenceResult } from '@/lib/types/time-tracking'

const EARTH_RADIUS_FT = 20_902_231 // Earth radius in feet

/**
 * Haversine formula — returns distance in feet between two lat/lng points.
 */
export function getDistanceFt(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_FT * c
}

/**
 * Check if user is within geofence of jobsite.
 *
 * Returns:
 * - within 500ft:   { within: true,  distanceFt, status: 'confirmed' }
 * - 500–2000ft:     { within: false, distanceFt, status: 'warning'   }
 * - 2000ft+:        { within: false, distanceFt, status: 'flagged'   }
 */
export function checkGeofence(
  userLat: number,
  userLng: number,
  jobLat: number,
  jobLng: number,
  radiusFt = 500
): GeofenceResult {
  // Validate inputs
  if (isNaN(userLat) || isNaN(userLng) || isNaN(jobLat) || isNaN(jobLng)) {
    return { within: false, distanceFt: 0, status: 'flagged' as const }
  }

  const distanceFt = Math.round(getDistanceFt(userLat, userLng, jobLat, jobLng))

  if (distanceFt <= radiusFt) {
    return { within: true, distanceFt, status: 'confirmed' }
  } else if (distanceFt <= 2000) {
    return { within: false, distanceFt, status: 'warning' }
  } else {
    return { within: false, distanceFt, status: 'flagged' }
  }
}

/**
 * Geocode an address to lat/lng using OpenWeatherMap geocoding API.
 * Returns null if OPENWEATHERMAP_API_KEY is not set or geocoding fails.
 */
export async function geocodeAddress(
  address: string,
  city: string,
  state: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY
  if (!apiKey) return null

  try {
    const q = encodeURIComponent(`${address},${city},${state},US`)
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${q}&appid=${apiKey}`
    const res = await fetch(url, { next: { revalidate: 86400 } }) // Cache 24h — addresses don't move
    if (!res.ok) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null

    const { lat, lon } = data[0]
    if (typeof lat !== 'number' || typeof lon !== 'number') return null

    if (lat < 24 || lat > 50 || lon < -125 || lon > -66) {
      console.warn(`Geocoding returned non-US coordinates: ${lat}, ${lon}`)
      return null
    }

    return { lat, lng: lon }
  } catch {
    return null
  }
}
