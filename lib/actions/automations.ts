'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, requireManager } from '@/lib/auth-helpers'

export interface CreateAutomationData {
  company_id?: string
  name: string
  trigger_type: 'status_change' | 'job_created' | 'estimate_sent' | 'payment_received' | 'invoice_created' | 'job_completed' | 'crew_assigned'
  trigger_value?: string
  action_type: 'send_sms' | 'send_email' | 'create_follow_up' | 'assign_crew' | 'update_status' | 'send_webhook'
  action_config: Record<string, unknown>
}

export async function createAutomationRule(data: CreateAutomationData) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const { data: rule, error } = await supabase
    .from('automation_rules')
    .insert({
      company_id: companyId,
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

export async function getCrewForAutomation() {
  const { companyId } = await getUserWithCompany()
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'crew')
    .eq('primary_company_id', companyId)
    .order('name')
  return data || []
}

export async function getAutomationRules() {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data: rules, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch automation rules: ${error.message}`)
  return rules || []
}

export async function updateAutomationRule(
  rule_id: string,
  updates: Partial<Omit<CreateAutomationData, 'company_id'>>
) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const payload: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  }

  const { data: rule, error } = await supabase
    .from('automation_rules')
    .update(payload)
    .eq('id', rule_id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update automation rule: ${error.message}`)
  return rule
}

export async function deleteAutomationRule(rule_id: string) {
  const supabase = await createClient()
  const { userId, companyId, role } = await getUserWithCompany()
  requireManager(role)

  // Log deletion for audit trail (best-effort)
  try {
    await supabase.from('activity_log').insert({
      job_id: null,
      user_id: userId,
      action: 'automation_rule_deleted',
      old_value: rule_id,
      new_value: null,
    })
  } catch {}

  const { error } = await supabase
    .from('automation_rules')
    .delete()
    .eq('id', rule_id)
    .eq('company_id', companyId)

  if (error) throw new Error(`Failed to delete automation rule: ${error.message}`)
}

export async function toggleAutomationRule(rule_id: string, is_active: boolean) {
  const supabase = await createClient()
  const { companyId, role } = await getUserWithCompany()
  requireManager(role)

  const { data: rule, error } = await supabase
    .from('automation_rules')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', rule_id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw new Error(`Failed to toggle automation rule: ${error.message}`)
  return rule
}

export async function getAutomationHistory(ruleId?: string): Promise<Array<{
  rule_name: string
  job_number: string
  customer_name: string
  action_type: string
  executed_at: string
  success: boolean
}>> {
  const supabase = await createClient()
  const { companyId } = await getUserWithCompany()

  const { data: logs, error } = await supabase
    .from('activity_log')
    .select(`
      old_value,
      new_value,
      created_at,
      job:jobs!inner(job_number, customer_name, company_id)
    `)
    .eq('action', 'automation_executed')
    .eq('job.company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return []

  return (logs ?? []).flatMap((log) => {
    let parsed: { action_type?: string; rule_id?: string; success?: boolean } = {}
    try { parsed = JSON.parse(log.new_value ?? '{}') } catch { return [] }

    if (ruleId && parsed.rule_id !== ruleId) return []

    const job = log.job as { job_number?: string; customer_name?: string } | null
    return [{
      rule_name: log.old_value ?? 'Unknown rule',
      job_number: job?.job_number ?? '-',
      customer_name: job?.customer_name ?? '-',
      action_type: parsed.action_type ?? '-',
      executed_at: log.created_at,
      success: parsed.success ?? false,
    }]
  })
}
