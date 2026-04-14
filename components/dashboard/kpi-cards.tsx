'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { formatCents, formatCentsCompact, dollarsToCents } from '@/lib/money'
import type { Company } from '@/lib/types/database'
import type { DashboardData } from '@/lib/actions/dashboard'

interface KPICardsProps {
  data: DashboardData
  companies: Company[]
}

// ── CSS-based bar chart ────────────────────────────────────────────────────

function BarRow({
  label,
  value,
  maxValue,
  color,
  suffix = '',
}: {
  label: string
  value: number
  maxValue: number
  color: string
  suffix?: string
}) {
  const pct = maxValue > 0 ? Math.max(2, (value / maxValue) * 100) : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {suffix}{value.toLocaleString()}
        </span>
      </div>
      <div
        style={{
          height: '6px',
          borderRadius: '3px',
          backgroundColor: 'var(--bg-elevated)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: '3px',
            backgroundColor: color,
            transition: 'width 400ms ease',
          }}
        />
      </div>
    </div>
  )
}

// ── Close rate color ───────────────────────────────────────────────────────

function closeRateColor(rate: number): string {
  if (rate >= 30) return 'var(--accent)'
  if (rate >= 15) return 'var(--accent-amber)'
  return 'var(--accent-red)'
}

function pipelineDaysColor(days: number): string {
  if (days < 7) return 'var(--accent)'
  if (days <= 14) return 'var(--accent-amber)'
  return 'var(--accent-red)'
}

// ── Date range chips ───────────────────────────────────────────────────────

type DateRange = 'month' | 'quarter' | 'year' | 'all'

function getDateRangeLabel(range: DateRange): string {
  switch (range) {
    case 'month': return 'This Month'
    case 'quarter': return 'This Quarter'
    case 'year': return 'This Year'
    case 'all': return 'All Time'
  }
}

// ── Static style constants (outside component to avoid re-creation per render) ──

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const sectionHeadStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '8px',
}

const listCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  overflow: 'hidden',
}

const barChartCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

// chipStyle and bigNumberStyle remain as functions (they depend on dynamic values)
const chipStyle = (active: boolean, color?: string): React.CSSProperties => ({
  padding: '8px 12px',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  cursor: 'pointer',
  border: active
    ? `1px solid ${color ?? 'var(--accent)'}`
    : '1px solid var(--border-subtle)',
  backgroundColor: active ? (color ? `${color}1f` : 'var(--accent-dim)') : 'transparent',
  color: active ? (color ?? 'var(--accent)') : 'var(--text-secondary)',
  transition: 'all 150ms ease',
  flexShrink: 0,
  letterSpacing: '0.04em',
})

const bigNumberStyle = (color: string): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: '28px',
  fontWeight: 700,
  color,
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
})

// ── Main component ─────────────────────────────────────────────────────────

