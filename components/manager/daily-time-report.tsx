'use client'

import { useState, useCallback } from 'react'
import { getTimeEntries, exportTimeEntriesCSV } from '@/lib/actions/time-tracking'
import { formatTime, formatTimeOrDash } from '@/lib/utils'
import { formatCents, dollarsToCents } from '@/lib/money'
import { DownloadIcon, FlagIcon } from '@/components/icons'
import type { TimeEntry } from '@/lib/types/time-tracking'

type EntryWithRelations = TimeEntry & {
  job?: { job_number: string; customer_name: string; address: string; city: string }
  user?: { id: string; name: string; email: string }
}

function mono(children: React.ReactNode, color?: string) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains-mono, monospace)',
        fontSize: '12px',
        color: color ?? 'var(--text-primary)',
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  )
}


function ExpandedRow({ entry }: { entry: EntryWithRelations }) {
  return (
    <tr>
      <td
        colSpan={11}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {/* Photos */}
          {entry.clock_in_photo_url && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                Clock-in Photo
              </span>
              <a
                href={entry.clock_in_photo_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '12px',
                  color: '#448aff',
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  textDecoration: 'none',
                }}
              >
                View Photo
              </a>
            </div>
          )}
          {entry.clock_out_photo_url && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                Clock-out Photo
              </span>
              <a
                href={entry.clock_out_photo_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '12px',
                  color: '#448aff',
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  textDecoration: 'none',
                }}
              >
                View Photo
              </a>
            </div>
          )}

          {/* GPS distances */}
          {entry.clock_in_distance_ft != null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                Clock-in Distance
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                {Math.round(entry.clock_in_distance_ft)}ft from jobsite
              </span>
            </div>
          )}

          {/* Weather */}
          {entry.weather_conditions && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                Weather
              </span>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {entry.weather_conditions}
              </span>
            </div>
          )}

          {/* Pay type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              Pay Type
            </span>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono, monospace)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              {/* Audit R3-#2 follow-up: cents-only post-031. */}
              {entry.pay_type === 'day_rate'
                ? `Day Rate: ${formatCents((entry as { day_rate_cents?: number | null }).day_rate_cents ?? 0)}`
                : `Hourly: ${formatCents((entry as { hourly_rate_cents?: number | null }).hourly_rate_cents ?? 0)}/hr`}
            </span>
          </div>
        </div>
      </td>
    </tr>
  )
}

