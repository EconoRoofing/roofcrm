'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { calculateMaterials, type MaterialCalcInput } from '@/lib/material-calculator'

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id: string
  job_id: string
  supplier_name: string
  supplier_email: string | null
  order_text: string
  status: 'draft' | 'sent' | 'confirmed' | 'delivered'
  total_estimated_cost: number
  sent_at: string | null
  confirmed_at: string | null
  delivered_at: string | null
  notes: string | null
  created_at: string
}

export async function createPurchaseOrder(
  jobId: string,
  supplierName: string,
  supplierEmail: string,
  orderText: string
): Promise<PurchaseOrder> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({
      job_id: jobId,
      supplier_name: supplierName,
      supplier_email: supplierEmail || null,
      order_text: orderText,
      status: 'draft',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create purchase order: ${error.message}`)
  return data as PurchaseOrder
}

export async function getPurchaseOrders(jobId: string): Promise<PurchaseOrder[]> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch purchase orders: ${error.message}`)
  return (data ?? []) as PurchaseOrder[]
}

export async function updatePurchaseOrderStatus(
  orderId: string,
  status: 'draft' | 'sent' | 'confirmed' | 'delivered'
): Promise<PurchaseOrder> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const timestampField: Record<string, string> = {
    sent: 'sent_at',
    confirmed: 'confirmed_at',
    delivered: 'delivered_at',
  }

  const update: Record<string, unknown> = { status }
  if (timestampField[status]) {
    update[timestampField[status]] = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(update)
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update purchase order: ${error.message}`)
  return data as PurchaseOrder
}

// ─── Supplier Contacts ────────────────────────────────────────────────────────

export interface SupplierContact {
  id: string
  company_id: string | null
  name: string
  email: string
  phone: string | null
  specialty: string | null
  is_preferred: boolean
  created_at: string
}

export async function getSupplierContacts(): Promise<SupplierContact[]> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('supplier_contacts')
    .select('*')
    .order('is_preferred', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw new Error(`Failed to fetch supplier contacts: ${error.message}`)
  return (data ?? []) as SupplierContact[]
}

export async function addSupplierContact(contactData: {
  name: string
  email: string
  phone?: string
  specialty?: string
  is_preferred?: boolean
  company_id?: string
}): Promise<SupplierContact> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  if (!contactData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactData.email)) {
    throw new Error('Valid email is required')
  }

  const { data, error } = await supabase
    .from('supplier_contacts')
    .insert({
      name: contactData.name,
      email: contactData.email,
      phone: contactData.phone ?? null,
      specialty: contactData.specialty ?? null,
      is_preferred: contactData.is_preferred ?? false,
      company_id: contactData.company_id ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to add supplier contact: ${error.message}`)
  return data as SupplierContact
}

export async function deleteSupplierContact(id: string): Promise<void> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('supplier_contacts')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Failed to delete supplier contact: ${error.message}`)
}



export async function generateSupplierOrderText(jobId: string): Promise<string> {
  const supabase = await createClient()

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(
      'id, job_number, customer_name, address, city, squares, material, felt_type, layers, gutter_length_ft, ridge_type, job_type, company_id, companies(name)'
    )
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    throw new Error('Job not found')
  }

  const { data: materialList } = await supabase
    .from('material_lists')
    .select('items, waste_factor, supplier_name')
    .eq('job_id', jobId)
    .single()

  let text = `ROOFING SUPPLY ORDER\n`
  text += `=====================================\n\n`
  text += `Job Details:\n`
  text += `Job #: ${job.job_number}\n`
  text += `Customer: ${job.customer_name}\n`
  text += `Address: ${job.address}, ${job.city}\n`
  text += `Job Type: ${job.job_type}\n`
  text += `\n`

  text += `Materials Needed:\n`
  text += `-------------------------------------\n`

  if (materialList?.items && Array.isArray(materialList.items)) {
    materialList.items.forEach((item: any) => {
      text += `• ${item.name}: ${item.quantity} ${item.unit}\n`
      if (item.formula) {
        text += `  (${item.formula})\n`
      }
    })
  } else {
    // Fallback calculation if no material list exists
    const calcInput: MaterialCalcInput = {
      squares: job.squares || 0,
      job_type: job.job_type,
      material: job.material || undefined,
      felt_type: job.felt_type || undefined,
      layers: job.layers || undefined,
      gutter_length_ft: job.gutter_length_ft || undefined,
    }

    const materials = calculateMaterials(calcInput)
    materials.forEach((item) => {
      text += `• ${item.name}: ${item.quantity} ${item.unit}\n`
      text += `  (${item.formula})\n`
    })
  }

  text += `\n`
  text += `Waste Factor: ${materialList?.waste_factor ? (materialList.waste_factor * 100).toFixed(0) + '%' : '10%'}\n`
  text += `\n`
  const companyName = (job.companies as any)?.name || 'Roofing Company'
  text += `Please provide quote and delivery timeline.\n`
  text += `Thank you,\n${companyName}\n`

  return text
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (char) => (({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[char] ?? char))
}

export async function emailSupplierOrder(
  jobId: string,
  supplierEmail: string,
  senderCompanyName?: string
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    throw new Error('Email service not configured — RESEND_API_KEY is missing')
  }

  // Ensure valid email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierEmail)) {
    throw new Error(`Invalid supplier email address: ${supplierEmail}`)
  }

  // Fetch job to get job_number and company name
  const supabase = await createClient()
  const { data: job } = await supabase
    .from('jobs')
    .select('job_number, company_id, companies(name)')
    .eq('id', jobId)
    .single()

  const jobNumber = job?.job_number || jobId
  const companyName = senderCompanyName || (job?.companies as any)?.name || 'Roofing Company'

  // Rate-limit: reject if the same order was already emailed in the last 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('id')
    .eq('job_id', jobId)
    .eq('auto_generated', false)
    .ilike('body', '%Material Order%')
    .gte('created_at', fiveMinAgo)

  if (recentMessages && recentMessages.length > 0) {
    throw new Error('Order was already sent recently. Please wait 5 minutes before sending again.')
  }

  const text = await generateSupplierOrderText(jobId)

  const { Resend } = await import('resend')
  const client = new Resend(resendKey)

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  // Escape HTML then replace newlines with <br>
  const safeText = escapeHtml(text)
  const htmlBody = safeText.replace(/\n/g, '<br>')

  await client.emails.send({
    from: `${companyName} <${fromEmail}>`,
    to: supplierEmail,
    subject: `Material Order Request - Job #${jobNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Roofing Supply Order</h2>
        <div style="font-family: monospace; font-size: 13px; line-height: 1.6;">${htmlBody}</div>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #ccc;">
        <p style="color: #666; font-size: 12px;">
          This is an automated order request. Please reply with quote and availability.
        </p>
      </div>
    `,
  })

  // Create purchase order record (best-effort)
  try {
    const po = await createPurchaseOrder(jobId, companyName, supplierEmail, text)
    await updatePurchaseOrderStatus(po.id, 'sent')
  } catch {}

  return true
}
