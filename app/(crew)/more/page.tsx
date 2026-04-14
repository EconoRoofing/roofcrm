import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUser, signOut } from '@/lib/auth'
import { clearActiveProfile } from '@/lib/actions/profiles'
import { SectionLabel } from '@/components/ui/section-label'
import { ListItem } from '@/components/ui/list-item'
import { SimpleModeToggle } from '@/components/crew/simple-mode-toggle'
import { PhoneIcon, AlertIcon, ClockIcon, PhotosIcon, MapIcon, BellIcon, ShieldIcon, IncidentIcon } from '@/components/icons'
import { APP_CONFIG } from '@/lib/config'

const { OFFICE_PHONE, EMERGENCY_PHONE } = APP_CONFIG

export default async function MorePage() {
  const user = await getUser()
  const cookieStore = await cookies()
  const isSimpleMode = cookieStore.get('crew_simple_mode')?.value === 'true'

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

      </div>

      {/* View Preferences */}
      <div>
        <SectionLabel label="View" />
        <div style={{ padding: '0 16px' }}>
          <SimpleModeToggle initialValue={isSimpleMode} />
        </div>
      </div>

      {/* Safety */}
      <div>
        <SectionLabel label="Safety" />
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <ListItem
            icon={<ShieldIcon />}
            iconBg="var(--accent-dim)"
            iconColor="var(--accent)"
            label="Safety Talks"
            sublabel="Toolbox talks & sign-off"
            href="/safety/talks"
          />
          <ListItem
            icon={<IncidentIcon />}
            iconBg="var(--accent-red-dim)"
            iconColor="var(--accent-red)"
            label="Report Incident"
            sublabel="Near miss, injury, damage"
            href="/safety/incident"
          />
        </div>
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
            await clearActiveProfile()
            redirect('/select-profile')
          }} style={{ marginBottom: '8px' }}>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '16px',
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
                padding: '16px',
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
