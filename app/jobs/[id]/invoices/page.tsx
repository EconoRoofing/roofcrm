'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  getJobInvoices,
  createInvoice,
  markInvoicePaid,
  sendInvoiceEmail,
  sendInvoiceWithPDF,
  addLineItem,
  getInvoiceLineItems,
  removeLineItem,
} from '@/lib/actions/invoicing'
import { exportInvoicesQBFormat } from '@/lib/actions/export'

interface Invoice {
  id: string
  job_id: string
  invoice_number: string
  type: string
  amount: number
  total_amount: number
  status: string
  due_date: string | null
  paid_date: string | null
  paid_amount: number
  payment_method: string | null
  notes: string | null
  payment_link: string | null
  pdf_url: string | null
  created_at: string
}

interface LineItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'var(--text-secondary)',
  sent: 'var(--accent)',
  viewed: 'var(--accent)',
  paid: '#22c55e',
  overdue: '#ef4444',
  cancelled: 'var(--text-secondary)',
}

const STATUS_BG: Record<string, string> = {
  draft: 'rgba(100,116,139,0.1)',
  sent: 'rgba(59,130,246,0.1)',
  viewed: 'rgba(59,130,246,0.1)',
  paid: 'rgba(34,197,94,0.1)',
  overdue: 'rgba(239,68,68,0.1)',
  cancelled: 'rgba(100,116,139,0.1)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--surface)',
  color: 'var(--text)',
  fontSize: '14px',
  boxSizing: 'border-box',
}

const btnSecondary: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  backgroundColor: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  cursor: 'pointer',
}

