import { notFound } from 'next/navigation'
import { getJob } from '@/lib/actions/jobs'
import { JobDetail } from '@/components/job-detail'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function JobPage({ params }: PageProps) {
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
        paddingTop: '8px',
        paddingBottom: '32px',
      }}
    >
      <JobDetail job={job} />
    </main>
  )
}
