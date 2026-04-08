'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, requireManager } from '@/lib/auth-helpers'
import { logActivity } from '@/lib/actions/activity'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QBOStatus {
  connected: boolean
  companyName: string | null
  lastSync: string | null
}

// ─── Token Management (internal) ─────────────────────────────────────────────

/** Get a valid access token, refreshing if expired */
async function getValidToken(companyId: string): Promise<{
  accessToken: string
  realmId: string
}> {
  const supabase = await createClient()
  const { data: company, error } = await supabase
    .from('companies')
    .select('qbo_access_token, qbo_refresh_token, qbo_token_expiry, qbo_realm_id')
    .eq('id', companyId)
    .single()

  if (error || !company) throw new Error('Company not found')
  if (!company.qbo_access_token || !company.qbo_refresh_token || !company.qbo_realm_id) {
    throw new Error('QuickBooks is not connected')
  }

  const expiry = new Date(company.qbo_token_expiry).getTime()

  // Refresh if token expires within 5 minutes
  if (expiry < Date.now() + 300000) {
    const qbo = await import('@/lib/integrations/quickbooks')
    const tokens = await qbo.refreshToken(company.qbo_refresh_token)

    await supabase
      .from('companies')
      .update({
        qbo_access_token: tokens.access_token,
        qbo_refresh_token: tokens.refresh_token,
        qbo_token_expiry: new Date(tokens.expires_at).toISOString(),
      })
      .eq('id', companyId)

    return { accessToken: tokens.access_token, realmId: company.qbo_realm_id }
  }

  return { accessToken: company.qbo_access_token, realmId: company.qbo_realm_id }
}

// ─── Connection Status ───────────────────────────────────────────────────────

/** Returns QuickBooks connection status */
export async function getQuickBooksStatus(): Promise<QBOStatus> {
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('qbo_access_token, qbo_realm_id, qbo_company_name, qbo_last_sync')
    .eq('id', companyId)
    .single()

  if (!company || !company.qbo_access_token || !company.qbo_realm_id) {
    return { connected: false, companyName: null, lastSync: null }
  }

  return {
    connected: true,
    companyName: company.qbo_company_name ?? null,
    lastSync: company.qbo_last_sync ?? null,
  }
}

// ─── Connect / Disconnect ────────────────────────────────────────────────────

/** Returns the OAuth URL to redirect the user to for QuickBooks authorization */
export async function connectQuickBooks(): Promise<string> {
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const qbo = await import('@/lib/integrations/quickbooks')
  if (!qbo.isConfigured()) throw new Error('QuickBooks integration is not configured')

  // Use companyId as state param to verify on callback
  return qbo.getAuthUrl(companyId)
}

