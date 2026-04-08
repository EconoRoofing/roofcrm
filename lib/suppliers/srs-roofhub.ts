// SRS Distribution / Roof Hub SIPS API
// Docs: https://apidocs.roofhub.pro
// Auth: API Key based
// Env vars: SRS_ROOFHUB_API_KEY, SRS_ROOFHUB_API_URL

const API_URL = process.env.SRS_ROOFHUB_API_URL || 'https://api.roofhub.pro/sips/v1'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SRSProduct {
  productId: string
  name: string
  description: string
  category: string
  uom: string
}

export interface SRSProductPrice {
  productId: string
  price: number
  uom: string
  availability: string
}

export interface SRSOrder {
  branchId: string
  accountNumber: string
  purchaseOrder: string
  items: Array<{ productId: string; quantity: number }>
  deliveryDate?: string
  comments?: string
}

export interface SRSOrderConfirmation {
  orderId: string
  confirmationNumber: string
  status: string
}

export interface SRSOrderStatus {
  orderId: string
  status: string
  items: Array<{ productId: string; quantity: number }>
  estimatedDelivery: string | null
}

export interface SRSBranch {
  branchId: string
  name: string
  address: string
  city: string
  state: string
  phone: string
}

// ─── Fetch Helper ────────────────────────────────────────────────────────────

async function srsFetch(path: string, options: RequestInit = {}): Promise<any> {
  const apiKey = process.env.SRS_ROOFHUB_API_KEY
  if (!apiKey) throw new Error('SRS Roof Hub API not configured')

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SRS Roof Hub API error ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── API Functions ───────────────────────────────────────────────────────────

/** Search products, optionally filtered by branch */
export async function searchProducts(
  query: string,
  branchId?: string
): Promise<SRSProduct[]> {
  const params = new URLSearchParams({ query })
  if (branchId) params.set('branchId', branchId)
  const data = await srsFetch(`/products/search?${params.toString()}`)
  return data as SRSProduct[]
}

/** Get pricing and availability for a product at a branch */
export async function getProductPrice(
  productId: string,
  branchId: string
): Promise<SRSProductPrice> {
  const data = await srsFetch(`/products/${encodeURIComponent(productId)}/price`, {
    method: 'POST',
    body: JSON.stringify({ branchId }),
  })
  return data as SRSProductPrice
}

/** Place an order with SRS Distribution */
export async function placeOrder(order: SRSOrder): Promise<SRSOrderConfirmation> {
  const data = await srsFetch('/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  })
  return data as SRSOrderConfirmation
}

/** Get status of a specific order */
export async function getOrderStatus(orderId: string): Promise<SRSOrderStatus> {
  const data = await srsFetch(`/orders/${encodeURIComponent(orderId)}`)
  return data as SRSOrderStatus
}

/** Get nearby branches by zip code */
export async function getBranches(zip: string): Promise<SRSBranch[]> {
  const data = await srsFetch(`/branches?zip=${encodeURIComponent(zip)}`)
  return data as SRSBranch[]
}

/** Check if SRS Roof Hub API key is configured */
export function isConfigured(): boolean {
  return !!process.env.SRS_ROOFHUB_API_KEY
}
