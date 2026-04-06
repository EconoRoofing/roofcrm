import { notFound } from 'next/navigation'
import { getJob } from '@/lib/actions/jobs'
import { getUser, getUserRole } from '@/lib/auth'
import { JobDetail } from '@/components/job-detail'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function JobPage({ params }: PageProps) {
  const { id } = await params

  const [job, user] = await Promise.all([getJob(id), getUser()])

  if (!job) {
    notFound()
  }

  const role = user ? await getUserRole(user.id) : null

  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-deep)',
        paddingTop: '8px',
        paddingBottom: '32px',
      }}
    >
      <JobDetail job={job} role={role} />
    </main>
  )
}
