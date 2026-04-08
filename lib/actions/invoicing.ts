'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { v4 as uuidv4 } from 'uuid'
import type { Database } from '@/lib/types/supabase'

type Invoice = Database['public']['Tables']['invoices']['Row']

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

  // Fetch job to get company_id
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, company_id, total_amount')
    .eq('id', data.job_id)
    .single()

  if (jobError || !job) throw new Error('Job not found')

  // Generate invoice number with format: INV-YYYYMMDD-XXXX
  const date = new Date()
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '')
  const invoiceNumberBase = `INV-${dateStr}`

  // Get count of invoices created today to make unique number
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', job.company_id)
    .ilike('invoice_number', `${invoiceNumberBase}%`)

  const invoiceNumber = `${invoiceNumberBase}-${String((count || 0) + 1).padStart(4, '0')}`

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

export async function generatePortalToken(job_id: string) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const token = uuidv4()

  const { data: job, error } = await supabase
    .from('jobs')
    .update({ portal_token: token })
    .eq('id', job_id)
    .select()
    .single()

  if (error) throw new Error(`Failed to generate portal token: ${error.message}`)
  return token
}
