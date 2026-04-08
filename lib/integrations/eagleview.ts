// EagleView Measurement API
// Docs: https://developer.eagleview.com
// Auth: OAuth 2.0 (client credentials)
// Env: EAGLEVIEW_CLIENT_ID, EAGLEVIEW_CLIENT_SECRET, EAGLEVIEW_API_URL

const API_URL = process.env.EAGLEVIEW_API_URL || 'https://api.eagleview.com'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReportType = 'roof' | 'walls' | 'full'

export interface EagleViewOrder {
  orderId: string
  status: string
  estimatedDelivery: string
}

export interface EagleViewStatus {
  orderId: string
  status: 'ordered' | 'processing' | 'complete' | 'failed'
  reportUrl?: string
}

export interface RoofFacet {
  area: number
  pitch: number
  orientation: string
}

export interface EagleViewReport {
  totalSquares: number
  roofFacets: RoofFacet[]
  ridgeLength: number
  hipLength: number
  valleyLength: number
  eaveLength: number
  rakeLength: number
  perimeterLength: number
  wastePercent: number
}

// ─── Auth ────────────────────────────────────────────────────────────────────

interface AuthToken {
  access_token: string
  expires_at: number
}

let cachedToken: AuthToken | null = null

async function getToken(): Promise<string> {
  // Check cached token (with 5-min buffer before expiry)
  if (cachedToken && cachedToken.expires_at > Date.now() + 300000) {
    return cachedToken.access_token
  }

  const clientId = process.env.EAGLEVIEW_CLIENT_ID
  const clientSecret = process.env.EAGLEVIEW_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('EagleView API not configured')

  const res = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) throw new Error(`EagleView auth failed: ${res.status}`)
  const data = await res.json()
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.access_token
}

// ─── Fetch Helper ────────────────────────────────────────────────────────────

async function evFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken()
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
    throw new Error(`EagleView API error ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── API Functions ───────────────────────────────────────────────────────────

/** Check if EagleView API credentials are configured */
export function isConfigured(): boolean {
  return !!(process.env.EAGLEVIEW_CLIENT_ID && process.env.EAGLEVIEW_CLIENT_SECRET)
}

/** Place a measurement order for a property */
export async function orderMeasurement(
  address: string,
  city: string,
  state: string,
  zip: string,
  reportType: ReportType = 'roof'
): Promise<EagleViewOrder> {
  const data = await evFetch('/v2/orders', {
    method: 'POST',
    body: JSON.stringify({
      address: { street: address, city, state, zip },
      reportType,
      deliveryMethod: 'api',
    }),
  })
  return {
    orderId: data.orderId,
    status: data.status,
    estimatedDelivery: data.estimatedDelivery,
  }
}

/** Check the status of a measurement order */
export async function getMeasurementStatus(orderId: string): Promise<EagleViewStatus> {
  const data = await evFetch(`/v2/orders/${encodeURIComponent(orderId)}`)
  return {
    orderId: data.orderId,
    status: data.status,
    reportUrl: data.reportUrl ?? undefined,
  }
}

/** Retrieve the completed measurement report data */
export async function getMeasurementReport(orderId: string): Promise<EagleViewReport> {
  const data = await evFetch(`/v2/orders/${encodeURIComponent(orderId)}/report`)
  return {
    totalSquares: data.totalSquares,
    roofFacets: (data.roofFacets ?? []).map((f: any) => ({
      area: f.area,
      pitch: f.pitch,
      orientation: f.orientation,
    })),
    ridgeLength: data.ridgeLength,
    hipLength: data.hipLength,
    valleyLength: data.valleyLength,
    eaveLength: data.eaveLength,
    rakeLength: data.rakeLength,
    perimeterLength: data.perimeterLength,
    wastePercent: data.wastePercent,
  }
}
