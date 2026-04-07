import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getDashboardData } from '@/lib/actions/dashboard'
import { KPICards } from '@/components/dashboard/kpi-cards'
import type { Company } from '@/lib/types/database'

interface PageProps {
  searchParams: Promise<{ company?: string; range?: string }>
}

function getDateRange(range?: string): { startDate?: string; endDate?: string } {
  const now = new Date()
  switch (range) {
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), q * 3, 1)
      const end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59)
      return { startDate: start.toISOString(), endDate: end.toISOString() }
    }
    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
      return { startDate: start.toISOString(), endDate: end.toISOString() }
    }
    case 'all':
      return {}
    default: {
      // "month" is default
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      return { startDate: start.toISOString(), endDate: end.toISOString() }
    }
  }
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams
  const companyId = params.company
  const range = params.range

  const dateRange = getDateRange(range)

  const [data, companiesResult] = await Promise.all([
    getDashboardData({ companyId, ...dateRange }),
    createClient().then((supabase) =>
      supabase
        .from('companies')
        .select('id, name, logo_url, address, phone, license_number, color')
        .order('name', { ascending: true })
    ),
  ])

  const companies: Company[] = companiesResult.data ?? []

  return (
    <Suspense>
      <KPICards data={data} companies={companies} />
    </Suspense>
  )
}
