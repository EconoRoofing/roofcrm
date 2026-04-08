// Internal automation engine — NOT a 'use server' file.
// This keeps processAutomationRules out of the server action surface
// while allowing server-side callers (jobs.ts, invoicing.ts) to use it.

import { createClient } from '@/lib/supabase/server'
import { escapeHtml } from '@/lib/auth-helpers'
import { sendSMS } from '@/lib/twilio'
import { createFollowUp } from '@/lib/actions/follow-up-tasks'
import { Resend } from 'resend'

// Module-level guards against infinite automation loops
const processingJobs = new Set<string>()
const MAX_AUTOMATION_DEPTH = 3

interface AutomationRule {
  id: string
  name: string
  trigger_type: string
  trigger_value: string | null
  action_type: string
  action_config: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export async function processAutomationRules(
  trigger: 'status_change' | 'job_created' | 'estimate_sent' | 'payment_received' | 'invoice_created' | 'job_completed' | 'crew_assigned',
  jobId: string,
  triggerValue?: string,
  depth = 0
) {
  // Guard against infinite recursion
  if (depth >= MAX_AUTOMATION_DEPTH) {
    console.warn(`Automation depth limit reached for job ${jobId}`)
    return
  }
  if (processingJobs.has(jobId)) {
    console.warn(`Automation already processing for job ${jobId}`)
    return
  }
  processingJobs.add(jobId)

  try {
    const supabase = await createClient()

    // Fetch job with company info
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, company_id, customer_name, phone, email, status, rep_id, do_not_text, job_number')
      .eq('id', jobId)
      .single()

    if (jobError || !job) return // Silent fail for async processing

    // Fetch matching active automation rules, filtering by trigger_value
    let query = supabase
      .from('automation_rules')
      .select('*')
      .eq('company_id', job.company_id)
      .eq('trigger_type', trigger)
      .eq('is_active', true)

    if (triggerValue) {
      // Sanitize triggerValue to prevent PostgREST filter injection (strip commas, parens, dots that aren't part of values)
      const safeTriggerValue = triggerValue.replace(/[^a-zA-Z0-9_\-]/g, '')
      query = query.or(`trigger_value.eq.${safeTriggerValue},trigger_value.is.null`)
    } else {
      query = query.is('trigger_value', null)
    }

    const { data: rules, error: rulesError } = await query.limit(50)

    if (rulesError || !rules || rules.length === 0) return

    // Process all matching rules in parallel — faster than sequential and failures are isolated
    await Promise.allSettled(
      rules.map(rule => executeAutomationAction(rule, job, triggerValue, depth))
    )
  } finally {
    processingJobs.delete(jobId)
  }
}

async function executeAutomationAction(
  rule: AutomationRule,
  job: {
    id: string
    company_id: string
    customer_name: string
    phone: string | null
    email: string | null
    status: string
    rep_id?: string | null
    do_not_text?: boolean
    job_number?: string | null
  },
  triggerValue?: string,
  depth = 0
) {
  const config = rule.action_config as Record<string, unknown>
  const supabase = await createClient()
  let success = false

  const replaceTemplateVars = (template: string) =>
    template.replace(
      /\{customer_name\}|\{status\}|\{phone\}|\{email\}|\{job_number\}/g,
      (match) => {
        if (match === '{customer_name}') return job.customer_name
        if (match === '{status}') return job.status.replace(/_/g, ' ')
        if (match === '{phone}') return job.phone ?? ''
        if (match === '{email}') return job.email ?? ''
        if (match === '{job_number}') return job.job_number ?? ''
        return match
      }
    )

  try {
    // Handle delayed actions — schedule as a follow-up instead of executing immediately
    if (config.delay_minutes && typeof config.delay_minutes === 'number' && config.delay_minutes > 0) {
      const dueDate = new Date()
      dueDate.setMinutes(dueDate.getMinutes() + config.delay_minutes)
      if (job.rep_id) {
        await createFollowUp(
          job.id,
          job.rep_id,
          dueDate.toISOString().split('T')[0],
          `Automation: ${rule.name}`
        ).catch(() => {})
      }
      success = true

      // Log execution
      try {
        await supabase.from('activity_log').insert({
          job_id: job.id,
          user_id: null,
          action: 'automation_executed',
          old_value: rule.name,
          new_value: JSON.stringify({ action_type: 'delayed_follow_up', rule_id: rule.id, delay_minutes: config.delay_minutes }),
        })
      } catch (err) {
        console.warn('[automations] delayed action activity log failed:', err)
      }
      return
    }

    switch (rule.action_type) {
    case 'send_sms': {
      if (!job.phone || job.do_not_text) {
        success = true // skipped — not a failure
        return
      }
      const template = config.message_template as string | undefined
      const message = template ? replaceTemplateVars(template) : null
      if (message) {
        await sendSMS(job.phone, message)
      }
      break
    }

    case 'create_follow_up': {
      const dueDate = new Date()
      const daysOffset = (config.days_offset as number) || 3
      dueDate.setDate(dueDate.getDate() + daysOffset)

      // Use config assigned_to, fall back to the job's rep_id
      const repId = (config.assigned_to as string) || job.rep_id || null
      if (repId) {
        await createFollowUp(
          job.id,
          repId,
          dueDate.toISOString().split('T')[0],
          (config.description as string) || `Follow up: ${job.customer_name}`
        ).catch(() => {})
      }
      break
    }

    case 'send_email': {
      if (!job.email) {
        success = true // skipped — not a failure
        return
      }
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) {
        success = true // skipped — not a failure
        return
      }
      const resend = new Resend(resendKey)
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
      const subject = replaceTemplateVars(
        (config.subject as string) || `Update on your project, ${job.customer_name}`
      )
      const body = replaceTemplateVars(
        (config.email_body as string) || `Hello ${job.customer_name}, this is an automated update regarding your roofing project.`
      )
      const safeBody = escapeHtml(body).replace(/\n/g, '<br>')
      const safeSubject = escapeHtml(subject)
      await resend.emails.send({
        from: `Roofing Company <${fromEmail}>`,
        to: job.email,
        subject: safeSubject,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><p>${safeBody}</p></div>`,
      })
      break
    }

    case 'assign_crew': {
      const crewId = config.crew_id as string
      if (!crewId) {
        success = true // skipped — not a failure
        return
      }
      // Verify crew member belongs to the same company as the job
      const { data: crewUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', crewId)
        .eq('primary_company_id', job.company_id)
        .maybeSingle()
      if (!crewUser) {
        throw new Error('Crew member not found in this company')
      }
      const { error: crewError } = await supabase
        .from('jobs')
        .update({ assigned_crew_id: crewId })
        .eq('id', job.id)
      if (crewError) throw new Error(`Failed to assign crew: ${crewError.message}`)
      break
    }

    case 'update_status': {
      const VALID_STATUSES = ['new', 'pending', 'sold', 'scheduled', 'in_progress', 'completed', 'cancelled']
      const newStatus = config.new_status as string
      if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`)
      }
      const { error: statusError } = await supabase
        .from('jobs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', job.id)
      if (statusError) throw new Error(`Failed to update status: ${statusError.message}`)

      // Chain automations — fire status_change trigger for downstream rules
      await processAutomationRules('status_change', job.id, newStatus, depth + 1)
      break
    }

    case 'send_webhook': {
      const webhookUrl = config.webhook_url as string
      if (!webhookUrl || !webhookUrl.startsWith('https://')) {
        throw new Error('Webhook URL must start with https://')
      }
      // SSRF prevention: block internal/private/metadata endpoints
      const blockedPatterns = [
        /^https?:\/\/localhost/i,
        /^https?:\/\/127\./,
        /^https?:\/\/\[::1\]/,
        /^https?:\/\/10\./,
        /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
        /^https?:\/\/192\.168\./,
        /^https?:\/\/169\.254\./,
        /^https?:\/\/metadata\./i,
        /^https?:\/\/0\./,
      ]
      if (blockedPatterns.some(p => p.test(webhookUrl))) {
        throw new Error('Webhook URL cannot target internal or private networks')
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: rule.trigger_type,
            job_id: job.id,
            customer_name: job.customer_name,
            status: job.status,
            job_number: job.job_number ?? null,
            timestamp: new Date().toISOString(),
          }),
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Webhook returned ${response.status}`)
        }
      } finally {
        clearTimeout(timeout)
      }
      break
    }
    }
    success = true
  } catch (err) {
    console.error(`Automation rule "${rule.name}" failed:`, err)
    success = false
  } finally {
    // Log execution to activity_log for history
    try {
      await supabase.from('activity_log').insert({
        job_id: job.id,
        user_id: null,
        action: 'automation_executed',
        old_value: rule.name,
        new_value: JSON.stringify({ action_type: rule.action_type, rule_id: rule.id, success }),
      })
    } catch (err) {
      console.warn('[automations] execution log failed:', err)
    }
  }
}
