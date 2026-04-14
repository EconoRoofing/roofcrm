'use client'

import { useState, useEffect, useRef } from 'react'
import { updateClaimStatus, updateAdjusterInfo, updateSupplementAmount, getClaimTimeline, addClaimDocument, getClaimDocuments } from '@/lib/actions/insurance'
import type { ClaimStatus, ClaimTimeline, ClaimDocument } from '@/lib/actions/insurance'
import { createClient } from '@/lib/supabase/client'

const CLAIM_STATUSES: ClaimStatus[] = ['filed', 'inspection', 'approved', 'supplement', 'done']

const VALID_CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  filed: ['inspection'],
  inspection: ['approved', 'filed'],
  approved: ['supplement', 'done'],
  supplement: ['approved', 'done'],
  done: [],
}

const STATUS_COLORS: Record<ClaimStatus, string> = {
  filed: '#64748b',
  inspection: '#3b82f6',
  approved: '#22c55e',
  supplement: '#f59e0b',
  done: '#10b981',
}

interface ClaimWorkflowProps {
  jobId: string
  claimNumber?: string
  currentStatus?: ClaimStatus
  adjusterName?: string
  adjusterPhone?: string
  adjusterEmail?: string
  supplementAmount?: number
  originalAmount?: number
  approvedAmount?: number
  onStatusChange?: (status: ClaimStatus) => void
}

