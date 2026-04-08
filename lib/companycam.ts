/**
 * CompanyCam API v2 client.
 *
 * If COMPANYCAM_API_KEY is not set, all functions return empty/null gracefully.
 * Callers never need to check for API key presence themselves.
 */

const COMPANYCAM_BASE = 'https://api.companycam.com/v2'

export interface CompanyCamProject {
  id: string
  name: string
  address: {
    street_address_1: string
    city: string
    state: string
  }
}

export interface CompanyCamPhoto {
  id: string
  urls: {
    original: string
    thumbnail: string
  }
  created_at: string
  creator: {
    display_name: string
  }
}

/**
 * Normalize an address for fuzzy matching against CompanyCam projects.
 * Lowercases, strips punctuation, and standardizes common abbreviations.
 */
function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/[.,#]/g, '')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\s+/g, ' ')
    .trim()
}

function getApiKey(): string | null {
  return process.env.COMPANYCAM_API_KEY ?? null
}

async function companycamFetch<T>(path: string): Promise<T | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null

  const res = await fetch(`${COMPANYCAM_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 300 }, // 5-minute cache
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    console.error('CompanyCam API error', res.status, path)
    return null
  }

  return res.json() as Promise<T>
}

/**
 * Search CompanyCam projects by address.
 * Returns an empty array if the API key is not configured.
 */
export async function searchProjectsByAddress(address: string): Promise<CompanyCamProject[]> {
  const apiKey = getApiKey()
  if (!apiKey) return []

  const normalized = normalizeAddress(address)
  const params = new URLSearchParams({ search: normalized })

  const res = await fetch(`${COMPANYCAM_BASE}/projects?${params.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 300 }, // 5-minute cache
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    console.error('CompanyCam: searchProjectsByAddress failed', res.status)
    return []
  }

  const json = await res.json()
  // CompanyCam returns { projects: [...] } or a flat array depending on version
  return Array.isArray(json) ? json : (json.projects ?? [])
}

/**
 * Get photos for a CompanyCam project.
 * Returns an empty array if the API key is not configured or the request fails.
 */
export async function getProjectPhotos(
  projectId: string,
  limit = 20
): Promise<CompanyCamPhoto[]> {
  const apiKey = getApiKey()
  if (!apiKey) return []

  const params = new URLSearchParams({ limit: String(limit) })
  const res = await fetch(
    `${COMPANYCAM_BASE}/projects/${encodeURIComponent(projectId)}/photos?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 300 }, // 5-minute cache
      signal: AbortSignal.timeout(8000),
    }
  )

  if (!res.ok) {
    console.error('CompanyCam: getProjectPhotos failed', res.status, projectId)
    return []
  }

  const json = await res.json()
  return Array.isArray(json) ? json : (json.photos ?? [])
}

/**
 * Get a deep link URL to open a project in the CompanyCam mobile app.
 */
export function getProjectDeepLink(projectId: string): string {
  return `companycam://projects/${projectId}`
}
