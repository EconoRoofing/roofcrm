'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { StatusBadge } from '@/components/status-badge'
import { hexToRgba } from '@/lib/utils'
import type { Job } from '@/lib/types/database'

type JobWithRelations = Job & {
  company: { id: string; name: string; color: string } | null
  rep: { id: string; name: string } | null
}

interface CalendarViewProps {
  jobs: JobWithRelations[]
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function CalendarView({ jobs }: CalendarViewProps) {
  const router = useRouter()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-indexed
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Build job map: date key → jobs
  const jobMap = useMemo(() => {
    const map = new Map<string, JobWithRelations[]>()
    for (const job of jobs) {
      if (!job.scheduled_date) continue
      const key = job.scheduled_date.substring(0, 10)
      const existing = map.get(key) ?? []
      existing.push(job)
      map.set(key, existing)
    }
    return map
  }, [jobs])

  // Calendar grid calculations
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay() // 0 = Sunday
  const daysInMonth = lastDay.getDate()

  // Build grid cells: null = padding cell, number = day
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // Pad to complete last week row
  while (cells.length % 7 !== 0) cells.push(null)

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  const todayKey = toDateKey(today)

  const selectedJobs = selectedDay ? (jobMap.get(selectedDay) ?? []) : []

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
      {/* Calendar area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {/* Month navigation header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'
            }}
          >
            {/* Left arrow SVG */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <h2
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {MONTH_NAMES[month]} {year}
          </h2>

          <button
            onClick={nextMonth}
            aria-label="Next month"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'
            }}
          >
            {/* Right arrow SVG */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Day-of-week header row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '1px',
            marginBottom: '1px',
          }}
        >
          {DAYS_OF_WEEK.map((d) => (
            <div
              key={d}
              style={{
                padding: '8px 4px',
                textAlign: 'center',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '1px',
            backgroundColor: 'var(--border-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {cells.map((day, idx) => {
            if (day === null) {
              return (
                <div
                  key={`pad-${idx}`}
                  style={{
                    minHeight: '80px',
                    backgroundColor: 'var(--bg-deep)',
                    padding: '8px',
                  }}
                />
              )
            }

            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayJobs = jobMap.get(dateKey) ?? []
            const isToday = dateKey === todayKey
            const isSelected = dateKey === selectedDay

            return (
              <div
                key={dateKey}
                onClick={() => setSelectedDay(isSelected ? null : dateKey)}
                style={{
                  minHeight: '80px',
                  backgroundColor: isSelected
                    ? 'var(--bg-elevated)'
                    : 'var(--bg-surface)',
                  padding: '8px',
                  cursor: dayJobs.length > 0 || true ? 'pointer' : 'default',
                  border: isToday ? '2px solid var(--accent)' : '2px solid transparent',
                  boxSizing: 'border-box',
                  transition: 'background-color 100ms ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-card)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-surface)'
                  }
                }}
              >
                {/* Day number */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--bg-deep)' : 'var(--text-secondary)',
                    backgroundColor: isToday ? 'var(--accent)' : 'transparent',
                    marginBottom: '4px',
                  }}
                >
                  {day}
                </span>

                {/* Job dots */}
                {dayJobs.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '3px',
                      marginTop: '4px',
                    }}
                  >
                    {dayJobs.slice(0, 6).map((job) => (
                      <span
                        key={job.id}
                        title={`${job.job_number} — ${job.customer_name}`}
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          backgroundColor: job.company?.color ?? 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      />
                    ))}
                    {dayJobs.length > 6 && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-muted)',
                          lineHeight: '7px',
                        }}
                      >
                        +{dayJobs.length - 6}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Selected day job list */}
        {selectedDay && (
          <div
            style={{
              marginTop: '24px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.04em',
                }}
              >
                {selectedDay}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                {selectedJobs.length} {selectedJobs.length === 1 ? 'job' : 'jobs'}
              </span>
            </div>

            {selectedJobs.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                No jobs scheduled this day
              </div>
            ) : (
              <div>
                {selectedJobs.map((job) => (
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
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-elevated)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
                    }}
                  >
                    {/* Company color stripe */}
                    <div
                      style={{
                        width: '3px',
                        height: '36px',
                        borderRadius: '2px',
                        backgroundColor: job.company?.color ?? 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    />

                    {/* Job info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '3px',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--accent)',
                          }}
                        >
                          {job.job_number}
                        </span>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {job.customer_name}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {job.address}{job.city ? `, ${job.city}` : ''}
                      </div>
                    </div>

                    {/* Right: status + company */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: '4px',
                        flexShrink: 0,
                      }}
                    >
                      <StatusBadge status={job.status} />
                      {job.company && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            color: job.company.color,
                            backgroundColor: hexToRgba(job.company.color, 0.1),
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {job.company.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
