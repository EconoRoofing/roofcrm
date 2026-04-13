'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ProfileCard } from '@/components/auth/profile-card'
import { PinEntry } from '@/components/auth/pin-entry'
import { getProfiles, createProfile, signOutAndClear } from '@/lib/actions/profiles'

interface Profile {
  id: string
  name: string
  role: string
  avatar_url: string | null
}

// --- Setup form for first-time ---
function SetupForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('manager')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')
    if (pin && pin.length !== 4) return setError('PIN must be 4 digits')
    setLoading(true)
    try {
      await createProfile(name.trim(), role, pin || undefined)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '400px', width: '100%', margin: '0 auto', padding: '0 24px' }}>
      <h1 style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '26px',
        fontWeight: 800,
        color: 'var(--text-primary)',
        margin: '0 0 8px',
      }}>
        Set Up Your Team
      </h1>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        color: 'var(--text-muted)',
        margin: '0 0 32px',
      }}>
        Create the first profile to get started.
      </p>

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
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: 'var(--bg-surface)',
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
              padding: '16px',
              backgroundColor: 'var(--bg-surface)',
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
            PIN (optional)
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="4-digit PIN"
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: 'var(--bg-surface)',
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

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '16px',
            backgroundColor: 'var(--accent)',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Creating...' : 'Create Profile'}
        </button>
      </form>
    </div>
  )
}

export default function SelectProfilePage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Profile | null>(null)

  const loadProfiles = async () => {
    setLoading(true)
    try {
      const data = await getProfiles()
      setProfiles(data as Profile[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  const handleSignOut = async () => {
    await signOutAndClear()
    router.push('/login')
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--bg-deep)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}>
          Loading...
        </div>
      </div>
    )
  }

  // PIN entry mode
  if (selected) {
    return (
      <div style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--bg-deep)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <PinEntry
          profileId={selected.id}
          profileName={selected.name}
          profileRole={selected.role}
          onBack={() => setSelected(null)}
        />
      </div>
    )
  }

  // No profiles — first-time setup
  if (profiles.length === 0) {
    return (
      <div style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--bg-deep)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 0',
      }}>
        <SetupForm onCreated={loadProfiles} />

        <button
          type="button"
          onClick={handleSignOut}
          style={{
            marginTop: '32px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Switch Google Account
        </button>
      </div>
    )
  }

  // Profile selector
  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: 'var(--bg-deep)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '48px 24px 32px',
    }}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '26px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
          }}>
            Who are you?
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            margin: 0,
          }}>
            Select your profile to continue
          </p>
        </div>

        {/* Profile grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '48px',
        }}>
          {profiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onSelect={setSelected}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Switch Google Account
          </button>
        </div>
      </div>
    </div>
  )
}
