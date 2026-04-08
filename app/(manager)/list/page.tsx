import { createClient } from '@/lib/supabase/server'
import { getJobs } from '@/lib/actions/jobs'
import { JobListTable } from '@/components/manager/job-list-table'
import type { Company } from '@/lib/types/database'

export default async function ListPage() {
  const [jobs, companiesResult] = await Promise.all([
    getJobs(),
    createClient().then((supabase) =>
      supabase
        .from('companies')
        .select('id, name, logo_url, address, phone, license_number, color')
        .order('name', { ascending: true })
    ),
  ])

  const companies: Company[] = companiesResult.data ?? []

  return (
    <JobListTable
      jobs={jobs as unknown as Parameters<typeof JobListTable>[0]['jobs']}
      companies={companies}
    />
  )
}