export function KPICards({ data, companies }: KPICardsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const selectedCompany = searchParams.get('company')
  const selectedRange = (searchParams.get('range') as DateRange) ?? 'month'

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }

  const maxRepRevenue = data.revenueByRep[0]?.revenue ?? 1
  const maxCompanyRevenue = data.revenueByCompany[0]?.revenue ?? 1
  const maxSourceCount = data.leadsBySource[0]?.count ?? 1

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        minHeight: '100%',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* ── Filter bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '12px 24px',
          overflowX: 'auto',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          flexWrap: 'wrap',
          rowGap: '8px',
        }}
      >
        {/* Company filter */}
        <button type="button" style={chipStyle(selectedCompany === null)} onClick={() => updateParam('company', null)}>
          All Companies
        </button>
        {companies.map((company) => {
          const isActive = selectedCompany === company.id
          return (
            <button
              type="button"
              key={company.id}
              style={chipStyle(isActive, company.color)}
              onClick={() => updateParam('company', isActive ? null : company.id)}
            >
              {company.name}
            </button>
          )
        })}

        {/* Divider */}
        <div
          style={{
            width: '1px',
            height: '20px',
            backgroundColor: 'var(--border-subtle)',
            margin: '0 4px',
            flexShrink: 0,
          }}
        />

        {/* Date range chips */}
        {(['month', 'quarter', 'year', 'all'] as DateRange[]).map((range) => (
          <button
            type="button"
            key={range}
            style={chipStyle(selectedRange === range)}
            onClick={() => updateParam('range', range === 'month' ? null : range)}
          >
            {getDateRangeLabel(range)}
          </button>
        ))}
      </div>

      {/* ── Main content ── */}
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

        {/* ── Primary KPIs 2-col grid ── */}
        <section>
          <p style={sectionHeadStyle}>Key Metrics</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
            }}
          >
            {/* Pipeline Value */}
            <div style={cardStyle}>
              <span style={labelStyle}>Pipeline Value</span>
              <span style={bigNumberStyle('var(--accent-blue)')}>
                {formatCentsCompact(dollarsToCents(data.pipelineValue))}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Active & pending jobs
              </span>
            </div>

            {/* Close Rate */}
            <div style={cardStyle}>
              <span style={labelStyle}>Close Rate</span>
              <span style={bigNumberStyle(closeRateColor(data.closeRate))}>
                {data.closeRate.toFixed(1)}%
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {data.closeRate >= 30 ? 'Excellent' : data.closeRate >= 15 ? 'Average' : 'Needs attention'}
              </span>
            </div>

            {/* Revenue This Month */}
            <div style={cardStyle}>
              <span style={labelStyle}>Revenue This Month</span>
              <span style={bigNumberStyle('var(--accent)')}>
                {formatCentsCompact(dollarsToCents(data.revenueThisMonth))}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {formatCents(dollarsToCents(data.revenueThisMonth))} total
              </span>
            </div>

            {/* Jobs Completed */}
            <div style={cardStyle}>
              <span style={labelStyle}>Jobs Completed</span>
              <span style={bigNumberStyle('var(--text-primary)')}>
                {data.jobsCompletedThisMonth}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>This month</span>
            </div>

            {/* Avg Days in Pipeline */}
            <div style={cardStyle}>
              <span style={labelStyle}>Avg Days in Pipeline</span>
              <span style={bigNumberStyle(pipelineDaysColor(data.avgDaysInPipeline))}>
                {data.avgDaysInPipeline.toFixed(1)}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {data.avgDaysInPipeline < 7 ? 'Fast close' : data.avgDaysInPipeline <= 14 ? 'Average pace' : 'Slow — review pipeline'}
              </span>
            </div>

            {/* Stale Leads */}
            <div style={cardStyle}>
              <span style={labelStyle}>Stale Leads</span>
              <span
                style={bigNumberStyle(
                  data.staleLeadCount > 0 ? 'var(--accent-red)' : 'var(--accent)'
                )}
              >
                {data.staleLeadCount}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {data.staleLeadCount > 0 ? 'Pending 14+ days — follow up' : 'All leads active'}
              </span>
            </div>
          </div>
        </section>

        {/* ── Revenue by Rep ── */}
        {data.revenueByRep.length > 0 && (
          <section>
            <p style={sectionHeadStyle}>Revenue by Rep</p>
            <div style={listCardStyle}>
              {data.revenueByRep.map((rep, i) => {
                const isTop = i === 0
                return (
                  <div
                    key={rep.repName}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom:
                        i < data.revenueByRep.length - 1
                          ? '1px solid var(--border-subtle)'
                          : 'none',
                      backgroundColor: isTop ? 'rgba(0, 230, 118, 0.04)' : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: isTop ? 'var(--accent)' : 'var(--text-muted)',
                        width: '20px',
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {rep.repName}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: isTop ? 'var(--accent)' : 'var(--text-primary)',
                      }}
                    >
                      {formatCents(dollarsToCents(rep.revenue))}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        width: '52px',
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {rep.jobCount} job{rep.jobCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Commissions ── */}
        {data.revenueByRep.some(r => r.commission > 0) && (
          <section>
            <p style={sectionHeadStyle}>Commissions</p>
            <div style={listCardStyle}>
              {data.revenueByRep.filter(r => r.commission > 0).map((rep, i, arr) => (
                <div
                  key={rep.repName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {rep.repName}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--accent)',
                    }}
                  >
                    {formatCents(dollarsToCents(rep.commission))}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', width: '52px', textAlign: 'right', flexShrink: 0 }}>
                    {rep.jobCount} job{rep.jobCount !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Revenue by Company ── */}
        {data.revenueByCompany.length > 0 && (
          <section>
            <p style={sectionHeadStyle}>Revenue by Company</p>
            <div style={barChartCardStyle}>
              {data.revenueByCompany.map((co) => {
                const pct = maxCompanyRevenue > 0 ? (co.revenue / maxCompanyRevenue) * 100 : 0
                const h = co.companyColor.replace('#', '')
                const r = parseInt(h.substring(0, 2), 16)
                const g = parseInt(h.substring(2, 4), 16)
                const b = parseInt(h.substring(4, 6), 16)

                return (
                  <div key={co.companyName} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: co.companyColor }}>
                        {co.companyName}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '14px',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {formatCents(dollarsToCents(co.revenue))}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {co.jobCount} job{co.jobCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        height: '8px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-elevated)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(2, pct)}%`,
                          height: '100%',
                          borderRadius: '4px',
                          backgroundColor: `rgba(${r},${g},${b},0.8)`,
                          transition: 'width 400ms ease',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Lead Sources ── */}
        {data.leadsBySource.length > 0 && (
          <section>
            <p style={sectionHeadStyle}>Lead Sources</p>
            <div style={barChartCardStyle}>
              {data.leadsBySource.slice(0, 8).map((source) => {
                const convRate =
                  source.count > 0 ? Math.round((source.convertedCount / source.count) * 100) : 0
                const convColor =
                  convRate >= 30
                    ? 'var(--accent)'
                    : convRate >= 15
                    ? 'var(--accent-amber)'
                    : 'var(--accent-red)'
                return (
                  <div key={source.source} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {source.source}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            color: convColor,
                            fontWeight: 600,
                          }}
                        >
                          {convRate}% conv.
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {source.count}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        height: '6px',
                        borderRadius: '3px',
                        backgroundColor: 'var(--bg-elevated)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(2, (source.count / maxSourceCount) * 100)}%`,
                          height: '100%',
                          borderRadius: '3px',
                          backgroundColor: 'var(--accent-purple)',
                          transition: 'width 400ms ease',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Time Tracking ── */}
        <section>
          <p style={sectionHeadStyle}>Time Tracking</p>
          {data.avgHoursPerJob === 0 && data.totalLaborCostThisMonth === 0 && data.overtimeHoursThisWeek === 0 ? (
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '24px 16px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No time tracking data available</span>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
              }}
            >
              <div style={cardStyle}>
                <span style={labelStyle}>Avg Hours / Job</span>
                <span style={bigNumberStyle('var(--accent-blue)')}>
                  {data.avgHoursPerJob.toFixed(1)}h
                </span>
              </div>
              <div style={cardStyle}>
                <span style={labelStyle}>Labor Cost (Month)</span>
                <span style={bigNumberStyle('var(--text-primary)')}>
                  {formatCentsCompact(dollarsToCents(data.totalLaborCostThisMonth))}
                </span>
              </div>
              <div style={{ ...cardStyle, gridColumn: 'span 2' }}>
                <span style={labelStyle}>OT Hours This Week</span>
                <span
                  style={bigNumberStyle(
                    data.overtimeHoursThisWeek > 20
                      ? 'var(--accent-red)'
                      : data.overtimeHoursThisWeek > 8
                      ? 'var(--accent-amber)'
                      : 'var(--accent)'
                  )}
                >
                  {data.overtimeHoursThisWeek.toFixed(1)}h
                </span>
              </div>
            </div>
          )}
        </section>

        {/* ── Job Type Breakdown ── */}
        {data.jobsByType.length > 0 && (
          <section>
            <p style={sectionHeadStyle}>Jobs by Type</p>
            <div style={barChartCardStyle}>
              {data.jobsByType.map((jt) => {
                const maxRev = data.jobsByType[0]?.revenue ?? 1
                return (
                  <BarRow
                    key={jt.type}
                    label={jt.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    value={jt.count}
                    maxValue={data.jobsByType.reduce((max, t) => Math.max(max, t.count), 1)}
                    color="var(--accent-amber)"
                    suffix=""
                  />
                )
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
