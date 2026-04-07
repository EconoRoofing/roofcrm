'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addCertification, deleteCertification } from '@/lib/actions/safety'
import type { Certification } from '@/lib/actions/safety'
import { CertBadgeIcon, PlusIcon, TrashIcon, XIcon } from '@/components/icons'

interface UserWithCerts {
  id: string
  name: string
  avatar_url: string | null
  certs: Certification[]
}

interface Props {
  usersWithCerts: UserWithCerts[]
}

export function CertManager({ usersWithCerts }: Props) {
  const router = useRouter()
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [certName, setCertName] = useState('')
  const [certNumber, setCertNumber] = useState('')
  const [issuedDate, setIssuedDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')

  function resetForm() {
    setCertName('')
    setCertNumber('')
    setIssuedDate('')
    setExpiryDate('')
    setError(null)
  }

  function handleAdd(userId: string) {
    if (!certName.trim()) {
      setError('Certification name is required')
      return
    }

    startTransition(async () => {
      try {
        await addCertification({
          userId,
          name: certName.trim(),
          certNumber: certNumber.trim() || undefined,
          issuedDate: issuedDate || undefined,
          expiryDate: expiryDate || undefined,
        })
        resetForm()
        setAddingFor(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add certification')
      }
    })
  }

  function handleDelete(certId: string) {
    startTransition(async () => {
      try {
        await deleteCertification(certId)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete certification')
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--accent-red-dim)',
            border: '1px solid rgba(255,82,82,0.2)',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--accent-red)',
          }}
        >
          {error}
        </div>
      )}

      {usersWithCerts.map((user) => (
        <div
          key={user.id}
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {/* User header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-elevated)',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-dim)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--accent)',
                fontFamily: 'var(--font-sans)',
                overflow: 'hidden',
              }}
            >
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div
              style={{
                flex: 1,
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {user.name}
            </div>
            <button
              type="button"
              onClick={() => {
                setAddingFor(addingFor === user.id ? null : user.id)
                resetForm()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: addingFor === user.id ? 'var(--bg-surface)' : 'var(--accent-dim)',
                border: `1px solid ${addingFor === user.id ? 'var(--border-subtle)' : 'var(--accent)'}`,
                borderRadius: '8px',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 600,
                color: addingFor === user.id ? 'var(--text-muted)' : 'var(--accent)',
                cursor: 'pointer',
              }}
            >
              {addingFor === user.id ? (
                <>
                  <XIcon size={12} />
                  Cancel
                </>
              ) : (
                <>
                  <PlusIcon size={12} />
                  Add Cert
                </>
              )}
            </button>
          </div>

          {/* Add cert form */}
          {addingFor === user.id && (
            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '2px',
                }}
              >
                Add Certification
              </div>

              {/* Common cert quick-picks */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['OSHA 10', 'OSHA 30', 'CPR/First Aid', 'Forklift', 'Fall Protection', 'Aerial Lift'].map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setCertName(name)}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: certName === name ? 'var(--accent-dim)' : 'var(--bg-surface)',
                      border: `1px solid ${certName === name ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      borderRadius: '20px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: certName === name ? 'var(--accent)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={certName}
                onChange={(e) => setCertName(e.target.value)}
                placeholder="Certification name (required)"
                style={inputStyle}
              />
              <input
                type="text"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                placeholder="Cert number (optional)"
                style={inputStyle}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>Issued Date</label>
                  <input
                    type="date"
                    value={issuedDate}
                    onChange={(e) => setIssuedDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleAdd(user.id)}
                disabled={isPending || !certName.trim()}
                style={{
                  padding: '10px 16px',
                  background:
                    certName.trim() && !isPending
                      ? 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))'
                      : 'var(--bg-surface)',
                  border: certName.trim() ? 'none' : '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: certName.trim() && !isPending ? 'var(--nav-text)' : 'var(--text-muted)',
                  cursor: certName.trim() && !isPending ? 'pointer' : 'not-allowed',
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? 'Saving...' : 'Save Certification'}
              </button>
            </div>
          )}

          {/* Cert list */}
          {user.certs.length === 0 ? (
            <div
              style={{
                padding: '16px',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              No certifications on file
            </div>
          ) : (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {user.certs.map((cert) => {
                const statusColor =
                  cert.status === 'expired'
                    ? 'var(--accent-red)'
                    : cert.status === 'expiring_soon'
                      ? 'var(--accent-amber)'
                      : '#22c55e'
                const statusBg =
                  cert.status === 'expired'
                    ? 'var(--accent-red-dim)'
                    : cert.status === 'expiring_soon'
                      ? 'var(--accent-amber-dim)'
                      : 'rgba(34,197,94,0.12)'

                return (
                  <div
                    key={cert.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-elevated)',
                      borderRadius: '8px',
                      border: `1px solid ${cert.status === 'expired' ? 'rgba(255,82,82,0.2)' : cert.status === 'expiring_soon' ? 'rgba(255,171,0,0.2)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    <div style={{ color: statusColor, flexShrink: 0 }}>
                      <CertBadgeIcon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {cert.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                        {cert.cert_number && (
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            #{cert.cert_number}
                          </span>
                        )}
                        {cert.expiry_date && (
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Expires {new Date(cert.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <span
                      style={{
                        padding: '2px 8px',
                        backgroundColor: statusBg,
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: statusColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        flexShrink: 0,
                      }}
                    >
                      {cert.status === 'expiring_soon' ? 'Expiring' : cert.status}
                    </span>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDelete(cert.id)}
                      disabled={isPending}
                      style={{
                        padding: '4px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <TrashIcon size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  fontFamily: 'var(--font-sans)',
  fontSize: '13px',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-sans)',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: '4px',
}
