// ABC Supply API integration
// Docs: https://apidocs.abcsupply.com
// Auth: OAuth 2.0 (client credentials or user token)
// Env vars: ABC_SUPPLY_CLIENT_ID, ABC_SUPPLY_CLIENT_SECRET, ABC_SUPPLY_API_URL

const API_URL = process.env.ABC_SUPPLY_API_URL || 'https://api.abcsupply.com'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ABCBranch {
  branchNumber: string
  name: string
  address: string
  city: string
  state: string
  phone: string
}

export interface ABCItem {
  itemNumber: string
  description: string
  uom: string
  category: string
  availability: string
}

export interface ABCItemPrice {
  itemNumber: string
  price: number
  uom: string
  description: string
}

export interface ABCOrder {
  branchNumber: string
  accountNumber: string
  purchaseOrder: string
  deliveryDate: string
  deliveryService: 'delivery' | 'willcall'
  items: Array<{ itemNumber: string; quantity: number; uom: string }>
  comments?: string
}

export interface ABCOrderConfirmation {
  confirmationNumber: string
  orderNumber: string
  status: string
}

export interface ABCOrderStatus {
  orderNumber: string
  status: string
  items: Array<{ itemNumber: string; quantity: number; uom: string }>
  deliveryDate: string
  trackingInfo: string | null
}

export interface ABCOrderHistoryEntry {
  orderNumber: string
  status: string
  date: string
  total: number
}

// ─── Auth ────────────────────────────────────────────────────────────────────

interface ABCAuthToken {
  access_token: string
  expires_at: number
}

let cachedToken: ABCAuthToken | null = null

async function getToken(): Promise<string> {
  // Check cached token (with 5-min buffer before expiry)
  if (cachedToken && cachedToken.expires_at > Date.now() + 300000) {
    return cachedToken.access_token
  }

  const clientId = process.env.ABC_SUPPLY_CLIENT_ID
  const clientSecret = process.env.ABC_SUPPLY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('ABC Supply API not configured')

  const res = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'item.read price.read order.write order.read branch.read',
    }),
  })

  if (!res.ok) throw new Error(`ABC Supply auth failed: ${res.status}`)
  const data = await res.json()
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.access_token
}

// ─── Fetch Helper ────────────────────────────────────────────────────────────

async function abcFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ABC Supply API error ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── API Functions ───────────────────────────────────────────────────────────

/** Search for nearby branches by zip code (50-mile radius) */
export async function searchBranches(zip: string): Promise<ABCBranch[]> {
  const data = await abcFetch(`/branches?zip=${encodeURIComponent(zip)}&radius=50`)
  return data as ABCBranch[]
}

/** Search items/products at a specific branch */
export async function searchItems(query: string, branchNumber: string): Promise<ABCItem[]> {
  const data = await abcFetch('/items/search', {
    method: 'POST',
    body: JSON.stringify({ query, branchNumber }),
  })
  return data as ABCItem[]
}

/** Get pricing for an item at a specific branch and account */
export async function getItemPrice(
  itemNumber: string,
  branchNumber: string,
  accountNumber: string
): Promise<ABCItemPrice> {
  const data = await abcFetch('/items/price', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ itemNumber }],
      branchNumber,
      accountNumber,
    }),
  })
  return data as ABCItemPrice
}

/** Place an order with ABC Supply */
export async function placeOrder(order: ABCOrder): Promise<ABCOrderConfirmation> {
  const data = await abcFetch('/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  })
  return data as ABCOrderConfirmation
}

/** Get status of a specific order */
export async function getOrderStatus(orderNumber: string): Promise<ABCOrderStatus> {
  const data = await abcFetch(`/orders/${encodeURIComponent(orderNumber)}`)
  return data as ABCOrderStatus
}

/** Get order history for an account within a date range */
export async function getOrderHistory(
  accountNumber: string,
  startDate?: string,
  endDate?: string
): Promise<ABCOrderHistoryEntry[]> {
  const params = new URLSearchParams({ accountNumber })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const data = await abcFetch(`/orders/history?${params.toString()}`)
  return data as ABCOrderHistoryEntry[]
}

/** Check if ABC Supply API credentials are configured */
export function isConfigured(): boolean {
  return !!(process.env.ABC_SUPPLY_CLIENT_ID && process.env.ABC_SUPPLY_CLIENT_SECRET)
}
