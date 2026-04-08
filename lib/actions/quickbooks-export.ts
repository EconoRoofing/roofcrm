'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'

// ---------------------------------------------------------------------------
// QuickBooks-compatible CSV exports
// ---------------------------------------------------------------------------

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvEscape).join(',')
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

// ---------------------------------------------------------------------------
// 1. Invoice export (QBO Desktop/Online import format)
// ---------------------------------------------------------------------------

export async function exportInvoicesToQBO(startDate?: string, endDate?: string) {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  let query = supabase
    .from('invoices')
    .select('*, jobs!inner(customer_name, job_number, company_id)')
    .eq('jobs.company_id', companyId)

  if (startDate) query = query.gte('created_at', startDate)
  if (endDate) query = query.lte('created_at', endDate)

  const { data: invoices, error } = await query.order('created_at', { ascending: true })
  if (error) throw new Error(`Failed to fetch invoices: ${error.message}`)
  if (!invoices || invoices.length === 0) {
    return { csv: '', count: 0, totalAmount: 0 }
  }

  // Fetch line items for all invoices in one query
  const invoiceIds = invoices.map((inv: any) => inv.id)
  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('*')
    .in('invoice_id', invoiceIds)
    .order('created_at', { ascending: true })

  // Group line items by invoice
  const lineItemMap = new Map<string, any[]>()
  for (const li of lineItems || []) {
    const existing = lineItemMap.get(li.invoice_id) || []
    existing.push(li)
    lineItemMap.set(li.invoice_id, existing)
  }

  // Build CSV
  const header = '*InvoiceNo,*Customer,*InvoiceDate,*DueDate,*Amount,*ItemDescription,*ItemAmount,Terms,Memo,Class'
  const rows: string[] = [header]
  let totalAmount = 0

  for (const inv of invoices) {
    const job = (inv as any).jobs
    const items = lineItemMap.get(inv.id)
    totalAmount += Number(inv.total_amount) || Number(inv.amount) || 0

    if (items && items.length > 0) {
      for (const item of items) {
        rows.push(csvRow([
          inv.invoice_number,
          job.customer_name,
          formatDate(inv.created_at),
          formatDate(inv.due_date),
          inv.total_amount ?? inv.amount,
          item.description,
          item.total ?? (Number(item.quantity) * Number(item.unit_price)),
          'Net 30',
          inv.notes,
          '',
        ]))
      }
    } else {
      // Single row when no line items
      rows.push(csvRow([
        inv.invoice_number,
        job.customer_name,
        formatDate(inv.created_at),
        formatDate(inv.due_date),
        inv.total_amount ?? inv.amount,
        inv.type ?? 'Roofing Services',
        inv.total_amount ?? inv.amount,
        'Net 30',
        inv.notes,
        '',
      ]))
    }
  }

  return {
    csv: rows.join('\n'),
    count: invoices.length,
    totalAmount,
  }
}

// ---------------------------------------------------------------------------
// 2. Payroll export (regular + overtime calculation)
// ---------------------------------------------------------------------------

