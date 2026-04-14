import { getJobsForPipeline } from '@/lib/actions/jobs'
import { KanbanBoard } from '@/components/kanban/board'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

/**
 * Performance pass R5-#1: previously this page rendered a client component
 * that `useEffect`-fetched pipeline jobs on mount. Full client waterfall
 * on every visit. Now SSRs the fetch — loading.tsx shows the skeleton
 * during the server query, KanbanBoard receives jobs as props and only
 * pays for its own hydration (dnd-kit interactivity).
 *
 * `KanbanBoard` is still `'use client'` for dnd-kit. That's correct —
 * it's the interactivity layer, not the data layer.
 */
export default async function PipelinePage() {
  const jobs = await getJobsForPipeline()

  if (!jobs || jobs.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 56px)',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-deep)',
        }}
      >
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <EmptyState
            title="No jobs yet"
            description="Add your first lead to get started"
            action={{ label: 'Add Lead', href: '/jobs/new' }}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 56px)',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <KanbanBoard jobs={jobs} companies={[]} />
      </div>
    </div>
  )
}
