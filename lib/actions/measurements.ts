'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership } from '@/lib/auth-helpers'
import { logActivity } from '@/lib/actions/activity'
import { generateMaterialList } from '@/lib/actions/materials'

// ─── Types ───────────────────────────────────────────────────────────────────

export type MeasurementProvider = 'eagleview' | 'hover' | 'manual'

export interface MeasurementProviderInfo {
  id: MeasurementProvider
  name: string
  configured: boolean
}

export interface MeasurementOrder {
  id: string
  job_id: string
  provider: MeasurementProvider
  provider_order_id: string
  status: 'ordered' | 'processing' | 'complete' | 'failed'
  report_url: string | null
  measurement_data: Record<string, any> | null
  created_at: string
  updated_at: string
}

// ─── Provider Availability ───────────────────────────────────────────────────

/** Returns which measurement integrations are configured */
export async function getAvailableMeasurementProviders(): Promise<MeasurementProviderInfo[]> {
  await getUserWithCompany()

  const providers: MeasurementProviderInfo[] = [
    { id: 'manual', name: 'Manual Entry', configured: true },
  ]

  try {
    const eagleview = await import('@/lib/integrations/eagleview')
    providers.unshift({
      id: 'eagleview',
      name: 'EagleView',
      configured: eagleview.isConfigured(),
    })
  } catch {
    providers.unshift({ id: 'eagleview', name: 'EagleView', configured: false })
  }

  try {
    const hover = await import('@/lib/integrations/hover')
    providers.unshift({
      id: 'hover',
      name: 'HOVER',
      configured: hover.isConfigured(),
    })
  } catch {
    providers.unshift({ id: 'hover', name: 'HOVER', configured: false })
  }

  return providers
}

// ─── Order Measurement ───────────────────────────────────────────────────────

/** Place a measurement order with EagleView or HOVER */
export async function orderMeasurement(
  jobId: string,
  provider: 'eagleview' | 'hover',
  reportType?: 'roof' | 'walls' | 'full'
): Promise<MeasurementOrder> {
  const { companyId, userId } = await getUserWithCompany()
  const job = await verifyJobOwnership(jobId, companyId)

  const address = job.address || ''
  const city = job.city || ''
  const state = job.state || ''
  const zip = job.zip || ''

  if (!address || !city || !state || !zip) {
    throw new Error('Job must have a complete address to order measurements')
  }

  let providerOrderId: string
  let status: 'ordered' | 'processing' = 'ordered'

  if (provider === 'eagleview') {
    const ev = await import('@/lib/integrations/eagleview')
    if (!ev.isConfigured()) throw new Error('EagleView is not configured')
    const result = await ev.orderMeasurement(address, city, state, zip, reportType ?? 'roof')
    providerOrderId = result.orderId
  } else {
    const hv = await import('@/lib/integrations/hover')
    if (!hv.isConfigured()) throw new Error('HOVER is not configured')
    const result = await hv.createJob(address, city, state, zip)
    providerOrderId = result.jobId
  }

  // Store measurement order on the job
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('measurement_orders')
    .insert({
      job_id: jobId,
      provider,
      provider_order_id: providerOrderId,
      status,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to store measurement order: ${error.message}`)

  await logActivity(
    jobId,
    userId,
    `Ordered ${provider === 'eagleview' ? 'EagleView' : 'HOVER'} measurement`,
    null,
    providerOrderId
  )

  return data as MeasurementOrder
}

// ─── Check Status ────────────────────────────────────────────────────────────

/** Check the status of a pending measurement order */
export async function checkMeasurementStatus(jobId: string): Promise<MeasurementOrder | null> {
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

  const supabase = await createClient()
  const { data: order, error } = await supabase
    .from('measurement_orders')
    .select('*')
    .eq('job_id', jobId)
    .in('status', ['ordered', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch measurement order: ${error.message}`)
  if (!order) return null

  const mo = order as MeasurementOrder
  let newStatus = mo.status
  let reportUrl: string | undefined

  if (mo.provider === 'eagleview') {
    const ev = await import('@/lib/integrations/eagleview')
    const result = await ev.getMeasurementStatus(mo.provider_order_id)
    newStatus = result.status
    reportUrl = result.reportUrl
  } else if (mo.provider === 'hover') {
    const hv = await import('@/lib/integrations/hover')
    const result = await hv.getJobStatus(mo.provider_order_id)
    newStatus = result.status === 'complete' ? 'complete' : result.status === 'processing' ? 'processing' : 'ordered'
    reportUrl = result.modelUrl
  }

  // Update local record if status changed
  if (newStatus !== mo.status) {
    const update: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }
    if (reportUrl) update.report_url = reportUrl

    await supabase
      .from('measurement_orders')
      .update(update)
      .eq('id', mo.id)

    mo.status = newStatus as MeasurementOrder['status']
    if (reportUrl) mo.report_url = reportUrl
  }

  return mo
}