export async function exportPayrollToCSV(startDate: string, endDate: string) {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  // Fetch time entries with user info, scoped to company via jobs
  const { data: entries, error } = await supabase
    .from('time_entries')
    .select('*, users!inner(full_name, hourly_rate, primary_company_id), jobs!inner(job_number, company_id)')
    .eq('users.primary_company_id', companyId)
    .eq('jobs.company_id', companyId)
    .gte('clock_in', startDate)
    .lte('clock_in', endDate)
    .not('clock_out', 'is', null)
    .order('clock_in', { ascending: true })
    .limit(10000)

  if (error) throw new Error(`Failed to fetch time entries: ${error.message}`)
  if (!entries || entries.length === 0) {
    return { csv: '', employeeCount: 0, totalHours: 0, totalPay: 0 }
  }

  // Group entries by employee + date for daily OT calculation
  const byEmployeeDate = new Map<string, any[]>()
  for (const entry of entries) {
    const user = (entry as any).users
    const dateKey = new Date(entry.clock_in).toISOString().split('T')[0]
    const key = `${entry.user_id}|${dateKey}`
    const existing = byEmployeeDate.get(key) || []
    existing.push({ ...entry, _userName: user.full_name, _rate: Number(user.hourly_rate) || 0 })
    byEmployeeDate.set(key, existing)
  }

  // Also track weekly hours per employee for 40hr OT threshold
  const weeklyHours = new Map<string, number>() // key: userId|weekStart

  const header = 'EmployeeName,Date,RegularHours,OvertimeHours,RegularPay,OvertimePay,TotalPay,CostCode,JobNumber'
  const rows: string[] = [header]
  const uniqueEmployees = new Set<string>()
  let grandTotalHours = 0
  let grandTotalPay = 0

  for (const [key, dayEntries] of Array.from(byEmployeeDate.entries())) {
    const [userId, dateStr] = key.split('|')
    const entryDate = new Date(dateStr)
    const weekStart = new Date(entryDate)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekKey = `${userId}|${weekStart.toISOString().split('T')[0]}`

    // Sum daily hours
    let dailyTotal = 0
    for (const e of dayEntries) {
      dailyTotal += Number(e.total_hours) || 0
    }

    // Track weekly accumulation
    const prevWeekly = weeklyHours.get(weekKey) || 0

    // Daily OT: hours over 8
    let regularHours = Math.min(dailyTotal, 8)
    let overtimeHours = Math.max(dailyTotal - 8, 0)

    // Weekly OT: if weekly total exceeds 40, additional hours are OT
    const newWeeklyTotal = prevWeekly + dailyTotal
    if (prevWeekly < 40 && newWeeklyTotal > 40) {
      const weeklyOT = newWeeklyTotal - 40
      if (weeklyOT > overtimeHours) {
        // Weekly threshold produces more OT than daily rule
        const additionalOT = weeklyOT - overtimeHours
        overtimeHours += additionalOT
        regularHours -= additionalOT
        if (regularHours < 0) regularHours = 0
      }
    } else if (prevWeekly >= 40) {
      // Already past 40 this week — all hours are OT
      overtimeHours = dailyTotal
      regularHours = 0
    }

    weeklyHours.set(weekKey, newWeeklyTotal)

    const rate = dayEntries[0]._rate
    const regularPay = +(regularHours * rate).toFixed(2)
    const overtimePay = +(overtimeHours * rate * 1.5).toFixed(2)
    const totalPay = regularPay + overtimePay

    uniqueEmployees.add(userId)
    grandTotalHours += dailyTotal
    grandTotalPay += totalPay

    const jobNumber = (dayEntries[0] as any).jobs?.job_number ?? ''

    rows.push(csvRow([
      dayEntries[0]._userName,
      dateStr,
      regularHours.toFixed(2),
      overtimeHours.toFixed(2),
      regularPay.toFixed(2),
      overtimePay.toFixed(2),
      totalPay.toFixed(2),
      '', // cost code — not tracked on time_entries currently
      jobNumber,
    ]))
  }

  return {
    csv: rows.join('\n'),
    employeeCount: uniqueEmployees.size,
    totalHours: +grandTotalHours.toFixed(2),
    totalPay: +grandTotalPay.toFixed(2),
  }
}

// ---------------------------------------------------------------------------
// 3. Expense / Purchase Order export
// ---------------------------------------------------------------------------

export async function exportExpensesToCSV(startDate?: string, endDate?: string) {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()

  let query = supabase
    .from('purchase_orders')
    .select('*, jobs!inner(job_number, company_id)')
    .eq('jobs.company_id', companyId)

  if (startDate) query = query.gte('created_at', startDate)
  if (endDate) query = query.lte('created_at', endDate)

  const { data: orders, error } = await query.order('created_at', { ascending: true })
  if (error) throw new Error(`Failed to fetch purchase orders: ${error.message}`)
  if (!orders || orders.length === 0) {
    return { csv: '', count: 0, totalAmount: 0 }
  }

  const header = '*Vendor,*Date,*Amount,*Account,Description,JobNumber'
  const rows: string[] = [header]
  let totalAmount = 0

  for (const po of orders) {
    const amount = Number(po.total_estimated_cost) || 0
    totalAmount += amount
    const job = (po as any).jobs

    rows.push(csvRow([
      po.supplier_name,
      formatDate(po.created_at),
      amount.toFixed(2),
      'Cost of Goods Sold',
      po.notes ?? po.order_text,
      job.job_number ?? '',
    ]))
  }

  return {
    csv: rows.join('\n'),
    count: orders.length,
    totalAmount: +totalAmount.toFixed(2),
  }
}
