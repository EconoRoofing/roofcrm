'use client'

import { useState } from 'react'
import { ShieldIcon, ClipboardCheckIcon, IncidentIcon, CertBadgeIcon, HardHatIcon } from '@/components/icons'

type Tab = 'overview' | 'talks' | 'inspections' | 'incidents' | 'certifications'

interface SafetyDashboardProps {
  talksThisWeek: number
  inspectionsPassed: number
  inspectionsFailed: number
  openIncidents: number
  expiringCerts: number
  children: {
    overview?: React.ReactNode
    talks?: React.ReactNode
    inspections?: React.ReactNode
    incidents?: React.ReactNode
    certifications?: React.ReactNode
  }
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'talks', label: 'Toolbox Talks' },
  { id: 'inspections', label: 'Inspections' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'certifications', label: 'Certifications' },
]

export function SafetyDashboard({
  talksThisWeek,
  inspectionsPassed,
  inspectionsFailed,
  openIncidents,
  expiringCerts,
  children,
}: SafetyDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', minHeight: '100%' }}>
      {/* Tab bar */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 24px',
          overflowX: 'auto',
        }}
      >
        <div style={{ display: 'flex', gap: '4px', whiteSpace: 'nowrap' }}>
          {TABS.map(({ id, label }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                style={{
                  padding: '14px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  marginBottom: '-1px',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {label}
                {id === 'incidents' && openIncidents > 0 && (
                  <span
                    style={{
                      marginLeft: '6px',
                      padding: '1px 6px',
                      backgroundColor: 'var(--accent-red)',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#fff',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {openIncidents}
                  </span>
                )}
                {id === 'certifications' && expiringCerts > 0 && (
                  <span
                    style={{
                      marginLeft: '6px',
                      padding: '1px 6px',
                      backgroundColor: 'var(--accent-amber)',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#000',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {expiringCerts}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Overview tab content */}
      {activeTab === 'overview' && (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* KPI Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <KpiCard
              icon={<HardHatIcon size={20} />}
              iconBg="var(--accent-dim)"
              iconColor="var(--accent)"
              label="Toolbox Talks"
              sublabel="this week"
              value={talksThisWeek}
              onClick={() => setActiveTab('talks')}
            />
            <KpiCard
              icon={<ClipboardCheckIcon size={20} />}
              iconBg="rgba(34,197,94,0.12)"
              iconColor="#22c55e"
              label="Inspections Passed"
              sublabel="this month"
              value={inspectionsPassed}
              valueColor="#22c55e"
              onClick={() => setActiveTab('inspections')}
            />
            <KpiCard
              icon={<ClipboardCheckIcon size={20} />}
              iconBg="var(--accent-red-dim)"
              iconColor="var(--accent-red)"
              label="Inspections Failed"
              sublabel="this month"
              value={inspectionsFailed}
              valueColor={inspectionsFailed > 0 ? 'var(--accent-red)' : undefined}
              onClick={() => setActiveTab('inspections')}
            />
            <KpiCard
              icon={<IncidentIcon size={20} />}
              iconBg="var(--accent-red-dim)"
              iconColor="var(--accent-red)"
              label="Open Incidents"
              sublabel="need resolution"
              value={openIncidents}
              valueColor={openIncidents > 0 ? 'var(--accent-red)' : undefined}
              onClick={() => setActiveTab('incidents')}
            />
            <KpiCard
              icon={<CertBadgeIcon size={20} />}
              iconBg="var(--accent-amber-dim)"
              iconColor="var(--accent-amber)"
              label="Expiring Certs"
              sublabel="within 30 days"
              value={expiringCerts}
              valueColor={expiringCerts > 0 ? 'var(--accent-amber)' : undefined}
              onClick={() => setActiveTab('certifications')}
            />
          </div>

          {children.overview}
        </div>
      )}

      {activeTab === 'talks' && (
        <div style={{ padding: '24px' }}>{children.talks}</div>
      )}

      {activeTab === 'inspections' && (
        <div style={{ padding: '24px' }}>{children.inspections}</div>
      )}

      {activeTab === 'incidents' && (
        <div style={{ padding: '24px' }}>{children.incidents}</div>
      )}

      {activeTab === 'certifications' && (
        <div style={{ padding: '24px' }}>{children.certifications}</div>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  iconBg,
  iconColor,
  label,
  sublabel,
  value,
  valueColor,
  onClick,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  sublabel: string
  value: number
  valueColor?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
        transition: 'border-color 0.15s',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          backgroundColor: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: iconColor,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '28px',
            fontWeight: 700,
            color: valueColor ?? 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginTop: '4px',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            marginTop: '2px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {sublabel}
        </div>
      </div>
    </button>
  )
}
