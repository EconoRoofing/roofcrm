import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser, getUserRole, signOut } from '@/lib/auth'
import { RoleToggle } from '@/components/crew/role-toggle'

// Office phone — configure here
const OFFICE_PHONE = '5595550100'
const EMERGENCY_PHONE = '9115550911'

// --- SVG Icons ---
function PhoneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path
        d="M3 3C3 2.4 3.5 2 4 2H6.5L8 5.5L6.5 7C6.5 7 7.2 9 9 10.8C10.8 12.6 13 13.5 13 13.5L14.5 12L18 13.5V16C18 16.5 17.6 17 17 17C9.5 17 1 8.5 1 1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 2L1.5 15H16.5L9 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 8V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="13" r="0.8" fill="currentColor" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 5.5V9L11.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function PhotosIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6.5" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 13L5.5 9.5C6 9 6.8 9 7.3 9.5L10 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 11L11.5 9.5C12 9 12.8 9 13.3 9.5L16 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M2 4L7 2L11 4L16 2V14L11 16L7 14L2 16V4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M7 2V14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11 4V16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 2C9 2 5 4 5 9V13H13V9C13 4 9 2 9 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 13H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.5 13C7.5 14.4 8.2 15 9 15C9.8 15 10.5 14.4 10.5 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 4L10 8L6 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// --- Section label ---
function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '0 16px',
        marginBottom: '8px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '2px',
        }}
      >
        {label}
      </span>
    </div>
  )
}

// --- List item ---
interface ListItemProps {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  sublabel?: string
  href?: string
  isExternal?: boolean
  danger?: boolean
}

function ListItem({ icon, iconBg, iconColor, label, sublabel, href, isExternal, danger }: ListItemProps) {
  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 16px',
        backgroundColor: danger ? 'var(--accent-red-dim)' : 'var(--bg-surface)',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    >
      {/* Icon circle */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          backgroundColor: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: iconColor,
        }}
      >
        {icon}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 600,
            color: danger ? 'var(--accent-red)' : 'var(--text-primary)',
            lineHeight: 1.3,
          }}
        >
          {label}
        </div>
        {sublabel && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}
          >
            {sublabel}
          </div>
        )}
      </div>

      {/* Chevron */}
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
        <ChevronRightIcon />
      </span>
    </div>
  )

  if (href) {
    if (isExternal) {
      return (
        <a href={href} style={{ textDecoration: 'none', display: 'block' }}>
          {inner}
        </a>
      )
    }
    return (
      <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
        {inner}
      </Link>
    )
  }

  return <div>{inner}</div>
}

export default async function MorePage() {
  const user = await getUser()
  const role = user ? (await getUserRole(user.id)) ?? 'crew' : 'crew'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        paddingTop: '24px',
        paddingBottom: '16px',
        minHeight: '100%',
        backgroundColor: 'var(--bg-deep)',
        gap: '24px',
      }}
    >
      {/* Header */}
      <div style={{ padding: '0 16px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 16px',
            lineHeight: 1.2,
          }}
        >
          More
        </h1>

        {/* Role toggle — only for sales_crew */}
        {role === 'sales_crew' && <RoleToggle currentRole={role} />}
      </div>

      {/* Quick Actions */}
      <div>
        <SectionLabel label="Quick Actions" />
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <ListItem
            icon={<PhoneIcon />}
            iconBg="var(--accent-dim)"
            iconColor="var(--accent)"
            label="Call Office"
            sublabel={`+1 (${OFFICE_PHONE.slice(0, 3)}) ${OFFICE_PHONE.slice(3, 6)}-${OFFICE_PHONE.slice(6)}`}
            href={`tel:${OFFICE_PHONE}`}
            isExternal
          />
          <ListItem
            icon={<AlertIcon />}
            iconBg="var(--accent-red-dim)"
            iconColor="var(--accent-red)"
            label="Report Emergency"
            href={`tel:${EMERGENCY_PHONE}`}
            isExternal
            danger
          />
        </div>
      </div>

      {/* History */}
      <div>
        <SectionLabel label="History" />
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <ListItem
            icon={<ClockIcon />}
            iconBg="var(--accent-amber-dim)"
            iconColor="var(--accent-amber)"
            label="Past Jobs"
            sublabel="Completed jobs"
            href="/jobs?status=completed"
          />
          <ListItem
            icon={<PhotosIcon />}
            iconBg="var(--accent-purple-dim)"
            iconColor="var(--accent-purple)"
            label="All Photos"
            sublabel="All job photos"
            href="/photos"
          />
        </div>
      </div>

      {/* Settings */}
      <div>
        <SectionLabel label="Settings" />
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <ListItem
            icon={<MapIcon />}
            iconBg="var(--accent-blue-dim)"
            iconColor="var(--accent-blue)"
            label="Default Maps App"
            sublabel="Apple Maps"
          />
          <ListItem
            icon={<BellIcon />}
            iconBg="var(--bg-elevated)"
            iconColor="var(--text-secondary)"
            label="Notifications"
            sublabel="Coming soon"
          />
        </div>
      </div>

      {/* Account */}
      <div>
        <SectionLabel label="Account" />
        <div style={{ padding: '0 16px' }}>
          <div style={{
            padding: '12px 16px',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '8px',
            marginBottom: '8px',
          }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {user?.email ?? ''}
            </div>
          </div>
          <form action={async () => {
            'use server'
            await signOut()
            redirect('/login')
          }}>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'var(--accent-red)',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
