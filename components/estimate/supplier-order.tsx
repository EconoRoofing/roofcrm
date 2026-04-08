'use client'

import { useState, useEffect } from 'react'
import {
  emailSupplierOrder,
  generateSupplierOrderText,
  getSupplierContacts,
  getPurchaseOrders,
  updatePurchaseOrderStatus,
  addSupplierContact,
} from '@/lib/actions/supplier'
import type { SupplierContact, PurchaseOrder } from '@/lib/actions/supplier'

interface SupplierOrderProps {
  jobId: string
  companyName?: string
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:     { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
  sent:      { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
  confirmed: { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  delivered: { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
}

export function SupplierOrder({ jobId, companyName = 'Roofing Company' }: SupplierOrderProps) {
  const [supplierEmail, setSupplierEmail] = useState('')
  const [orderText, setOrderText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  // Supplier contacts
  const [contacts, setContacts] = useState<SupplierContact[]>([])
  const [selectedContactId, setSelectedContactId] = useState<string>('')
  const [showAddContact, setShowAddContact] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', specialty: '' })
  const [savingContact, setSavingContact] = useState(false)

  // Order history
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    loadContacts()
    loadOrders()
  }, [])

  const loadContacts = async () => {
    try {
      const data = await getSupplierContacts()
      setContacts(data)
    } catch {
      // non-fatal
    }
  }

  const loadOrders = async () => {
    setOrdersLoading(true)
    try {
      const data = await getPurchaseOrders(jobId)
      setOrders(data)
    } catch {
      // non-fatal
    } finally {
      setOrdersLoading(false)
    }
  }

  const handleContactSelect = (contactId: string) => {
    setSelectedContactId(contactId)
    if (!contactId) { setSupplierEmail(''); return }
    const contact = contacts.find((c) => c.id === contactId)
    if (contact) setSupplierEmail(contact.email)
  }

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingContact(true)
    try {
      await addSupplierContact(newContact)
      await loadContacts()
      setNewContact({ name: '', email: '', phone: '', specialty: '' })
      setShowAddContact(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact')
    } finally {
      setSavingContact(false)
    }
  }

  const handleGenerateOrder = async () => {
    setLoading(true)
    setError(null)
    try {
      const text = await generateSupplierOrderText(jobId)
      setOrderText(text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate order')
    } finally {
      setLoading(false)
    }
  }

  const handleSendEmail = async () => {
    if (!supplierEmail.trim()) {
      setError('Please enter or select a supplier email')
      return
    }

    setSending(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await emailSupplierOrder(jobId, supplierEmail, companyName)
      if (result) {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        await loadOrders()
      } else {
        setError('Failed to send email. Check the supplier email and try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  const handleCopyText = async () => {
    if (!orderText) return
    try {
      await navigator.clipboard.writeText(orderText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Failed to copy to clipboard')
    }
  }

  const handleStatusChange = async (orderId: string, status: PurchaseOrder['status']) => {
    try {
      await updatePurchaseOrderStatus(orderId, status)
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    textTransform: 'uppercase',
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '24px',
      }}
    >
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
        Send to Supplier
      </h3>

      {/* Supplier contact selector */}
      {contacts.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Saved Suppliers</label>
          <select
            value={selectedContactId}
            onChange={(e) => handleContactSelect(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select a supplier...</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.is_preferred ? '★ ' : ''}{c.name}{c.specialty ? ` (${c.specialty})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Supplier email input */}
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Supplier Email</label>
        <input
          type="email"
          value={supplierEmail}
          onChange={(e) => { setSupplierEmail(e.target.value); setSelectedContactId('') }}
          placeholder="supplier@example.com"
          style={inputStyle}
        />
      </div>

      {/* Add supplier contact toggle */}
      <button
        onClick={() => setShowAddContact(!showAddContact)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: 0,
          marginBottom: '16px',
        }}
      >
        {showAddContact ? 'Cancel' : '+ Save supplier as contact'}
      </button>

      {/* Add contact form */}
      {showAddContact && (
        <form onSubmit={handleSaveContact} style={{ marginBottom: '16px', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input type="text" required value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} style={inputStyle} placeholder="ABC Supply Co." />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" required value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} style={inputStyle} placeholder="orders@supplier.com" />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input type="tel" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} style={inputStyle} placeholder="(555) 000-0000" />
            </div>
            <div>
              <label style={labelStyle}>Specialty</label>
              <select value={newContact.specialty} onChange={(e) => setNewContact({ ...newContact, specialty: e.target.value })} style={inputStyle}>
                <option value="">General</option>
                <option value="shingles">Shingles</option>
                <option value="gutters">Gutters</option>
                <option value="lumber">Lumber</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={savingContact}
            style={{
              padding: '7px 14px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: 'var(--accent)',
              color: 'var(--bg-deep)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: savingContact ? 'not-allowed' : 'pointer',
              opacity: savingContact ? 0.5 : 1,
            }}
          >
            {savingContact ? 'Saving...' : 'Save Contact'}
          </button>
        </form>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={handleGenerateOrder}
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Generating...' : 'Preview Order'}
        </button>

        <button
          onClick={handleSendEmail}
          disabled={sending || !supplierEmail.trim()}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '4px',
            border: '1px solid var(--accent)',
            backgroundColor: 'var(--accent)',
            color: 'var(--bg-deep)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: sending || !supplierEmail.trim() ? 'not-allowed' : 'pointer',
            opacity: sending || !supplierEmail.trim() ? 0.5 : 1,
          }}
        >
          {sending ? 'Sending...' : 'Send Email'}
        </button>
      </div>

      {/* Error / Success */}
      {error && (
        <div style={{ padding: '12px', borderRadius: '4px', backgroundColor: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '12px', borderRadius: '4px', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: '12px', marginBottom: '16px' }}>
          Order sent and recorded successfully.
        </div>
      )}

      {/* Order text preview */}
      {orderText && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={labelStyle}>Order Preview</label>
            <button
              onClick={handleCopyText}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre
            style={{
              padding: '12px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              maxHeight: '300px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono, monospace)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {orderText}
          </pre>
        </div>
      )}

      {/* Order History */}
      <div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            marginBottom: '12px',
          }}
        >
          {showHistory ? '- Hide' : '+ Show'} Order History ({orders.length})
        </button>

        {showHistory && (
          <div style={{ display: 'grid', gap: '8px' }}>
            {ordersLoading ? (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading...</div>
            ) : orders.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No orders yet.</div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{order.supplier_name}</div>
                      {order.supplier_email && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{order.supplier_email}</div>
                      )}
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: STATUS_COLORS[order.status]?.bg ?? 'transparent',
                        color: STATUS_COLORS[order.status]?.color ?? 'var(--text-secondary)',
                      }}
                    >
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  {/* Status advancement */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(['draft', 'sent', 'confirmed', 'delivered'] as const)
                      .filter((s) => s !== order.status)
                      .map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(order.id, s)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: `1px solid ${STATUS_COLORS[s]?.color ?? 'var(--border-subtle)'}`,
                            backgroundColor: 'transparent',
                            color: STATUS_COLORS[s]?.color ?? 'var(--text-secondary)',
                            fontSize: '11px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          Mark {s}
                        </button>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
