'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  {
    href: '/today',
    label: 'Today',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="4" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M9 1V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M9 15V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M1 9H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M15 9H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M3.22 3.22L4.64 4.64" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M13.36 13.36L14.78 14.78" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M14.78 3.22L13.36 4.64" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M4.64 13.36L3.22 14.78" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/sales-pipeline',
    label: 'Pipeline',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="14" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="2" y="7.75" width="14" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="2" y="13.5" width="14" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    href: '/jobs/new',
    label: 'Add',
    isFab: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="10" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M11 7V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M7 11H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/sales-calendar',
    label: 'Calendar',
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
    href: '/sales-more',
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

export default function SalesBottomNav() {
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
      {NAV_ITEMS.map(({ href, label, icon, isFab }) => {
        const isActive = !isFab && (pathname === href || pathname.startsWith(href + '/'))
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
              color: isFab ? 'var(--accent)' : isActive ? 'var(--accent)' : '#6b7294',
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
