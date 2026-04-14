'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, requireEstimateEditor } from '@/lib/auth-helpers'
import { randomBytes } from 'crypto'

// ─── Portal rate limiting ────────────────────────────────────────────────────
// Audit finding #35. `/portal/[token]` is unauthenticated (token-gated), so a
// token holder could previously flood `sendPortalMessage` / `requestBooking`
// with arbitrary content. This module-level sliding-window limiter caps
// writes per token to LIMIT requests per WINDOW_MS.
//
// Module state is per-serverless-instance — Vercel spreads traffic across
// instances, so the effective cap is roughly LIMIT × instance_count. At the
// current scale (a handful of customers per portal) this is plenty. If this
// ever becomes insufficient, move to a Supabase-backed counter.

const WINDOW_MS = 60 * 1000 // 1 minute
const LIMIT_PER_WINDOW = 5   // messages or booking requests per token per minute

type RateLimitBucket = { timestamps: number[] }
const rateLimitBuckets = new Map<string, RateLimitBucket>()

/**
 * Record a portal write attempt and return `true` if it's within the limit,
 * `false` if the token has hit its cap. Sliding 60-second window: the entry
 * expires from the bucket once 60 seconds have passed.
 */
function checkPortalRateLimit(token: string): boolean {
  const now = Date.now()
  const cutoff = now - WINDOW_MS
  const bucket = rateLimitBuckets.get(token) ?? { timestamps: [] }
  // Drop expired entries
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff)
  if (bucket.timestamps.length >= LIMIT_PER_WINDOW) {
    rateLimitBuckets.set(token, bucket)
    return false
  }
  bucket.timestamps.push(now)
  rateLimitBuckets.set(token, bucket)

  // Opportunistic cleanup — purge buckets that are fully expired, so a burst
  // of one-time portal visits doesn't leak memory forever.
  if (rateLimitBuckets.size > 500) {
    for (const [key, b] of rateLimitBuckets.entries()) {
      if (b.timestamps.every((t) => t <= cutoff)) rateLimitBuckets.delete(key)
    }
  }
  return true
}

// Max characters for any user-generated portal content. Prevents a token
// holder from inserting megabytes of text into the messages / tasks tables.
const MAX_PORTAL_MESSAGE_CHARS = 2000
const MAX_PORTAL_NOTES_CHARS = 500

export async function generatePortalToken(jobId: string, forceRegenerate = false): Promise<string> {
  const { companyId, role } = await getUserWithCompany()

  // Sales + managers can mint/rotate portal tokens. Crew is blocked because
  // a force-regenerate would invalidate an active customer portal session.
  // The status_change side effect in jobs.ts also calls this with no caller
  // context — that path goes through updateJobStatus which is already gated
  // to managers, so by the time we reach here the role check is consistent.
  requireEstimateEditor(role)

  // Verify the job belongs to the caller's company
  await verifyJobOwnership(jobId, companyId)

  const supabase = await createClient()

  // If not forcing, return existing token to avoid invalidating active portal sessions
  if (!forceRegenerate) {
    const { data: existing } = await supabase
      .from('jobs')
      .select('portal_token')
      .eq('id', jobId)
      .single()

    if (existing?.portal_token) return existing.portal_token
  }

  // Generate new 32-char hex token
  const token = randomBytes(16).toString('hex')

  const { error } = await supabase
    .from('jobs')
    .update({ portal_token: token })
    .eq('id', jobId)

  if (error) {
    console.error('Failed to save portal token:', error)
    throw new Error('Failed to generate portal token')
  }

  return token
}

export async function getJobByPortalToken(token: string) {
  const supabase = await createClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .select(`
      id,
      job_number,
      status,
      customer_name,
      address,
      city,
      scheduled_date,
      completed_date,
      companies(name, phone, color, address)
    `)
    .eq('portal_token', token)
    .not('status', 'eq', 'cancelled')
    .single()

  if (error || !job) {
    return null
  }

  return job as any
}

export async function getPortalInvoices(token: string) {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('portal_token', token)
    .single()

  if (!job) return []

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, type, total_amount, status, due_date, payment_link, pdf_url')
    .eq('job_id', job.id)
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })

  return invoices ?? []
}

export async function getPortalMessages(token: string) {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('portal_token', token)
    .single()

  if (!job) return []

  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, body, created_at, channel')
    .eq('job_id', job.id)
    .order('created_at', { ascending: true })

  return messages ?? []
}

