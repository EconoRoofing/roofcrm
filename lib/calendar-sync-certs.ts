/**
 * Certification renewal → Google Calendar sync.
 *
 * When a cert with an expiry_date is added, we drop a single reminder event
 * on the company calendar 30 days before expiry. The event has a clear
 * actionable title ("⚠️ Renew: <cert>") and a description that links to
 * the cert document if one's on file.
 *
 * Why ONE reminder, not a cascade (1 month / 1 week / 1 day):
 * Per Mario's Stage 2 design choice — fewer events = harder to dismiss.
 * Easy to add more lead times later if a single 30-day notice misses.
 *
 * Why no UPDATE handler:
 * lib/actions/safety.ts has no updateCertification function — certs are
 * insert-once / delete-or-leave-stale. If that changes later we'd add an
 * update sync that compares old vs new expiry_date and PATCHes the event.
 */

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  type GoogleEventBody,
} from '@/lib/google-calendar'

// Google Calendar color ID for cert renewals: 11 = red ("Tomato").
// Visually urgent — cert renewals are deadline-driven and missing one can
// mean fines or suspended work, so they should pop out from job blue +
// follow-up orange.
const CERT_RENEWAL_COLOR_ID = '11'

// Days before expiry to fire the reminder. If you change this, also change
// the comment in the migration file's reasoning. 30 is a balance of "enough
// lead time to actually file paperwork" and "not so far out you forget."
const REMINDER_LEAD_DAYS = 30

interface CertSyncContext {
  certId: string
  companyId: string
  certName: string
  certNumber: string | null
  expiryDate: string  // YYYY-MM-DD
  documentUrl: string | null
  userId: string  // who is saving — used to fetch their Google access token
}

/**
 * Create a Google Calendar reminder event for a cert with an expiry_date.
 *
 * Returns null (and skips silently) if:
 *   - reminderDate (expiry - 30d) is in the past — the cert is already
 *     within its renewal window or expired; we don't add stale reminders
 *   - the company has no calendar configured at all (falls back to 'primary'
 *     which writes to the user's personal calendar — still works, just
 *     ends up in their personal view instead of the company's shared one)
 *
 * Writes the returned event_id back to certifications.calendar_event_id.
 */
export async function syncCertReminderToCalendar(
  ctx: CertSyncContext
): Promise<string | null> {
  try {
    // Compute reminder date = expiry - 30 days
    const expiry = new Date(ctx.expiryDate)
    if (isNaN(expiry.getTime())) {
      console.warn(
        `[cert sync] cert ${ctx.certId}: invalid expiry_date "${ctx.expiryDate}", skipping`
      )
      return null
    }
    const reminderDate = new Date(expiry)
    reminderDate.setDate(reminderDate.getDate() - REMINDER_LEAD_DAYS)

    // Skip if reminder date is in the past — cert is already inside the
    // renewal window or expired. Adding a calendar event in the past is
    // pure noise.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (reminderDate < today) {
      console.log(
        `[cert sync] cert ${ctx.certId} (${ctx.certName}) expires ${ctx.expiryDate} — reminder date ${reminderDate.toISOString().slice(0, 10)} is in the past, skipping calendar sync`
      )
      return null
    }

    const supabase = await createClient()

    const { data: companyData } = await supabase
      .from('companies')
      .select('calendar_id, jobs_calendar_id')
      .eq('id', ctx.companyId)
      .single()

    const calendarId =
      companyData?.jobs_calendar_id ?? companyData?.calendar_id ?? 'primary'

    const reminderDateStr = reminderDate.toISOString().slice(0, 10)
    const body = buildCertReminderEventBody({
      certName: ctx.certName,
      certNumber: ctx.certNumber,
      expiryDate: ctx.expiryDate,
      reminderDate: reminderDateStr,
      documentUrl: ctx.documentUrl,
    })

    const eventId = await createGoogleEvent(
      ctx.userId,
      calendarId,
      body,
      `cert_renewal:${ctx.certId.slice(0, 8)}`
    )

    if (!eventId) return null

    const { error: updateErr } = await supabase
      .from('certifications')
      .update({ calendar_event_id: eventId })
      .eq('id', ctx.certId)

    if (updateErr) {
      console.warn(
        `[cert sync] wrote event to Google but failed to persist event_id back to DB: ${updateErr.message}`
      )
    }

    return eventId
  } catch (err) {
    console.error('[cert sync] unexpected error in syncCertReminderToCalendar:', err)
    return null
  }
}

/**
 * Delete a cert's Google Calendar reminder event.
 * Called from deleteCertification — by the time this runs the row is gone,
 * so the caller passes the eventId + companyId directly (we can't look them
 * up afterwards).
 */
export async function removeCertReminderFromCalendar(args: {
  certId: string
  calendarEventId: string
  companyId: string
  userId: string
}): Promise<void> {
  try {
    if (!args.calendarEventId) return

    const supabase = await createClient()
    const { data: companyData } = await supabase
      .from('companies')
      .select('calendar_id, jobs_calendar_id')
      .eq('id', args.companyId)
      .single()

    const calendarId =
      companyData?.jobs_calendar_id ?? companyData?.calendar_id ?? 'primary'

    await deleteGoogleEvent(
      args.userId,
      calendarId,
      args.calendarEventId,
      `cert_renewal:${args.certId.slice(0, 8)}`
    )
  } catch (err) {
    console.error('[cert sync] unexpected error in removeCertReminderFromCalendar:', err)
  }
}

function buildCertReminderEventBody(args: {
  certName: string
  certNumber: string | null
  expiryDate: string
  reminderDate: string
  documentUrl: string | null
}): GoogleEventBody {
  const summary = `⚠️ Renew: ${args.certName} — expires ${args.expiryDate}`

  const description = [
    `Certification: ${args.certName}`,
    args.certNumber ? `Cert #: ${args.certNumber}` : null,
    `Expires: ${args.expiryDate}`,
    `Lead time: 30 days before expiry`,
    ``,
    args.documentUrl ? `Current document: ${args.documentUrl}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n')

  return {
    summary,
    description,
    start: { date: args.reminderDate },
    end: { date: args.reminderDate },
    colorId: CERT_RENEWAL_COLOR_ID,
  }
}
