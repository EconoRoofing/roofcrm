'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HouseIcon, CalendarIcon, PhotosIcon, MenuIcon } from '@/components/icons'

const NAV_ITEMS = [
  { href: '/route',  label: 'Route',  icon: <HouseIcon /> },
  { href: '/week',   label: 'Week',   icon: <CalendarIcon /> },
  { href: '/photos', label: 'Photos', icon: <PhotosIcon /> },
  { href: '/more',   label: 'More',   icon: <MenuIcon /> },
]

export default function CrewBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      style={{
        backgroundColor: 'var(--bg-nav)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '8px 16px max(24px, env(safe-area-inset-bottom))',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
        flexShrink: 0,
      }}
    >
      {NAV_ITEMS.map(({ href, label, icon }) => {
        // Guard: usePathname() can return null during SSR / initial hydration.
        // Previously `pathname.startsWith(...)` would throw in that window.
        const isActive =
          pathname != null && (pathname === href || pathname.startsWith(href + '/'))
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              textDecoration: 'none',
              color: isActive ? 'var(--accent)' : 'var(--text-nav-inactive)',
              minWidth: '56px',
              position: 'relative',
            }}
          >
            {/* Active indicator dot */}
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent)',
                }}
              />
            )}
            <span
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                backgroundColor: isActive ? 'var(--accent-dim)' : 'transparent',
              }}
            >
              {icon}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono, monospace)',
                fontSize: '8px',
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
