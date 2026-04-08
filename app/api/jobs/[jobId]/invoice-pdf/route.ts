import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { InvoicePDF } from '@/lib/pdf/invoice-template'
import type { Company } from '@/lib/types/database'
import type { DocumentProps } from '@react-pdf/renderer'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const body = await req.json().catch(() => ({}))
    const invoiceId = body.invoiceId as string | undefined

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch invoice
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('job_id', jobId)
      .single()

    if (invError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Fetch job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('job_number, customer_name, address, city, state, zip, phone, email, company_id')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Fetch company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', job.company_id)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
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
      console.error('[invoice-pdf] upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload PDF' }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('estimates')
      .getPublicUrl(storagePath)

    const publicUrl = urlData.publicUrl

    // Persist pdf_url on invoice
    await supabase
      .from('invoices')
      .update({ pdf_url: publicUrl })
      .eq('id', invoiceId)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('[invoice-pdf] generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
