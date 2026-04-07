'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronRightIcon } from '@/components/icons'

export interface ListItemProps {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  sublabel?: string
  href?: string
  isExternal?: boolean
  danger?: boolean
}

export function ListItem({ icon, iconBg, iconColor, label, sublabel, href, isExternal, danger }: ListItemProps) {
  const [hovered, setHovered] = useState(false)

  const baseColor = danger ? 'var(--accent-red-dim)' : 'var(--bg-surface)'
  const hoverColor = danger ? 'var(--accent-red-dim)' : 'var(--bg-elevated)'

  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 16px',
        backgroundColor: hovered ? hoverColor : baseColor,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Icon square */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          backgroundColor: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: iconColor,
        }}
      >
        {icon}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 600,
            color: danger ? 'var(--accent-red)' : 'var(--text-primary)',
            lineHeight: 1.3,
          }}
        >
          {label}
        </div>
        {sublabel && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}
          >
            {sublabel}
          </div>
        )}
      </div>

      {/* Chevron */}
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
        <ChevronRightIcon />
      </span>
    </div>
  )

  if (href) {
    if (isExternal) {
      return (
        <a href={href} style={{ textDecoration: 'none', display: 'block' }}>
          {inner}
        </a>
      )
    }
    return (
      <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
        {inner}
      </Link>
    )
  }

  return <div>{inner}</div>
}
