// QuickBooks Online API
// Docs: https://developer.intuit.com/app/developer/qbo
// Auth: OAuth 2.0 (authorization code flow — user grants access)
// Env: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, QBO_REALM_ID
// Token storage: companies table (qbo_access_token, qbo_refresh_token, qbo_token_expiry)

const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

function getBaseUrl(realmId: string): string {
  return `https://quickbooks.api.intuit.com/v3/company/${realmId}`
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QBOTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

export interface QBOCustomer {
  Id: string
  DisplayName: string
  PrimaryEmailAddr?: { Address: string }
  PrimaryPhone?: { FreeFormNumber: string }
}

export interface QBOLineItem {
  description: string
  amount: number
  quantity?: number
}

export interface QBOInvoice {
  Id: string
  DocNumber: string
  TotalAmt: number
  Balance: number
  DueDate: string
  TxnDate: string
}

export interface QBOCompanyInfo {
  CompanyName: string
  LegalName: string
  Country: string
  FiscalYearStartMonth: string
}

// ─── Auth Helpers ────────────────────────────────────────────────────────────

/** Check if QuickBooks API credentials are configured */
export function isConfigured(): boolean {
  return !!(
    process.env.QBO_CLIENT_ID &&
    process.env.QBO_CLIENT_SECRET &&
    process.env.QBO_REDIRECT_URI
  )
}

/** Returns the OAuth authorization URL for the user to grant access */
export function getAuthUrl(state: string): string {
  const clientId = process.env.QBO_CLIENT_ID
  const redirectUri = process.env.QBO_REDIRECT_URI
  if (!clientId || !redirectUri) throw new Error('QuickBooks OAuth not configured')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri,
    state,
  })
  return `${QBO_AUTH_URL}?${params.toString()}`
}

/** Exchanges auth code for access + refresh tokens */
export async function exchangeCode(code: string): Promise<QBOTokens> {
  const clientId = process.env.QBO_CLIENT_ID
  const clientSecret = process.env.QBO_CLIENT_SECRET
  const redirectUri = process.env.QBO_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('QuickBooks OAuth not configured')
  }

  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) throw new Error(`QBO token exchange failed: ${res.status}`)
  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

/** Refreshes an expired access token */
export async function refreshToken(currentRefreshToken: string): Promise<QBOTokens> {
  const clientId = process.env.QBO_CLIENT_ID
  const clientSecret = process.env.QBO_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('QuickBooks OAuth not configured')

  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
    }),
  })

  if (!res.ok) throw new Error(`QBO token refresh failed: ${res.status}`)
  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

// ─── Fetch Helper ────────────────────────────────────────────────────────────

async function qboFetch(
  realmId: string,
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const res = await fetch(`${getBaseUrl(realmId)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`QBO API error ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── API Functions ───────────────────────────────────────────────────────────

/** Creates or finds a customer in QBO by display name */
export async function createCustomer(
  realmId: string,
  accessToken: string,
  name: string,
  email?: string,
  phone?: string,
  address?: { line1: string; city: string; state: string; zip: string }
): Promise<QBOCustomer> {
  // First, try to find existing customer by name
  const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`)
  const existing = await qboFetch(realmId, accessToken, `/query?query=${query}`)
  const found = existing?.QueryResponse?.Customer?.[0]
  if (found) return found as QBOCustomer

  // Create new customer
  const customerData: Record<string, any> = { DisplayName: name }
  if (email) customerData.PrimaryEmailAddr = { Address: email }
  if (phone) customerData.PrimaryPhone = { FreeFormNumber: phone }
  if (address) {
    customerData.BillAddr = {
      Line1: address.line1,
      City: address.city,
      CountrySubDivisionCode: address.state,
      PostalCode: address.zip,
    }
  }

  const data = await qboFetch(realmId, accessToken, '/customer', {
    method: 'POST',
    body: JSON.stringify(customerData),
  })
  return data.Customer as QBOCustomer
}

/** Creates an invoice in QBO */
export async function createInvoice(
  realmId: string,
  accessToken: string,
  customerId: string,
  lineItems: QBOLineItem[],
  invoiceNumber: string,
  dueDate: string
): Promise<QBOInvoice> {
  const lines = lineItems.map((item, idx) => ({
    LineNum: idx + 1,
    Amount: item.amount,
    DetailType: 'SalesItemLineDetail',
    Description: item.description,
    SalesItemLineDetail: {
      Qty: item.quantity ?? 1,
      UnitPrice: item.amount / (item.quantity ?? 1),
    },
  }))

  const data = await qboFetch(realmId, accessToken, '/invoice', {
    method: 'POST',
    body: JSON.stringify({
      CustomerRef: { value: customerId },
      Line: lines,
      DocNumber: invoiceNumber,
      DueDate: dueDate,
    }),
  })
  return data.Invoice as QBOInvoice
}

/** Records a payment against an invoice */
export async function syncPayment(
  realmId: string,
  accessToken: string,
  invoiceId: string,
  amount: number,
  paymentDate: string,
  method: string
): Promise<{ paymentId: string }> {
  const data = await qboFetch(realmId, accessToken, '/payment', {
    method: 'POST',
    body: JSON.stringify({
      TotalAmt: amount,
      TxnDate: paymentDate,
      PaymentMethodRef: { value: method },
      Line: [
        {
          Amount: amount,
          LinkedTxn: [{ TxnId: invoiceId, TxnType: 'Invoice' }],
        },
      ],
    }),
  })
  return { paymentId: data.Payment?.Id }
}

/** Returns connected QBO company info */
export async function getCompanyInfo(
  realmId: string,
  accessToken: string
): Promise<QBOCompanyInfo> {
  const data = await qboFetch(realmId, accessToken, '/companyinfo/' + realmId)
  const info = data.CompanyInfo
  return {
    CompanyName: info.CompanyName,
    LegalName: info.LegalName,
    Country: info.Country,
    FiscalYearStartMonth: info.FiscalYearStartMonth,
  }
}
