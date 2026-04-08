import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'

interface UserProfile {
  id: string
  primary_company_id?: string
  company_id?: string
  role?: string
  [key: string]: unknown
}

/**
 * Get the authenticated user's company_id. Resolves via:
 * 1. primary_company_id on the user profile
 * 2. Fallback: first company where user is owner
 *
 * Throws if not authenticated or no company found.
 */
export async function getUserWithCompany() {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const profile = user as UserProfile

  // Profile record from users table should have company_id or primary_company_id
  const userId = profile.id
  const companyId = profile.primary_company_id || profile.company_id

  if (companyId) {
    return { user, userId, companyId, role: (profile.role ?? null) as string | null }
  }

  // Fallback: look up ownership
  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_id', userId)
    .limit(1)
    .single()

  if (!company) throw new Error('No company associated with this user')

  return { user, userId, companyId: company.id as string, role: (profile.role ?? null) as string | null }
}

/** Verify a job belongs to the user's company. Returns the job row. */
export async function verifyJobOwnership(jobId: string, companyId: string) {
  const supabase = await createClient()
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single()

  if (error || !job) throw new Error('Job not found or access denied')
  return job
}

/** Require manager or admin role or throw */
export function requireManager(role: string | null) {
  if (role !== 'manager' && role !== 'admin') throw new Error('Only managers can perform this action')
}

/** Wrap a Supabase error for client display (hides internal details, logs full error server-side) */
export function safeError(prefix: string, error: { message?: string } | null): Error {
  if (error?.message) console.error(`[${prefix}]`, error.message)
  return new Error(prefix)
}

/** Sanitize a string for use in email headers (strip control chars that could inject headers) */
export function sanitizeEmailName(name: string): string {
  return name.replace(/[\r\n\t\x00-\x1f]/g, '').trim()
}

/** Get today's date as YYYY-MM-DD in local timezone (not UTC) */
export function localDateString(date?: Date): string {
  const d = date ?? new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Sanitize a string for safe HTML insertion (email templates) */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
  )
}
