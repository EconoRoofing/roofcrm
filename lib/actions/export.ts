'use server'

import { createClient } from '@/lib/supabase/server'

export async function exportPayrollCSV(filters?: {
  startDate: string
  endDate: string
  companyId?: string
}): Promise<string> {
  const supabase = await createClient()

  let query = supabase
    .from('time_entries')
    .select(`
      clock_in, clock_out, regular_hours, overtime_hours, doubletime_hours,
      total_hours, total_cost, cost_code, pay_type, hourly_rate, day_rate,
      user:users!time_entries_user_id_fkey(name, primary_company_id),
      job:jobs!time_entries_job_id_fkey(job_number, customer_name, company_id)
    `)
    .not('clock_out', 'is', null)
    .order('clock_in', { ascending: true })

  if (filters?.startDate) query = query.gte('clock_in', filters.startDate)
  if (filters?.endDate) query = query.lte('clock_in', filters.endDate + 'T23:59:59')

  const { data } = await query

  // Filter by company client-side (embedded resource filters don't work in PostgREST)
  let filtered = data ?? []
  if (filters?.companyId) {
    filtered = filtered.filter(entry => {
      const job = entry.job as any
      return job?.company_id === filters.companyId
    })
  }

  if (filtered.length === 0) return ''

  const headers = [
    'Employee', 'Date', 'Job #', 'Customer', 'Clock In', 'Clock Out',
    'Regular Hrs', 'OT Hrs (1.5x)', 'DT Hrs (2x)', 'Total Hrs',
    'Pay Type', 'Rate', 'Total Pay', 'Cost Code',
  ]

  const rows = filtered.map(entry => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = entry.user as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = entry.job as any
    const clockIn = new Date(entry.clock_in)
    const clockOut = entry.clock_out ? new Date(entry.clock_out) : null

    return [
      user?.name ?? '',
      clockIn.toLocaleDateString('en-US'),
      job?.job_number ?? '',
      job?.customer_name ?? '',
      clockIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      clockOut?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) ?? '',
      (entry.regular_hours ?? 0).toFixed(2),
      (entry.overtime_hours ?? 0).toFixed(2),
      (entry.doubletime_hours ?? 0).toFixed(2),
      (entry.total_hours ?? 0).toFixed(2),
      entry.pay_type ?? 'hourly',
      entry.pay_type === 'day_rate'
        ? (entry.day_rate ?? 0).toFixed(2)
        : (entry.hourly_rate ?? 0).toFixed(2),
      (entry.total_cost ?? 0).toFixed(2),
      entry.cost_code ?? 'labor',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

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
