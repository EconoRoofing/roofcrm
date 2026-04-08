'use client'

import { useEffect, useState } from 'react'
import { getAutomationRules, toggleAutomationRule, deleteAutomationRule, createAutomationRule, updateAutomationRule, getAutomationHistory, getCrewForAutomation } from '@/lib/actions/automations'

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

interface AutomationHistoryEntry {
  rule_name: string
  job_number: string
  customer_name: string
  action_type: string
  executed_at: string
  success: boolean
}

interface CrewMember {
  id: string
  name: string
}

const TRIGGER_TYPES = [
  'status_change', 'job_created', 'estimate_sent', 'payment_received',
  'invoice_created', 'job_completed', 'crew_assigned',
]
const ACTION_TYPES = ['send_sms', 'send_email', 'create_follow_up', 'assign_crew', 'update_status', 'send_webhook']

const STATUS_OPTIONS = ['new', 'pending', 'sold', 'scheduled', 'in_progress', 'completed', 'cancelled']

const TEMPLATE_VARIABLES_HINT = 'Available variables: {customer_name}, {status}, {phone}, {email}, {job_number}'

const defaultFormData = {
  name: '',
  trigger_type: 'status_change' as const,
  trigger_value: '',
  action_type: 'send_sms' as const,
  message_template: '',
  days_offset: '3',
  delay_minutes: '',
  email_subject: '',
  email_body_template: '',
  crew_id: '',
  new_status: '',
  webhook_url: '',
}

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [operatingId, setOperatingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<AutomationHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([])
  const [formData, setFormData] = useState({ ...defaultFormData })

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        setLoading(true)
        const [rulesData, crewData] = await Promise.all([
          getAutomationRules(),
          getCrewForAutomation(),
        ])
        if (mounted) {
          setRules(rulesData)
          setCrewMembers(crewData)
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load rules')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [])

  const loadRules = async () => {
    try {
      setLoading(true)
      const data = await getAutomationRules()
      setRules(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules')
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const data = await getAutomationHistory()
      setHistory(data)
    } catch {
      // non-fatal
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleToggle = async (rule_id: string, current_state: boolean) => {
    try {
      setError(null)
      setOperatingId(rule_id)
      await toggleAutomationRule(rule_id, !current_state)
      setRules(rules.map((r) => (r.id === rule_id ? { ...r, is_active: !current_state } : r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule')
    } finally {
      setOperatingId(null)
    }
  }

  const handleDelete = async (rule_id: string) => {
    if (!confirm('Delete this automation rule?')) return
    try {
      setError(null)
      setOperatingId(rule_id)
      await deleteAutomationRule(rule_id)
      setRules(rules.filter((r) => r.id !== rule_id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule')
    } finally {
      setOperatingId(null)
    }
  }

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule)
    const config = rule.action_config || {}
    setFormData({
      name: rule.name,
      trigger_type: rule.trigger_type as typeof defaultFormData.trigger_type,
      trigger_value: rule.trigger_value || '',
      action_type: rule.action_type as typeof defaultFormData.action_type,
      message_template: (config.message_template as string) || '',
      days_offset: String((config.days_offset as number) || 3),
      delay_minutes: config.delay_minutes ? String(config.delay_minutes) : '',
      email_subject: (config.subject as string) || '',
      email_body_template: (config.email_body as string) || '',
      crew_id: (config.crew_id as string) || '',
      new_status: (config.new_status as string) || '',
      webhook_url: (config.webhook_url as string) || '',
    })
    setShowForm(true)
    setValidationError(null)
  }

  const handleCancelEdit = () => {
    setEditingRule(null)
    setFormData({ ...defaultFormData })
    setShowForm(false)
    setValidationError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    setError(null)

    // Validation
    const trimmedName = formData.name.trim()
    if (!trimmedName) {
      setValidationError('Rule name is required')
      return
    }
    const actionType = formData.action_type as string
    if (actionType === 'send_sms' && !formData.message_template.trim()) {
      setValidationError('SMS message template is required')
      return
    }
    if (actionType === 'send_email' && !formData.email_body_template.trim()) {
      setValidationError('Email body template is required')
      return
    }
    if (actionType === 'assign_crew' && !formData.crew_id.trim()) {
      setValidationError('Crew member is required')
      return
    }
    if (actionType === 'update_status' && !formData.new_status) {
      setValidationError('Target status is required')
      return
    }
    if (actionType === 'send_webhook') {
      const url = formData.webhook_url.trim()
      if (!url) {
        setValidationError('Webhook URL is required')
        return
      }
      if (!url.startsWith('https://')) {
        setValidationError('Webhook URL must start with https://')
        return
      }
    }

    try {
      setSubmitting(true)

      const actionConfig: Record<string, unknown> = {}
      if (actionType === 'send_sms') {
        actionConfig.message_template = formData.message_template
      }
      if (actionType === 'send_email') {
        actionConfig.subject = formData.email_subject
        actionConfig.email_body = formData.email_body_template
      }
      if (actionType === 'assign_crew') {
        actionConfig.crew_id = formData.crew_id.trim()
      }
      if (actionType === 'create_follow_up') {
        const parsed = parseInt(formData.days_offset)
        actionConfig.days_offset = isNaN(parsed) || parsed <= 0 ? 3 : parsed
      }
      if (actionType === 'update_status') {
        actionConfig.new_status = formData.new_status
      }
      if (actionType === 'send_webhook') {
        actionConfig.webhook_url = formData.webhook_url.trim()
      }
      if (formData.delay_minutes && parseInt(formData.delay_minutes) > 0) {
        actionConfig.delay_minutes = parseInt(formData.delay_minutes)
      }

      if (editingRule) {
        await updateAutomationRule(editingRule.id, {
          name: trimmedName,
          trigger_type: formData.trigger_type,
          trigger_value: formData.trigger_value,
          action_type: formData.action_type,
          action_config: actionConfig,
        })
      } else {
        await createAutomationRule({
          name: trimmedName,
          trigger_type: formData.trigger_type,
          trigger_value: formData.trigger_value,
          action_type: formData.action_type,
          action_config: actionConfig,
        })
      }

      setEditingRule(null)
      setFormData({ ...defaultFormData })
      setShowForm(false)
      await loadRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : editingRule ? 'Failed to update rule' : 'Failed to create rule')
    } finally {
      setSubmitting(false)
    }
  }

  const hintStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '4px',
    fontFamily: 'monospace',
    opacity: 0.8,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>CRM Automations</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory() }}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              backgroundColor: showHistory ? 'var(--surface-hover)' : 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            History
          </button>
          <button
            onClick={() => {
              if (showForm && !editingRule) {
                setShowForm(false)
              } else {
                handleCancelEdit()
                setShowForm(true)
              }
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {showForm && !editingRule ? 'Cancel' : 'Add Rule'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'var(--surface-hover)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              {editingRule ? 'Edit Rule' : 'Create Rule'}
            </h2>
            {editingRule && (
              <button
                type="button"
                onClick={handleCancelEdit}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel Edit
              </button>
            )}
          </div>

          {validationError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                marginBottom: '12px',
                fontSize: '13px',
              }}
            >
              {validationError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Rule Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., SMS when job sold"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Trigger Type
              </label>
              <select
                value={formData.trigger_type}
                onChange={(e) => setFormData({ ...formData, trigger_type: e.target.value as any, trigger_value: '' })}
                style={inputStyle}
              >
                {TRIGGER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Trigger Value (optional)
              </label>
              {formData.trigger_type === 'status_change' ? (
                <select
                  value={formData.trigger_value}
                  onChange={(e) => setFormData({ ...formData, trigger_value: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">Any status change</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.trigger_value}
                  onChange={(e) => setFormData({ ...formData, trigger_value: e.target.value })}
                  placeholder="e.g., specific trigger condition"
                  style={inputStyle}
                />
              )}
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Action Type
              </label>
              <select
                value={formData.action_type}
                onChange={(e) => setFormData({ ...formData, action_type: e.target.value as any })}
                style={inputStyle}
              >
                {ACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(formData.action_type as string) === 'send_sms' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                SMS Template
              </label>
              <textarea
                value={formData.message_template}
                onChange={(e) => setFormData({ ...formData, message_template: e.target.value })}
                placeholder="Use {customer_name} and {status} as placeholders"
                style={{
                  ...inputStyle,
                  fontFamily: 'monospace',
                  minHeight: '60px',
                }}
              />
              <div style={hintStyle}>{TEMPLATE_VARIABLES_HINT}</div>
            </div>
          )}

          {(formData.action_type as string) === 'send_email' && (
            <div style={{ marginBottom: '16px', display: 'grid', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                  Email Subject
                </label>
                <input
                  type="text"
                  value={formData.email_subject}
                  onChange={(e) => setFormData({ ...formData, email_subject: e.target.value })}
                  placeholder="e.g., Update on your roofing project"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                  Email Body Template
                </label>
                <textarea
                  value={formData.email_body_template}
                  onChange={(e) => setFormData({ ...formData, email_body_template: e.target.value })}
                  placeholder="Use {customer_name} and {status} as placeholders"
                  style={{
                    ...inputStyle,
                    fontFamily: 'monospace',
                    minHeight: '80px',
                  }}
                />
                <div style={hintStyle}>{TEMPLATE_VARIABLES_HINT}</div>
              </div>
            </div>
          )}

          {(formData.action_type as string) === 'assign_crew' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Crew Member
              </label>
              <select
                value={formData.crew_id}
                onChange={(e) => setFormData({ ...formData, crew_id: e.target.value })}
                style={inputStyle}
              >
                <option value="">Select crew member</option>
                {crewMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(formData.action_type as string) === 'create_follow_up' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Days Until Due
              </label>
              <input
                type="number"
                value={formData.days_offset}
                onChange={(e) => setFormData({ ...formData, days_offset: e.target.value })}
                min="1"
                max="30"
                style={inputStyle}
              />
            </div>
          )}

          {(formData.action_type as string) === 'update_status' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                New Status
              </label>
              <select
                value={formData.new_status}
                onChange={(e) => setFormData({ ...formData, new_status: e.target.value })}
                style={inputStyle}
              >
                <option value="">Select status</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(formData.action_type as string) === 'send_webhook' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Webhook URL
              </label>
              <input
                type="url"
                value={formData.webhook_url}
                onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                placeholder="https://hooks.example.com/..."
                style={inputStyle}
              />
              <div style={hintStyle}>Must start with https://. Receives POST with job data as JSON.</div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
              Delay (minutes) — leave blank for immediate
            </label>
            <input
              type="number"
              value={formData.delay_minutes}
              onChange={(e) => setFormData({ ...formData, delay_minutes: e.target.value })}
              min="0"
              placeholder="0 = immediate"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
              opacity: submitting ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.opacity = '1' }}
          >
            {submitting
              ? (editingRule ? 'Updating...' : 'Creating...')
              : (editingRule ? 'Update Rule' : 'Create Rule')
            }
          </button>
        </form>
      )}

      {showHistory && (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'var(--surface-hover)',
            border: '1px solid var(--border)',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Execution History</h2>
          {historyLoading ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading history...</div>
          ) : history.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No automation executions recorded yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Rule', 'Job', 'Customer', 'Action', 'Status', 'Time'].map((h) => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={`${entry.executed_at}-${entry.job_number}-${entry.rule_name}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>{entry.rule_name}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{entry.job_number}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{entry.customer_name}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{entry.action_type.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: entry.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                          color: entry.success ? '#22c55e' : '#ef4444',
                        }}>
                          {entry.success ? 'OK' : 'Failed'}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(entry.executed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Loading rules...</div>
      ) : rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
          No automation rules yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Group rules by trigger type + value as "workflows" */}
          {Object.entries(
            rules.reduce<Record<string, AutomationRule[]>>((groups, rule) => {
              const key = `${rule.trigger_type}::${rule.trigger_value || '*'}`
              if (!groups[key]) groups[key] = []
              groups[key].push(rule)
              return groups
            }, {})
          ).map(([groupKey, groupRules]) => {
            const [triggerType, triggerVal] = groupKey.split('::')
            const isWorkflow = groupRules.length > 1
            return (
              <div key={groupKey} style={{ borderRadius: '8px', border: isWorkflow ? '1px solid var(--border)' : 'none', overflow: 'hidden' }}>
                {isWorkflow && (
                  <div style={{ padding: '8px 16px', backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                      Workflow: {triggerType.replace(/_/g, ' ')}{triggerVal !== '*' ? ` (${triggerVal})` : ''} — {groupRules.length} actions
                    </span>
                  </div>
                )}
                {groupRules.map((rule) => (
            <div
              key={rule.id}
              style={{
                padding: '16px',
                borderRadius: isWorkflow ? '0' : '8px',
                border: isWorkflow ? 'none' : '1px solid var(--border)',
                borderBottom: isWorkflow ? '1px solid var(--border-subtle, var(--border))' : undefined,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>{rule.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {isWorkflow ? '' : `${rule.trigger_type.replace(/_/g, ' ')}${rule.trigger_value ? ` (${rule.trigger_value})` : ''} → `}{rule.action_type.replace(/_/g, ' ')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: operatingId === rule.id ? 'not-allowed' : 'pointer', opacity: operatingId === rule.id ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    checked={rule.is_active}
                    onChange={() => handleToggle(rule.id, rule.is_active)}
                    disabled={operatingId !== null}
                    style={{ cursor: operatingId !== null ? 'not-allowed' : 'pointer' }}
                  />
                  <span style={{ fontSize: '13px' }}>{rule.is_active ? 'Active' : 'Inactive'}</span>
                </label>

                <button
                  onClick={() => handleEdit(rule)}
                  disabled={operatingId !== null}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: operatingId !== null ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s',
                    opacity: operatingId !== null ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!operatingId) e.currentTarget.style.backgroundColor = 'var(--surface-hover)' }}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Edit
                </button>

                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={operatingId !== null}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    fontSize: '12px',
                    cursor: operatingId !== null ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s',
                    opacity: operatingId !== null ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!operatingId) e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)' }}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Delete
                </button>
              </div>
            </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
