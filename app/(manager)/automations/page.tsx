'use client'

import { useEffect, useState } from 'react'
import { getAutomationRules, toggleAutomationRule, deleteAutomationRule, createAutomationRule, getAutomationHistory } from '@/lib/actions/automations'
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

const TRIGGER_TYPES = [
  'status_change', 'job_created', 'estimate_sent', 'payment_received',
  'invoice_created', 'job_completed', 'crew_assigned',
]
const ACTION_TYPES = ['send_sms', 'send_email', 'create_follow_up', 'assign_crew']

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [companyId, setCompanyId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<AutomationHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    trigger_type: 'status_change' as const,
    trigger_value: '',
    action_type: 'send_sms' as const,
    message_template: '',
    days_offset: '3',
    delay_minutes: '',
  })

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    try {
      setLoading(true)
      // No company_id needed — server action resolves it from the authenticated user
      const data = await getAutomationRules()
      setRules(data)
      // Cache company_id for use when creating new rules
      if (data.length > 0 && (data[0] as any).company_id) {
        setCompanyId((data[0] as any).company_id)
      }
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
      await toggleAutomationRule(rule_id, !current_state)
      setRules(rules.map((r) => (r.id === rule_id ? { ...r, is_active: !current_state } : r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule')
    }
  }

  const handleDelete = async (rule_id: string) => {
    if (!confirm('Delete this automation rule?')) return
    try {
      await deleteAutomationRule(rule_id)
      setRules(rules.filter((r) => r.id !== rule_id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!companyId) {
        setError('Company not found — please refresh the page')
        return
      }

      const actionConfig: Record<string, unknown> = {}
      const actionType = formData.action_type as string
      if (actionType === 'send_sms') {
        actionConfig.message_template = formData.message_template
      }
      if (actionType === 'create_follow_up') {
        actionConfig.days_offset = parseInt(formData.days_offset)
      }
      if (formData.delay_minutes && parseInt(formData.delay_minutes) > 0) {
        actionConfig.delay_minutes = parseInt(formData.delay_minutes)
      }

      await createAutomationRule({
        company_id: companyId,
        name: formData.name,
        trigger_type: formData.trigger_type,
        trigger_value: formData.trigger_value,
        action_type: formData.action_type,
        action_config: actionConfig,
      })

      setFormData({
        name: '',
        trigger_type: 'status_change',
        trigger_value: '',
        action_type: 'send_sms',
        message_template: '',
        days_offset: '3',
        delay_minutes: '',
      })
      setShowForm(false)
      await loadRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule')
    }
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
            onClick={() => setShowForm(!showForm)}
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
            {showForm ? 'Cancel' : 'Add Rule'}
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
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Trigger Type
              </label>
              <select
                value={formData.trigger_type}
                onChange={(e) => setFormData({ ...formData, trigger_type: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                {TRIGGER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Trigger Value (optional)
              </label>
              <input
                type="text"
                value={formData.trigger_value}
                onChange={(e) => setFormData({ ...formData, trigger_value: e.target.value })}
                placeholder="e.g., sold (for status_change trigger)"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Action Type
              </label>
              <select
                value={formData.action_type}
                onChange={(e) => setFormData({ ...formData, action_type: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                {ACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace('_', ' ')}
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
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                  minHeight: '60px',
                }}
              />
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
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
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
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
                color: 'var(--text)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
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
            Create Rule
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
                  {history.map((entry, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>{entry.rule_name}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{entry.job_number}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{entry.customer_name}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{entry.action_type.replace('_', ' ')}</td>
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
        <div style={{ display: 'grid', gap: '12px' }}>
          {rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>{rule.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {rule.trigger_type.replace('_', ' ')} → {rule.action_type.replace('_', ' ')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rule.is_active}
                    onChange={() => handleToggle(rule.id, rule.is_active)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px' }}>{rule.is_active ? 'Active' : 'Inactive'}</span>
                </label>

                <button
                  onClick={() => handleDelete(rule.id)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
