import { geocodeAddress } from '@/lib/geo'

export interface RoofMeasurements {
  total_squares: number
  ridge_length_ft: number
  hip_length_ft: number
  valley_length_ft: number
  eave_length_ft: number
  pitch: string // e.g., "6/12"
  facets: number
  satellite_image_url: string
}

/**
 * Get a satellite image URL for the given address using Google Maps Static API.
 * Returns null if GOOGLE_MAPS_API_KEY is not configured.
 */
export async function getSatelliteImage(
  address: string,
  city: string,
  state: string
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  const coords = await geocodeAddress(address, city, state)
  if (!coords) return null

  const { lat, lng } = coords
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=600x400&maptype=satellite&key=${apiKey}`
}

/**
 * Get roof measurements for the given address.
 * Phase 1: Returns null — measurements are entered manually.
 * Phase 2 will integrate Google Solar API or Roofr API.
 *
 * Future implementation:
 * GET https://solar.googleapis.com/v1/buildingInsights:findClosest
 *   ?location.latitude=${lat}&location.longitude=${lng}&key=${GOOGLE_MAPS_API_KEY}
 */
export async function getRoofMeasurements(
  _address: string,
  _city: string,
  _state: string
): Promise<RoofMeasurements | null> {
  return null
}
