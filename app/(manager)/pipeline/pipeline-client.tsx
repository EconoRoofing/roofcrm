'use client'

import { useEffect, useState } from 'react'
import { getJobsForPipeline } from '@/lib/actions/jobs'
import { KanbanBoard } from '@/components/kanban/board'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export function PipelineClient() {
  const [jobs, setJobs] = useState<any[] | null>(null)
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const jobData = await getJobsForPipeline()
        if (mounted) {
          setJobs(jobData)
        }
      } catch {}
      if (mounted) setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '24px', backgroundColor: 'var(--bg-deep)', minHeight: '100vh' }}>
        <Skeleton width="150px" height="28px" />
        <div style={{ display: 'flex', gap: '16px', marginTop: '24px', overflowX: 'auto' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Skeleton width="100%" height="32px" />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 56px)', overflow: 'hidden',
      backgroundColor: 'var(--bg-deep)',
    }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {!jobs || jobs.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            description="Add your first lead to get started"
            action={{ label: 'Add Lead', href: '/jobs/new' }}
          />
        ) : (
          <KanbanBoard jobs={jobs} companies={companies} />
        )}
      </div>
    </div>
  )
}