export function ClaimWorkflow({
  jobId,
  claimNumber,
  currentStatus = 'filed',
  adjusterName,
  adjusterPhone,
  adjusterEmail,
  supplementAmount = 0,
  originalAmount = 0,
  approvedAmount = 0,
  onStatusChange,
}: ClaimWorkflowProps) {
  const [status, setStatus] = useState<ClaimStatus>(currentStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdjusterForm, setShowAdjusterForm] = useState(false)
  const [showSupplementForm, setShowSupplementForm] = useState(false)
  const [timeline, setTimeline] = useState<ClaimTimeline[]>([])
  const [documents, setDocuments] = useState<ClaimDocument[]>([])
  const [uploadingStage, setUploadingStage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingUploadStage, setPendingUploadStage] = useState<string | null>(null)
  const [adjusterDisplay, setAdjusterDisplay] = useState({
    name: adjusterName || '',
    phone: adjusterPhone || '',
    email: adjusterEmail || '',
  })
  const [adjusterForm, setAdjusterForm] = useState({
    name: adjusterName || '',
    phone: adjusterPhone || '',
    email: adjusterEmail || '',
  })
  const [displaySupplementAmount, setDisplaySupplementAmount] = useState(supplementAmount)
  const [supplementForm, setSupplementForm] = useState({
    amount: supplementAmount.toString(),
  })

  // Load claim timeline and documents on mount
  useEffect(() => {
    getClaimTimeline(jobId)
      .then(setTimeline)
      .catch(() => {/* non-fatal */})
    getClaimDocuments(jobId)
      .then(setDocuments)
      .catch(() => {})
  }, [jobId])

  const handleDocumentUpload = async (stage: string, file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      setError('File too large (max 25MB)')
      setTimeout(() => setError(null), 5000)
      return
    }

    // Audit R5-#6: previously passed `contentType: file.type` unmodified
    // — an attacker could upload evil.html with Content-Type: text/html.
    // If the bucket ever became public (see R5-#2 for the estimates
    // bucket story), the uploaded HTML would execute JS in the browser
    // when the signed URL is opened, with session cookies for the
    // supabase.co domain — full XSS on the storage origin.
    // Fix: whitelist to PDFs and images only. Also validate filename
    // extensions to block things like `invoice.pdf.html`.
    const ALLOWED_MIME = new Set([
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/heic',
      'image/heif',
      'image/webp',
    ])
    if (!ALLOWED_MIME.has(file.type)) {
      setError(`File type not allowed. PDF or image only (got: ${file.type || 'unknown'})`)
      setTimeout(() => setError(null), 5000)
      return
    }
    // Strip any path-traversal characters from the filename before
    // embedding it in the storage path. File.name is user-controlled.
    const safeName = file.name
      .replace(/[^\w.\- ]/g, '_')
      .replace(/\.+/g, '.')
      .slice(0, 200)

    setUploadingStage(stage)
    try {
      const supabase = createClient()
      const path = `claim-docs/${jobId}/${stage}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('claim-documents')
        .upload(path, file, { contentType: file.type, upsert: false })

      if (uploadError) throw uploadError

      // Store the storage path (not a signed URL) so it never expires
      const doc: ClaimDocument = {
        stage,
        url: path,
        name: file.name,
        uploaded_at: new Date().toISOString(),
      }

      const updated = await addClaimDocument(jobId, doc)
      setDocuments(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setError(msg)
      setTimeout(() => setError(null), 5000)
    } finally {
      setUploadingStage(null)
      setPendingUploadStage(null)
    }
  }

  const triggerUpload = (stage: string) => {
    setPendingUploadStage(stage)
    fileInputRef.current?.click()
  }

  const handleStatusChange = async (newStatus: ClaimStatus) => {
    try {
      setLoading(true)
      setError(null)
      await updateClaimStatus(jobId, newStatus)
      setStatus(newStatus)
      onStatusChange?.(newStatus)
      // Auto-refresh timeline to show the new entry
      getClaimTimeline(jobId).then(setTimeline).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update status'
      setError(msg)
      setTimeout(() => setError(null), 5000)
    } finally {
      setLoading(false)
    }
  }

  const handleAdjusterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)
      await updateAdjusterInfo(jobId, adjusterForm.name, adjusterForm.phone, adjusterForm.email)
      // Update displayed values with the saved form values
      setAdjusterDisplay({ ...adjusterForm })
      setShowAdjusterForm(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update adjuster info'
      setError(msg)
      setTimeout(() => setError(null), 5000)
    } finally {
      setLoading(false)
    }
  }

  const handleSupplementSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseFloat(supplementForm.amount)
    if (isNaN(parsed) || parsed <= 0) {
      setError('Please enter a valid supplement amount')
      setTimeout(() => setError(null), 5000)
      return
    }
    try {
      setLoading(true)
      setError(null)
      await updateSupplementAmount(jobId, parsed)
      setDisplaySupplementAmount(parsed)
      setShowSupplementForm(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update supplement amount'
      setError(msg)
      setTimeout(() => setError(null), 5000)
    } finally {
      setLoading(false)
    }
  }

  const currentIndex = CLAIM_STATUSES.indexOf(status)

  return (
    <div
      style={{
        padding: '20px',
        borderRadius: '8px',
        backgroundColor: 'var(--surface-hover)',
        border: '1px solid var(--border)',
      }}
    >
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', margin: 0 }}>Insurance Claim</h2>

      {claimNumber && (
        <div style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--text-secondary)' }}>
          Claim #{claimNumber}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Status Pipeline */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          {CLAIM_STATUSES.map((s, index) => {
            const isCurrentOrPast = index <= currentIndex
            const isValidNext = VALID_CLAIM_TRANSITIONS[status]?.includes(s) ?? false
            const canClick = s !== status && isValidNext
            return (
            <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <button
                onClick={() => handleStatusChange(s)}
                disabled={loading || !canClick}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: isCurrentOrPast ? STATUS_COLORS[s] : 'var(--surface)',
                  color: isCurrentOrPast ? '#fff' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: canClick && !loading ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                  opacity: !canClick && !isCurrentOrPast ? 0.5 : 1,
                  border: index === currentIndex ? `2px solid ${STATUS_COLORS[s]}` : '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
                title={s.replace(/_/g, ' ')}
              >
                {index + 1}
              </button>
              <div style={{ fontSize: '11px', marginTop: '6px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                {s.replace(/_/g, ' ')}
              </div>
            </div>
            )
          })}
        </div>

        {/* Status Line Connector */}
        <div
          style={{
            height: '2px',
            backgroundColor: 'var(--border)',
            position: 'relative',
            marginTop: '56px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              height: '100%',
              backgroundColor: STATUS_COLORS[status],
              width: `${(currentIndex / (CLAIM_STATUSES.length - 1)) * 100}%`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Adjuster Card */}
      <div
        style={{
          padding: '16px',
          borderRadius: '8px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Adjuster</h3>
          <button
            onClick={() => setShowAdjusterForm(!showAdjusterForm)}
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
            {showAdjusterForm ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {showAdjusterForm ? (
          <form onSubmit={handleAdjusterSubmit} style={{ display: 'grid', gap: '8px' }}>
            <input
              type="text"
              value={adjusterForm.name}
              onChange={(e) => setAdjusterForm({ ...adjusterForm, name: e.target.value })}
              placeholder="Adjuster name"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="tel"
              value={adjusterForm.phone}
              onChange={(e) => setAdjusterForm({ ...adjusterForm, phone: e.target.value })}
              placeholder="Phone number"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <input
              type="email"
              value={adjusterForm.email}
              onChange={(e) => setAdjusterForm({ ...adjusterForm, email: e.target.value })}
              placeholder="Email address"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.15s',
                opacity: loading ? 0.5 : 1,
              }}
            >
              Save
            </button>
          </form>
        ) : (
          <div style={{ fontSize: '13px', display: 'grid', gap: '6px' }}>
            {adjusterDisplay.name ? (
              <>
                <div>
                  <span style={{ fontWeight: 500 }}>Name:</span> {adjusterDisplay.name}
                </div>
                {adjusterDisplay.phone && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Phone:</span>{' '}
                    <a href={`tel:${adjusterDisplay.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {adjusterDisplay.phone}
                    </a>
                  </div>
                )}
                {adjusterDisplay.email && (
                  <div>
                    <span style={{ fontWeight: 500 }}>Email:</span>{' '}
                    <a href={`mailto:${adjusterDisplay.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {adjusterDisplay.email}
                    </a>
                  </div>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>No adjuster assigned yet</span>
            )}
          </div>
        )}
      </div>

      {/* Supplement Amount Tracker — show whenever there is a supplement amount or status is supplement */}
      {(status === 'supplement' || displaySupplementAmount > 0) && (
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Supplement Amount</h3>
            <button
              onClick={() => setShowSupplementForm(!showSupplementForm)}
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
              {showSupplementForm ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {showSupplementForm ? (
            <form onSubmit={handleSupplementSubmit} style={{ display: 'grid', gap: '8px' }}>
              <input
                type="number"
                value={supplementForm.amount}
                onChange={(e) => setSupplementForm({ amount: e.target.value })}
                step="0.01"
                min="0"
                placeholder="0.00"
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--surface-hover)',
                  color: 'var(--text)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.15s',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                Save
              </button>
            </form>
          ) : (
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent)' }}>
              ${displaySupplementAmount.toFixed(2)}
            </div>
          )}
        </div>
      )}

      {/* Claim Timeline */}
      {timeline.length > 0 && (
        <div
          style={{
            marginTop: '16px',
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>Claim History</h3>
          <div style={{ display: 'grid', gap: '8px' }}>
            {timeline.map((entry) => (
              <div key={entry.timestamp} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '13px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: STATUS_COLORS[entry.status] || '#64748b',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 600,
                    flexShrink: 0,
                    textTransform: 'capitalize',
                  }}
                >
                  {entry.status}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {new Date(entry.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supplement Comparison — show when status is supplement or approved and amounts are set */}
      {(status === 'supplement' || status === 'approved') && (originalAmount > 0 || displaySupplementAmount > 0 || approvedAmount > 0) && (
        <div
          style={{
            marginTop: '16px',
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>Amount Comparison</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {[
              { label: 'Original', amount: originalAmount, color: '#64748b' },
              { label: 'Supplement Request', amount: displaySupplementAmount, color: '#f59e0b' },
              { label: 'Approved', amount: approvedAmount, color: '#22c55e' },
            ].map(({ label, amount, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color }}>${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            ))}
          </div>
          {approvedAmount > 0 && displaySupplementAmount > 0 && (
            <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
              Difference: <span style={{ fontWeight: 600, color: approvedAmount >= displaySupplementAmount ? '#22c55e' : '#ef4444' }}>
                {approvedAmount >= displaySupplementAmount ? '+' : ''}{(approvedAmount - displaySupplementAmount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Document Attachments Per Stage */}
      <div
        style={{
          marginTop: '16px',
          padding: '16px',
          borderRadius: '8px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>Claim Documents</h3>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && pendingUploadStage) {
              handleDocumentUpload(pendingUploadStage, file)
            }
            // Reset so same file can be re-selected
            e.target.value = ''
          }}
        />

        <div style={{ display: 'grid', gap: '12px' }}>
          {CLAIM_STATUSES.map((s) => {
            const stageDocs = documents.filter((d) => d.stage === s)
            return (
              <div key={s}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{s}</span>
                  <button
                    onClick={() => triggerUpload(s)}
                    disabled={uploadingStage === s}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'transparent',
                      color: 'var(--accent)',
                      fontSize: '11px',
                      cursor: uploadingStage === s ? 'not-allowed' : 'pointer',
                      opacity: uploadingStage === s ? 0.5 : 1,
                    }}
                  >
                    {uploadingStage === s ? 'Uploading...' : '+ Upload'}
                  </button>
                </div>
                {stageDocs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {stageDocs.map((doc, idx) => (
                      <a
                        key={idx}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--surface-hover)',
                          textDecoration: 'none',
                          fontSize: '12px',
                          color: 'var(--accent)',
                        }}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '11px', flexShrink: 0 }}>
                          {new Date(doc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingLeft: '4px' }}>No documents</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
