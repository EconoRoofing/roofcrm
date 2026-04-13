'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
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

// Bottom tab bar shows these 5 on mobile — rest go in "More"
const MOBILE_TABS = [
  { href: '/home', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
  { href: '/pipeline', label: 'Pipeline', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7' },
  { href: '/schedule', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/dashboard', label: 'Dashboard', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
]

const MORE_LINKS = [
  { href: '/list', label: 'Job List' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/time-tracking', label: 'Time Tracking' },
  { href: '/safety', label: 'Safety' },
  { href: '/equipment', label: 'Equipment' },
  { href: '/automations', label: 'Automations' },
  { href: '/team', label: 'Team' },
]

export default function ManagerTopNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      {/* Desktop: horizontal nav */}
      <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <nav style={{ display: 'flex', gap: '2px', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', flexShrink: 1, minWidth: 0 }}>
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link key={href} href={href} style={{
                padding: '6px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--accent-dim)' : 'transparent',
                transition: 'color 0.15s, background-color 0.15s',
              }}>
                {label}
              </Link>
            )
          })}
        </nav>
        <div style={{ flexShrink: 1, minWidth: '120px', maxWidth: '200px' }}>
          <JobSearch />
        </div>
      </div>

      {/* Mobile: bottom tab bar (fixed) */}
      <nav className="mobile-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)',
        display: 'none', justifyContent: 'space-around', alignItems: 'center',
        paddingBottom: 'env(safe-area-inset-bottom)', height: '60px',
      }}>
        {MOBILE_TABS.map(({ href, label, icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              textDecoration: 'none', padding: '6px 0', flex: 1,
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={icon} />
              </svg>
              <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</span>
            </Link>
          )
        })}

        {/* More button */}
        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            background: 'none', border: 'none', padding: '6px 0', flex: 1, cursor: 'pointer',
            color: moreOpen ? 'var(--accent)' : 'var(--text-muted)',
            transition: 'color 0.15s',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
          </svg>
          <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.02em' }}>More</span>
        </button>
      </nav>

      {/* More menu overlay */}
      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 49, backgroundColor: 'rgba(0,0,0,0.5)' }}
          />
          <div className="mobile-nav" style={{
            position: 'fixed', bottom: '60px', left: '8px', right: '8px', zIndex: 51,
            backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '12px', padding: '8px', display: 'none', flexDirection: 'column', gap: '2px',
            paddingBottom: `calc(8px + env(safe-area-inset-bottom))`,
          }}>
            {MORE_LINKS.map(({ href, label }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href} onClick={() => setMoreOpen(false)} style={{
                  padding: '12px 16px', borderRadius: '8px', textDecoration: 'none',
                  fontSize: '14px', fontWeight: 500, display: 'block',
                  color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                  backgroundColor: isActive ? 'var(--accent-dim)' : 'transparent',
                }}>
                  {label}
                </Link>
              )
            })}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-nav { display: flex !important; }
        }
        @media (min-width: 769px) {
          .desktop-nav { display: flex !important; }
          .mobile-nav { display: none !important; }
        }
      `}</style>
    </>
  )
}
