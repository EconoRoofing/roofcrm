'use server'

import { createClient } from '@/lib/supabase/server'

// Generate a QR code data URL for the company's Google review link
export async function generateReviewQR(companyId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('companies')
    .select('google_review_link')
    .eq('id', companyId)
    .single()
  if (!data?.google_review_link) return null
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data.google_review_link)}&size=300x300`
}

// Send review link via SMS to a customer
export async function sendReviewLinkSMS(
  jobId: string,
  customerPhone: string,
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('name, google_review_link')
    .eq('id', companyId)
    .single()

  if (!company?.google_review_link) {
    return { success: false, error: 'No review link configured for this company' }
  }

  const { sendSMS } = await import('@/lib/twilio')
  const message = `Hi! Thank you for choosing ${company.name}. If you're happy with our work, please leave us a Google review: ${company.google_review_link}`
  return sendSMS(customerPhone, message)
}

// Get review stats across all jobs
export async function getReviewStats(): Promise<{
  totalRequested: number
  totalReceived: number
  ratePercent: number
  byCompany: Array<{ name: string; requested: number; received: number }>
}> {
  const supabase = await createClient()

  const [completedResult, companiesResult] = await Promise.all([
    supabase
      .from('jobs')
      .select('company_id, review_received')
      .eq('status', 'completed'),
    supabase
      .from('companies')
      .select('id, name'),
  ])

  const jobs = completedResult.data ?? []
  const companies = companiesResult.data ?? []
  const companyMap = new Map(companies.map(c => [c.id, c.name]))

  const totalRequested = jobs.length
  const totalReceived = jobs.filter(j => j.review_received).length
  const ratePercent = totalRequested > 0 ? Math.round((totalReceived / totalRequested) * 100) : 0

  const byCompanyMap = new Map<string, { name: string; requested: number; received: number }>()
  for (const job of jobs) {
    const name = companyMap.get(job.company_id) ?? 'Unknown'
    const existing = byCompanyMap.get(job.company_id) ?? { name, requested: 0, received: 0 }
    existing.requested += 1
    if (job.review_received) existing.received += 1
    byCompanyMap.set(job.company_id, existing)
  }

  return {
    totalRequested,
    totalReceived,
    ratePercent,
    byCompany: Array.from(byCompanyMap.values()),
  }
}
