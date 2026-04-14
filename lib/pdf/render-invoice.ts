/**
 * Audit R3-#1: extracted from app/api/jobs/[jobId]/invoice-pdf/route.ts so the
 * server action `generateInvoicePDF` can call the renderer directly instead
 * of doing an HTTP self-fetch.
 *
 * The previous implementation in invoicing.ts:
 *   const response = await fetch(`${baseUrl}/api/jobs/${jobId}/invoice-pdf`, {
 *     headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
 *   })
 *
 * ...always returned 401 because the route authenticates via Supabase session
 * cookies (`getUserWithCompany`) and a server-side `fetch()` does not forward
 * the user's cookies. The catch in `sendInvoiceWithPDF` swallowed the error
 * and the customer received the invoice email with `pdfIncluded: false`.
 * Every "Send Invoice" click in the UI was silently shipping a PDF-less
 * email since this route was added.
 *
 * This helper takes a PRE-VALIDATED companyId — it never calls
 * `getUserWithCompany`. Both the API route and the server action authenticate
 * in their own context first, then hand off the verified companyId here.
 */

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { InvoicePDF } from './invoice-template'
import type { Company } from '@/lib/types/database'

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24

export interface RenderedInvoicePDF {
  url: string
  storagePath: string
}

/**
 * Render an invoice to PDF, upload to Supabase Storage, persist the signed URL
 * on the invoice row, and return the URL.
 *
 * Caller is responsible for verifying that `invoiceId` belongs to `jobId`,
 * and that `jobId` belongs to `companyId`. This function does not re-check
 * tenant boundaries — it trusts the caller did its own authz pass.
 */
export async function renderAndStoreInvoicePDF(
  supabase: SupabaseClient,
  params: { invoiceId: string; jobId: string; companyId: string }
): Promise<RenderedInvoicePDF> {
  const { invoiceId, jobId, companyId } = params

  // Fetch invoice (scoped to the verified job)
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('job_id', jobId)
    .single()

  if (invError || !invoice) {
    throw new Error('Invoice not found')
  }

  // Fetch job (scoped to the verified company)
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('job_number, customer_name, address, city, state, zip, phone, email, company_id')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single()

  if (jobError || !job) {
    throw new Error('Job not found')
  }

  // Fetch company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', job.company_id)
    .single()

  if (companyError || !company) {
    throw new Error('Company not found')
  }

  // Fetch line items
  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })

  // Render PDF
  const element = React.createElement(InvoicePDF, {
    company: company as Company,
    invoice,
    job,
    lineItems: lineItems ?? [],
  }) as unknown as React.ReactElement<DocumentProps>

  const pdfBuffer = await renderToBuffer(element)

  // Upload to Supabase Storage
  const timestamp = Date.now()
  const storagePath = `invoices/${jobId}/${timestamp}-${invoice.invoice_number}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('estimates')
    .upload(storagePath, Buffer.from(pdfBuffer), {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Failed to upload PDF: ${uploadError.message}`)
  }

  const { data: signed, error: signedErr } = await supabase.storage
    .from('estimates')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (signedErr || !signed?.signedUrl) {
    throw new Error(`Failed to issue signed URL: ${signedErr?.message ?? 'unknown'}`)
  }

  // Persist pdf_url on invoice
  await supabase
    .from('invoices')
    .update({ pdf_url: signed.signedUrl })
    .eq('id', invoiceId)

  return { url: signed.signedUrl, storagePath }
}
