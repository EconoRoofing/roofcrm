'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  emailSupplierOrder,
  generateSupplierOrderText,
  getSupplierContacts,
  getPurchaseOrders,
  updatePurchaseOrderStatus,
  addSupplierContact,
  addDeliveryNote,
  getSupplierIntegrations,
  searchSupplierProducts,
  getSupplierProductPrice,
  placeSupplierOrder,
  searchSupplierBranches,
} from '@/lib/actions/supplier'
import type {
  SupplierContact,
  PurchaseOrder,
  SupplierType,
  SupplierIntegration,
  SupplierProduct,
  SupplierBranch,
} from '@/lib/actions/supplier'

interface SupplierOrderProps {
  jobId: string
  companyName?: string
}

type OrderTab = 'abc_supply' | 'srs_roofhub' | 'email'

interface CartItem {
  product: SupplierProduct
  quantity: number
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:     { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
  sent:      { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
  confirmed: { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
  delivered: { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
}

const TAB_LABELS: Record<OrderTab, string> = {
  abc_supply: 'ABC Supply',
  srs_roofhub: 'SRS / Roof Hub',
  email: 'Email Order',
}

// ─── Debounce helper ─────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ─── API Integration Sub-component ───────────────────────────────────────────

function ApiSupplierPanel({
  supplierType,
  jobId,
  onOrderPlaced,
}: {
  supplierType: SupplierType
  jobId: string
  onOrderPlaced: () => void
}) {
  // Branch state
  const [zipInput, setZipInput] = useState('')
  const [branches, setBranches] = useState<SupplierBranch[]>([])
  const [selectedBranch, setSelectedBranch] = useState<SupplierBranch | null>(null)
  const [branchLoading, setBranchLoading] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounce(searchQuery, 400)
  const [searchResults, setSearchResults] = useState<SupplierProduct[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])

  // Order state
  const [placing, setPlacing] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Branch search
  const handleBranchSearch = async () => {
    if (zipInput.length < 5) return
    setBranchLoading(true)
    setError(null)
    try {
      const results = await searchSupplierBranches(supplierType, zipInput)
      setBranches(results)
      if (results.length === 1) setSelectedBranch(results[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find branches')
    } finally {
      setBranchLoading(false)
    }
  }

  // Product search (triggered by debounced query)
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) {
      setSearchResults([])
      return
    }

    let cancelled = false
    const run = async () => {
      setSearchLoading(true)
      try {
        const results = await searchSupplierProducts(
          supplierType,
          debouncedQuery,
          selectedBranch?.id
        )
        if (!cancelled) setSearchResults(results)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [debouncedQuery, supplierType, selectedBranch?.id])

  const addToCart = (product: SupplierProduct) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const updateCartQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.product.id !== productId))
    } else {
      setCart((prev) =>
        prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i))
      )
    }
  }

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId))
  }

  const cartTotal = cart.reduce((sum, item) => {
    const price = item.product.price ?? 0
    return sum + price * item.quantity
  }, 0)

  const handlePlaceOrder = async () => {
    if (!selectedBranch) {
      setError('Please select a branch first')
      return
    }
    if (cart.length === 0) {
      setError('Cart is empty')
      return
    }
    if (!window.confirm(`Place order for ${cart.length} item(s) at ${selectedBranch.name}?`)) return

    setPlacing(true)
    setError(null)
    try {
      const result = await placeSupplierOrder(supplierType, {
        branchId: selectedBranch.id,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          uom: i.product.uom,
        })),
        jobId,
      })
      setOrderSuccess(result.confirmationNumber)
      setCart([])
      onOrderPlaced()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order')
    } finally {
      setPlacing(false)
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
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* Error */}
      {error && (
        <div style={{ padding: '10px 12px', borderRadius: '4px', backgroundColor: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {/* Order success */}
      {orderSuccess && (
        <div style={{ padding: '12px', borderRadius: '4px', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>
          Order placed. Confirmation: {orderSuccess}
        </div>
      )}

      {/* Branch Finder */}
      <div>
        <label style={labelStyle}>Find a Branch</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={zipInput}
            onChange={(e) => setZipInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="Enter ZIP code"
            maxLength={5}
            style={{ ...inputStyle, flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBranchSearch() }}
          />
          <button
            onClick={handleBranchSearch}
            disabled={zipInput.length < 5 || branchLoading}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: zipInput.length < 5 || branchLoading ? 'not-allowed' : 'pointer',
              opacity: zipInput.length < 5 || branchLoading ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {branchLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Branch results */}
        {branches.length > 0 && (
          <div style={{ marginTop: '8px', display: 'grid', gap: '4px' }}>
            {branches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => setSelectedBranch(branch)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: selectedBranch?.id === branch.id
                    ? '2px solid var(--accent)'
                    : '1px solid var(--border-subtle)',
                  backgroundColor: selectedBranch?.id === branch.id
                    ? 'rgba(245,158,11,0.06)'
                    : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                  {branch.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {branch.address}, {branch.city}, {branch.state} &middot; {branch.phone}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected branch indicator */}
        {selectedBranch && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--accent)', fontWeight: 500 }}>
            Selected: {selectedBranch.name}
          </div>
        )}
      </div>

      {/* Product Search */}
      <div>
        <label style={labelStyle}>Search Products</label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shingles, underlayment, flashing..."
            style={inputStyle}
          />
          {searchLoading && (
            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Searching...
            </div>
          )}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div style={{ marginTop: '8px', maxHeight: '280px', overflowY: 'auto', display: 'grid', gap: '4px' }}>
            {searchResults.map((product) => {
              const inCart = cart.some((i) => i.product.id === product.id)
              return (
                <div
                  key={product.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: inCart ? 'rgba(245,158,11,0.04)' : 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>
                      {product.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {product.description}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '12px' }}>
                      {product.price != null && (
                        <span style={{ color: '#22c55e', fontWeight: 600 }}>
                          ${product.price.toFixed(2)} / {product.uom}
                        </span>
                      )}
                      {product.availability && (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {product.availability}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => addToCart(product)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: inCart ? 'var(--border-subtle)' : 'var(--accent)',
                      color: inCart ? 'var(--text-secondary)' : 'var(--bg-deep)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      marginLeft: '12px',
                      flexShrink: 0,
                    }}
                  >
                    {inCart ? '+ More' : 'Add'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <div>
          <label style={labelStyle}>
            Cart ({cart.length} item{cart.length !== 1 ? 's' : ''})
          </label>
          <div style={{ display: 'grid', gap: '4px', marginBottom: '12px' }}>
            {cart.map((item) => (
              <div
                key={item.product.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <div style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {item.product.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: '16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                    }}
                  >
                    -
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '24px', textAlign: 'center' }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: '16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                    }}
                  >
                    +
                  </button>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '50px', textAlign: 'right' }}>
                  {item.product.uom}
                </span>
                {item.product.price != null && (
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#22c55e', minWidth: '70px', textAlign: 'right' }}>
                    ${(item.product.price * item.quantity).toFixed(2)}
                  </span>
                )}
                <button
                  onClick={() => removeFromCart(item.product.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    fontSize: '14px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    lineHeight: 1,
                  }}
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>

          {/* Total + Place Order */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {cartTotal > 0 && (
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Total: <span style={{ color: '#22c55e' }}>${cartTotal.toFixed(2)}</span>
              </div>
            )}
            <button
              onClick={handlePlaceOrder}
              disabled={placing || !selectedBranch}
              style={{
                padding: '12px 24px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'var(--accent)',
                color: 'var(--bg-deep)',
                fontSize: '14px',
                fontWeight: 700,
                cursor: placing || !selectedBranch ? 'not-allowed' : 'pointer',
                opacity: placing || !selectedBranch ? 0.5 : 1,
                marginLeft: 'auto',
              }}
            >
              {placing ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
          {!selectedBranch && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'right' }}>
              Select a branch above before placing an order.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SupplierOrder({ jobId, companyName = 'Roofing Company' }: SupplierOrderProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<OrderTab>('email')
  const [integrations, setIntegrations] = useState<SupplierIntegration[]>([])
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false)

  // Email order state (original)
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

  // Delivery notes
  const [noteOrderId, setNoteOrderId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteDeliveryDate, setNoteDeliveryDate] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    loadContacts()
    loadOrders()
    loadIntegrations()
  }, [jobId])

  const loadIntegrations = async () => {
    try {
      const data = await getSupplierIntegrations()
      setIntegrations(data)
      // Default to first configured integration
      const configured = data.filter((i) => i.isConfigured && i.type !== 'email_only')
      if (configured.length > 0 && (configured[0].type === 'abc_supply' || configured[0].type === 'srs_roofhub')) {
        setActiveTab(configured[0].type)
      }
    } catch {
      // non-fatal — fall back to email tab
    } finally {
      setIntegrationsLoaded(true)
    }
  }

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
    setError(null)
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

    const selectedContact = contacts.find((c) => c.id === selectedContactId)
    const recipientLabel = selectedContact ? selectedContact.name : supplierEmail
    if (!window.confirm(`Send this order to ${recipientLabel}?`)) return

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

  const handleSaveNote = async (orderId: string) => {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      const updated = await addDeliveryNote(orderId, noteText.trim(), noteDeliveryDate || undefined)
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, delivery_notes: updated.delivery_notes, estimated_delivery: updated.estimated_delivery } : o))
      )
      setNoteOrderId(null)
      setNoteText('')
      setNoteDeliveryDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save delivery note')
    } finally {
      setSavingNote(false)
    }
  }

  const STATUS_STEPS = ['draft', 'sent', 'confirmed', 'delivered'] as const

  const getDaysAgo = (dateStr: string | null): string | null => {
    if (!dateStr) return null
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return '1 day ago'
    return `${diff} days ago`
  }

  const getOrderAgeLabel = (order: PurchaseOrder): string | null => {
    if (order.status === 'delivered') return `Delivered ${getDaysAgo(order.delivered_at)}`
    if (order.sent_at) return `Sent ${getDaysAgo(order.sent_at)}`
    const age = getDaysAgo(order.sent_at || order.created_at)
    if (!age) return null
    return `Created ${age}`
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

  // Build tab list: only show API tabs if configured
  const configuredTypes = integrations
    .filter((i) => i.isConfigured && i.type !== 'email_only')
    .map((i) => i.type as OrderTab)
  const tabs: OrderTab[] = [...configuredTypes, 'email']

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

      {/* ─── Integration Tabs ──────────────────────────────────────────── */}
      {integrationsLoaded && tabs.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab
            const isApi = tab !== 'email'
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: isActive ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
                  backgroundColor: isActive ? 'rgba(245,158,11,0.08)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {TAB_LABELS[tab]}
                {isApi && (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 5px',
                      borderRadius: '3px',
                      backgroundColor: 'rgba(34,197,94,0.15)',
                      color: '#22c55e',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Live Pricing
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ─── API Tab Content ───────────────────────────────────────────── */}
      {activeTab !== 'email' && (
        <ApiSupplierPanel
          supplierType={activeTab}
          jobId={jobId}
          onOrderPlaced={loadOrders}
        />
      )}

      {/* ─── Email Tab Content (original flow) ────────────────────────── */}
      {activeTab === 'email' && (
        <>
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
                    {c.is_preferred ? '* ' : ''}{c.name}{c.specialty ? ` (${c.specialty})` : ''}
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
        </>
      )}

      {/* ─── Order History (shared across all tabs) ────────────────────── */}
      <div style={{ marginTop: activeTab === 'email' ? '0' : '20px' }}>
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
              orders.map((order) => {
                const currentIdx = STATUS_STEPS.indexOf(order.status as typeof STATUS_STEPS[number])
                const ageLabel = getOrderAgeLabel(order)

                return (
                  <div
                    key={order.id}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-secondary)',
                    }}
                  >
                    {/* Header row */}
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

                    {/* Date + age indicator */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      <span>
                        {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {ageLabel && (
                        <span style={{ fontStyle: 'italic', opacity: 0.8 }}>{ageLabel}</span>
                      )}
                    </div>

                    {/* Visual status timeline */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '10px' }}>
                      {STATUS_STEPS.map((step, idx) => {
                        const isReached = idx <= currentIdx
                        const stepColor = isReached ? (STATUS_COLORS[step]?.color ?? 'var(--text-secondary)') : 'var(--border-subtle)'
                        const isLast = idx === STATUS_STEPS.length - 1

                        return (
                          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: isLast ? '0 0 auto' : 1 }}>
                            {/* Step dot */}
                            <div style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              backgroundColor: isReached ? stepColor : 'transparent',
                              border: `2px solid ${stepColor}`,
                              flexShrink: 0,
                              position: 'relative',
                            }}>
                              <span style={{
                                position: 'absolute',
                                top: '14px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                fontSize: '9px',
                                color: isReached ? stepColor : 'var(--text-secondary)',
                                fontWeight: isReached ? 600 : 400,
                                whiteSpace: 'nowrap',
                                textTransform: 'capitalize',
                              }}>
                                {step}
                              </span>
                            </div>
                            {/* Connector line */}
                            {!isLast && (
                              <div style={{
                                flex: 1,
                                height: '2px',
                                backgroundColor: idx < currentIdx ? (STATUS_COLORS[STATUS_STEPS[idx + 1]]?.color ?? 'var(--border-subtle)') : 'var(--border-subtle)',
                              }} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {/* Spacer for step labels below dots */}
                    <div style={{ height: '14px' }} />

                    {/* Estimated delivery */}
                    {(order as PurchaseOrder & { estimated_delivery?: string | null }).estimated_delivery && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        marginBottom: '6px',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="1" y="2" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                          <path d="M1 6h14" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M5 1v2M11 1v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <span>
                          Expected: {new Date((order as PurchaseOrder & { estimated_delivery: string }).estimated_delivery).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    )}

                    {/* Delivery notes */}
                    {(order as PurchaseOrder & { delivery_notes?: string | null }).delivery_notes && (
                      <div style={{
                        padding: '8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(100,116,139,0.06)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        marginBottom: '8px',
                        lineHeight: '1.4',
                      }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginRight: '4px' }}>Note:</span>
                        {(order as PurchaseOrder & { delivery_notes: string }).delivery_notes}
                      </div>
                    )}

                    {/* Inline add-note form */}
                    {noteOrderId === order.id ? (
                      <div style={{ marginBottom: '8px', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Delivery note..."
                          rows={2}
                          style={{
                            ...inputStyle,
                            resize: 'vertical',
                            marginBottom: '6px',
                            minHeight: '48px',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Est. delivery:</label>
                          <input
                            type="date"
                            value={noteDeliveryDate}
                            onChange={(e) => setNoteDeliveryDate(e.target.value)}
                            style={{ ...inputStyle, flex: 1 }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handleSaveNote(order.id)}
                            disabled={savingNote || !noteText.trim()}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '4px',
                              border: 'none',
                              backgroundColor: 'var(--accent)',
                              color: 'var(--bg-deep)',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: savingNote || !noteText.trim() ? 'not-allowed' : 'pointer',
                              opacity: savingNote || !noteText.trim() ? 0.5 : 1,
                            }}
                          >
                            {savingNote ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setNoteOrderId(null); setNoteText(''); setNoteDeliveryDate('') }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-subtle)',
                              backgroundColor: 'transparent',
                              color: 'var(--text-secondary)',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setNoteOrderId(order.id)
                          setNoteText((order as PurchaseOrder & { delivery_notes?: string | null }).delivery_notes ?? '')
                          setNoteDeliveryDate((order as PurchaseOrder & { estimated_delivery?: string | null }).estimated_delivery ?? '')
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                          marginBottom: '8px',
                          display: 'block',
                        }}
                      >
                        + Add delivery note
                      </button>
                    )}

                    {/* Status advancement -- forward-only */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {({ draft: ['sent'], sent: ['confirmed'], confirmed: ['delivered'], delivered: [] } as Record<string, string[]>)[order.status]?.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(order.id, s as 'draft' | 'sent' | 'confirmed' | 'delivered')}
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
                )
              }))
            }
          </div>
        )}
      </div>
    </div>
  )
}
