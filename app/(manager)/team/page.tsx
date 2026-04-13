'use client'

import { useState, useEffect } from 'react'
import { getProfiles, getCompanies, createProfile, updateProfile, setPin as setPinAction } from '@/lib/actions/profiles'

interface Profile {
  id: string
  name: string
  role: string
  avatar_url: string | null
  is_active: boolean
}

interface Company {
  id: string
  name: string
}

const ROLE_LABELS: Record<string, string> = {
  manager: 'Manager',
  sales: 'Sales',
  crew: 'Crew',
  sales_crew: 'Sales / Crew',
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  manager: { bg: 'var(--accent-dim)', color: 'var(--accent)' },
  sales: { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' },
  sales_crew: { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' },
  crew: { bg: 'var(--accent-amber-dim)', color: 'var(--accent-amber)' },
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

function AddMemberModal({
  onClose,
  onCreated,
  companies,
}: {
  onClose: () => void
  onCreated: () => void
  companies: Company[]
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('crew')
  const [pin, setPin] = useState('')
  const [primaryCompanyId, setPrimaryCompanyId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')
    if (pin && pin.length !== 4) return setError('PIN must be exactly 4 digits')
    setLoading(true)
    try {
      await createProfile(name.trim(), role, pin || undefined, primaryCompanyId || undefined)
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '32px',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <h2 style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '20px',
          fontWeight: 800,
          color: 'var(--text-primary)',
          margin: '0 0 24px',
        }}>
          Add Team Member
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginBottom: '8px',
            }}>
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginBottom: '8px',
            }}>
              Role
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            >
              <option value="owner">Owner</option>
              <option value="office_manager">Office Manager</option>
              <option value="manager">Manager</option>
              <option value="sales">Sales</option>
              <option value="crew">Crew</option>
              <option value="sales_crew">Sales / Crew</option>
            </select>
          </div>

          {companies.length > 0 && (
            <div>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                marginBottom: '8px',
              }}>
                Primary Company (Payroll)
              </label>
              <select
                value={primaryCompanyId}
                onChange={e => setPrimaryCompanyId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">-- None --</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginBottom: '8px',
            }}>
              PIN (4 digits)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Optional"
              style={{
                width: '100%',
                padding: '12px 14px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '20px',
                letterSpacing: '8px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--accent-red)',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '16px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 2,
                padding: '16px',
                backgroundColor: 'var(--accent)',
                border: 'none',
                borderRadius: '8px',
                color: '#000',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 700,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Creating...' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ResetPinModal({
  profile,
  onClose,
}: {
  profile: Profile
  onClose: () => void
}) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.length !== 4) return setError('PIN must be exactly 4 digits')
    setLoading(true)
    try {
      await setPinAction(profile.id, pin)
      setDone(true)
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '32px',
          width: '100%',
          maxWidth: '360px',
        }}
      >
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}>
              PIN Updated
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginBottom: '24px',
            }}>
              {profile.name}&apos;s PIN has been reset.
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '12px 32px',
                backgroundColor: 'var(--accent)',
                border: 'none',
                borderRadius: '8px',
                color: '#000',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '18px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 4px',
            }}>
              Reset PIN
            </h2>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              margin: '0 0 24px',
            }}>
              {profile.name}
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="New 4-digit PIN"
                autoFocus
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '24px',
                  letterSpacing: '10px',
                  textAlign: 'center',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />

              {error && (
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--accent-red)',
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || pin.length !== 4}
                  style={{
                    flex: 2,
                    padding: '12px',
                    backgroundColor: 'var(--accent)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#000',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: (loading || pin.length !== 4) ? 'default' : 'pointer',
                    opacity: (loading || pin.length !== 4) ? 0.5 : 1,
                  }}
                >
                  {loading ? 'Saving...' : 'Set PIN'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function TeamPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      // Include inactive profiles for management
      const [data, companiesData] = await Promise.all([
        getProfiles(),
        getCompanies(),
      ])
      setProfiles(data as Profile[])
      setCompanies(companiesData as Company[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleActive = async (profile: Profile) => {
    if (profile.is_active) {
      if (!confirm(`Deactivate ${profile.name}?`)) return
    }
    await updateProfile(profile.id, { is_active: !profile.is_active })
    load()
  }

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '40px 24px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px',
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '24px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Team
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            margin: '4px 0 0',
          }}>
            Manage team profiles and PINs
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          style={{
            padding: '10px 20px',
            backgroundColor: 'var(--accent)',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + Add Member
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-muted)',
          padding: '32px 0',
          textAlign: 'center',
        }}>
          Loading...
        </div>
      ) : profiles.length === 0 ? (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-muted)',
          padding: '32px 0',
          textAlign: 'center',
        }}>
          No team members yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {profiles.map(profile => {
            const roleStyle = ROLE_COLORS[profile.role] ?? ROLE_COLORS.crew

            return (
              <div
                key={profile.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '16px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  opacity: profile.is_active ? 1 : 0.5,
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: roleStyle.bg,
                  color: roleStyle.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '15px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {getInitials(profile.name)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}>
                    {profile.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '100px',
                      backgroundColor: roleStyle.bg,
                      color: roleStyle.color,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '1.5px',
                    }}>
                      {ROLE_LABELS[profile.role] ?? profile.role}
                    </span>
                    {!profile.is_active && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                      }}>
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setResetTarget(profile)}
                    aria-label={`Reset PIN for ${profile.name}`}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Reset PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(profile)}
                    aria-label={profile.is_active ? `Deactivate ${profile.name}` : `Activate ${profile.name}`}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      color: profile.is_active ? 'var(--accent-red)' : 'var(--accent)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {profile.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddMemberModal onClose={() => setShowAdd(false)} onCreated={load} companies={companies} />
      )}
      {resetTarget && (
        <ResetPinModal profile={resetTarget} onClose={() => setResetTarget(null)} />
      )}
    </div>
  )
}
