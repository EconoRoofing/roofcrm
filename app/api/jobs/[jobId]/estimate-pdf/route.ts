import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePDF } from '@/lib/pdf/generate-pdf'
import { getUserWithCompany, verifyJobOwnership, requireEstimateEditor } from '@/lib/auth-helpers'
import type { Job, Company } from '@/lib/types/database'

// Signed URL TTL for private estimates bucket — 24 hours.
// Customers receive estimates by email; the signed URL is fresh per generation.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params

    // Authn + authz: must be logged-in editor in the job's company
    let companyId: string
    let role: string | null
    try {
      ;({ companyId, role } = await getUserWithCompany())
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      requireEstimateEditor(role)
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let job: Job
    try {
      job = (await verifyJobOwnership(jobId, companyId)) as Job
    } catch {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Block regeneration of a signed estimate. Once a customer has signed,
    // the contract PDF is locked — managers must explicitly void it via a
    // separate flow if it's wrong (not built yet).
    // Stopgap detection: signature.ts uploads with `-signed.pdf` suffix.
    const existingPdfUrl = (job as Job & { estimate_pdf_url?: string | null }).estimate_pdf_url
    if (existingPdfUrl && existingPdfUrl.includes('-signed.pdf')) {
      return NextResponse.json(
        { error: 'This estimate has been signed and cannot be regenerated' },
        { status: 409 }
      )
    }

    const supabase = await createClient()

    // Fetch company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', job.company_id)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Generate PDF
    const pdfBuffer = await generatePDF({
      company: company as Company,
      job,
    })

    // Upload to Supabase Storage (PRIVATE bucket — see /tasks/todo.md storage notes)
    const timestamp = Date.now()
    const storagePath = `estimates/${jobId}/${timestamp}-agreement.pdf`

    const { error: uploadError } = await supabase.storage
      .from('estimates')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      console.error('PDF upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload PDF' }, { status: 500 })
    }

    // Issue a time-limited signed URL instead of a public URL.
    // Requires the `estimates` bucket to be set to Private in the Supabase Dashboard.
    const { data: signed, error: signedErr } = await supabase.storage
      .from('estimates')
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

    if (signedErr || !signed?.signedUrl) {
      console.error('Signed URL error:', signedErr)
      return NextResponse.json({ error: 'Failed to issue signed URL' }, { status: 500 })
    }

    // Persist the signed URL on the job. NOTE: signed URLs expire after
    // SIGNED_URL_TTL_SECONDS — when we add UI/email regeneration, we should
    // store the storage path separately and re-sign on demand.
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ estimate_pdf_url: signed.signedUrl })
      .eq('id', jobId)
      .eq('company_id', companyId)

    if (updateError) {
      console.error('Job update error:', updateError)
      // Non-fatal: return the URL even if update fails
    }

    return NextResponse.json({ url: signed.signedUrl })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
