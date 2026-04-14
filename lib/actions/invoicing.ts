'use server'

import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { createPaymentLink } from '@/lib/stripe'
import { getUserWithCompany, verifyJobOwnership, escapeHtml, sanitizeEmailName, localDateString, requireEstimateEditor, requireManager } from '@/lib/auth-helpers'
import { logActivity } from '@/lib/actions/activity'
import {
  dollarsToCents,
  centsToDollars,
  readMoneyFromRow,
  multiplyCents,
  formatCents,
} from '@/lib/money'

/** Ensure a URL starts with https:// before embedding in HTML */
const safeUrl = (url: string) => url.startsWith('https://') ? url : '#'

interface Invoice {
  id: string
  job_id: string
  invoice_number: string
  type: string
  amount: number
  total_amount: number
  status: string
  due_date: string | null
  paid_date: string | null
  paid_amount: number
  payment_method: string | null
  notes: string | null
  created_at: string
}

export interface CreateInvoiceData {
  job_id: string
  type?: 'standard' | 'deposit' | 'supplement' | 'change_order'
  /** @deprecated pass amount_cents instead — will be converted if provided */
  amount?: number
  /** @deprecated pass total_amount_cents instead */
  total_amount?: number
  /** Integer cents — authoritative */
  amount_cents?: number
  /** Integer cents — authoritative */
  total_amount_cents?: number
  due_date: string
  notes?: string
}

// Valid invoice status transitions
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['viewed', 'paid', 'overdue', 'cancelled'],
  viewed: ['paid', 'overdue', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: [], // terminal
  cancelled: ['draft'], // allow re-draft
}

