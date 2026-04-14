'use client'

interface Profile {
  id: string
  name: string
  role: string
  avatar_url: string | null
}

interface ProfileCardProps {
  profile: Profile
  onSelect: (profile: Profile) => void
}

const ROLE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  owner: { bg: 'var(--accent-purple-dim)', color: 'var(--accent-purple)', label: 'Owner' },
  office_manager: { bg: 'var(--accent-dim)', color: 'var(--accent)', label: 'Office Manager' },
  sales: { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', label: 'Sales' },
  crew: { bg: 'var(--accent-amber-dim)', color: 'var(--accent-amber)', label: 'Crew' },
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function ProfileCard({ profile, onSelect }: ProfileCardProps) {
  const roleStyle = ROLE_COLORS[profile.role] ?? ROLE_COLORS.crew

  return (
    <button
      type="button"
      onClick={() => onSelect(profile)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        padding: '24px 16px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        cursor: 'pointer',
        minHeight: '140px',
        width: '100%',
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'
        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'
        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-surface)'
      }}
    >
      {/* Avatar */}
      {profile.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={profile.name}
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: roleStyle.bg,
            color: roleStyle.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '18px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {getInitials(profile.name)}
        </div>
      )}

      {/* Name */}
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {profile.name}
      </div>

      {/* Role badge */}
      <div
        style={{
          padding: '3px 10px',
          borderRadius: '100px',
          backgroundColor: roleStyle.bg,
          color: roleStyle.color,
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
        }}
      >
        {roleStyle.label}
      </div>
    </button>
  )
}
