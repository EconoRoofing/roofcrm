'use client'

import { useEffect, useState } from 'react'
import { getJobInvoices, createInvoice, markInvoicePaid, updateInvoiceStatus } from '@/lib/actions/invoicing'
import type { Database } from '@/lib/types/supabase'

type Invoice = Database['public']['Tables']['invoices']['Row']

const STATUS_COLORS: Record<string, string> = {
  draft: 'var(--text-secondary)',
  sent: 'var(--accent)',
  viewed: 'var(--accent)',
  paid: '#22c55e',
  overdue: '#ef4444',
  cancelled: 'var(--text-secondary)',
}

const STATUS_BG_COLORS: Record<string, string> = {
  draft: 'rgba(100, 116, 139, 0.1)',
  sent: 'rgba(59, 130, 246, 0.1)',
  viewed: 'rgba(59, 130, 246, 0.1)',
  paid: 'rgba(34, 197, 94, 0.1)',
  overdue: 'rgba(239, 68, 68, 0.1)',
  cancelled: 'rgba(100, 116, 139, 0.1)',
}

export default function JobInvoicesPage({ params }: { params: { id: string } }) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    type: 'standard' as const,
    amount: '',
    due_date: '',
    notes: '',
  })

  useEffect(() => {
    loadInvoices()
  }, [params.id])

  const loadInvoices = async () => {
    try {
      setLoading(true)
      const data = await getJobInvoices(params.id)
      setInvoices(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!formData.amount || !formData.due_date) {
        setError('Amount and due date are required')
        return
      }

      await createInvoice({
        job_id: params.id,
        type: formData.type,
        amount: parseFloat(formData.amount),
        total_amount: parseFloat(formData.amount),
        due_date: formData.due_date,
        notes: formData.notes || undefined,
      })

      setFormData({
        type: 'standard',
        amount: '',
        due_date: '',
        notes: '',
      })
      setShowForm(false)
      setError(null)
      await loadInvoices()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice')
    }
  }

  const handleMarkPaid = async (invoice_id: string) => {
    try {
      const invoice = invoices.find((i) => i.id === invoice_id)
      if (!invoice) return

      await markInvoicePaid(invoice_id, invoice.total_amount, 'manual')
      setInvoices(invoices.map((i) => (i.id === invoice_id ? { ...i, status: 'paid' } : i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark invoice as paid')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Invoices</h1>
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
          {showForm ? 'Cancel' : 'New Invoice'}
        </button>
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
                Invoice Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
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
                <option value="standard">Standard</option>
                <option value="deposit">Deposit</option>
                <option value="supplement">Supplement</option>
                <option value="change_order">Change Order</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>
                Amount
              </label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                step="0.01"
                min="0"
                placeholder="0.00"
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
                Due Date
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                required
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
                Notes (optional)
              </label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Internal notes..."
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
            Create Invoice
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
          No invoices yet. Create one to get started.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Invoice #
                </th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Type
                </th>
                <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Amount
                </th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Due Date
                </th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Status
                </th>
                <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 500 }}>{invoice.invoice_number}</td>
                  <td style={{ padding: '12px 8px', textTransform: 'capitalize' }}>{invoice.type}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{formatCurrency(invoice.amount)}</td>
                  <td style={{ padding: '12px 8px' }}>{formatDate(invoice.due_date)}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: STATUS_BG_COLORS[invoice.status] || 'transparent',
                        color: STATUS_COLORS[invoice.status] || 'var(--text)',
                        fontSize: '12px',
                        fontWeight: 500,
                        textTransform: 'capitalize',
                      }}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                    {invoice.status !== 'paid' && (
                      <button
                        onClick={() => handleMarkPaid(invoice.id)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          backgroundColor: 'transparent',
                          color: 'var(--accent)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-dim)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