export async function createInvoice(data: CreateInvoiceData) {
  const supabase = await createClient()
  // Audit R2-#12: sales + managers may create invoices. Crew is blocked.
  const { companyId, role } = await getUserWithCompany()
  requireEstimateEditor(role)

  // Normalize to cents. Callers may still pass legacy `amount` dollars during
  // the migration; we convert to cents once and do all validation in integer.
  const amountCents =
    data.amount_cents != null ? data.amount_cents : dollarsToCents(data.amount ?? 0)
  const totalAmountCentsInput =
    data.total_amount_cents != null ? data.total_amount_cents : dollarsToCents(data.total_amount ?? 0)

  if (amountCents <= 0) throw new Error('Invoice amount must be greater than zero')

  // Validate due_date (compare against local-today, not UTC-today)
  const dueDate = new Date(data.due_date + 'T00:00:00')
  if (isNaN(dueDate.getTime())) {
    throw new Error('Invalid due date format')
  }
  // Audit R2-#27: previously this was a console.warn that the user never
  // saw — invoices were happily created with already-past due dates, then
  // immediately sent down the overdue-reminders pipeline. Throw instead so
  // the form has to be corrected before the row hits the DB. Past-dated
  // invoices are almost always a mistake (typo, wrong year, copy-paste).
  if (data.due_date < localDateString()) {
    throw new Error('Due date cannot be in the past')
  }

  // Enforce max 20 invoices per job
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', data.job_id)

  if (count !== null && count >= 20) {
    throw new Error('Maximum of 20 invoices per job reached')
  }

  // Verify job belongs to user's company
  const job = await verifyJobOwnership(data.job_id, companyId)

  // Generate collision-safe invoice number using job number + timestamp
  const jobNum = job.job_number || 'JOB'
  const invoiceNumber = `INV-${jobNum}-${crypto.randomUUID().slice(0, 8)}`

  // Total defaults to: caller's total → job's total → this invoice's amount.
  // All three coerce to integer cents before comparison/store.
  const jobTotalCents = readMoneyFromRow(
    (job as { total_amount_cents?: number | null }).total_amount_cents,
    job.total_amount
  )
  const totalAmountCents = totalAmountCentsInput || jobTotalCents || amountCents

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      company_id: job.company_id,
      job_id: data.job_id,
      invoice_number: invoiceNumber,
      type: data.type || 'standard',
      amount: centsToDollars(amountCents),              // legacy dual-write
      total_amount: centsToDollars(totalAmountCents),   // legacy dual-write
      amount_cents: amountCents,
      total_amount_cents: totalAmountCents,
      due_date: data.due_date,
      status: 'draft',
      notes: data.notes,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create invoice: ${error.message}`)

  // Fire invoice_created automation — best-effort
  if (invoice) {
    try {
      const { processAutomationRules } = await import('./automations-internal')
      await processAutomationRules('invoice_created', data.job_id)
    } catch {}

    // Audit log
    try {
      await logActivity(data.job_id, null, 'invoice_created', null, invoice.invoice_number)
    } catch {}
  }

  // Generate Stripe payment link if configured. createPaymentLink expects
  // dollars — convert from cents at this boundary.
  if (invoice) {
    const paymentLink = await createPaymentLink(
      invoice.id,
      centsToDollars(amountCents),
      job.job_number,
      invoiceNumber
    )
    if (paymentLink) {
      await supabase
        .from('invoices')
        .update({ payment_link: paymentLink })
        .eq('id', invoice.id)
      return { ...invoice, payment_link: paymentLink }
    }
  }

  return invoice
}

export async function createInvoiceFromEstimate(jobId: string) {
  const { companyId } = await getUserWithCompany()

  const job = await verifyJobOwnership(jobId, companyId)

  const amountCents = readMoneyFromRow(
    (job as { total_amount_cents?: number | null }).total_amount_cents,
    job.total_amount
  )
  if (amountCents <= 0) {
    throw new Error('Job has no estimate amount to convert')
  }

  // Default due date: 30 days from now (local tz, not UTC)
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 30)

  return createInvoice({
    job_id: jobId,
    type: 'standard',
    amount_cents: amountCents,
    total_amount_cents: amountCents,
    due_date: localDateString(dueDate),
    notes: 'Created from estimate',
  })
}

export async function getJobInvoices(job_id: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Verify the job belongs to user's company
  await verifyJobOwnership(job_id, companyId)

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('job_id', job_id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch invoices: ${error.message}`)
  if (!invoices || invoices.length === 0) return []

  // Re-sign PDF URLs on the fly — stored signed URLs expire after 24h (R2-#8)
  const { resignEstimatesPdf } = await import('@/lib/storage-urls')
  return Promise.all(
    invoices.map(async (inv) => ({
      ...inv,
      pdf_url: inv.pdf_url ? await resignEstimatesPdf(supabase, inv.pdf_url) : null,
    }))
  )
}

export async function markInvoicePaid(
  invoice_id: string,
  paid_amount: number,
  payment_method?: string
) {
  const supabase = await createClient()
  // Manager only — marking invoices paid is a financial action.
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Normalize caller-supplied dollars → cents at the boundary
  const paidCents = dollarsToCents(paid_amount)
  if (paidCents <= 0) throw new Error('Payment amount must be greater than zero')

  // Fetch invoice with job join to verify company ownership
  const { data: existing } = await supabase
    .from('invoices')
    .select('status, jobs!inner(company_id)')
    .eq('id', invoice_id)
    .single()

  if (!existing) throw new Error('Invoice not found')
  if ((existing as any).jobs.company_id !== companyId) throw new Error('Access denied')
  if (existing.status === 'paid') throw new Error('Invoice is already marked as paid')
  if (existing.status === 'cancelled') throw new Error('Cannot mark a cancelled invoice as paid. Re-draft it first.')

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_date: localDateString(),
      paid_amount: centsToDollars(paidCents),  // legacy dual-write
      paid_amount_cents: paidCents,
      payment_method: payment_method,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice_id)
    .select('*, jobs!inner(id)')
    .single()

  if (error) throw new Error(`Failed to mark invoice as paid: ${error.message}`)

  // Audit log
  if (invoice) {
    try {
      await logActivity((invoice as any).jobs.id, null, 'invoice_marked_paid', existing.status, 'paid')
    } catch {}
  }

  return invoice
}

