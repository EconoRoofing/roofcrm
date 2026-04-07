import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser, getUserRole, signOut } from '@/lib/auth'
import { RoleToggle } from '@/components/crew/role-toggle'

const OFFICE_PHONE = '5595550100'

// --- SVG Icons ---
function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 5.5V9L11.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 1.5V3M9 15v1.5M1.5 9H3m12 0h1.5M3.7 3.7l1.1 1.1m8.5 8.5 1.1 1.1M14.3 3.7l-1.1 1.1M4.8 13.2l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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

// --- Sub-components ---
function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: '0 16px', marginBottom: '8px' }}>
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

interface ListItemProps {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  sublabel?: string
  href?: string
  isExternal?: boolean
}

function ListItem({ icon, iconBg, iconColor, label, sublabel, href, isExternal }: ListItemProps) {
  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 16px',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    >
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

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
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

export default async function SalesMorePage() {
  const user = await getUser()
  const role = user ? (await getUserRole(user.id)) ?? 'sales' : 'sales'

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

        {/* Role toggle for sales_crew users */}
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
            sublabel="Completed & cancelled"
            href="/jobs?status=completed"
          />
        </div>
      </div>

      {/* Settings */}
      <div>
        <SectionLabel label="Settings" />
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <ListItem
            icon={<GearIcon />}
            iconBg="var(--bg-elevated)"
            iconColor="var(--text-secondary)"
            label="Settings"
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
