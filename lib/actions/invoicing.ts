'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { Resend } from 'resend'
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
        ${invoice.notes ? `<p style="color: #666; font-size: 14px;">Notes: ${invoice.notes}</p>` : ''}
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
