'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { Resend } from 'resend'
import { createPaymentLink } from '@/lib/stripe'

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
  amount: number
  total_amount: number
  due_date: string
  notes?: string
}

export async function createInvoice(data: CreateInvoiceData) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  if (data.amount <= 0) throw new Error('Invoice amount must be greater than zero')

  // Enforce max 20 invoices per job
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', data.job_id)

  if (count !== null && count >= 20) {
    throw new Error('Maximum of 20 invoices per job reached')
  }

  // Fetch job to get company_id and job_number in one query
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, company_id, total_amount, job_number')
    .eq('id', data.job_id)
    .single()

  if (jobError || !job) throw new Error('Job not found')

  // Generate collision-safe invoice number using job number + timestamp
  const jobNum = job.job_number || 'JOB'
  const invoiceNumber = `INV-${jobNum}-${Date.now()}`

  // Use job's total_amount if not specified
  const totalAmount = data.total_amount || job.total_amount || data.amount

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      company_id: job.company_id,
      job_id: data.job_id,
      invoice_number: invoiceNumber,
      type: data.type || 'standard',
      amount: data.amount,
      total_amount: totalAmount,
      due_date: data.due_date,
      status: 'draft',
      notes: data.notes,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create invoice: ${error.message}`)

  // Generate Stripe payment link if configured
  if (invoice) {
    const paymentLink = await createPaymentLink(
      invoice.id,
      totalAmount,
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

export async function getJobInvoices(job_id: string) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('job_id', job_id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch invoices: ${error.message}`)
  return invoices || []
}

export async function markInvoicePaid(
  invoice_id: string,
  paid_amount: number,
  payment_method?: string
) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  if (paid_amount <= 0) throw new Error('Payment amount must be greater than zero')

  // Check if already paid
  const { data: existing } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoice_id)
    .single()
  if (existing?.status === 'paid') throw new Error('Invoice is already marked as paid')

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_date: new Date().toISOString().split('T')[0],
      paid_amount: paid_amount,
      payment_method: payment_method,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice_id)
    .select()
    .single()

  if (error) throw new Error(`Failed to mark invoice as paid: ${error.message}`)
  return invoice
}

export async function updateInvoiceStatus(
  invoice_id: string,
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'
) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update({
      status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice_id)
    .select()
    .single()

  if (error) throw new Error(`Failed to update invoice status: ${error.message}`)
  return invoice
}

export async function deleteInvoice(invoice_id: string) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoice_id)

  if (error) throw new Error(`Failed to delete invoice: ${error.message}`)
}

export async function getInvoiceByNumber(invoice_number: string, company_id: string) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_number', invoice_number)
    .eq('company_id', company_id)
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
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  if (!description.trim()) throw new Error('Description is required')
  if (quantity <= 0) throw new Error('Quantity must be greater than zero')
  if (unitPrice < 0) throw new Error('Unit price cannot be negative')

  const { data, error } = await supabase
    .from('invoice_line_items')
    .insert({
      invoice_id: invoiceId,
      description: description.trim(),
      quantity,
      unit_price: unitPrice,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to add line item: ${error.message}`)
  return data
}

export async function getInvoiceLineItems(invoiceId: string) {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

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
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('invoice_line_items')
    .delete()
    .eq('id', lineItemId)

  if (error) throw new Error(`Failed to remove line item: ${error.message}`)
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

export async function generateInvoicePDF(invoiceId: string): Promise<string> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: invoice } = await supabase
    .from('invoices')
    .select('job_id')
    .eq('id', invoiceId)
    .single()

  if (!invoice) throw new Error('Invoice not found')

  // Delegate to the API route which handles rendering + storage
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  // Use server-side fetch with service key for internal route call
  const response = await fetch(`${baseUrl}/api/jobs/${invoice.job_id}/invoice-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Failed to generate PDF')
  }

  const result = await response.json()
  return (result as { url: string }).url
}

