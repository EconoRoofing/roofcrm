'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatDisplayDate } from '@/lib/utils'
import { formatCentsCompact, dollarsToCents } from '@/lib/money'
import { broadcastToTodayCrew } from '@/lib/actions/broadcast'
import type { CommandCenterData } from '@/lib/actions/command-center'

// ─── Icons (inline SVG, no emoji) ────────────────────────────────────────────

function AlertDotIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M14 2L2 7l5 2 2 5 5-12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AlertBar({ data }: { data: CommandCenterData }) {
  const alerts: Array<{ label: string; href: string; severity: 'red' | 'amber' }> = []

  const notClockedIn = data.totalCrewToday - data.activeCrewCount
  if (notClockedIn > 0) {
    alerts.push({ label: `${notClockedIn} crew not clocked in`, href: '/team', severity: 'amber' })
  }
  if (data.staleLeadCount > 0) {
    alerts.push({ label: `${data.staleLeadCount} stale lead${data.staleLeadCount > 1 ? 's' : ''}`, href: '/pipeline', severity: 'amber' })
  }
  if (data.dueFollowUpCount > 0) {
    alerts.push({ label: `${data.dueFollowUpCount} follow-up${data.dueFollowUpCount > 1 ? 's' : ''} due`, href: '/pipeline', severity: 'amber' })
  }
  if (data.openIncidentCount > 0) {
    alerts.push({ label: `${data.openIncidentCount} open incident${data.openIncidentCount > 1 ? 's' : ''}`, href: '/safety', severity: 'red' })
  }
  if (data.expiringCertCount > 0) {
    alerts.push({ label: `${data.expiringCertCount} cert expiring`, href: '/team', severity: 'amber' })
  }
  if (data.overdueEquipmentCount > 0) {
    alerts.push({ label: `${data.overdueEquipmentCount} equipment overdue`, href: '/equipment', severity: 'amber' })
  }

  if (alerts.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '12px 16px',
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {alerts.map((alert) => (
        <Link
          key={alert.label}
          href={alert.href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            textDecoration: 'none',
            color: alert.severity === 'red' ? 'var(--accent-red)' : 'var(--accent-amber)',
            backgroundColor: alert.severity === 'red' ? 'var(--accent-red-dim)' : 'var(--accent-amber-dim)',
            border: `1px solid ${alert.severity === 'red' ? 'rgba(255,82,82,0.3)' : 'rgba(255,171,0,0.3)'}`,
          }}
        >
          <AlertDotIcon />
          {alert.label}
        </Link>
      ))}
    </div>
  )
}

function MoneyCards({ data }: { data: CommandCenterData }) {
  // Simple close rate: jobs with total_amount / all non-cancelled — use pipeline heuristic
  const closeRatePct = data.pipelineValue > 0
    ? Math.min(99, Math.round((data.revenueThisMonth / (data.revenueThisMonth + data.pipelineValue)) * 100))
    : 0

  const cards = [
    { label: 'Revenue This Month', value: formatCentsCompact(dollarsToCents(data.revenueThisMonth)), accent: 'var(--accent)' },
    { label: 'Pipeline Value', value: formatCentsCompact(dollarsToCents(data.pipelineValue)), accent: 'var(--accent-blue)' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '16px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono, monospace)',
              fontSize: '22px',
              fontWeight: 700,
              color: card.accent,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            {card.value}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              marginTop: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {card.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function BroadcastPanel() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSend() {
    if (!message.trim()) return
    startTransition(async () => {
      const res = await broadcastToTodayCrew(message.trim())
      setResult(`Sent to ${res.sent} crew member${res.sent !== 1 ? 's' : ''}`)
      setMessage('')
      setTimeout(() => {
        setResult(null)
        setOpen(false)
      }, 2500)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          padding: '12px 16px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <SendIcon />
        Message All Crew
      </button>
    )
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {result ? (
        <div
          style={{
            padding: '10px',
            backgroundColor: 'var(--accent-dim)',
            borderRadius: '6px',
            color: 'var(--accent)',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {result}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Message All Crew
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
              }}
            >
              <CloseIcon />
            </button>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message to send to all crew working today..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!message.trim() || isPending}
            style={{
              padding: '10px 16px',
              backgroundColor: isPending ? 'var(--bg-elevated)' : 'var(--accent)',
              border: 'none',
              borderRadius: '6px',
              color: isPending ? 'var(--text-muted)' : '#000',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isPending || !message.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'opacity 0.15s',
              opacity: !message.trim() ? 0.5 : 1,
            }}
          >
            <SendIcon />
            {isPending ? 'Sending...' : 'Send'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface CommandCenterProps {
  data: CommandCenterData
  managerName: string
}

export function CommandCenter({ data, managerName }: CommandCenterProps) {
  const now = new Date()
  const displayDate = formatDisplayDate(now)
  const firstName = managerName.split(' ')[0]

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* Alert bar — sits flush at top */}
      <AlertBar data={data} />

      {/* Main content */}
      <div
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          width: '100%',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Header */}
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '28px',
              fontWeight: 900,
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
            }}
          >
            {greeting}, {firstName}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-jetbrains-mono, monospace)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              margin: '4px 0 0',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {displayDate} · Fresno, CA
          </p>
        </div>

        {/* Money cards */}
        <MoneyCards data={data} />

        {/* 3-column stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            { label: "Today's Jobs", value: data.todayJobCount, href: '/list' },
            { label: 'Crew Active', value: `${data.activeCrewCount}/${data.totalCrewToday}`, href: '/team' },
            { label: 'Completed Yesterday', value: data.yesterdayCompletedCount, href: '/list' },
          ].map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '12px',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                {stat.value}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 500,
                }}
              >
                {stat.label}
              </span>
            </Link>
          ))}
        </div>

        {/* Today's schedule */}
        {data.todayJobs.length > 0 && (
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                margin: '0 0 8px',
              }}
            >
              Today&apos;s Schedule
            </h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {data.todayJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    textDecoration: 'none',
                  }}
                >
                  {/* Company color dot */}
                  {job.company && (
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: job.company.color,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
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
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {job.city}
                    </div>
                  </div>
                  {job.company && (
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: job.company.color,
                        backgroundColor: job.company.color + '22',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        flexShrink: 0,
                      }}
                    >
                      {job.company.name}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Follow-ups due */}
        {data.dueFollowUps.length > 0 && (
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                margin: '0 0 8px',
              }}
            >
              Follow-ups Due
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.dueFollowUps.map((fu) => {
                const job = fu.job as { customer_name?: string; phone?: string | null } | null
                return (
                  <div
                    key={fu.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {job?.customer_name ?? 'Customer'}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fu.note}
                      </div>
                    </div>
                    {job?.phone && (
                      <a
                        href={`tel:${job.phone}`}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--accent-dim)',
                          border: '1px solid rgba(0,230,118,0.2)',
                          borderRadius: '6px',
                          color: 'var(--accent)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '12px',
                          fontWeight: 700,
                          textDecoration: 'none',
                          flexShrink: 0,
                        }}
                      >
                        Call
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Broadcast */}
        <BroadcastPanel />
      </div>
    </div>
  )
}
