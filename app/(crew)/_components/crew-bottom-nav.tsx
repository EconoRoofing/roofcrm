'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  {
    href: '/route',
    label: 'Route',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 7L9 2L15 7V15C15 15.6 14.6 16 14 16H4C3.4 16 3 15.6 3 15V7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7 16V10H11V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: '/week',
    label: 'Week',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M2 7H16" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M6 1V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M12 1V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <rect x="5" y="9.5" width="2" height="2" rx="0.5" fill="currentColor"/>
        <rect x="8" y="9.5" width="2" height="2" rx="0.5" fill="currentColor"/>
        <rect x="11" y="9.5" width="2" height="2" rx="0.5" fill="currentColor"/>
        <rect x="5" y="12.5" width="2" height="2" rx="0.5" fill="currentColor"/>
      </svg>
    ),
  },
  {
    href: '/photos',
    label: 'Photos',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="6.5" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M2 13L5.5 9.5C6 9 6.8 9 7.3 9.5L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M10 11L11.5 9.5C12 9 12.8 9 13.3 9.5L16 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/more',
    label: 'More',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="3" width="14" height="2" rx="1" fill="currentColor"/>
        <rect x="2" y="8" width="14" height="2" rx="1" fill="currentColor"/>
        <rect x="2" y="13" width="14" height="2" rx="1" fill="currentColor"/>
      </svg>
    ),
  },
]

export default function CrewBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      style={{
        backgroundColor: '#0a0c12',
        borderTop: '1px solid var(--border-subtle)',
        padding: '8px 16px 24px',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
        flexShrink: 0,
      }}
    >
      {NAV_ITEMS.map(({ href, label, icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
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
              color: isActive ? 'var(--accent)' : '#6b7294',
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
