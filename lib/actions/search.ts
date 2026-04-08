'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'

export interface SearchResult {
  id: string
  job_number: string
  customer_name: string
  address: string
  city: string
  status: string
  company: { name: string; color: string } | null
}

export async function searchJobs(query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return []

  // Strip everything except alphanumeric, spaces, and hyphens (no apostrophes — they break PostgREST filters)
  const sanitized = query.replace(/[^a-zA-Z0-9\s\-]/g, '').trim()
  if (!sanitized) return []

  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Use individual .ilike() filters chained with .or() to avoid string interpolation in filter syntax
  const pattern = `%${sanitized}%`
  const { data } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, address, city, status, company:companies(name, color)')
    .eq('company_id', companyId)
    .or(`customer_name.ilike.${pattern},address.ilike.${pattern},job_number.ilike.${pattern},city.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(10)

  return (data ?? []) as unknown as SearchResult[]
}
