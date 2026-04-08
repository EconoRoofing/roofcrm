import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getJobsForPipeline } from '@/lib/actions/jobs'
import { CompanyFilter } from '@/components/company-filter'
import { KanbanBoard } from '@/components/kanban/board'
import { EmptyState } from '@/components/ui/empty-state'
import type { Company } from '@/lib/types/database'

interface PipelinePageProps {
  searchParams: Promise<{ company?: string }>
}

export default async function PipelinePage({ searchParams }: PipelinePageProps) {
  const { company: companyParam } = await searchParams

  // Fetch only kanban-needed fields (85% less data than SELECT *)
  const jobs = await getJobsForPipeline()

  // Fetch companies for the filter bar
  const supabase = await createClient()
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, logo_url, address, phone, license_number, color')
    .order('name', { ascending: true })

  const companyList: Company[] = companies ?? []
  const selectedCompany = companyParam ?? null

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
      {/* Suspense boundary prevents CSR bailout from useSearchParams() */}
      <Suspense fallback={<div style={{ padding: '12px 16px', height: '48px' }} />}>
        {/* Company filter chip bar */}
        <CompanyFilter
          companies={companyList}
          selected={selectedCompany}
        />

        {/* Kanban board fills remaining height */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {jobs.length === 0 ? (
            <EmptyState
              title="No jobs yet"
              description="Add your first lead to get started"
              action={{ label: 'Add Lead', href: '/jobs/new' }}
            />
          ) : (
            <KanbanBoard
              jobs={jobs}
              companies={companyList}
            />
          )}
        </div>
      </Suspense>
    </div>
  )
}