export default function JobInvoicesPage() {
  const { id } = useParams<{ id: string }>()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null)
  const [paidAmounts, setPaidAmounts] = useState<Record<string, string>>({})
  const [showPaidInput, setShowPaidInput] = useState<Record<string, boolean>>({})

  // Line items panel
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  const [lineItems, setLineItems] = useState<Record<string, LineItem[]>>({})
  const [lineItemForm, setLineItemForm] = useState({ description: '', quantity: '1', unitPrice: '' })
  const [addingLineItem, setAddingLineItem] = useState(false)

  // QB export
  const [exportingQB, setExportingQB] = useState(false)

  const [formData, setFormData] = useState({
    type: 'standard' as 'standard' | 'deposit' | 'supplement' | 'change_order',
    amount: '',
    due_date: '',
    notes: '',
  })

  useEffect(() => {
    loadInvoices()
  }, [id])

  const loadInvoices = async () => {
    try {
      setLoading(true)
      const data = await getJobInvoices(id)
      setInvoices(data as Invoice[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      if (!formData.amount || !formData.due_date) {
        setError('Amount and due date are required')
        return
      }
      await createInvoice({
        job_id: id,
        type: formData.type,
        amount: parseFloat(formData.amount),
        total_amount: parseFloat(formData.amount),
        due_date: formData.due_date,
        notes: formData.notes || undefined,
      })
      setFormData({ type: 'standard', amount: '', due_date: '', notes: '' })
      setShowForm(false)
      await loadInvoices()
      setSuccess('Invoice created')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice')
    }
  }

  const handleMarkPaid = async (invoice_id: string) => {
    try {
      const invoice = invoices.find((i) => i.id === invoice_id)
      if (!invoice) return
      const paidAmt = paidAmounts[invoice_id] ? parseFloat(paidAmounts[invoice_id]) : invoice.total_amount
      await markInvoicePaid(invoice_id, paidAmt, 'manual')
      setInvoices(invoices.map((i) => i.id === invoice_id ? { ...i, status: 'paid', paid_amount: paidAmt } : i))
      setShowPaidInput((prev) => ({ ...prev, [invoice_id]: false }))
      setSuccess('Invoice marked as paid')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark invoice as paid')
    }
  }

  const handleSendInvoice = async (invoice_id: string) => {
    try {
      setSendingId(invoice_id)
      setError(null)
      await sendInvoiceWithPDF(invoice_id)
      setInvoices(invoices.map((i) => i.id === invoice_id ? { ...i, status: 'sent' } : i))
      setSuccess('Invoice sent with PDF')
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      // Fall back to basic email if PDF fails
      try {
        await sendInvoiceEmail(invoice_id)
        setInvoices(invoices.map((i) => i.id === invoice_id ? { ...i, status: 'sent' } : i))
        setSuccess('Invoice sent')
        setTimeout(() => setSuccess(null), 4000)
      } catch (err2) {
        setError(err2 instanceof Error ? err2.message : 'Failed to send invoice')
      }
    } finally {
      setSendingId(null)
    }
  }

  const handleGeneratePDF = async (invoice: Invoice) => {
    try {
      setGeneratingPdfId(invoice.id)
      setError(null)
      const res = await fetch(`/api/jobs/${id}/invoice-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id }),
      })
      if (!res.ok) throw new Error('PDF generation failed')
      const { url } = await res.json()
      setInvoices(invoices.map((i) => i.id === invoice.id ? { ...i, pdf_url: url } : i))
      window.open(url, '_blank')
      setSuccess('PDF generated')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setGeneratingPdfId(null)
    }
  }

  const handleToggleLineItems = async (invoiceId: string) => {
    if (expandedInvoiceId === invoiceId) {
      setExpandedInvoiceId(null)
      return
    }
    setExpandedInvoiceId(invoiceId)
    if (!lineItems[invoiceId]) {
      const items = await getInvoiceLineItems(invoiceId)
      setLineItems((prev) => ({ ...prev, [invoiceId]: items as LineItem[] }))
    }
  }

  const handleAddLineItem = async (invoiceId: string) => {
    if (!lineItemForm.description.trim() || !lineItemForm.unitPrice) return
    setAddingLineItem(true)
    try {
      await addLineItem(
        invoiceId,
        lineItemForm.description,
        parseFloat(lineItemForm.quantity) || 1,
        parseFloat(lineItemForm.unitPrice)
      )
      setLineItemForm({ description: '', quantity: '1', unitPrice: '' })
      const items = await getInvoiceLineItems(invoiceId)
      setLineItems((prev) => ({ ...prev, [invoiceId]: items as LineItem[] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add line item')
    } finally {
      setAddingLineItem(false)
    }
  }

  const handleRemoveLineItem = async (invoiceId: string, lineItemId: string) => {
    try {
      await removeLineItem(lineItemId)
      setLineItems((prev) => ({
        ...prev,
        [invoiceId]: (prev[invoiceId] || []).filter((i) => i.id !== lineItemId),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove line item')
    }
  }

  const handleExportQB = async () => {
    setExportingQB(true)
    try {
      const today = new Date()
      const yearAgo = new Date()
      yearAgo.setFullYear(today.getFullYear() - 1)
      const csv = await exportInvoicesQBFormat({
        start: yearAgo.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      })
      if (!csv) {
        setError('No invoices to export')
        return
      }
      const blob = new Blob([csv], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoices-quickbooks-${today.toISOString().split('T')[0]}.iif`
      a.click()
      URL.revokeObjectURL(url)
      setSuccess('QuickBooks IIF file downloaded')
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportingQB(false)
    }
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const formatDate = (d: string) =>
    new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })

  return (
    <div style={{ padding: '24px', maxWidth: '1000px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Invoices</h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleExportQB}
            disabled={exportingQB}
            style={{ ...btnSecondary, padding: '8px 14px', fontSize: '13px' }}
          >
            {exportingQB ? 'Exporting...' : 'Export for QuickBooks'}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
          >
            {showForm ? 'Cancel' : 'New Invoice'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', marginBottom: '16px', fontSize: '14px' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>x</button>
        </div>
      )}

      {success && (
        <div style={{ padding: '12px 16px', borderRadius: '6px', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', marginBottom: '16px', fontSize: '14px' }}>
          {success}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: '24px', padding: '20px', borderRadius: '8px', backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--text)' }}>New Invoice</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Type</label>
              <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as any })} style={inputStyle}>
                <option value="standard">Standard</option>
                <option value="deposit">Deposit</option>
                <option value="supplement">Supplement</option>
                <option value="change_order">Change Order</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Amount</label>
              <input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required step="0.01" min="0" placeholder="0.00" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Due Date</label>
              <input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Notes (optional)</label>
              <input type="text" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Internal notes..." style={inputStyle} />
            </div>
          </div>
          {formData.amount && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button type="button" onClick={() => setFormData({ ...formData, type: 'deposit', amount: String((parseFloat(formData.amount) * 0.5).toFixed(2)) })} style={btnSecondary}>
                50% Deposit
              </button>
            </div>
          )}
          <button type="submit" style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
            Create Invoice
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>No invoices yet. Create one to get started.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {invoices.map((invoice) => (
            <div key={invoice.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--surface)', overflow: 'hidden' }}>
              {/* Invoice row */}
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{invoice.invoice_number}</span>
                    <span style={{ fontSize: '12px', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{invoice.type.replace(/_/g, ' ')}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: STATUS_BG[invoice.status], color: STATUS_COLORS[invoice.status], fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      {invoice.status}
                    </span>
                    {invoice.payment_link && invoice.status !== 'paid' && (
                      <a href={invoice.payment_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>
                        Stripe Link
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>
                    {formatCurrency(invoice.total_amount)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : 'No due date'}
                    {invoice.paid_date ? ` — Paid ${formatDate(invoice.paid_date)}` : ''}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Line items toggle */}
                  <button
                    onClick={() => handleToggleLineItems(invoice.id)}
                    style={{ ...btnSecondary, color: expandedInvoiceId === invoice.id ? 'var(--accent)' : 'var(--text-secondary)' }}
                  >
                    Line Items
                  </button>

                  {/* PDF */}
                  {invoice.pdf_url ? (
                    <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer" style={{ ...btnSecondary, textDecoration: 'none' }}>
                      View PDF
                    </a>
                  ) : (
                    <button
                      onClick={() => handleGeneratePDF(invoice)}
                      disabled={generatingPdfId === invoice.id}
                      style={{ ...btnSecondary, opacity: generatingPdfId === invoice.id ? 0.5 : 1 }}
                    >
                      {generatingPdfId === invoice.id ? 'Generating...' : 'Gen PDF'}
                    </button>
                  )}

                  {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                    <>
                      {showPaidInput[invoice.id] ? (
                        <>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={paidAmounts[invoice.id] ?? String(invoice.total_amount)}
                            onChange={(e) => setPaidAmounts((prev) => ({ ...prev, [invoice.id]: e.target.value }))}
                            style={{ width: '90px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)', fontSize: '12px' }}
                          />
                          <button onClick={() => handleMarkPaid(invoice.id)} style={{ ...btnSecondary, borderColor: '#22c55e', color: '#22c55e' }}>
                            Confirm
                          </button>
                          <button onClick={() => setShowPaidInput((prev) => ({ ...prev, [invoice.id]: false }))} style={btnSecondary}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setPaidAmounts((prev) => ({ ...prev, [invoice.id]: String(invoice.total_amount) }))
                            setShowPaidInput((prev) => ({ ...prev, [invoice.id]: true }))
                          }}
                          style={{ ...btnSecondary, color: '#22c55e', borderColor: '#22c55e' }}
                        >
                          Mark Paid
                        </button>
                      )}
                      <button
                        onClick={() => handleSendInvoice(invoice.id)}
                        disabled={sendingId === invoice.id}
                        style={{ ...btnSecondary, opacity: sendingId === invoice.id ? 0.5 : 1 }}
                      >
                        {sendingId === invoice.id ? 'Sending...' : 'Send'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Line items panel */}
              {expandedInvoiceId === invoice.id && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '16px', backgroundColor: 'var(--surface-hover)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', letterSpacing: '0.3px' }}>LINE ITEMS</h4>

                  {(lineItems[invoice.id] || []).length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>No line items yet.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Unit Price</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Total</th>
                          <th style={{ width: '32px' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {(lineItems[invoice.id] || []).map((item) => (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px' }}>{item.description}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{item.quantity}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.total)}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <button
                                onClick={() => handleRemoveLineItem(invoice.id, item.id)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
                                title="Remove line item"
                              >
                                x
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(lineItems[invoice.id] || []).length > 0 && (
                          <tr>
                            <td colSpan={3} style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Total</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, fontSize: '14px' }}>
                              {formatCurrency((lineItems[invoice.id] || []).reduce((s, i) => s + i.total, 0))}
                            </td>
                            <td />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}

                  {/* Add line item form */}
                  {invoice.status !== 'paid' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ flex: 2, minWidth: '160px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>DESCRIPTION</label>
                        <input
                          type="text"
                          value={lineItemForm.description}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, description: e.target.value })}
                          placeholder="Labor, Materials, etc."
                          style={{ ...inputStyle, fontSize: '13px', padding: '6px 10px' }}
                        />
                      </div>
                      <div style={{ width: '72px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>QTY</label>
                        <input
                          type="number"
                          value={lineItemForm.quantity}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, quantity: e.target.value })}
                          min="0.01"
                          step="0.01"
                          style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}
                        />
                      </div>
                      <div style={{ width: '110px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>UNIT PRICE</label>
                        <input
                          type="number"
                          value={lineItemForm.unitPrice}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, unitPrice: e.target.value })}
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}
                        />
                      </div>
                      <button
                        onClick={() => handleAddLineItem(invoice.id)}
                        disabled={addingLineItem || !lineItemForm.description.trim() || !lineItemForm.unitPrice}
                        style={{
                          padding: '7px 16px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: 'var(--accent)',
                          color: '#fff',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: addingLineItem ? 'not-allowed' : 'pointer',
                          opacity: addingLineItem ? 0.6 : 1,
                        }}
                      >
                        Add Item
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
