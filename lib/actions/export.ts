'use server'

import { createClient } from '@/lib/supabase/server'

export async function exportJobsCSV(filters?: { companyId?: string; status?: string }): Promise<string> {
  const supabase = await createClient()

  let query = supabase.from('jobs').select(`
    job_number, customer_name, address, city, state, zip, phone, email,
    status, job_type, total_amount, material, material_color, squares,
    scheduled_date, completed_date, created_at,
    company:companies(name),
    rep:users!jobs_rep_id_fkey(name)
  `)

  if (filters?.companyId) query = query.eq('company_id', filters.companyId)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data } = await query.order('created_at', { ascending: false })

  if (!data || data.length === 0) return ''

  const headers = [
    'Job #', 'Customer', 'Address', 'City', 'Phone', 'Email',
    'Status', 'Type', 'Amount', 'Material', 'Company', 'Rep',
    'Scheduled', 'Completed', 'Created',
  ]

  const rows = data.map((job) => {
    const company = (job.company as { name?: string } | null)?.name ?? ''
    const rep = (job.rep as { name?: string } | null)?.name ?? ''
    return [
      job.job_number,
      job.customer_name,
      job.address,
      job.city,
      job.phone ?? '',
      job.email ?? '',
      job.status,
      job.job_type,
      job.total_amount ?? '',
      job.material ?? '',
      company,
      rep,
      job.scheduled_date ?? '',
      job.completed_date ?? '',
      (job.created_at as string).split('T')[0],
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}
