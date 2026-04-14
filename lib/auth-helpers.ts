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

/** Roles with management access. Order: owner > office_manager.
 *  Note: legacy 'manager' / 'admin' roles are no longer recognized — they were
 *  removed when the role model was simplified to: owner, office_manager, sales, crew. */
const MANAGER_ROLES = ['owner', 'office_manager']

/** Require management-level role or throw */
export function requireManager(role: string | null) {
  if (!role || !MANAGER_ROLES.includes(role)) throw new Error('Only managers can perform this action')
}

/** Require owner role specifically */
export function requireOwner(role: string | null) {
  if (role !== 'owner') throw new Error('Only owners can perform this action')
}

/** Check if a role has management access */
export function isManagerRole(role: string | null): boolean {
  return !!role && MANAGER_ROLES.includes(role)
}

/** Roles allowed to edit job rows / change job status. Crew is read-only. */
const JOB_EDITOR_ROLES = ['owner', 'office_manager']

/** Require ability to edit a job (status, fields, etc.). Crew and sales are blocked. */
export function requireJobEditor(role: string | null) {
  if (!role || !JOB_EDITOR_ROLES.includes(role)) {
    throw new Error('You do not have permission to edit jobs')
  }
}

/** Roles allowed to edit estimates. Sales can edit estimates; crew cannot. */
const ESTIMATE_EDITOR_ROLES = ['owner', 'office_manager', 'sales']

/** Require ability to edit an estimate. Crew is blocked. */
export function requireEstimateEditor(role: string | null) {
  if (!role || !ESTIMATE_EDITOR_ROLES.includes(role)) {
    throw new Error('You do not have permission to edit estimates')
  }
}

/** Wrap a Supabase error for client display (hides internal details, logs full error server-side) */
export function safeError(prefix: string, error: { message?: string } | null): Error {
  if (error?.message) console.error(`[${prefix}]`, error.message)
  return new Error(prefix)
}

/**
 * Sanitize a string for use in email headers.
 *
 * Audit R4-#5: previously only stripped control chars, but the `from:`
 * header in lib/actions/invoicing.ts is built as
 * `${companyName} <${fromEmail}>` — an RFC-5322 display-name + angle-addr
 * pair. A company name containing `<`, `>`, or `"` can break the parse
 * and cause mail transfer agents / Resend to interpret the string as a
 * different email address. Example exploit: a company name of
 * `Acme <hacker@evil.com>` produces the header
 * `From: Acme <hacker@evil.com> <onboarding@resend.dev>` — the outer
 * angle-addr takes precedence on some parsers and the envelope From
 * becomes hacker@evil.com.
 *
 * Strip everything that has any meaning in an email header: control
 * chars (newline-based header injection), angle brackets (angle-addr
 * delimiters), double-quotes (display-name quoting), semicolon and
 * comma (address-list separators), and colon (header delimiter).
 */
export function sanitizeEmailName(name: string): string {
  return name.replace(/[\r\n\t\x00-\x1f<>"';,:]/g, '').trim()
}

/**
 * Sanitize a string for use in an email subject line or other header
 * field value where multi-line injection is the primary concern. Unlike
 * sanitizeEmailName, this preserves characters that are legal in a
 * subject line (angle brackets, commas, colons) but still strips
 * newline-based injection vectors.
 *
 * Audit R4-#6: invoice numbers flowed into the Subject: header via
 * `subject: \`Invoice ${safeInvoiceNumber}...\``. escapeHtml was applied
 * but does not strip `\r\n`. A user-set invoice number containing
 * `INV-1\r\nBcc: leak@x.com` would inject a BCC header. Applied at every
 * Subject: interpolation site in lib/actions/invoicing.ts.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\x00-\x1f]/g, '').trim()
}

/**
 * Sanitize a single template variable interpolated into an SMS body.
 *
 * Audit R4-#8: customer names and company names flowed raw into SMS
 * templates in lib/actions/messages.ts and lib/actions/post-job.ts.
 * User-controlled newlines and control chars in those fields cause:
 *   - Display garbling on the recipient's phone (brand-tanking)
 *   - SMS segmentation into multiple billed messages
 *   - Some carriers dropping the message as spam (silent failure,
 *     Twilio reports success)
 *   - Template line-count assumptions breaking if the template
 *     uses \n-delimited sections
 *
 * Strip CR/LF + control chars + collapse any run of whitespace (including
 * tabs and Unicode space chars) into a single regular space. Preserves
 * the semantic content while making the field safe for one-line-per-field
 * template assumptions.
 */
export function sanitizeSmsField(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/[\r\n\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
