'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { getUserWithCompany, verifyJobOwnership, requireManager, escapeHtml } from '@/lib/auth-helpers'
import { calculateMaterials, type MaterialCalcInput } from '@/lib/material-calculator'
import type { SupplierType, SupplierIntegration } from '@/lib/suppliers'

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
  delivery_notes: string | null
  estimated_delivery: string | null
  created_at: string
}

export interface OrderTimelineEntry {
  status: string
  timestamp: string
  note?: string
}

export async function createPurchaseOrder(
  jobId: string,
  supplierName: string,
  supplierEmail: string,
  orderText: string
): Promise<PurchaseOrder> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

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
  const { companyId } = await getUserWithCompany()

  // Verify job belongs to user's company
  await verifyJobOwnership(jobId, companyId)

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
  const { companyId } = await getUserWithCompany()

  // Fetch the PO to get job_id and current status, then verify ownership
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('job_id, status')
    .eq('id', orderId)
    .single()

  if (poError || !po) throw new Error('Purchase order not found')
  await verifyJobOwnership(po.job_id, companyId)

  // Enforce forward-only status transitions
  const validTransitions: Record<string, string> = {
    draft: 'sent',
    sent: 'confirmed',
    confirmed: 'delivered',
  }

  const currentStatus = po.status as string
  if (validTransitions[currentStatus] !== status) {
    throw new Error(
      `Invalid status transition: cannot move from "${currentStatus}" to "${status}"`
    )
  }

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

// ─── Delivery Tracking ──────────────────────────────────────────────────────

export async function addDeliveryNote(
  orderId: string,
  note: string,
  estimatedDelivery?: string
): Promise<PurchaseOrder> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Fetch the PO to verify ownership
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('job_id')
    .eq('id', orderId)
    .single()

  if (poError || !po) throw new Error('Purchase order not found')
  await verifyJobOwnership(po.job_id, companyId)

  const update: Record<string, unknown> = {
    delivery_notes: note,
  }
  if (estimatedDelivery) {
    update.estimated_delivery = estimatedDelivery
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(update)
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw new Error(`Failed to add delivery note: ${error.message}`)
  return data as PurchaseOrder
}

export async function getOrderTimeline(
  orderId: string
): Promise<OrderTimelineEntry[]> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Fetch the PO to verify ownership and get timestamps
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('job_id, status, created_at, sent_at, confirmed_at, delivered_at, delivery_notes')
    .eq('id', orderId)
    .single()

  if (poError || !po) throw new Error('Purchase order not found')
  await verifyJobOwnership(po.job_id, companyId)

  // Build timeline from the PO's own timestamp fields
  const timeline: OrderTimelineEntry[] = []

  if (po.created_at) {
    timeline.push({ status: 'draft', timestamp: po.created_at, note: 'Order created' })
  }
  if (po.sent_at) {
    timeline.push({ status: 'sent', timestamp: po.sent_at, note: 'Order sent to supplier' })
  }
  if (po.confirmed_at) {
    timeline.push({ status: 'confirmed', timestamp: po.confirmed_at, note: 'Supplier confirmed order' })
  }
  if (po.delivered_at) {
    timeline.push({
      status: 'delivered',
      timestamp: po.delivered_at,
      note: po.delivery_notes || 'Materials delivered',
    })
  }

  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  return timeline
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
  const { companyId } = await getUserWithCompany()

  const { data, error } = await supabase
    .from('supplier_contacts')
    .select('*')
    .eq('company_id', companyId)
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
}): Promise<SupplierContact> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

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
      company_id: companyId,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to add supplier contact: ${error.message}`)
  return data as SupplierContact
}

export async function deleteSupplierContact(id: string): Promise<void> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { error } = await supabase
    .from('supplier_contacts')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) throw new Error(`Failed to delete supplier contact: ${error.message}`)
}

export async function updateSupplierContact(
  contactId: string,
  updates: {
    name?: string
    email?: string
    phone?: string
    specialty?: string
    is_preferred?: boolean
  }
): Promise<SupplierContact> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const updatePayload: Record<string, unknown> = {}
  if (updates.name !== undefined) updatePayload.name = updates.name
  if (updates.email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
      throw new Error('Valid email is required')
    }
    updatePayload.email = updates.email
  }
  if (updates.phone !== undefined) updatePayload.phone = updates.phone || null
  if (updates.specialty !== undefined) updatePayload.specialty = updates.specialty || null
  if (updates.is_preferred !== undefined) updatePayload.is_preferred = updates.is_preferred

  if (Object.keys(updatePayload).length === 0) {
    throw new Error('No fields to update')
  }

  const { data, error } = await supabase
    .from('supplier_contacts')
    .update(updatePayload)
    .eq('id', contactId)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update supplier contact: ${error.message}`)
  return data as SupplierContact
}

export async function generateSupplierOrderText(jobId: string): Promise<string> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  // Verify job belongs to user's company
  await verifyJobOwnership(jobId, companyId)

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

// ─── Supplier Integrations (ABC Supply, SRS / Roof Hub) ─────────────────────

