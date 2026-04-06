'use client'

import { useRouter } from 'next/navigation'
import { CompanyTag } from '@/components/company-tag'
import { StaleReminders } from '@/components/sales/stale-reminders'
import type { Job } from '@/lib/types/database'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

interface TodayViewProps {
  todayJobs: JobWithCompany[]
  staleJobs: Job[]
  stats: {
    appointments: number
    pending: number
    monthlyRevenue: number
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatJobType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function appleMapsUrl(address: string, city: string): string {
  const query = encodeURIComponent(`${address}, ${city}`)
  return `https://maps.apple.com/?q=${query}`
}

// --- SVG icons ---
function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path
        d="M3 3C3 2.4 3.5 2 4 2H6.5L8 5.5L6.5 7C6.5 7 7.2 9 9 10.8C10.8 12.6 13 13.5 13 13.5L14.5 12L18 13.5V16C18 16.5 17.6 17 17 17C9.5 17 1 8.5 1 1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path
        d="M2 3C2 2.4 2.4 2 3 2H15C15.6 2 16 2.4 16 3V11C16 11.6 15.6 12 15 12H10L7 16V12H3C2.4 12 2 11.6 2 11V3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MapPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 1C6.2 1 4 3.2 4 6C4 9.5 9 17 9 17C9 17 14 9.5 14 6C14 3.2 11.8 1 9 1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function TodayView({ todayJobs, staleJobs, stats }: TodayViewProps) {
  const router = useRouter()

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
            {formatCurrency(stats.monthlyRevenue)}
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
                  borderRadius: '10px',
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
                      <PhoneIcon />
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
                      <MessageIcon />
                      Text
                    </a>
                  )}
                  {job.address && (
                    <a
                      href={appleMapsUrl(job.address, job.city)}
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
                      <MapPinIcon />
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
