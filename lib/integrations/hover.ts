// HOVER 3D Property Models API
// Docs: https://developers.hover.to
// Auth: API key
// Env: HOVER_API_KEY, HOVER_API_URL

const API_URL = process.env.HOVER_API_URL || 'https://api.hover.to'

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

async function hoverFetch(path: string, options: RequestInit = {}): Promise<any> {
  const apiKey = process.env.HOVER_API_KEY
  if (!apiKey) throw new Error('HOVER API not configured')

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'X-API-Key': apiKey,
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
  return !!process.env.HOVER_API_KEY
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
