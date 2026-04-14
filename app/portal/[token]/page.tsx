'use client'

import React, { useEffect, useState, useRef } from 'react'
import {
  getJobByPortalToken,
  getPortalInvoices,
  getPortalMessages,
  sendPortalMessage,
  getPortalPhotos,
} from '@/lib/actions/portal'
import { formatCents, dollarsToCents } from '@/lib/money'

const STATUS_STEPS = [
  { key: 'lead', label: 'Lead' },
  { key: 'estimate_scheduled', label: 'Estimate' },
  { key: 'pending', label: 'Pending' },
  { key: 'sold', label: 'Sold' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Complete' },
]

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = React.use(params)
  const [job, setJob] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Messaging
  const [msgText, setMsgText] = useState('')
  const [msgSending, setMsgSending] = useState(false)
  const [msgSent, setMsgSent] = useState(false)

  // Photo lightbox
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [jobData, invData, msgData, photoData] = await Promise.all([
          getJobByPortalToken(token),
          getPortalInvoices(token),
          getPortalMessages(token),
          getPortalPhotos(token),
        ])

        if (!jobData) {
          setError('Project not found')
        } else {
          setJob(jobData)
          setInvoices(invData)
          setMessages(msgData)
          setPhotos(photoData)
        }
      } catch (err) {
        setError('Failed to load project')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [token])

  const handleSendMessage = async () => {
    if (!msgText.trim() || msgSending) return
    setMsgSending(true)
    try {
      const ok = await sendPortalMessage(token, msgText)
      if (ok) {
        setMsgSent(true)
        setMsgText('')
        // Reload messages
        const newMessages = await getPortalMessages(token)
        setMessages(newMessages)
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setMsgSending(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-deep)', color: 'var(--text-secondary)' }}>
        <div>Loading project...</div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-deep)' }}>
        <div style={{ maxWidth: '400px', padding: '32px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Project not found</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            The project link you provided is invalid or has expired. Please contact your roofing company for assistance.
          </p>
        </div>
      </div>
    )
  }

  const currentStatusIndex = STATUS_STEPS.findIndex((s) => s.key === job.status)
  const progressPercent = currentStatusIndex >= 0 ? ((currentStatusIndex + 1) / STATUS_STEPS.length) * 100 : 0
  const company = job.companies as any
  const accentColor = company?.color || 'var(--accent)'

  const allPaid = invoices.length > 0 && invoices.every((inv: any) => inv.status === 'paid')
  const unpaidInvoices = invoices.filter((inv: any) => inv.status !== 'paid' && inv.status !== 'cancelled')

  // Pipe through cents formatter so display matches the rest of the app
  const formatCurrency = (n: number) => formatCents(dollarsToCents(n))

  const formatDate = (d: string) =>
    new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--bg-deep)' }}>
      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <img
            src={lightboxPhoto}
            alt="Project photo"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px' }}
          />
          <div style={{ position: 'absolute', top: '20px', right: '24px', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>
            x
          </div>
        </div>
      )}

      {/* Company accent bar */}
      <div style={{ height: '6px', backgroundColor: accentColor }} />

      {/* Header */}
      <header style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', padding: '24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {company?.name || 'Roofing Project'}
          </h1>
          {company?.address && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>{company.address}</p>
          )}
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>Project #{job.job_number}</p>
        </div>
      </header>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 24px' }}>

        {/* Status Progress Bar */}
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Project Status
          </h2>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ height: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: 'var(--accent)', transition: 'width 0.3s ease' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            {STATUS_STEPS.map((step, idx) => {
              const isActive = idx <= currentStatusIndex
              return (
                <div key={step.key} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isActive ? 'var(--accent)' : 'var(--bg-secondary)', color: isActive ? 'var(--bg-deep)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600 }}>
                    {idx + 1}
                  </div>
                  <span style={{ fontSize: '12px', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isActive ? 500 : 400 }}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Project Details */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>Project Details</h2>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>CUSTOMER</label>
              <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>{job.customer_name}</p>
            </div>
            {job.scheduled_date && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>SCHEDULED DATE</label>
                <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {/* Audit R2-#26: append T00:00:00 so the YYYY-MM-DD string parses as
                      LOCAL midnight, not UTC midnight. Without this, Pacific customers
                      see scheduled dates a day earlier than what the office set. */}
                  {new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Invoices / Payment */}
        {invoices.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Invoices
              {allPaid && <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 600, color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: '12px' }}>PAID IN FULL</span>}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {invoices.map((inv: any) => {
                const isPaid = inv.status === 'paid'
                const isOverdue = inv.status === 'overdue'
                return (
                  <div
                    key={inv.id}
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: `1px solid ${isPaid ? 'rgba(34,197,94,0.3)' : isOverdue ? 'rgba(239,68,68,0.3)' : 'var(--border-subtle)'}`,
                      borderRadius: '8px',
                      padding: '20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        {inv.invoice_number} &mdash; {(inv.type || 'standard').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {/* Audit R3-#2: cents-only — readMoneyFromRow's legacy
                            fallback referenced inv.total_amount which is dropped
                            by migration 031. */}
                        {formatCents(inv.total_amount_cents ?? 0)}
                      </div>
                      {inv.due_date && (
                        <div style={{ fontSize: '12px', color: isOverdue ? '#ef4444' : 'var(--text-secondary)', marginTop: '4px' }}>
                          {isPaid ? 'Paid' : `Due ${formatDate(inv.due_date)}`}
                          {isOverdue && !isPaid ? ' — OVERDUE' : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {inv.pdf_url && (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none', cursor: 'pointer', fontWeight: 500 }}
                        >
                          View PDF
                        </a>
                      )}
                      {isPaid ? (
                        <span style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>
                          Paid
                        </span>
                      ) : inv.payment_link ? (
                        <a
                          href={inv.payment_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ padding: '10px 24px', borderRadius: '6px', backgroundColor: accentColor, color: '#fff', fontSize: '14px', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
                        >
                          Pay Now
                        </a>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Photo Gallery */}
        {photos.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Project Photos
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
              {photos.map((photo: any) => (
                <div
                  key={photo.id}
                  onClick={() => setLightboxPhoto(photo.urls?.original || photo.urls?.thumbnail)}
                  style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'var(--bg-secondary)' }}
                >
                  <img
                    src={photo.urls?.thumbnail || photo.urls?.original}
                    alt="Project photo"
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.15s ease' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.04)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message History + Send Message */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Messages
          </h2>

          {/* Message thread */}
          {messages.length > 0 && (
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                maxHeight: '320px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {messages.map((msg: any) => {
                const isInbound = msg.direction === 'inbound'
                return (
                  <div
                    key={msg.id}
                    style={{ display: 'flex', justifyContent: isInbound ? 'flex-end' : 'flex-start' }}
                  >
                    <div
                      style={{
                        maxWidth: '70%',
                        padding: '10px 14px',
                        borderRadius: isInbound ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        backgroundColor: isInbound ? accentColor : 'var(--bg-secondary)',
                        color: isInbound ? '#fff' : 'var(--text-primary)',
                        fontSize: '13px',
                        lineHeight: 1.5,
                      }}
                    >
                      <div>{msg.body}</div>
                      <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7, textAlign: 'right' }}>
                        {new Date(msg.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Send form */}
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Send a Message to {company?.name || 'Us'}
            </h3>
            {msgSent && (
              <div style={{ marginBottom: '12px', padding: '10px 14px', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '6px', fontSize: '13px', color: '#22c55e' }}>
                Your message has been sent to {company?.name || 'the team'}.
              </div>
            )}
            <textarea
              value={msgText}
              onChange={(e) => { setMsgText(e.target.value); setMsgSent(false) }}
              placeholder="Type your message here..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleSendMessage}
                disabled={!msgText.trim() || msgSending}
                style={{
                  padding: '10px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: !msgText.trim() || msgSending ? 'var(--bg-secondary)' : accentColor,
                  color: !msgText.trim() || msgSending ? 'var(--text-muted)' : '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: !msgText.trim() || msgSending ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.15s',
                }}
              >
                {msgSending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Questions?</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
            Contact {company?.name || 'us'} directly for more information about your project.
          </p>
          {company?.phone && (
            <a
              href={`tel:${company.phone}`}
              style={{ display: 'inline-block', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: `1px solid ${accentColor}`, backgroundColor: accentColor, color: '#fff', textDecoration: 'none' }}
            >
              Call {company.name}
            </a>
          )}
          {!company?.phone && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              Please use the contact information provided to you by {company?.name || 'your contractor'}.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