export async function updateInvoiceStatus(
  invoice_id: string,
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'
) {
  const supabase = await createClient()
  // Sales + managers can advance invoice status (e.g. draft → sent); crew cannot.
  const { companyId, role } = await getUserWithCompany()
  requireEstimateEditor(role)

  // Fetch invoice with job join to verify company ownership and current status
  const { data: existing } = await supabase
    .from('invoices')
    .select('status, jobs!inner(company_id)')
    .eq('id', invoice_id)
    .single()

  if (!existing) throw new Error('Invoice not found')
  if ((existing as any).jobs.company_id !== companyId) throw new Error('Access denied')

  // Validate status transition
  const allowed = VALID_STATUS_TRANSITIONS[existing.status]
  if (!allowed || !allowed.includes(status)) {
    throw new Error(`Cannot transition invoice from '${existing.status}' to '${status}'`)
  }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update({
      status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice_id)
    .select('*, jobs!inner(id)')
    .single()

  if (error) throw new Error(`Failed to update invoice status: ${error.message}`)

  // Audit log
  if (invoice) {
    try {
      await logActivity((invoice as any).jobs.id, null, 'invoice_status_changed', existing.status, status)
    } catch {}
  }

  return invoice
}

export async function deleteInvoice(invoice_id: string) {
  const supabase = await createClient()
  // Manager only — deleting invoices removes financial records.
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Fetch invoice with job join to verify company ownership and status
  const { data: existing } = await supabase
    .from('invoices')
    .select('status, jobs!inner(company_id)')
    .eq('id', invoice_id)
    .single()

  if (!existing) throw new Error('Invoice not found')
  if ((existing as any).jobs.company_id !== companyId) throw new Error('Access denied')
  if (existing.status !== 'draft') {
    throw new Error('Only draft invoices can be deleted. Cancel paid/sent invoices instead.')
  }

  // Fetch job_id before deleting for audit log
  const { data: invoiceRow } = await supabase
    .from('invoices')
    .select('invoice_number, job_id')
    .eq('id', invoice_id)
    .single()

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoice_id)

  if (error) throw new Error(`Failed to delete invoice: ${error.message}`)

  // Audit log
  if (invoiceRow) {
    try {
      await logActivity(invoiceRow.job_id, null, 'invoice_deleted', invoiceRow.invoice_number, null)
    } catch {}
  }
}

export async function getInvoiceByNumber(invoice_number: string, _company_id?: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Always use authenticated user's company (param ignored for security)
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_number', invoice_number)
    .eq('company_id', companyId)
    .single()

  if (error) throw new Error(`Invoice not found: ${error.message}`)
  return invoice
}

// ─── Line Items ──────────────────────────────────────────────────────────────

export async function addLineItem(
  invoiceId: string,
  description: string,
  quantity: number,
  unitPrice: number
) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireEstimateEditor(role)

  if (!description.trim()) throw new Error('Description is required')
  if (quantity <= 0) throw new Error('Quantity must be greater than zero')
  if (unitPrice < 0) throw new Error('Unit price cannot be negative')

  // Verify the invoice belongs to user's company
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, jobs!inner(company_id)')
    .eq('id', invoiceId)
    .single()

  if (!invoice) throw new Error('Invoice not found')
  if ((invoice as any).jobs.company_id !== companyId) throw new Error('Access denied')

  // Store unit price in integer cents. `total_cents` used to be a Postgres
  // GENERATED column; now computed here so we can do it in integer math.
  const unitPriceCents = dollarsToCents(unitPrice)
  const totalCents = multiplyCents(unitPriceCents, quantity)

  const { data, error } = await supabase
    .from('invoice_line_items')
    .insert({
      invoice_id: invoiceId,
      description: description.trim(),
      quantity,
      unit_price: centsToDollars(unitPriceCents),     // legacy dual-write
      unit_price_cents: unitPriceCents,
      total_cents: totalCents,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to add line item: ${error.message}`)
  return data
}

export async function getInvoiceLineItems(invoiceId: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Verify the invoice belongs to user's company
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, jobs!inner(company_id)')
    .eq('id', invoiceId)
    .single()

  if (!invoice) throw new Error('Invoice not found')
  if ((invoice as any).jobs.company_id !== companyId) throw new Error('Access denied')

  const { data, error } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch line items: ${error.message}`)
  return data || []
}

