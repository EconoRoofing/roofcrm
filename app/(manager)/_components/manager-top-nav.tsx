'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { JobSearch } from '@/components/job-search'

const NAV_LINKS = [
  { href: '/home', label: 'Home' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/list', label: 'List' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/schedule', label: 'Schedule' },
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
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
      <nav style={{ display: 'flex', gap: '2px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', flexShrink: 1, minWidth: 0 }}>
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
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
      <div style={{ flexShrink: 1, minWidth: '120px', maxWidth: '200px' }}>
        <JobSearch />
      </div>
    </div>
  )
}
