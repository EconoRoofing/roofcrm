'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { getJobsByDate } from '@/lib/actions/jobs'
import { CompanyTag } from '@/components/company-tag'
import { ChevronIcon } from '@/components/icons'
import type { Job, UserRole } from '@/lib/types/database'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

interface WeekStripProps {
  userId: string
  role: string
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function getWeekDays(today: Date): Date[] {
  // Returns the 7 days of the current week (Sun-Sat)
  const dayOfWeek = today.getDay()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - dayOfWeek)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    return d
  })
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatJobTypeLocal(type: string): string {
  const map: Record<string, string> = {
    reroof: 'Re-Roof',
    repair: 'Repair',
    maintenance: 'Maintenance',
    inspection: 'Inspection',
    coating: 'Coating',
    new_construction: 'New Const.',
    gutters: 'Gutters',
    other: 'Other',
  }
  return map[type] ?? type
}

export function WeekStrip({ userId, role }: WeekStripProps) {
  const today = new Date()
  const todayStr = toDateString(today)
  const weekDays = getWeekDays(today)

  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [dayJobs, setDayJobs] = useState<JobWithCompany[]>([])
  const [isPending, startTransition] = useTransition()

  function handleDayTap(dateStr: string) {
    setSelectedDate(dateStr)
    startTransition(async () => {
      const jobs = await getJobsByDate(dateStr, userId, role as UserRole)
      setDayJobs(jobs as JobWithCompany[])
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Week strip */}
      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: '8px',
          padding: '0 16px',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {weekDays.map((day) => {
          const dateStr = toDateString(day)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const dayName = DAY_NAMES[day.getDay()]
          const dayNum = day.getDate()

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => handleDayTap(dateStr)}
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: isSelected ? 'var(--accent-dim)' : 'var(--bg-surface)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                cursor: 'pointer',
                minWidth: '48px',
                transition: 'background-color 0.15s, border-color 0.15s',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  fontWeight: 500,
                  color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {dayName}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: isSelected
                    ? 'var(--accent)'
                    : isToday
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                  lineHeight: 1,
                }}
              >
                {dayNum}
              </span>
              {/* placeholder dot row — real dot counts require server prefetch, show indicator for today */}
              <div style={{ display: 'flex', gap: '3px', minHeight: '6px' }}>
                {isToday && (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Job list for selected day */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {isPending ? (
          <div
            style={{
              padding: '32px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Loading...
            </span>
          </div>
        ) : dayJobs.length === 0 ? (
          <div
            style={{
              padding: '32px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              No jobs scheduled
            </span>
          </div>
        ) : (
          dayJobs.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px 14px',
                textDecoration: 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginBottom: '4px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {job.customer_name}
                  </span>
                  {job.company && (
                    <CompanyTag name={job.company.name} color={job.company.color} />
                  )}
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {job.address}, {job.city} &middot; {formatJobTypeLocal(job.job_type)}
                </span>
              </div>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                <ChevronIcon />
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