export async function removeLineItem(lineItemId: string) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireEstimateEditor(role)

  // Look up the line item's invoice to verify company ownership
  const { data: lineItem } = await supabase
    .from('invoice_line_items')
    .select('invoice_id, invoices!inner(jobs!inner(company_id))')
    .eq('id', lineItemId)
    .single()

  if (!lineItem) throw new Error('Line item not found')
  if ((lineItem as any).invoices.jobs.company_id !== companyId) throw new Error('Access denied')

  const { error } = await supabase
    .from('invoice_line_items')
    .delete()
    .eq('id', lineItemId)

  if (error) throw new Error(`Failed to remove line item: ${error.message}`)
}

export async function updateLineItem(
  lineItemId: string,
  description: string,
  quantity: number,
  unitPrice: number
) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireEstimateEditor(role)

  if (!description.trim()) throw new Error('Description is required')
  if (quantity <= 0) throw new Error('Quantity must be greater than zero')
  if (unitPrice < 0) throw new Error('Unit price cannot be negative')

  // Verify the line item belongs to user's company via invoice -> job
  const { data: lineItem } = await supabase
    .from('invoice_line_items')
    .select('invoice_id, invoices!inner(jobs!inner(company_id))')
    .eq('id', lineItemId)
    .single()

  if (!lineItem) throw new Error('Line item not found')
  if ((lineItem as any).invoices.jobs.company_id !== companyId) throw new Error('Access denied')

  const unitPriceCents = dollarsToCents(unitPrice)
  const totalCents = multiplyCents(unitPriceCents, quantity)

  const { data, error } = await supabase
    .from('invoice_line_items')
    .update({
      description: description.trim(),
      quantity,
      unit_price: centsToDollars(unitPriceCents),  // legacy dual-write
      unit_price_cents: unitPriceCents,
      total_cents: totalCents,
    })
    .eq('id', lineItemId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update line item: ${error.message}`)
  return data
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

export async function generateInvoicePDF(invoiceId: string): Promise<string> {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  // Audit R3-#1: was an HTTP self-fetch to /api/jobs/[id]/invoice-pdf with a
  // Bearer header. The route handler authenticates via session cookies which
  // are not forwarded on server-side fetch, so the call always returned 401
  // and `sendInvoiceWithPDF` quietly emailed customers without the attachment.
  // Now we render in-process via the shared helper. Same auth gate the route
  // applies, just inlined here.
  requireManager(role)

  // Resolve the job for the invoice and verify it belongs to this company
  // BEFORE handing off to the renderer (the helper trusts its caller's authz).
  const { data: invoice } = await supabase
    .from('invoices')
    .select('job_id, jobs!inner(company_id)')
    .eq('id', invoiceId)
    .single()

  if (!invoice) throw new Error('Invoice not found')
  if ((invoice as any).jobs.company_id !== companyId) throw new Error('Access denied')

  const { renderAndStoreInvoicePDF } = await import('@/lib/pdf/render-invoice')
  const { url } = await renderAndStoreInvoicePDF(supabase, {
    invoiceId,
    jobId: invoice.job_id as string,
    companyId,
  })
  return url
}

export async function sendInvoiceWithPDF(invoiceId: string): Promise<{ sent: boolean; pdfIncluded: boolean }> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Get or generate PDF URL
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, jobs(customer_name, email, job_number, company_id, companies(name))')
    .eq('id', invoiceId)
    .single()

  if (!invoice) throw new Error('Invoice not found')

  const job = (invoice as any).jobs
  if (job.company_id !== companyId) throw new Error('Access denied')
  if (!job?.email) throw new Error('Customer has no email address on file')

  let pdfUrl = invoice.pdf_url as string | null
  let pdfIncluded = true
  if (!pdfUrl) {
    try {
      pdfUrl = await generateInvoicePDF(invoiceId)
    } catch (err) {
      console.warn('[invoicing] PDF generation failed, sending without attachment:', err)
      pdfIncluded = false
    }
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) throw new Error('Email service not configured')

  const resend = new Resend(resendKey)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const companyName = sanitizeEmailName(job.companies?.name || 'Your Roofing Company')

  // Escape user-controlled values for safe HTML insertion
  const safeCustomerName = escapeHtml(job.customer_name || '')
  const safeCompanyName = escapeHtml(companyName)
  const safeInvoiceNumber = escapeHtml(invoice.invoice_number || '')
  const safeJobNumber = escapeHtml(job.job_number || '')

  // Prefer cents, fall back to legacy dollar column
  const invoiceTotalCents = readMoneyFromRow(
    (invoice as { total_amount_cents?: number | null }).total_amount_cents,
    invoice.total_amount
  )
  const invoiceTotalDisplay = formatCents(invoiceTotalCents)

  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Upon receipt'

  const paymentSection = invoice.payment_link
    ? `<p style="margin-top:20px;"><a href="${safeUrl(invoice.payment_link)}" style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Pay Now — ${invoiceTotalDisplay}</a></p>`
    : ''

  const pdfSection = pdfUrl
    ? `<p style="margin-top:12px;font-size:13px;color:#555;">View your invoice PDF: <a href="${safeUrl(pdfUrl)}" style="color:#0066cc;">Download Invoice</a></p>`
    : ''

  await resend.emails.send({
    from: `${companyName} <${fromEmail}>`,
    to: job.email,
    subject: `Invoice ${safeInvoiceNumber} from ${companyName} — ${invoiceTotalDisplay} due ${dueDate}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;">
        <div style="background:#1a1a1a;padding:24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:22px;">${safeCompanyName}</h2>
          <p style="color:#aaa;margin:4px 0 0;font-size:13px;">Invoice</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
          <p style="font-size:15px;">Hello ${safeCustomerName},</p>
          <p>Please find your invoice details below. Payment is due <strong>${dueDate}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:10px 0;color:#666;">Invoice #</td>
              <td style="padding:10px 0;font-weight:600;text-align:right;">${safeInvoiceNumber}</td>
            </tr>
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:10px 0;color:#666;">Job #</td>
              <td style="padding:10px 0;text-align:right;">${safeJobNumber}</td>
            </tr>
            <tr style="border-bottom:2px solid #1a1a1a;">
              <td style="padding:10px 0;font-weight:700;">Amount Due</td>
              <td style="padding:10px 0;font-weight:700;font-size:20px;text-align:right;">${invoiceTotalDisplay}</td>
            </tr>
          </table>
          ${paymentSection}
          ${pdfSection}
          ${invoice.notes ? `<p style="margin-top:20px;padding:12px;background:#f5f5f5;border-left:3px solid #ccc;font-size:13px;color:#555;">${escapeHtml(String(invoice.notes))}</p>` : ''}
          <p style="margin-top:28px;font-size:12px;color:#999;">Questions? Contact ${safeCompanyName} directly.</p>
        </div>
      </div>
    `,
  })

  // Only advance status to 'sent' if currently draft — don't regress paid/overdue
  if (invoice.status === 'draft') {
    await supabase
      .from('invoices')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', invoiceId)
  }

  return { sent: true, pdfIncluded }
}

// ─── Multi-Stage Invoice Escalation ──────────────────────────────────────────

/**
 * Escalation tiers based on days overdue.
 * Each tier has a minimum days threshold, subject template, and styling.
 */
interface EscalationTier {
  tier: 1 | 2 | 3 | 4
  minDays: number
  headerBg: string
  headerSubColor: string
  buttonBg: string
  buildSubject: (invoiceNum: string, days: number, amount: string) => string
  buildBody: (customerName: string, invoiceNum: string, amount: string, dueDate: string, days: number, companyName: string) => string
}

const ESCALATION_TIERS: EscalationTier[] = [
  {
    tier: 4,
    minDays: 30,
    headerBg: '#1a1a1a',
    headerSubColor: '#666',
    buttonBg: '#1a1a1a',
    buildSubject: (inv, _d, amt) =>
      `FINAL NOTICE: Invoice ${inv} — ${amt} past due`,
    buildBody: (name, inv, amt, due, days, _co) =>
      `<p>Dear ${name},</p>` +
      `<p>This is a <strong>final notice</strong> regarding invoice <strong>${inv}</strong> for <strong>${amt}</strong>, which was due on ${due} and is now <strong>${days} days past due</strong>.</p>` +
      `<p>Despite previous reminders, this balance remains outstanding. If payment is not received promptly, further action may be required to resolve this matter.</p>` +
      `<p style="font-size:13px;color:#555;">Please remit payment immediately. If you believe this is an error or have already sent payment, contact us right away.</p>`,
  },
  {
    tier: 3,
    minDays: 14,
    headerBg: '#cc0000',
    headerSubColor: '#ffcccc',
    buttonBg: '#cc0000',
    buildSubject: (inv, days, amt) =>
      `URGENT: Invoice ${inv} is ${days} days past due — ${amt}`,
    buildBody: (name, inv, amt, due, days, _co) =>
      `<p>Dear ${name},</p>` +
      `<p>This is an <strong>urgent notice</strong> that invoice <strong>${inv}</strong> for <strong>${amt}</strong> was due on ${due} and is now <strong>${days} days past due</strong>.</p>` +
      `<p>Continued non-payment may result in service suspension or additional late fees. Please arrange payment at your earliest convenience to avoid any disruption.</p>` +
      `<p style="font-size:13px;color:#555;">If you have already sent payment, please disregard this message and contact us so we can update our records.</p>`,
  },
  {
    tier: 2,
    minDays: 7,
    headerBg: '#d97706',
    headerSubColor: '#fef3c7',
    buttonBg: '#d97706',
    buildSubject: (inv, days, _amt) =>
      `Reminder: Invoice ${inv} is ${days} days overdue`,
    buildBody: (name, inv, amt, due, days, _co) =>
      `<p>Hello ${name},</p>` +
      `<p>This is a reminder that invoice <strong>${inv}</strong> for <strong>${amt}</strong> was due on ${due} and is now <strong>${days} days past due</strong>.</p>` +
      `<p>We would appreciate prompt payment to keep your account in good standing.</p>` +
      `<p style="font-size:13px;color:#555;">If you have already sent payment, please disregard this message. Contact us if you have any questions.</p>`,
  },
  {
    tier: 1,
    minDays: 3,
    headerBg: '#2563eb',
    headerSubColor: '#bfdbfe',
    buttonBg: '#2563eb',
    buildSubject: (inv, _d, _a) =>
      `Friendly Reminder: Invoice ${inv} is past due`,
    buildBody: (name, inv, amt, due, _days, _co) =>
      `<p>Hi ${name},</p>` +
      `<p>Just a quick reminder that invoice <strong>${inv}</strong> for <strong>${amt}</strong> was due on ${due}. We wanted to check in and make sure everything is on track.</p>` +
      `<p>No action is needed if you&rsquo;ve already sent payment. Otherwise, we&rsquo;d appreciate it if you could arrange payment at your convenience.</p>` +
      `<p style="font-size:13px;color:#555;">Feel free to reach out if you have any questions or need to discuss payment options.</p>`,
  },
]

/** Determine which escalation tier applies based on days overdue */
function getEscalationTier(daysPastDue: number): EscalationTier | null {
  // ESCALATION_TIERS is sorted highest-first, so first match wins
  for (const tier of ESCALATION_TIERS) {
    if (daysPastDue >= tier.minDays) return tier
  }
  return null
}

/** Map tier number to a label for determining if we should skip re-sending */
function inferLastTierFromDays(daysPastDue: number, lastReminderAt: string | null): number {
  if (!lastReminderAt) return 0
  // Use days overdue at the time of last reminder to infer which tier was sent
  const lastSentDate = new Date(lastReminderAt)
  const dueDate = new Date(Date.now() - daysPastDue * 24 * 60 * 60 * 1000)
  const daysAtLastReminder = Math.floor(
    (lastSentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const tier = getEscalationTier(daysAtLastReminder)
  return tier?.tier ?? 0
}

/**
 * Process overdue invoice reminders with 4-tier escalation.
 * Called from cron API route only (the API route handles auth via CRON_SECRET).
 *
 * Tier 1 (3+ days):  Friendly reminder  — blue header
 * Tier 2 (7+ days):  Standard reminder  — amber header
 * Tier 3 (14+ days): Urgent notice      — red header
 * Tier 4 (30+ days): Final notice       — dark/black header
 *
 * Won't re-send the same tier within 3 days.
 */
export async function processInvoiceReminders(): Promise<{ sent: number }> {
  const supabase = await createClient()

  const today = localDateString()
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  // Find overdue invoices: past due, not paid, no reminder in last 3 days
  const { data: overdueInvoices, error } = await supabase
    .from('invoices')
    .select('*, jobs(customer_name, email, job_number, companies(name))')
    .in('status', ['sent', 'viewed', 'overdue'])
    .lt('due_date', today)
    .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${threeDaysAgo}`)

  if (error) {
    console.error('[invoicing] processInvoiceReminders query failed:', error)
    return { sent: 0 }
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || !overdueInvoices?.length) return { sent: 0 }

  const resend = new Resend(resendKey)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  let sent = 0

  for (const invoice of overdueInvoices) {
    const job = (invoice as any).jobs
    if (!job?.email) continue

    const daysPastDue = Math.floor(
      (Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)
    )

    // Determine which tier to send
    const tier = getEscalationTier(daysPastDue)
    if (!tier) continue // Less than 3 days overdue — skip

    // Don't re-send the same tier within 3 days
    const lastTier = inferLastTierFromDays(daysPastDue, invoice.last_reminder_sent_at)
    if (lastTier >= tier.tier && invoice.last_reminder_sent_at) {
      // Same or higher tier was already sent, and cooldown hasn't passed
      // (the query already filters for 3-day cooldown, but double-check tier escalation)
      continue
    }

    const companyName = sanitizeEmailName(job.companies?.name || 'Your Roofing Company')
    const safeCustomerName = escapeHtml(job.customer_name || '')
    const safeCompanyName = escapeHtml(companyName)
    const safeInvoiceNumber = escapeHtml(invoice.invoice_number || '')

    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'a past date'

    const invoiceCents = readMoneyFromRow(
      (invoice as { total_amount_cents?: number | null }).total_amount_cents,
      invoice.total_amount
    )
    const amount = formatCents(invoiceCents)

    const subject = tier.buildSubject(safeInvoiceNumber, daysPastDue, amount)
    const bodyContent = tier.buildBody(safeCustomerName, safeInvoiceNumber, amount, dueDate, daysPastDue, safeCompanyName)

    const paymentSection = invoice.payment_link
      ? `<p style="margin-top:20px;"><a href="${safeUrl(invoice.payment_link)}" style="display:inline-block;padding:12px 28px;background:${tier.buttonBg};color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Pay Now &mdash; ${amount}</a></p>`
      : ''

    const tierLabel = tier.tier === 1 ? 'Friendly Reminder'
      : tier.tier === 2 ? 'Payment Reminder'
      : tier.tier === 3 ? 'Urgent Notice'
      : 'Final Notice'

    try {
      await resend.emails.send({
        from: `${companyName} <${fromEmail}>`,
        to: job.email,
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:${tier.headerBg};padding:20px;border-radius:8px 8px 0 0;">
              <h2 style="color:#fff;margin:0;">${escapeHtml(tierLabel)}</h2>
              <p style="color:${tier.headerSubColor};margin:4px 0 0;font-size:13px;">${safeCompanyName}</p>
            </div>
            <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
              ${bodyContent}
              ${paymentSection}
              <p style="margin-top:20px;font-size:12px;color:#999;">&mdash; ${safeCompanyName}</p>
            </div>
          </div>
        `,
      })

      // Mark overdue and update last reminder timestamp
      await supabase
        .from('invoices')
        .update({
          status: 'overdue',
          last_reminder_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id)

      sent++
    } catch (err) {
      console.error(`[invoicing] tier ${tier.tier} reminder failed for invoice`, invoice.id, err)
    }
  }

  return { sent }
}

// generatePortalToken lives in lib/actions/portal.ts — removed duplicate

export async function sendInvoiceEmail(invoice_id: string) {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('*, jobs(customer_name, email, job_number, company_id, companies(name))')
    .eq('id', invoice_id)
    .single()

  if (invError || !invoice) throw new Error('Invoice not found')

  const job = (invoice as any).jobs
  if (job.company_id !== companyId) throw new Error('Access denied')
  if (!job?.email) throw new Error('Customer has no email address on file')

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) throw new Error('Email service not configured — RESEND_API_KEY is missing')

  const resend = new Resend(resendKey)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const companyName = sanitizeEmailName(job.companies?.name || 'Your Roofing Company')

  // Escape user-controlled values for safe HTML insertion
  const safeCustomerName = escapeHtml(job.customer_name || '')
  const safeCompanyName = escapeHtml(companyName)
  const safeInvoiceNumber = escapeHtml(invoice.invoice_number || '')
  const safeJobNumber = escapeHtml(job.job_number || '')

  const invoiceCents = readMoneyFromRow(
    (invoice as { total_amount_cents?: number | null }).total_amount_cents,
    invoice.total_amount
  )
  const invoiceTotalDisplay = formatCents(invoiceCents)

  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'On receipt'

  await resend.emails.send({
    from: `${companyName} <${fromEmail}>`,
    to: job.email,
    subject: `Invoice ${safeInvoiceNumber} from ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Invoice from ${safeCompanyName}</h2>
        <p>Hello ${safeCustomerName},</p>
        <p>Please find your invoice details below:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Invoice #</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${safeInvoiceNumber}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Job #</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeJobNumber}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Type</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-transform: capitalize;">${escapeHtml(invoice.type || '')}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Amount Due</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; font-size: 18px;">${invoiceTotalDisplay}</td></tr>
          <tr><td style="padding: 8px; color: #666;">Due Date</td><td style="padding: 8px;">${dueDate}</td></tr>
        </table>
        ${invoice.notes ? `<p style="color: #666; font-size: 14px;">Notes: ${escapeHtml(String(invoice.notes))}</p>` : ''}
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          Please contact us if you have any questions about this invoice.
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 32px;">&mdash; ${safeCompanyName}</p>
      </div>
    `,
  })

  // Only advance to 'sent' if currently draft — don't regress paid/overdue
  if (invoice.status === 'draft') {
    await supabase
      .from('invoices')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', invoice_id)
  }

  return true
}
