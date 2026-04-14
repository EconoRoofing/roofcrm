'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CompanyTag } from '@/components/company-tag'
import { StatusBadge } from '@/components/status-badge'
import { formatJobType } from '@/lib/utils'
import { formatCentsOrDash } from '@/lib/money'
import type { Job, JobStatus } from '@/lib/types/database'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

interface PipelineListProps {
  jobs: JobWithCompany[]
}

const TABS: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'lead' },
  { label: 'Scheduled', value: 'estimate_scheduled' },
  { label: 'Pending', value: 'pending' },
  { label: 'Sold', value: 'sold' },
  { label: 'Done', value: 'completed' },
]


export function PipelineList({ jobs }: PipelineListProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<JobStatus | 'all'>('all')

  const filtered =
    activeTab === 'all' ? jobs : jobs.filter((j) => j.status === activeTab)

  function countForTab(tab: JobStatus | 'all'): number {
    if (tab === 'all') return jobs.length
    return jobs.filter((j) => j.status === tab).length
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* Status tabs */}
      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          paddingLeft: '16px',
          paddingRight: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          gap: '0',
          scrollbarWidth: 'none',
        }}
      >
        {TABS.map(({ label, value }) => {
          const isActive = value === activeTab
          const count = countForTab(value)

          return (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '12px 12px',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                marginBottom: '-1px',
                transition: 'color 150ms ease, border-color 150ms ease',
              }}
            >
              {label}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '16px',
                  height: '16px',
                  padding: '0 4px',
                  borderRadius: '8px',
                  backgroundColor: isActive ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Job list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '48px 16px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--text-muted)',
              }}
            >
              No jobs in this category
            </span>
          </div>
        ) : (
          <div>
            {filtered.map((job, idx) => (
              <div
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'background-color 100ms ease',
                  backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-surface)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                    idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                }}
              >
                {/* Left: job number */}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--accent)',
                    flexShrink: 0,
                    minWidth: '52px',
                  }}
                >
                  {job.job_number}
                </span>

                {/* Middle: name + type + company */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {job.customer_name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {job.company && (
                      <CompanyTag name={job.company.name} color={job.company.color} />
                    )}
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {formatJobType(job.job_type)}
                    </span>
                  </div>
                </div>

                {/* Right: amount + status */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '4px',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {/* Audit R3-#2 follow-up: cents-only post-031. */}
                    {formatCentsOrDash((job as { total_amount_cents?: number | null }).total_amount_cents ?? 0)}
                  </span>
                  <StatusBadge status={job.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