function EntryRow({
  entry,
  index,
}: {
  entry: EntryWithRelations
  index: number
}) {
  const [expanded, setExpanded] = useState(false)
  const isEven = index % 2 === 0
  const isFlagged = entry.flagged

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        style={{
          backgroundColor: isEven ? 'var(--bg-card)' : 'var(--bg-surface)',
          borderLeft: isFlagged ? '3px solid #ff5252' : '3px solid transparent',
          cursor: 'pointer',
          transition: 'background-color 0.1s',
        }}
      >
        {/* Crew Member */}
        <td
          style={{
            padding: '10px 12px',
            fontSize: '13px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {entry.user?.name ?? '—'}
        </td>

        {/* Job # */}
        <td
          style={{
            padding: '10px 12px',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {mono(entry.job?.job_number ? `#${entry.job.job_number}` : '—', '#448aff')}
        </td>

        {/* Job Name */}
        <td
          style={{
            padding: '10px 12px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            maxWidth: '160px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {entry.job?.customer_name ?? '—'}
        </td>

        {/* Clock In */}
        <td
          style={{
            padding: '10px 12px',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {mono(formatTimeOrDash(entry.clock_in))}
        </td>

        {/* Clock Out */}
        <td
          style={{
            padding: '10px 12px',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {entry.clock_out ? mono(formatTimeOrDash(entry.clock_out)) : (
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono, monospace)',
                fontSize: '11px',
                color: 'var(--accent)',
                fontWeight: 600,
              }}
            >
              ACTIVE
            </span>
          )}
        </td>

        {/* Breaks */}
        <td
          style={{
            padding: '10px 12px',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {mono('—')}
        </td>

        {/* Regular Hrs */}
        <td
          style={{
            padding: '10px 12px',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {mono(Number(entry.regular_hours ?? 0).toFixed(2))}
        </td>

        {/* OT Hrs */}
        <td
          style={{
            padding: '10px 12px',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {mono(
            Number(entry.overtime_hours ?? 0).toFixed(2),
            Number(entry.overtime_hours ?? 0) > 0 ? '#ffab00' : 'var(--text-muted)'
          )}
        </td>

        {/* DT Hrs */}
        <td
          style={{
            padding: '10px 12px',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {mono(
            Number(entry.doubletime_hours ?? 0).toFixed(2),
            Number(entry.doubletime_hours ?? 0) > 0 ? '#ff5252' : 'var(--text-muted)'
          )}
        </td>

        {/* Total Cost */}
        <td
          style={{
            padding: '10px 12px',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {/* Audit R3-#2 follow-up: cents-only post-031. */}
          {mono(formatCents((entry as { total_cost_cents?: number | null }).total_cost_cents ?? 0), 'var(--text-primary)')}
        </td>

        {/* Flags */}
        <td
          style={{
            padding: '10px 12px',
            borderBottom: expanded ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          {isFlagged ? (
            <div title={entry.flag_reason ?? 'Flagged'} style={{ cursor: 'help' }} aria-label={entry.flag_reason ?? 'Flagged'}>
              <FlagIcon size={14} />
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
          )}
        </td>
      </tr>
      {expanded && <ExpandedRow entry={entry} />}
    </>
  )
}

interface DailyTimeReportProps {
  initialEntries: EntryWithRelations[]
  initialDate: string
}

export default function DailyTimeReport({ initialEntries, initialDate }: DailyTimeReportProps) {
  const [date, setDate] = useState(initialDate)
  const [entries, setEntries] = useState<EntryWithRelations[]>(initialEntries)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fetchForDate = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const data = await getTimeEntries({ date: d })
      setEntries(data as EntryWithRelations[])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = e.target.value
    setDate(d)
    if (d) fetchForDate(d)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const start = `${date}T00:00:00.000Z`
      const end = `${date}T23:59:59.999Z`
      const csv = await exportTimeEntriesCSV(start, end)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `time-entries-${date}.csv`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    } finally {
      setExporting(false)
    }
  }

  // Summary totals
  const totalRegular = entries.reduce((sum, e) => sum + Number(e.regular_hours ?? 0), 0)
  const totalOT = entries.reduce((sum, e) => sum + Number(e.overtime_hours ?? 0), 0)
  const totalDT = entries.reduce((sum, e) => sum + Number(e.doubletime_hours ?? 0), 0)
  const totalCost = entries.reduce((sum, e) => sum + Number(e.total_cost ?? 0), 0)

  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: '10px',
    fontFamily: 'var(--font-sans)',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-elevated)',
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Daily Time Report
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Date picker */}
          <input
            type="date"
            value={date}
            onChange={handleDateChange}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-jetbrains-mono, monospace)',
              fontSize: '12px',
              cursor: 'pointer',
              outline: 'none',
            }}
          />

          {/* Export button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || entries.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: exporting || entries.length === 0 ? 'not-allowed' : 'pointer',
              opacity: entries.length === 0 ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <DownloadIcon size={12} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Crew Member</th>
              <th style={thStyle}>Job #</th>
              <th style={thStyle}>Job Name</th>
              <th style={thStyle}>Clock In</th>
              <th style={thStyle}>Clock Out</th>
              <th style={thStyle}>Breaks</th>
              <th style={thStyle}>Reg Hrs</th>
              <th style={thStyle}>OT Hrs</th>
              <th style={thStyle}>DT Hrs</th>
              <th style={thStyle}>Total Cost</th>
              <th style={thStyle}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={11}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                  }}
                >
                  Loading...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                  }}
                >
                  No time entries for this date
                </td>
              </tr>
            ) : (
              entries.map((entry, i) => <EntryRow key={entry.id} entry={entry} index={i} />)
            )}
          </tbody>

          {/* Summary row */}
          {entries.length > 0 && !loading && (
            <tfoot>
              <tr
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderTop: '2px solid var(--border-subtle)',
                }}
              >
                <td
                  colSpan={6}
                  style={{
                    padding: '10px 12px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Totals ({entries.length} entries)
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {mono(totalRegular.toFixed(2))}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {mono(totalOT.toFixed(2), totalOT > 0 ? '#ffab00' : undefined)}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {mono(totalDT.toFixed(2), totalDT > 0 ? '#ff5252' : undefined)}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {mono(formatCents(dollarsToCents(totalCost)), 'var(--accent)')}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
