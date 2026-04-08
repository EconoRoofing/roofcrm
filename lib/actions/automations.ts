'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
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

export interface CreateAutomationData {
  company_id: string
  name: string
  trigger_type: 'status_change' | 'job_created' | 'estimate_sent' | 'payment_received'
  trigger_value?: string
  action_type: 'send_sms' | 'send_email' | 'create_follow_up' | 'assign_crew'
  action_config: Record<string, unknown>
}

export async function createAutomationRule(data: CreateAutomationData) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  // Only managers can create automation rules (prevents privilege escalation)
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userData?.role !== 'manager') throw new Error('Only managers can create automation rules')

  const { data: rule, error } = await supabase
    .from('automation_rules')
    .insert({
      company_id: data.company_id,
      name: data.name,
      trigger_type: data.trigger_type,
      trigger_value: data.trigger_value,
      action_type: data.action_type,
      action_config: data.action_config,
      is_active: true,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create automation rule: ${error.message}`)
  return rule
}

export async function getAutomationRules(company_id?: string) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  // If no company_id provided, look up the user's company server-side
  let resolvedCompanyId = company_id
  if (!resolvedCompanyId) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    resolvedCompanyId = company?.id
  }

  if (!resolvedCompanyId) throw new Error('Company not found')

  const { data: rules, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('company_id', resolvedCompanyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch automation rules: ${error.message}`)
  return rules || []
}

export async function updateAutomationRule(
  rule_id: string,
  updates: Partial<Omit<CreateAutomationData, 'company_id'>>
) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const payload: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  }

  const { data: rule, error } = await supabase
    .from('automation_rules')
    .update(payload)
    .eq('id', rule_id)
    .select()
    .single()

  if (error) throw new Error(`Failed to update automation rule: ${error.message}`)
  return rule
}

export async function deleteAutomationRule(rule_id: string) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  // Only managers can delete automation rules
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userData?.role !== 'manager') throw new Error('Only managers can delete automation rules')

  // Log deletion for audit trail (best-effort)
  try {
    await supabase.from('activity_log').insert({
      job_id: rule_id,
      user_id: user.id,
      action: 'automation_rule_deleted',
      old_value: rule_id,
      new_value: null,
    })
  } catch {}

  const { error } = await supabase
    .from('automation_rules')
    .delete()
    .eq('id', rule_id)

  if (error) throw new Error(`Failed to delete automation rule: ${error.message}`)
}

export async function toggleAutomationRule(rule_id: string, is_active: boolean) {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: rule, error } = await supabase
    .from('automation_rules')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', rule_id)
    .select()
    .single()

  if (error) throw new Error(`Failed to toggle automation rule: ${error.message}`)
  return rule
}

export async function processAutomationRules(
  trigger: 'status_change' | 'job_created' | 'estimate_sent' | 'payment_received',
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
      .select('id, company_id, customer_name, phone, email, status, rep_id, do_not_text')
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
      query = query.or(`trigger_value.eq.${triggerValue},trigger_value.is.null`)
    }

    const { data: rules, error: rulesError } = await query.limit(10)

    if (rulesError || !rules || rules.length === 0) return

    // Process all matching rules in parallel — faster than sequential and failures are isolated
    await Promise.allSettled(
      rules.map(rule => executeAutomationAction(rule, job, triggerValue))
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
  },
  triggerValue?: string
) {
  const config = rule.action_config as Record<string, unknown>
  const supabase = await createClient()

  switch (rule.action_type) {
    case 'send_sms': {
      if (!job.phone || job.do_not_text) return
      const message = (config.message_template as string)?.replace(
        /\{customer_name\}|\{status\}/g,
        (match) => {
          if (match === '{customer_name}') return job.customer_name
          if (match === '{status}') return job.status
          return match
        }
      )
      if (message) {
        await sendSMS(job.phone, message).catch(() => {
          // Best-effort SMS sending
        })
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
        ).catch(() => {
          // Best-effort follow-up creation
        })
      }
      break
    }

    case 'send_email': {
      if (!job.email) return
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) return
      const resend = new Resend(resendKey)
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
      const subject = (config.subject as string) || `Update on your project, ${job.customer_name}`
      const body = (config.email_body as string) || `Hello ${job.customer_name}, this is an automated update regarding your roofing project.`
      await resend.emails.send({
        from: `Roofing Company <${fromEmail}>`,
        to: job.email,
        subject,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><p>${body.replace(/\n/g, '<br>')}</p></div>`,
      }).catch(() => {
        // Best-effort email sending
      })
      break
    }

    case 'assign_crew': {
      const crewId = config.crew_id as string
      if (!crewId) return
      await supabase
        .from('jobs')
        .update({ assigned_crew_id: crewId })
        .eq('id', job.id)
      break
    }
  }
}