// ─── Import Measurements ─────────────────────────────────────────────────────

/** Import completed measurement data into the job and auto-generate material list */
export async function importMeasurements(jobId: string): Promise<{ squares: number; pitch: number | null }> {
  const { companyId, userId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

  const supabase = await createClient()
  const { data: order, error: orderError } = await supabase
    .from('measurement_orders')
    .select('*')
    .eq('job_id', jobId)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (orderError) throw new Error(`Failed to fetch measurement order: ${orderError.message}`)
  if (!order) throw new Error('No completed measurement found for this job')

  const mo = order as MeasurementOrder
  let squares = 0
  let pitch: number | null = null
  let measurementData: Record<string, any> = {}

  if (mo.provider === 'eagleview') {
    const ev = await import('@/lib/integrations/eagleview')
    const report = await ev.getMeasurementReport(mo.provider_order_id)
    squares = report.totalSquares
    pitch = report.roofFacets.length > 0
      ? Math.round(report.roofFacets.reduce((sum, f) => sum + f.pitch, 0) / report.roofFacets.length)
      : null
    measurementData = report
  } else if (mo.provider === 'hover') {
    const hv = await import('@/lib/integrations/hover')
    const measurements = await hv.getMeasurements(mo.provider_order_id)
    squares = Math.round((measurements.totalArea / 100) * 100) / 100 // sq ft to squares
    pitch = measurements.pitch
    measurementData = measurements
  }

  // Update job with measurement data
  const jobUpdate: Record<string, unknown> = { squares }
  if (pitch !== null) jobUpdate.pitch = pitch

  const { error: jobError } = await supabase
    .from('jobs')
    .update(jobUpdate)
    .eq('id', jobId)

  if (jobError) throw new Error(`Failed to update job with measurements: ${jobError.message}`)

  // Store raw measurement data on the order
  await supabase
    .from('measurement_orders')
    .update({ measurement_data: measurementData })
    .eq('id', mo.id)

  // Auto-generate material list with new measurements
  try {
    await generateMaterialList(jobId)
  } catch {
    // Non-fatal — measurements are still imported
    console.error('[measurements] Auto material list generation failed for job', jobId)
  }

  await logActivity(
    jobId,
    userId,
    `Imported ${mo.provider === 'eagleview' ? 'EagleView' : 'HOVER'} measurements`,
    null,
    `${squares} squares` + (pitch !== null ? `, ${pitch}/12 pitch` : '')
  )

  return { squares, pitch }
}

// ─── History ─────────────────────────────────────────────────────────────────

/** Returns all measurement orders for a job */
export async function getMeasurementHistory(jobId: string): Promise<MeasurementOrder[]> {
  const { companyId } = await getUserWithCompany()
  await verifyJobOwnership(jobId, companyId)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('measurement_orders')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`Failed to fetch measurement history: ${error.message}`)
  return (data ?? []) as MeasurementOrder[]
}
