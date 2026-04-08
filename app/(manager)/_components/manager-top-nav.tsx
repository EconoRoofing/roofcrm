'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { JobSearch } from '@/components/job-search'

const NAV_LINKS = [
  { href: '/home', label: 'Home' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/list', label: 'List' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/time-tracking', label: 'Time' },
  { href: '/safety', label: 'Safety' },
  { href: '/equipment', label: 'Equipment' },
  { href: '/automations', label: 'Automations' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/team', label: 'Team' },
]

export default function ManagerTopNav() {
  const pathname = usePathname()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
      <nav style={{ display: 'flex', gap: '4px' }}>
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                textDecoration: 'none',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--accent-dim)' : 'transparent',
                transition: 'color 0.15s, background-color 0.15s',
              }}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Global job search */}
      <JobSearch />
    </div>
  )
}
