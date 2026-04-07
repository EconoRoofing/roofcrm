import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePDF } from '@/lib/pdf/generate-pdf'
import type { Job, Company } from '@/lib/types/database'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const supabase = await createClient()

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Fetch company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', (job as Job).company_id)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Generate PDF
    const pdfBuffer = await generatePDF({
      company: company as Company,
      job: job as Job,
    })

    // Upload to Supabase Storage
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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('estimates')
      .getPublicUrl(storagePath)

    const publicUrl = urlData.publicUrl

    // Update job record
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ estimate_pdf_url: publicUrl })
      .eq('id', jobId)

    if (updateError) {
      console.error('Job update error:', updateError)
      // Non-fatal: return the URL even if update fails
    }

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
