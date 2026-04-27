/**
 * Follow-up → Google Calendar sync.
 *
 * Mirrors the inline pattern in lib/actions/jobs.ts but lives in its own
 * file because follow-ups can flow from multiple call sites (manual create,
 * automation rules, future paths) — keeping the sync logic in one place
 * means each caller only needs a one-liner.
 *
 * Entry points: syncFollowUpToCalendar (after insert) +
 * removeFollowUpFromCalendar (when marking complete or deleting).
 *
 * Both are best-effort: any Google API failure is caught and logged but
 * never propagates back to break the primary mutation. The user's follow-up
 * still saves correctly even if Calendar is broken.
 */

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  type GoogleEventBody,
} from '@/lib/google-calendar'

// Google Calendar color ID for follow-ups: 6 = orange ("Tangerine")
// Distinct from job colors (which vary by job_type) so follow-ups stand
// out visually on a calendar that contains both. Mario picked B (different
// color) on the Stage 2 design questions.
const FOLLOW_UP_COLOR_ID = '6'

// Maximum length of the note that goes into the calendar event title.
// Keeps the title scannable on Google's day view; full note is in the
// description regardless.
const NOTE_TITLE_MAX = 60

interface FollowUpSyncContext {
  followUpId: string
  jobId: string
  dueDate: string
  note: string
  userId: string  // who is saving this — used to fetch their Google access token
}

/**
 * Create a Google Calendar event for a newly-saved follow-up and write the
 * event ID back to follow_ups.calendar_event_id.
 *
 * Looks up the related job's company to route to the right calendar:
 *   companies.jobs_calendar_id ?? calendar_id ?? 'primary'
 * (Same fallback chain as job events. Follow-ups are work tasks, so we
 * reuse the jobs calendar — no separate "follow-ups calendar" config exists.)
 *
 * Returns the event ID on success, null otherwise. The caller doesn't need
 * the return value to behave correctly; it's only useful for logging.
 */
export async function syncFollowUpToCalendar(
  ctx: FollowUpSyncContext
): Promise<string | null> {
  try {
    const supabase = await createClient()

    // Fetch job + company calendar config in one round-trip
    const { data: jobData } = await supabase
      .from('jobs')
      .select('job_number, customer_name, phone, company_id')
      .eq('id', ctx.jobId)
      .single()

    if (!jobData) {
      console.warn(
        `[follow-up sync] follow-up ${ctx.followUpId}: job ${ctx.jobId} not found, skipping calendar sync`
      )
      return null
    }

    const { data: companyData } = await supabase
      .from('companies')
      .select('calendar_id, jobs_calendar_id')
      .eq('id', jobData.company_id)
      .single()

    const calendarId =
      companyData?.jobs_calendar_id ?? companyData?.calendar_id ?? 'primary'

    const body = buildFollowUpEventBody({
      followUpId: ctx.followUpId,
      jobId: ctx.jobId,
      jobNumber: jobData.job_number,
      customerName: jobData.customer_name,
      customerPhone: jobData.phone ?? null,
      dueDate: ctx.dueDate,
      note: ctx.note,
    })

    const eventId = await createGoogleEvent(
      ctx.userId,
      calendarId,
      body,
      `follow_up:${ctx.followUpId.slice(0, 8)}`
    )

    if (!eventId) {
      // createGoogleEvent already logged the specifics; nothing else to do.
      return null
    }

    const { error: updateErr } = await supabase
      .from('follow_ups')
      .update({ calendar_event_id: eventId })
      .eq('id', ctx.followUpId)

    if (updateErr) {
      console.warn(
        `[follow-up sync] wrote event to Google but failed to persist event_id back to DB: ${updateErr.message}`
      )
    }

    return eventId
  } catch (err) {
    console.error('[follow-up sync] unexpected error in syncFollowUpToCalendar:', err)
    return null
  }
}

/**
 * Delete a follow-up's Google Calendar event and clear the stored event_id.
 * Called when a follow-up is marked complete or deleted.
 *
 * Looks up the calendar_event_id and the company's calendar in one query.
 * If the event_id is null (follow-up was created before sync existed, or
 * the original sync failed), there's nothing to do — return silently.
 */
export async function removeFollowUpFromCalendar(
  followUpId: string,
  userId: string
): Promise<void> {
  try {
    const supabase = await createClient()

    const { data } = await supabase
      .from('follow_ups')
      .select(
        'calendar_event_id, job:jobs!follow_ups_job_id_fkey(company_id, company:companies!jobs_company_id_fkey(calendar_id, jobs_calendar_id))'
      )
      .eq('id', followUpId)
      .single()

    if (!data?.calendar_event_id) {
      return // Nothing to delete (never synced or already cleared)
    }

    // The nested join is typed loosely; pick out fields with care
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const company = (data.job as any)?.company
    const calendarId =
      company?.jobs_calendar_id ?? company?.calendar_id ?? 'primary'

    await deleteGoogleEvent(
      userId,
      calendarId,
      data.calendar_event_id,
      `follow_up:${followUpId.slice(0, 8)}`
    )

    // Clear regardless of whether Google delete succeeded — we don't want
    // to keep retrying on every status change of an event that's already
    // gone (404 from Google is treated as success in deleteGoogleEvent).
    await supabase
      .from('follow_ups')
      .update({ calendar_event_id: null })
      .eq('id', followUpId)
  } catch (err) {
    console.error('[follow-up sync] unexpected error in removeFollowUpFromCalendar:', err)
  }
}

/**
 * Build the GoogleEventBody for a follow-up.
 *
 * All-day event on `due_date`. Summary uses an emoji prefix for visual
 * scannability on Google's day view + the customer name + a truncated
 * version of the note. Description has the full note plus links.
 */
function buildFollowUpEventBody(args: {
  followUpId: string
  jobId: string
  jobNumber: string
  customerName: string
  customerPhone: string | null
  dueDate: string
  note: string
}): GoogleEventBody {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const deepLink = `${appUrl}/jobs/${args.jobId}`

  const noteSnippet =
    args.note.length > NOTE_TITLE_MAX
      ? `${args.note.slice(0, NOTE_TITLE_MAX - 1)}…`
      : args.note

  const summary = `📞 Follow-up: ${args.customerName} — ${noteSnippet}`

  const description = [
    `Customer: ${args.customerName}`,
    args.customerPhone ? `Phone: ${args.customerPhone}` : null,
    `Job #: ${args.jobNumber}`,
    ``,
    `Note:`,
    args.note,
    ``,
    `View in CRM: ${deepLink}`,
  ]
    .filter((line) => line !== null)
    .join('\n')

  return {
    summary,
    description,
    start: { date: args.dueDate },
    end: { date: args.dueDate },
    colorId: FOLLOW_UP_COLOR_ID,
  }
}
