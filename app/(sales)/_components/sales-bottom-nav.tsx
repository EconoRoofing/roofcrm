'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SunIcon, ListIcon, PlusCircleIcon, CalendarIcon, MenuIcon } from '@/components/icons'

const NAV_ITEMS = [
  { href: '/today',          label: 'Today',    icon: <SunIcon /> },
  { href: '/sales-pipeline', label: 'Pipeline', icon: <ListIcon /> },
  { href: '/jobs/new',       label: 'Add',      icon: <PlusCircleIcon size={22} />, isFab: true },
  { href: '/sales-calendar', label: 'Calendar', icon: <CalendarIcon /> },
  { href: '/sales-more',     label: 'More',     icon: <MenuIcon /> },
]

export default function SalesBottomNav() {
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
      {NAV_ITEMS.map(({ href, label, icon, isFab }) => {
        const isActive =
          !isFab && pathname != null && (pathname === href || pathname.startsWith(href + '/'))
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
              color: isFab ? 'var(--accent)' : isActive ? 'var(--accent)' : 'var(--text-nav-inactive)',
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
                width: isFab ? '44px' : '36px',
                height: isFab ? '44px' : '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: isFab ? '50%' : '8px',
                backgroundColor: isFab
                  ? 'var(--accent-dim)'
                  : isActive
                  ? 'var(--accent-dim)'
                  : 'transparent',
                border: isFab ? '1.5px solid var(--accent)' : 'none',
                marginTop: isFab ? '-10px' : '0',
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
