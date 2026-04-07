import { notFound } from 'next/navigation'
import Link from 'next/link'
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Pipeline
        </Link>
      </div>
      <JobDetail job={job} role={role} />
    </main>
  )
}