/** Handle OAuth callback — exchange code for tokens and store them */
export async function handleQuickBooksCallback(
  code: string,
  realmId: string,
  state: string
): Promise<void> {
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Verify state matches company
  if (state !== companyId) {
    throw new Error('Invalid OAuth state — possible CSRF attack')
  }

  const qbo = await import('@/lib/integrations/quickbooks')
  const tokens = await qbo.exchangeCode(code)

  // Fetch company info from QBO
  let companyName = ''
  try {
    const info = await qbo.getCompanyInfo(realmId, tokens.access_token)
    companyName = info.CompanyName
  } catch {
    // Non-fatal
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('companies')
    .update({
      qbo_access_token: tokens.access_token,
      qbo_refresh_token: tokens.refresh_token,
      qbo_token_expiry: new Date(tokens.expires_at).toISOString(),
      qbo_realm_id: realmId,
      qbo_company_name: companyName || null,
    })
    .eq('id', companyId)

  if (error) throw new Error(`Failed to store QuickBooks credentials: ${error.message}`)
}

/** Clears stored QuickBooks tokens */
export async function disconnectQuickBooks(): Promise<void> {
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const supabase = await createClient()
  const { error } = await supabase
    .from('companies')
    .update({
      qbo_access_token: null,
      qbo_refresh_token: null,
      qbo_token_expiry: null,
      qbo_realm_id: null,
      qbo_company_name: null,
      qbo_last_sync: null,
    })
    .eq('id', companyId)

  if (error) throw new Error(`Failed to disconnect QuickBooks: ${error.message}`)
}

// ─── Invoice Sync ────────────────────────────────────────────────────────────

/** Sync a single invoice to QuickBooks (creates customer if needed) */
export async function syncInvoiceToQBO(invoiceId: string): Promise<{ qboInvoiceId: string }> {
  const { companyId, userId, role } = await getUserWithCompany()
  requireManager(role)

  const { accessToken, realmId } = await getValidToken(companyId)
  const qbo = await import('@/lib/integrations/quickbooks')

  const supabase = await createClient()

  // Fetch invoice with job details
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('*, jobs!inner(customer_name, customer_email, customer_phone, address, city, state, zip, company_id)')
    .eq('id', invoiceId)
    .single()

  if (invError || !invoice) throw new Error('Invoice not found')

  const job = invoice.jobs as any
  if (job.company_id !== companyId) throw new Error('Access denied')

  // Create or find customer in QBO
  const customer = await qbo.createCustomer(
    realmId,
    accessToken,
    job.customer_name,
    job.customer_email ?? undefined,
    job.customer_phone ?? undefined,
    job.address ? { line1: job.address, city: job.city, state: job.state, zip: job.zip } : undefined
  )

  // Build line items
  const lineItems = [
    {
      description: `Invoice ${invoice.invoice_number} — ${invoice.type || 'Roofing Services'}`,
      amount: invoice.amount,
      quantity: 1,
    },
  ]

  // Create invoice in QBO
  const qboInvoice = await qbo.createInvoice(
    realmId,
    accessToken,
    customer.Id,
    lineItems,
    invoice.invoice_number,
    invoice.due_date || new Date().toISOString().split('T')[0]
  )

  // Store QBO invoice ID on local record
  await supabase
    .from('invoices')
    .update({
      qbo_invoice_id: qboInvoice.Id,
      qbo_synced_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)

  // Update company's last sync timestamp
  await supabase
    .from('companies')
    .update({ qbo_last_sync: new Date().toISOString() })
    .eq('id', companyId)

  await logActivity(
    invoice.job_id,
    userId,
    'Synced invoice to QuickBooks',
    null,
    `QBO Invoice #${qboInvoice.DocNumber}`
  )

  return { qboInvoiceId: qboInvoice.Id }
}

// ─── Payment Sync ────────────────────────────────────────────────────────────

/** Records a payment in QuickBooks */
export async function syncPaymentToQBO(
  invoiceId: string,
  paymentData: { amount: number; paymentDate: string; method: string }
): Promise<{ qboPaymentId: string }> {
  const { companyId, userId, role } = await getUserWithCompany()
  requireManager(role)

  const { accessToken, realmId } = await getValidToken(companyId)
  const qbo = await import('@/lib/integrations/quickbooks')

  const supabase = await createClient()
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, job_id, qbo_invoice_id, invoice_number, jobs!inner(company_id)')
    .eq('id', invoiceId)
    .single()

  if (error || !invoice) throw new Error('Invoice not found')
  if ((invoice.jobs as any).company_id !== companyId) throw new Error('Access denied')
  if (!invoice.qbo_invoice_id) throw new Error('Invoice has not been synced to QuickBooks yet')

  const result = await qbo.syncPayment(
    realmId,
    accessToken,
    invoice.qbo_invoice_id,
    paymentData.amount,
    paymentData.paymentDate,
    paymentData.method
  )

  await logActivity(
    invoice.job_id,
    userId,
    'Synced payment to QuickBooks',
    null,
    `$${paymentData.amount.toFixed(2)} — ${paymentData.method}`
  )

  return { qboPaymentId: result.paymentId }
}

// ─── Batch Sync ──────────────────────────────────────────────────────────────

/** Batch sync all unsent invoices to QuickBooks */
export async function syncAllPendingInvoices(): Promise<{
  synced: number
  failed: number
  errors: string[]
}> {
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Verify QBO is connected before starting batch
  await getValidToken(companyId)

  const supabase = await createClient()
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, jobs!inner(company_id)')
    .eq('jobs.company_id', companyId)
    .is('qbo_invoice_id', null)
    .neq('status', 'cancelled')
    .neq('status', 'draft')
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) throw new Error(`Failed to fetch pending invoices: ${error.message}`)
  if (!invoices || invoices.length === 0) {
    return { synced: 0, failed: 0, errors: [] }
  }

  let synced = 0
  let failed = 0
  const errors: string[] = []

  for (const inv of invoices) {
    try {
      await syncInvoiceToQBO(inv.id)
      synced++
    } catch (err: any) {
      failed++
      errors.push(`Invoice ${inv.id}: ${err.message}`)
    }
  }

  return { synced, failed, errors }
}