export async function sendInvoiceWithPDF(invoiceId: string): Promise<boolean> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  // Get or generate PDF URL
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, jobs(customer_name, email, job_number, company_id, companies(name))')
    .eq('id', invoiceId)
    .single()

  if (!invoice) throw new Error('Invoice not found')

  const job = (invoice as any).jobs
  if (!job?.email) throw new Error('Customer has no email address on file')

  let pdfUrl = invoice.pdf_url as string | null
  if (!pdfUrl) {
    try {
      pdfUrl = await generateInvoicePDF(invoiceId)
    } catch (err) {
      console.warn('[invoicing] PDF generation failed, sending without attachment:', err)
    }
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) throw new Error('Email service not configured')

  const resend = new Resend(resendKey)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const companyName = job.companies?.name || 'Your Roofing Company'

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Upon receipt'

  const paymentSection = invoice.payment_link
    ? `<p style="margin-top:20px;"><a href="${invoice.payment_link}" style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Pay Now — ${formatCurrency(invoice.total_amount)}</a></p>`
    : ''

  const pdfSection = pdfUrl
    ? `<p style="margin-top:12px;font-size:13px;color:#555;">View your invoice PDF: <a href="${pdfUrl}" style="color:#0066cc;">Download Invoice</a></p>`
    : ''

  await resend.emails.send({
    from: `${companyName} <${fromEmail}>`,
    to: job.email,
    subject: `Invoice ${invoice.invoice_number} from ${companyName} — ${formatCurrency(invoice.total_amount)} due ${dueDate}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;">
        <div style="background:#1a1a1a;padding:24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:22px;">${companyName}</h2>
          <p style="color:#aaa;margin:4px 0 0;font-size:13px;">Invoice</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
          <p style="font-size:15px;">Hello ${job.customer_name},</p>
          <p>Please find your invoice details below. Payment is due <strong>${dueDate}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:10px 0;color:#666;">Invoice #</td>
              <td style="padding:10px 0;font-weight:600;text-align:right;">${invoice.invoice_number}</td>
            </tr>
            <tr style="border-bottom:1px solid #eee;">
              <td style="padding:10px 0;color:#666;">Job #</td>
              <td style="padding:10px 0;text-align:right;">${job.job_number}</td>
            </tr>
            <tr style="border-bottom:2px solid #1a1a1a;">
              <td style="padding:10px 0;font-weight:700;">Amount Due</td>
              <td style="padding:10px 0;font-weight:700;font-size:20px;text-align:right;">${formatCurrency(invoice.total_amount)}</td>
            </tr>
          </table>
          ${paymentSection}
          ${pdfSection}
          ${invoice.notes ? `<p style="margin-top:20px;padding:12px;background:#f5f5f5;border-left:3px solid #ccc;font-size:13px;color:#555;">${String(invoice.notes).replace(/[&<>"']/g, (c: string) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c))}</p>` : ''}
          <p style="margin-top:28px;font-size:12px;color:#999;">Questions? Contact ${companyName} directly.</p>
        </div>
      </div>
    `,
  })

  await supabase
    .from('invoices')
    .update({ status: 'sent', updated_at: new Date().toISOString() })
    .eq('id', invoiceId)

  return true
}

// ─── Payment Reminders ────────────────────────────────────────────────────────

export async function processInvoiceReminders(): Promise<{ sent: number }> {
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Find sent invoices: past due, not paid, no reminder in last 7 days
  const { data: overdueInvoices, error } = await supabase
    .from('invoices')
    .select('*, jobs(customer_name, email, job_number, companies(name))')
    .in('status', ['sent', 'viewed', 'overdue'])
    .lt('due_date', today)
    .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${sevenDaysAgo}`)

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

    const companyName = job.companies?.name || 'Your Roofing Company'
    const formatCurrency = (n: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'a past date'

    const daysPastDue = Math.floor(
      (Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)
    )

    const paymentSection = invoice.payment_link
      ? `<p style="margin-top:20px;"><a href="${invoice.payment_link}" style="display:inline-block;padding:12px 28px;background:#cc0000;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Pay Now — ${formatCurrency(invoice.total_amount)}</a></p>`
      : ''

    try {
      await resend.emails.send({
        from: `${companyName} <${fromEmail}>`,
        to: job.email,
        subject: `[Reminder] Invoice ${invoice.invoice_number} is ${daysPastDue} days overdue — ${formatCurrency(invoice.total_amount)}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#cc0000;padding:20px;border-radius:8px 8px 0 0;">
              <h2 style="color:#fff;margin:0;">Payment Reminder</h2>
              <p style="color:#ffcccc;margin:4px 0 0;font-size:13px;">${companyName}</p>
            </div>
            <div style="background:#fff;padding:28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
              <p>Hello ${job.customer_name},</p>
              <p>This is a reminder that invoice <strong>${invoice.invoice_number}</strong> for <strong>${formatCurrency(invoice.total_amount)}</strong> was due on ${dueDate} and is now <strong>${daysPastDue} days past due</strong>.</p>
              ${paymentSection}
              <p style="margin-top:20px;font-size:13px;color:#555;">If you have already sent payment, please disregard this message. Contact us if you have any questions.</p>
              <p style="margin-top:20px;font-size:12px;color:#999;">&mdash; ${companyName}</p>
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
      console.error('[invoicing] reminder send failed for invoice', invoice.id, err)
    }
  }

  return { sent }
}

// generatePortalToken lives in lib/actions/portal.ts — removed duplicate

export async function sendInvoiceEmail(invoice_id: string) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('*, jobs(customer_name, email, job_number, company_id, companies(name))')
    .eq('id', invoice_id)
    .single()

  if (invError || !invoice) throw new Error('Invoice not found')

  const job = (invoice as any).jobs
  if (!job?.email) throw new Error('Customer has no email address on file')

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) throw new Error('Email service not configured — RESEND_API_KEY is missing')

  const resend = new Resend(resendKey)
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const companyName = job.companies?.name || 'Your Roofing Company'

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'On receipt'

  await resend.emails.send({
    from: `${companyName} <${fromEmail}>`,
    to: job.email,
    subject: `Invoice ${invoice.invoice_number} from ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Invoice from ${companyName}</h2>
        <p>Hello ${job.customer_name},</p>
        <p>Please find your invoice details below:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Invoice #</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${invoice.invoice_number}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Job #</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${job.job_number}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Type</td><td style="padding: 8px; border-bottom: 1px solid #eee; text-transform: capitalize;">${invoice.type}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Amount Due</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; font-size: 18px;">${formatCurrency(invoice.total_amount)}</td></tr>
          <tr><td style="padding: 8px; color: #666;">Due Date</td><td style="padding: 8px;">${dueDate}</td></tr>
        </table>
        ${invoice.notes ? `<p style="color: #666; font-size: 14px;">Notes: ${String(invoice.notes).replace(/[&<>"']/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))}</p>` : ''}
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          Please contact us if you have any questions about this invoice.
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 32px;">&mdash; ${companyName}</p>
      </div>
    `,
  })

  // Mark invoice as sent
  await supabase
    .from('invoices')
    .update({ status: 'sent', updated_at: new Date().toISOString() })
    .eq('id', invoice_id)

  return true
}
