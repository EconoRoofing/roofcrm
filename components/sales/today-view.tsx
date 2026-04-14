'use client'

import { useRouter } from 'next/navigation'
import { CompanyTag } from '@/components/company-tag'
import { StaleReminders } from '@/components/sales/stale-reminders'
import { FollowUpWidget } from '@/components/follow-up-widget'
import { PhoneIcon, MessageIcon, MapPinIcon } from '@/components/icons'
import { formatJobType, buildMapsUrl } from '@/lib/utils'
import { formatCents, dollarsToCents } from '@/lib/money'
import { completeFollowUp } from '@/lib/actions/follow-up-tasks'
import { useState } from 'react'
import type { Job } from '@/lib/types/database'
import type { FollowUp } from '@/lib/actions/follow-up-tasks'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

interface TodayViewProps {
  todayJobs: JobWithCompany[]
  staleJobs: Job[]
  followUps?: FollowUp[]
  currentUserId?: string
  stats: {
    appointments: number
    pending: number
    /** @deprecated use monthlyRevenueCents */
    monthlyRevenue: number
    monthlyRevenueCents?: number
  }
}


export function TodayView({ todayJobs, staleJobs, followUps = [], currentUserId = '', stats }: TodayViewProps) {
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]
  const [localFollowUps, setLocalFollowUps] = useState<FollowUp[]>(followUps)

  const handleCompleteFollowUp = async (id: string) => {
    try {
      await completeFollowUp(id)
      setLocalFollowUps(prev => prev.filter(f => f.id !== id))
    } catch {
      // ignore
    }
  }

  const overdueFollowUps = localFollowUps.filter(f => f.due_date < today)
  const dueTodayFollowUps = localFollowUps.filter(f => f.due_date === today)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        paddingBottom: '16px',
      }}
    >
      {/* Quick stats row */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '0 16px',
        }}
      >
        {/* Appointments today */}
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}
          >
            {stats.appointments}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textAlign: 'center',
            }}
          >
            Today
          </span>
        </div>

        {/* Pending estimates */}
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '20px',
              fontWeight: 700,
              color: stats.pending > 0 ? 'var(--accent-amber)' : 'var(--text-primary)',
              lineHeight: 1,
            }}
          >
            {stats.pending}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textAlign: 'center',
            }}
          >
            Pending
          </span>
        </div>

        {/* Monthly revenue */}
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--accent)',
              lineHeight: 1,
            }}
          >
            {formatCents(stats.monthlyRevenueCents ?? dollarsToCents(stats.monthlyRevenue))}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textAlign: 'center',
            }}
          >
            Month
          </span>
        </div>
      </div>

      {/* Stale reminders */}
      {staleJobs.length > 0 && <StaleReminders jobs={staleJobs} />}

      {/* Follow-ups */}
      {localFollowUps.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ marginBottom: '8px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '2px',
              }}
            >
              Follow-Ups
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[...overdueFollowUps, ...dueTodayFollowUps].map(f => {
              const isOverdue = f.due_date < today
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const job = f.job as any
              return (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-surface)',
                    border: `1px solid ${isOverdue ? 'var(--accent-red)' : 'var(--accent-amber)'}`,
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: '2px',
                      }}
                    >
                      {job?.customer_name ?? 'Customer'}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: isOverdue ? 'var(--accent-red)' : 'var(--accent-amber)',
                        marginBottom: '2px',
                      }}
                    >
                      {isOverdue ? 'OVERDUE' : 'Due Today'} &bull; {f.due_date}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {f.note}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCompleteFollowUp(f.id)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      color: 'var(--accent)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Mark Done
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Today's appointments */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Section header */}
        <div style={{ padding: '0 16px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}
          >
            Appointments
          </span>
        </div>

        {todayJobs.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
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
              No appointments today
            </span>
          </div>
        ) : (
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {todayJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                {/* Card header */}
                <div
                  style={{
                    padding: '12px 12px 8px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Top row: company tag + job number */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    {job.company && (
                      <CompanyTag name={job.company.name} color={job.company.color} />
                    )}
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
                  </div>

                  {/* Customer name */}
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '16px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      marginBottom: '2px',
                    }}
                  >
                    {job.customer_name}
                  </div>

                  {/* Job type + address */}
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {formatJobType(job.job_type)}
                    {job.address && (
                      <span> &bull; {job.address}{job.city ? `, ${job.city}` : ''}</span>
                    )}
                  </div>
                </div>

                {/* Quick action buttons */}
                <div
                  style={{
                    display: 'flex',
                    borderTop: 'none',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {job.phone && (
                    <a
                      href={`tel:${job.phone.replace(/\D/g, '')}`}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '10px',
                        textDecoration: 'none',
                        color: 'var(--accent)',
                        borderRight: '1px solid var(--border-subtle)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      <PhoneIcon size={16} />
                      Call
                    </a>
                  )}
                  {job.phone && (
                    <a
                      href={`sms:${job.phone.replace(/\D/g, '')}`}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '10px',
                        textDecoration: 'none',
                        color: 'var(--accent-amber)',
                        borderRight: '1px solid var(--border-subtle)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      <MessageIcon size={16} />
                      Text
                    </a>
                  )}
                  {job.address && (
                    <a
                      href={buildMapsUrl(job.address, job.city)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '10px',
                        textDecoration: 'none',
                        color: 'var(--accent-blue)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      <MapPinIcon size={16} />
                      Map
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
