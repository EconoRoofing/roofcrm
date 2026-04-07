'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { logActivity } from '@/lib/actions/activity'
import { generatePDF } from '@/lib/pdf/generate-pdf'
import { sendEstimateEmail } from '@/lib/email'
import type { Job, Company } from '@/lib/types/database'

export async function signEstimate(
  jobId: string,
  repSignature: string,
  customerSignature: string,
  auditData: {
    ip?: string
    userAgent?: string
    timestamp: string
  }
): Promise<{ pdfUrl: string }> {
  const supabase = await createClient()
  const user = await getUser()

  // 1. Fetch job + company data
  const { data: jobRow, error: jobError } = await supabase
    .from('jobs')
    .select(`
      *,
      company:companies(*)
    `)
    .eq('id', jobId)
    .single()

  if (jobError || !jobRow) {
    throw new Error('Job not found')
  }

  const job = jobRow as Job & { company: Company }
  const company = job.company

  // 2. Generate signed PDF with both signatures
  const pdfBuffer = await generatePDF({
    company,
    job,
    repSignature,
    customerSignature,
    signedDate: new Date(auditData.timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  })

  // 3. Upload signed PDF to Supabase Storage
  const timestamp = new Date(auditData.timestamp).getTime()
  const storagePath = `estimates/${jobId}/${timestamp}-signed.pdf`

  const { error: uploadError } = await supabase.storage
    .from('estimates')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Failed to upload signed PDF: ${uploadError.message}`)
  }

  // 4. Get the public URL
  const { data: urlData } = supabase.storage
    .from('estimates')
    .getPublicUrl(storagePath)

  const pdfUrl = urlData.publicUrl

  // 5. Update jobs.estimate_pdf_url with the signed PDF URL
  const { error: updateError } = await supabase
    .from('jobs')
    .update({ estimate_pdf_url: pdfUrl })
    .eq('id', jobId)

  if (updateError) {
    throw new Error(`Failed to update job PDF URL: ${updateError.message}`)
  }

  // 6. Log activity with audit trail
  await logActivity(
    jobId,
    user?.id ?? null,
    'estimate_signed',
    null,
    JSON.stringify({
      pdfUrl,
      ip: auditData.ip,
      userAgent: auditData.userAgent,
      timestamp: auditData.timestamp,
    })
  )

  // 7. Try to send email to customer (best-effort)
  if (job.email && job.customer_name && company.name) {
    await sendEstimateEmail(
      job.email,
      job.customer_name,
      company.name,
      pdfUrl
    )
  }

  // 8. Auto-advance status to 'sold' if currently 'pending' (estimate was given, now signed)
  const { data: freshJob } = await supabase
    .from('jobs')
    .select('status')
    .eq('id', jobId)
    .single()

  if (freshJob?.status === 'pending') {
    try {
      const { updateJobStatus } = await import('./jobs')
      await updateJobStatus(jobId, 'sold')
    } catch {
      // Status advance is best-effort — don't fail the signature flow
    }
  }

  return { pdfUrl }
}
