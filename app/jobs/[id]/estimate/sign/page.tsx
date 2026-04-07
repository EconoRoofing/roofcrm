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

  return (
    <SignClient
      jobId={job.id}
      jobNumber={job.job_number}
      customerName={job.customer_name}
      companyName={company?.name ?? 'Roofing Co'}
      totalAmount={job.total_amount}
      customerEmail={job.email}
    />
  )
}
