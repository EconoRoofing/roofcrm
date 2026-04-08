import { getUser } from '@/lib/auth'
import { getJobs } from '@/lib/actions/jobs'
import { PipelineList } from '@/components/sales/pipeline-list'
import type { Job } from '@/lib/types/database'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

export default async function SalesPipelinePage() {
  const user = await getUser()

  if (!user) {
    return (
      <div
        style={{
          padding: '48px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          Not signed in
        </span>
      </div>
    )
  }

  const jobs = await getJobs({ rep_id: user.id })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 16px 8px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Pipeline
        </h1>
      </div>

      <PipelineList jobs={jobs as unknown as JobWithCompany[]} />
    </div>
  )
}