export async function sendPortalMessage(token: string, messageText: string): Promise<boolean> {
  const supabase = await createClient()

  const trimmed = messageText.trim()
  if (!trimmed) return false

  // Cap length — a portal token shouldn't be able to write megabytes
  const body = trimmed.slice(0, MAX_PORTAL_MESSAGE_CHARS)

  // Rate-limit per token. If the token is flooding, silently drop.
  if (!checkPortalRateLimit(token)) {
    console.warn('[portal] rate limit hit for sendPortalMessage')
    return false
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, customer_name, companies(name)')
    .eq('portal_token', token)
    .single()

  if (!job) return false

  // companyName kept for future notification fan-out; not used here yet
  void (job as { companies?: { name?: string } }).companies?.name

  await supabase.from('messages').insert({
    job_id: job.id,
    direction: 'inbound',
    channel: 'portal',
    body,
    status: 'received',
    auto_generated: false,
    from_number: null,
    to_number: null,
  })

  return true
}

export async function getPortalPhotos(token: string) {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, address, city, state, companycam_project_id')
    .eq('portal_token', token)
    .single()

  if (!job) return []

  // If we have a stored CompanyCam project ID use it directly
  const { getProjectPhotos, searchProjectsByAddress } = await import('@/lib/companycam')

  let projectId = (job as any).companycam_project_id as string | undefined

  if (!projectId) {
    const addressStr = [(job as any).address, (job as any).city, (job as any).state]
      .filter(Boolean)
      .join(', ')
    if (!addressStr) return []

    const { searchProjectsByAddress: search } = await import('@/lib/companycam')
    const projects = await search(addressStr)
    projectId = projects[0]?.id
  }

  if (!projectId) return []

  return getProjectPhotos(projectId, 30)
}

export async function getPortalPhotoGallery(token: string) {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, address, city, state, companycam_project_id')
    .eq('portal_token', token)
    .single()

  if (!job) return { categories: [], total: 0 }

  const { getProjectPhotos, searchProjectsByAddress } = await import('@/lib/companycam')

  let projectId = (job as any).companycam_project_id as string | undefined

  if (!projectId) {
    const addressStr = [(job as any).address, (job as any).city, (job as any).state]
      .filter(Boolean)
      .join(', ')
    if (!addressStr) return { categories: [], total: 0 }

    const projects = await searchProjectsByAddress(addressStr)
    projectId = projects[0]?.id
  }

  if (!projectId) return { categories: [], total: 0 }

  const photos = await getProjectPhotos(projectId, 100)

  // Group photos by tag/category
  const categoryMap = new Map<string, any[]>()
  for (const photo of photos) {
    const tags: string[] = (photo as any).tags ?? []
    const category = tags.length > 0 ? tags[0] : 'General'
    const existing = categoryMap.get(category) ?? []
    existing.push({
      id: (photo as any).id,
      url: (photo as any).uris?.original_url ?? (photo as any).uri ?? '',
      thumbnail: (photo as any).uris?.thumbnail_url ?? (photo as any).uri ?? '',
      caption: (photo as any).caption ?? '',
      taken_at: (photo as any).captured_at ?? (photo as any).created_at ?? '',
    })
    categoryMap.set(category, existing)
  }

  const categories = Array.from(categoryMap.entries())
    .map(([name, items]) => ({ name, photos: items, count: items.length }))
    .sort((a, b) => b.count - a.count)

  return { categories, total: photos.length }
}

export async function requestBooking(
  token: string,
  preferredDate: string,
  preferredTime: string,
  notes?: string
): Promise<boolean> {
  const supabase = await createClient()

  if (!preferredDate || !preferredTime) return false

  // Basic format validation — reject anything that isn't a plausible date/time
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) return false
  if (preferredTime.length > 32) return false

  // Cap notes length
  const safeNotes = notes?.trim().slice(0, MAX_PORTAL_NOTES_CHARS) ?? ''

  // Rate-limit per token
  if (!checkPortalRateLimit(token)) {
    console.warn('[portal] rate limit hit for requestBooking')
    return false
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, customer_name, rep_id, company_id')
    .eq('portal_token', token)
    .single()

  if (!job) return false

  // Create a follow-up task for the assigned rep.
  // Notes are already trimmed and capped above; dates are format-validated.
  const { error } = await supabase.from('tasks').insert({
    job_id: job.id,
    company_id: (job as any).company_id,
    assigned_to: (job as any).rep_id,
    title: `Booking request from ${(job as any).customer_name}`,
    description: [
      `Customer requested a follow-up visit via portal.`,
      `Preferred date: ${preferredDate}`,
      `Preferred time: ${preferredTime}`,
      safeNotes ? `Notes: ${safeNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    due_date: preferredDate,
    status: 'pending',
    priority: 'high',
  })

  if (error) {
    console.error('Failed to create booking request task:', error)
    return false
  }

  // Also log as an inbound portal message for visibility
  await supabase.from('messages').insert({
    job_id: job.id,
    direction: 'inbound',
    channel: 'portal',
    body: `Booking request: ${preferredDate} at ${preferredTime}${safeNotes ? ` — ${safeNotes}` : ''}`,
    status: 'received',
    auto_generated: false,
    from_number: null,
    to_number: null,
  })

  return true
}

export async function getPortalJobTimeline(token: string) {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select(
      'id, status, created_at, scheduled_date, completed_date, total_amount'
    )
    .eq('portal_token', token)
    .single()

  if (!job) return []

  // Define the canonical stages in order
  const stages = [
    { key: 'created', label: 'Job Created' },
    { key: 'estimate', label: 'Estimate Provided' },
    { key: 'sold', label: 'Approved / Sold' },
    { key: 'scheduled', label: 'Work Scheduled' },
    { key: 'in_progress', label: 'Work In Progress' },
    { key: 'completed', label: 'Completed' },
  ] as const

  // Map job statuses to stage progression
  const statusToStageIndex: Record<string, number> = {
    lead: 0,
    pending: 1,
    estimate_scheduled: 1,
    sold: 2,
    scheduled: 3,
    in_progress: 4,
    completed: 5,
  }

  const currentStageIndex = statusToStageIndex[job.status] ?? 0

  // Build timeline entries
  const timeline = stages.map((stage, index) => {
    let date: string | null = null
    if (index === 0) date = job.created_at
    if (stage.key === 'scheduled' && job.scheduled_date) date = job.scheduled_date
    if (stage.key === 'completed' && job.completed_date) date = job.completed_date

    return {
      stage: stage.key,
      label: stage.label,
      status:
        index < currentStageIndex
          ? ('completed' as const)
          : index === currentStageIndex
            ? ('current' as const)
            : ('upcoming' as const),
      date,
    }
  })

  return timeline
}
