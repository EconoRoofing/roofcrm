import { IncidentReport } from '@/components/safety/incident-report'

export default function CrewIncidentPage() {
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
      {/* Header */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '20px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Report Incident
        </h1>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Injury, near miss, property damage, environmental
        </div>
      </div>

      {/* Form */}
      <div style={{ padding: '16px' }}>
        <IncidentReport />
      </div>
    </div>
  )
}
