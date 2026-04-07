'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { searchJobs } from '@/lib/actions/search'
import type { SearchResult } from '@/lib/actions/search'
import { StatusBadge } from '@/components/status-badge'
import { CompanyTag } from '@/components/company-tag'

export function JobSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      const data = await searchJobs(q)
      setResults(data)
      setOpen(true)
      setActiveIndex(-1)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSearch(query)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  function handleSelect(result: SearchResult) {
    setOpen(false)
    setQuery('')
    router.push(`/jobs/${result.id}`)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      handleSelect(results[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div style={{ position: 'relative', width: '260px', flexShrink: 0 }}>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true) }}
        placeholder="Search jobs..."
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocusCapture={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)' }}
        onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
      />

      {/* Dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            overflow: 'hidden',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {loading && (
            <div
              style={{
                padding: '12px 16px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
              }}
            >
              Searching...
            </div>
          )}
          {!loading && results.length === 0 && (
            <div
              style={{
                padding: '12px 16px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
              }}
            >
              No results for &quot;{query}&quot;
            </div>
          )}
          {!loading && results.map((result, idx) => (
            <button
              type="button"
              key={result.id}
              onMouseDown={() => handleSelect(result)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 16px',
                backgroundColor: idx === activeIndex ? 'var(--bg-elevated)' : 'transparent',
                border: 'none',
                borderBottom: idx < results.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = idx === activeIndex ? 'var(--bg-elevated)' : 'transparent' }}
            >
              {/* Job number */}
              <code
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {result.job_number}
              </code>

              {/* Name + address */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {result.customer_name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {result.city}
                </div>
              </div>

              {/* Company tag */}
              {result.company && (
                <CompanyTag name={result.company.name} color={result.company.color} />
              )}

              {/* Status badge */}
              <StatusBadge status={result.status as import('@/lib/types/database').JobStatus} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
