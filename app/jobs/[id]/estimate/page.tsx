import { notFound } from 'next/navigation'
import { getJob } from '@/lib/actions/jobs'
import { EstimateWizard } from '@/components/estimate/wizard'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EstimatePage({ params }: PageProps) {
  const { id } = await params

  const job = await getJob(id)

  if (!job) {
    notFound()
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      <EstimateWizard job={job} />
    </main>
  )
}
