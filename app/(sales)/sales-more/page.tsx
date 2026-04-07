import { redirect } from 'next/navigation'
import { getUser, getUserRole, signOut } from '@/lib/auth'
import { RoleToggle } from '@/components/crew/role-toggle'
import { clearActiveProfile } from '@/lib/actions/profiles'
import { SectionLabel } from '@/components/ui/section-label'
import { ListItem } from '@/components/ui/list-item'
import { PhoneIcon, ClockIcon, GearIcon } from '@/components/icons'
import { APP_CONFIG } from '@/lib/config'

const { OFFICE_PHONE } = APP_CONFIG

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
            await clearActiveProfile()
            redirect('/select-profile')
          }} style={{ marginBottom: '8px' }}>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Switch Profile
            </button>
          </form>
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
