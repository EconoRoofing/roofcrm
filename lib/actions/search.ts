'use server'

import { createClient } from '@/lib/supabase/server'

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

  const sanitized = query.replace(/[^a-zA-Z0-9\s\-']/g, '').trim()
  if (!sanitized) return []

  const supabase = await createClient()

  const { data } = await supabase
    .from('jobs')
    .select('id, job_number, customer_name, address, city, status, company:companies(name, color)')
    .or(
      `customer_name.ilike.%${sanitized}%,address.ilike.%${sanitized}%,job_number.ilike.%${sanitized}%,city.ilike.%${sanitized}%`
    )
    .order('created_at', { ascending: false })
    .limit(10)

  return (data ?? []) as unknown as SearchResult[]
}
