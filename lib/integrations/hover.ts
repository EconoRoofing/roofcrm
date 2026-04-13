// HOVER 3D Property Models API
// Docs: https://developers.hover.to
// Auth: OAuth 2.0 (client credentials)
// Env: HOVER_API_KEY (client ID), HOVER_API_SECRET (client secret), HOVER_API_URL

const API_URL = process.env.HOVER_API_URL || 'https://api.hover.to'

interface HoverToken {
  access_token: string
  expires_at: number
}

let cachedHoverToken: HoverToken | null = null

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HoverJob {
  jobId: string
  status: string
}

export interface HoverJobStatus {
  jobId: string
  status: 'created' | 'processing' | 'complete'
  modelUrl?: string
}

export interface HoverFacet {
  area: number
  pitch: number
  orientation: string
}

export interface HoverMeasurements {
  totalArea: number
  pitch: number
  facets: HoverFacet[]
  ridgeLength: number
  eaveLength: number
}

// ─── Fetch Helper ────────────────────────────────────────────────────────────

async function getHoverToken(): Promise<string> {
  if (cachedHoverToken && cachedHoverToken.expires_at > Date.now() + 300000) {
    return cachedHoverToken.access_token
  }
  const clientId = process.env.HOVER_API_KEY
  const clientSecret = process.env.HOVER_API_SECRET
  if (!clientId || !clientSecret) throw new Error('HOVER API not configured')

  const res = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) throw new Error(`HOVER auth failed: ${res.status}`)
  const data = await res.json()
  cachedHoverToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000),
  }
  return cachedHoverToken.access_token
}

async function hoverFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getHoverToken()

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HOVER API error ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── API Functions ───────────────────────────────────────────────────────────

/** Check if HOVER API credentials are configured */
export function isConfigured(): boolean {
  return !!(process.env.HOVER_API_KEY && process.env.HOVER_API_SECRET)
}

/** Create a HOVER job from an address */
export async function createJob(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<HoverJob> {
  const data = await hoverFetch('/v2/jobs', {
    method: 'POST',
    body: JSON.stringify({
      address: { street: address, city, state, zip },
    }),
  })
  return {
    jobId: data.id || data.jobId,
    status: data.status,
  }
}

/** Check the status of a HOVER job */
export async function getJobStatus(jobId: string): Promise<HoverJobStatus> {
  const data = await hoverFetch(`/v2/jobs/${encodeURIComponent(jobId)}`)
  return {
    jobId: data.id || data.jobId,
    status: data.status,
    modelUrl: data.modelUrl ?? undefined,
  }
}

/** Retrieve roof measurements from a completed HOVER job */
export async function getMeasurements(jobId: string): Promise<HoverMeasurements> {
  const data = await hoverFetch(`/v2/jobs/${encodeURIComponent(jobId)}/measurements`)
  return {
    totalArea: data.totalArea,
    pitch: data.pitch,
    facets: (data.facets ?? []).map((f: any) => ({
      area: f.area,
      pitch: f.pitch,
      orientation: f.orientation,
    })),
    ridgeLength: data.ridgeLength,
    eaveLength: data.eaveLength,
  }
}
