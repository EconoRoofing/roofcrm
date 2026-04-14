import { notFound } from 'next/navigation'
import { getJob } from '@/lib/actions/jobs'
import { SignClient } from './sign-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SignEstimatePage({ params }: PageProps) {
  const { id } = await params

  const job = await getJob(id)

  if (!job) {
    notFound()
  }

  const company = (job as typeof job & { company?: { name: string } }).company

  // Audit R3-#2 follow-up: convert cents at the boundary so SignClient's
  // existing dollar-based prop signature keeps working post-031.
  const totalCents = (job as { total_amount_cents?: number | null }).total_amount_cents ?? null
  const totalDollars = totalCents != null ? totalCents / 100 : null

  return (
    <SignClient
      jobId={job.id}
      jobNumber={job.job_number}
      customerName={job.customer_name}
      companyName={company?.name ?? 'Roofing Co'}
      totalAmount={totalDollars}
      customerEmail={job.email}
    />
  )
}
