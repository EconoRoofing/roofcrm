'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { Company } from '@/lib/types/database'

interface CompanyFilterProps {
  companies: Company[]
  selected: string | null
  onChange?: (id: string | null) => void
}

export function CompanyFilter({ companies, selected }: CompanyFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const handleSelect = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id === null) {
      params.delete('company')
    } else {
      params.set('company', id)
    }
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '12px 24px',
        overflowX: 'auto',
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-surface)',
        flexShrink: 0,
      }}
    >
      {/* "All" chip */}
      <button
        type="button"
        onClick={() => handleSelect(null)}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 500,
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          border: selected === null
            ? '1px solid var(--accent)'
            : '1px solid var(--border-subtle)',
          backgroundColor: selected === null ? 'var(--accent-dim)' : 'transparent',
          color: selected === null ? 'var(--accent)' : 'var(--text-secondary)',
          transition: 'all 150ms ease',
          flexShrink: 0,
          letterSpacing: '0.04em',
        }}
      >
        All
      </button>

      {/* Company chips */}
      {companies.map((company) => {
        const isActive = selected === company.id
        const color = company.color

        // Convert hex to rgba for background
        const h = color.replace('#', '')
        const r = parseInt(h.substring(0, 2), 16)
        const g = parseInt(h.substring(2, 4), 16)
        const b = parseInt(h.substring(4, 6), 16)
        const bgColor = isActive ? `rgba(${r},${g},${b},0.12)` : 'transparent'

        return (
          <button
            type="button"
            key={company.id}
            onClick={() => handleSelect(isActive ? null : company.id)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 500,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              border: isActive
                ? `1px solid ${color}`
                : '1px solid var(--border-subtle)',
              backgroundColor: bgColor,
              color: isActive ? color : 'var(--text-secondary)',
              transition: 'all 150ms ease',
              flexShrink: 0,
              letterSpacing: '0.04em',
            }}
          >
            {company.name}
          </button>
        )
      })}
    </div>
  )
}
