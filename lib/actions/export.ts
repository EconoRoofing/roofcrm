'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'

export async function exportPayrollCSV(filters?: {
  startDate: string
  endDate: string
}): Promise<string> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // First get the company's job IDs to scope time entries at DB level
  let jobQuery = supabase.from('jobs').select('id').eq('company_id', companyId)
  const { data: companyJobs } = await jobQuery
  const companyJobIds = (companyJobs ?? []).map(j => j.id)

  if (companyJobIds.length === 0) return ''

  let query = supabase
    .from('time_entries')
    .select(`
      clock_in, clock_out, regular_hours, overtime_hours, doubletime_hours,
      total_hours, total_cost, cost_code, pay_type, hourly_rate, day_rate,
      user:users!time_entries_user_id_fkey(name, primary_company_id),
      job:jobs!time_entries_job_id_fkey(job_number, customer_name, company_id)
    `)
    .in('job_id', companyJobIds)
    .not('clock_out', 'is', null)
    .order('clock_in', { ascending: true })
    .limit(10000)

  if (filters?.startDate) query = query.gte('clock_in', filters.startDate)
  if (filters?.endDate) query = query.lte('clock_in', filters.endDate + 'T23:59:59')

  const { data } = await query

  const filtered = data ?? []

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

export async function exportInvoicesQBFormat(dateRange: { start: string; end: string }): Promise<string> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, type, amount, total_amount, status,
      due_date, paid_date, paid_amount, payment_method, created_at,
      jobs(job_number, customer_name, address, city, state),
      companies(name)
    `)
    .eq('company_id', companyId)
    .gte('created_at', dateRange.start)
    .lte('created_at', dateRange.end + 'T23:59:59')
    .order('created_at', { ascending: true })
    .limit(10000)

  if (!invoices || invoices.length === 0) return ''

  // QuickBooks IIF format
  // Header line defines column types; each TRNS row is a transaction
  const lines: string[] = [
    '!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\tCLEAR\tTOPRINT',
    '!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\tQNTY\tPRICE',
    '!ENDTRNS',
  ]

  for (const inv of invoices) {
    const job = (inv as any).jobs as { job_number: string; customer_name: string; address?: string; city?: string; state?: string } | null
    const company = (inv as any).companies as { name: string } | null
    const customerName = job?.customer_name ?? 'Unknown Customer'
    const docNum = inv.invoice_number
    const dateStr = new Date(inv.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    const amount = Number(inv.total_amount).toFixed(2)
    const memo = `Job #${job?.job_number ?? ''} - ${company?.name ?? ''}`

    lines.push(`TRNS\t\tINVOICE\t${dateStr}\tAccounts Receivable\t${customerName}\t${amount}\t${docNum}\t${memo}\tN\tY`)
    lines.push(`SPL\t\tINVOICE\t${dateStr}\tRoofing Services Income\t${customerName}\t-${amount}\t${docNum}\t${memo}\t1\t${amount}`)
    lines.push('ENDTRNS')
  }

  return lines.join('\n')
}

export async function exportJobsCSV(filters?: { status?: string }): Promise<string> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  let query = supabase.from('jobs').select(`
    job_number, customer_name, address, city, state, zip, phone, email,
    status, job_type, total_amount, material, material_color, squares,
    scheduled_date, completed_date, created_at,
    company:companies(name),
    rep:users!jobs_rep_id_fkey(name)
  `)

  query = query.eq('company_id', companyId)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data } = await query.order('created_at', { ascending: false }).limit(10000)

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
