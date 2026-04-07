import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getJob } from '@/lib/actions/jobs'
import { getUser, getUserRole } from '@/lib/auth'
import { JobDetail } from '@/components/job-detail'
import { ChevronLeftNavIcon } from '@/components/icons'

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
      {/* Back to Pipeline */}
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '0 16px 8px' }}>
        <Link
          href="/pipeline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          <ChevronLeftNavIcon />
          Pipeline
        </Link>
      </div>
      <JobDetail job={job} role={role} />
    </main>
  )
}
