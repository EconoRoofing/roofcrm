import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from '@/lib/auth'
import { clearActiveProfile } from '@/lib/actions/profiles'
import ManagerTopNav from './_components/manager-top-nav'
import { QuickAddFab } from '@/components/quick-add-fab'

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const [{ data: { user } }, companiesResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('companies').select('id, name, color').order('name', { ascending: true }),
  ])
  const companies = companiesResult.data ?? []

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: 'var(--bg-deep)' }}>
      {/* Top navigation bar */}
      <header
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            maxWidth: '100%',
            padding: '0 16px',
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            overflow: 'hidden',
          }}
        >
          {/* Branding */}
          <img
            src="/logo.png"
            alt="RoofCRM"
            style={{
              height: '32px',
              width: 'auto',
              flexShrink: 0,
              filter: 'invert(1)',
            }}
          />

          {/* Active-aware nav tabs — client component */}
          <ManagerTopNav />

          {/* User area — hidden on mobile */}
          <div className="header-user-area" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            {user?.email && (
              <span
                style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  color: 'var(--text-muted)',
                }}
              >
                {user.email}
              </span>
            )}
            <form
              action={async () => {
                'use server'
                await clearActiveProfile()
                redirect('/select-profile')
              }}
            >
              <button
                type="submit"
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Switch Profile
              </button>
            </form>
            <form
              action={async () => {
                'use server'
                await signOut()
              }}
            >
              <button
                type="submit"
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Page content — extra bottom padding on mobile for tab bar */}
      <main style={{ flex: 1, paddingBottom: '0' }} className="main-content">{children}</main>
      <style>{`
        @media (max-width: 768px) {
          .main-content { padding-bottom: 70px !important; }
          .header-user-area { display: none !important; }
        }
      `}</style>

      {/* Quick-add FAB — appears on all manager pages */}
      <QuickAddFab companies={companies} />
    </div>
  )
}
