'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CompanyTag } from '@/components/company-tag'
import { StatusBadge } from '@/components/status-badge'
import { hexToRgba, formatAmount } from '@/lib/utils'
import { SortAscIcon, SortDescIcon, SortNeutralIcon } from '@/components/icons'
import type { Job, Company, JobStatus } from '@/lib/types/database'

type JobWithRelations = Job & {
  company: { id: string; name: string; color: string } | null
  rep: { id: string; name: string } | null
}

interface JobListTableProps {
  jobs: JobWithRelations[]
  companies: Company[]
}

type SortKey = 'job_number' | 'customer_name' | 'company' | 'job_type' | 'total_amount' | 'status' | 'rep'
type SortDir = 'asc' | 'desc'

const STATUS_TABS: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'lead' },
  { label: 'Scheduled', value: 'estimate_scheduled' },
  { label: 'Pending', value: 'pending' },
  { label: 'Sold', value: 'sold' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Done', value: 'completed' },
]

const JOB_TYPE_LABELS: Record<string, string> = {
  reroof: 'Reroof',
  repair: 'Repair',
  maintenance: 'Maintenance',
  inspection: 'Inspection',
  coating: 'Coating',
  new_construction: 'New Construction',
  gutters: 'Gutters',
  other: 'Other',
}

export function JobListTable({ jobs, companies }: JobListTableProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<JobStatus | 'all'>('all')
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('job_number')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Count per status tab
  const countByStatus = useMemo(() => {
    const counts: Record<string, number> = { all: jobs.length }
    for (const job of jobs) {
      counts[job.status] = (counts[job.status] ?? 0) + 1
    }
    return counts
  }, [jobs])

  // Filter
  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      if (activeTab !== 'all' && job.status !== activeTab) return false
      if (selectedCompany && job.company_id !== selectedCompany) return false
      return true
    })
  }, [jobs, activeTab, selectedCompany])

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortKey) {
        case 'job_number':
          av = a.job_number ?? ''
          bv = b.job_number ?? ''
          break
        case 'customer_name':
          av = a.customer_name ?? ''
          bv = b.customer_name ?? ''
          break
        case 'company':
          av = a.company?.name ?? ''
          bv = b.company?.name ?? ''
          break
        case 'job_type':
          av = a.job_type ?? ''
          bv = b.job_type ?? ''
          break
        case 'total_amount':
          av = a.total_amount ?? -1
          bv = b.total_amount ?? -1
          break
        case 'status':
          av = a.status ?? ''
          bv = b.status ?? ''
          break
        case 'rep':
          av = a.rep?.name ?? ''
          bv = b.rep?.name ?? ''
          break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <SortNeutralIcon />
    return sortDir === 'asc' ? <SortAscIcon /> : <SortDescIcon />
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 16px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-elevated)',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    borderBottom: '1px solid var(--border-subtle)',
    userSelect: 'none',
  }

  const thButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
    letterSpacing: 'inherit',
    textTransform: 'inherit',
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 56px)',
        backgroundColor: 'var(--bg-deep)',
        overflow: 'hidden',
      }}
    >
      {/* Status tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0',
          padding: '0 24px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {STATUS_TABS.map(({ label, value }) => {
          const count = countByStatus[value === 'all' ? 'all' : value] ?? 0
          const isActive = activeTab === value
          return (
            <button
              type="button"
              key={value}
              onClick={() => setActiveTab(value)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '16px',
                fontSize: '12px',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'color 150ms ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                marginBottom: '-1px',
              }}
            >
              {label}
              {count > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 5px',
                    borderRadius: '8px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    backgroundColor: isActive ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Company filter chips */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 24px',
          overflowX: 'auto',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedCompany(null)}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 500,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            border: selectedCompany === null ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
            backgroundColor: selectedCompany === null ? 'var(--accent-dim)' : 'transparent',
            color: selectedCompany === null ? 'var(--accent)' : 'var(--text-secondary)',
            transition: 'all 150ms ease',
            flexShrink: 0,
            letterSpacing: '0.04em',
          }}
        >
          All
        </button>
        {companies.map((company) => {
          const isActive = selectedCompany === company.id
          const bgColor = isActive ? hexToRgba(company.color, 0.12) : 'transparent'
          return (
            <button
              type="button"
              key={company.id}
              onClick={() => setSelectedCompany(isActive ? null : company.id)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 500,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                border: isActive ? `1px solid ${company.color}` : '1px solid var(--border-subtle)',
                backgroundColor: bgColor,
                color: isActive ? company.color : 'var(--text-secondary)',
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

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            minWidth: '720px',
            borderCollapse: 'collapse',
          }}
        >
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th style={thStyle}>
                <button type="button" aria-label="Sort by job number" style={thButtonStyle} onClick={() => handleSort('job_number')}>
                  Job # <SortIcon col="job_number" />
                </button>
              </th>
              <th style={thStyle}>
                <button type="button" aria-label="Sort by customer" style={thButtonStyle} onClick={() => handleSort('customer_name')}>
                  Customer <SortIcon col="customer_name" />
                </button>
              </th>
              <th style={thStyle}>
                <button type="button" aria-label="Sort by company" style={thButtonStyle} onClick={() => handleSort('company')}>
                  Company <SortIcon col="company" />
                </button>
              </th>
              <th style={thStyle}>
                <button type="button" aria-label="Sort by type" style={thButtonStyle} onClick={() => handleSort('job_type')}>
                  Type <SortIcon col="job_type" />
                </button>
              </th>
              <th style={{ ...thStyle, textAlign: 'right' }}>
                <button type="button" aria-label="Sort by amount" style={{ ...thButtonStyle, justifyContent: 'flex-end' }} onClick={() => handleSort('total_amount')}>
                  Amount <SortIcon col="total_amount" />
                </button>
              </th>
              <th style={thStyle}>
                <button type="button" aria-label="Sort by status" style={thButtonStyle} onClick={() => handleSort('status')}>
                  Status <SortIcon col="status" />
                </button>
              </th>
              <th style={thStyle}>
                <button type="button" aria-label="Sort by rep" style={thButtonStyle} onClick={() => handleSort('rep')}>
                  Rep <SortIcon col="rep" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.04em',
                  }}
                >
                  No jobs found
                </td>
              </tr>
            ) : (
              sorted.map((job, idx) => {
                const isEven = idx % 2 === 0
                return (
                  <tr
                    key={job.id}
                    onClick={() => router.push(`/jobs/${job.id}`)}
                    style={{
                      backgroundColor: isEven ? 'var(--bg-card)' : 'var(--bg-surface)',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'background-color 100ms ease',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--bg-elevated)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.backgroundColor = isEven
                        ? 'var(--bg-card)'
                        : 'var(--bg-surface)'
                    }}
                  >
                    <td
                      style={{
                        padding: '12px 16px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {job.job_number}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {job.customer_name}
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      {job.company ? (
                        <CompanyTag name={job.company.name} color={job.company.color} />
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {JOB_TYPE_LABELS[job.job_type] ?? job.job_type}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: job.total_amount ? 'var(--text-primary)' : 'var(--text-muted)',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatAmount(job.total_amount)}
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <StatusBadge status={job.status} />
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {job.rep?.name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Row count footer */}
      <div
        style={{
          padding: '8px 24px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        {sorted.length} {sorted.length === 1 ? 'job' : 'jobs'}
      </div>
    </div>
  )
}