// Re-export types from the canonical supplier module
export type { SupplierType, SupplierIntegration } from '@/lib/suppliers'

export interface SupplierProduct {
  id: string
  name: string
  description: string
  price?: number
  uom: string
  availability?: string
}

export interface SupplierBranch {
  id: string
  name: string
  address: string
  city: string
  state: string
  phone: string
}

export async function getSupplierIntegrations(): Promise<SupplierIntegration[]> {
  await getUserWithCompany()

  try {
    const { getAvailableSuppliers } = await import('@/lib/suppliers')
    return getAvailableSuppliers()
  } catch {
    return []
  }
}

export async function searchSupplierProducts(
  supplierType: SupplierType,
  query: string,
  branchId?: string
): Promise<SupplierProduct[]> {
  await getUserWithCompany()

  if (!query.trim()) return []

  const { getSupplierClient } = await import('@/lib/suppliers')
  const client = getSupplierClient(supplierType)
  if (!client) throw new Error(`Supplier "${supplierType}" is not configured`)

  const results = await client.searchProducts(query, branchId)
  // Normalize different supplier result shapes to SupplierProduct
  return (results as any[]).map((item: any) => ({
    id: item.itemNumber || item.productId || item.id || '',
    name: item.description || item.name || '',
    description: item.category || item.description || '',
    price: item.price,
    uom: item.uom || 'EA',
    availability: item.availability,
  }))
}

export async function getSupplierProductPrice(
  supplierType: SupplierType,
  productId: string,
  branchId: string
): Promise<{ productId: string; price: number; uom: string }> {
  await getUserWithCompany()

  const { getSupplierClient } = await import('@/lib/suppliers')
  const client = getSupplierClient(supplierType)
  if (!client) throw new Error(`Supplier "${supplierType}" is not configured`)

  return client.getProductPrice(productId, branchId)
}

export async function placeSupplierOrder(
  supplierType: SupplierType,
  order: {
    branchId: string
    items: Array<{ productId: string; quantity: number; uom: string }>
    jobId: string
    deliveryNotes?: string
  }
): Promise<{ confirmationNumber: string; localOrderId: string }> {
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)
  await verifyJobOwnership(order.jobId, companyId)

  const { getSupplierClient } = await import('@/lib/suppliers')
  const client = getSupplierClient(supplierType)
  if (!client) throw new Error(`Supplier "${supplierType}" is not configured`)

  const result = await (client.placeOrder as any)(order)

  // Create local PO record
  const supabase = await createClient()
  const supplierLabel = supplierType === 'abc_supply' ? 'ABC Supply' : 'SRS / Roof Hub'

  const orderText = order.items
    .map((item) => `${item.quantity} ${item.uom} - Product #${item.productId}`)
    .join('\n')

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .insert({
      job_id: order.jobId,
      supplier_name: `${supplierLabel} (API)`,
      supplier_email: null,
      order_text: `Confirmation: ${result.confirmationNumber}\n\n${orderText}`,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(`Order placed but failed to save locally: ${error.message}`)

  return {
    confirmationNumber: result.confirmationNumber,
    localOrderId: (po as PurchaseOrder).id,
  }
}

export async function searchSupplierBranches(
  supplierType: SupplierType,
  zip: string
): Promise<SupplierBranch[]> {
  await getUserWithCompany()

  if (!zip.trim() || zip.length < 5) return []

  const { getSupplierClient } = await import('@/lib/suppliers')
  const client = getSupplierClient(supplierType)
  if (!client) throw new Error(`Supplier "${supplierType}" is not configured`)

  const results = await client.searchBranches(zip)
  return (results as any[]).map((b: any) => ({
    id: b.branchNumber || b.branchId || b.id || '',
    name: b.name || '',
    address: b.address || '',
    city: b.city || '',
    state: b.state || '',
    phone: b.phone || '',
  }))
}

export async function emailSupplierOrder(
  jobId: string,
  supplierEmail: string,
  senderCompanyName?: string
): Promise<boolean> {
  const { companyId } = await getUserWithCompany()
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    throw new Error('Email service not configured — RESEND_API_KEY is missing')
  }

  // Ensure valid email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierEmail)) {
    throw new Error(`Invalid supplier email address: ${supplierEmail}`)
  }

  // Fetch job scoped to user's company
  const supabase = await createClient()
  const { data: job } = await supabase
    .from('jobs')
    .select('job_number, company_id, companies(name)')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single()

  const jobNumber = job?.job_number || jobId
  const companyName = (senderCompanyName || (job?.companies as any)?.name || 'Roofing Company').replace(/[\r\n]/g, '')

  // Rate-limit: reject if a PO was already sent for this job in the last 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recentOrders } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('job_id', jobId)
    .eq('status', 'sent')
    .gte('sent_at', fiveMinAgo)

  if (recentOrders && recentOrders.length > 0) {
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

  // Create purchase order record (best-effort — email already sent)
  try {
    const po = await createPurchaseOrder(jobId, companyName, supplierEmail, text)
    await updatePurchaseOrderStatus(po.id, 'sent')
  } catch (err) {
    console.error('[supplier] PO record creation failed after email sent:', err)
  }

  return true
}
