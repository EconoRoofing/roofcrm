import { formatCurrency } from '@/lib/utils'

interface JobCostCardProps {
  contractAmount: number | null
  materialCost: number | null
  laborCost: number
  laborHours: number
}

function profitColor(pct: number): string {
  if (pct > 30) return 'var(--accent)'
  if (pct >= 15) return '#ffab00'
  return '#ff5252'
}

export function JobCostCard({ contractAmount, materialCost, laborCost, laborHours }: JobCostCardProps) {
  const hasLaborData = laborHours > 0

  const contract = contractAmount ?? 0
  const materials = materialCost ?? 0
  const profit = contract - materials - laborCost
  const profitPct = contract > 0 ? (profit / contract) * 100 : 0

  const monoStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains-mono, monospace)',
    fontSize: '13px',
    fontWeight: 500,
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-sans)',
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
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
        Profitability
      </h2>

      {!hasLaborData && laborCost === 0 && contractAmount == null ? (
        <span
          style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          No time entries
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Contract */}
          <div style={rowStyle}>
            <span style={labelStyle}>Contract</span>
            <span style={{ ...monoStyle, color: 'var(--text-primary)' }}>
              {formatCurrency(contract)}
            </span>
          </div>

          {/* Materials */}
          <div style={rowStyle}>
            <span style={labelStyle}>Materials</span>
            <span style={{ ...monoStyle, color: 'var(--text-secondary)' }}>
              -{formatCurrency(materials)}
            </span>
          </div>

          {/* Labor */}
          <div style={rowStyle}>
            <span style={labelStyle}>
              Labor
              {hasLaborData && (
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono, monospace)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginLeft: '6px',
                  }}
                >
                  ({laborHours.toFixed(1)} hrs)
                </span>
              )}
            </span>
            <span style={{ ...monoStyle, color: 'var(--text-secondary)' }}>
              -{formatCurrency(laborCost)}
            </span>
          </div>

          {/* Divider */}
          <div
            style={{
              height: '1px',
              backgroundColor: 'var(--border-subtle)',
              margin: '2px 0',
            }}
          />

          {/* Profit */}
          <div style={rowStyle}>
            <span
              style={{
                fontSize: '14px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              Profit
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: profitColor(profitPct),
                }}
              >
                {formatCurrency(profit)}
              </span>
              {contract > 0 && (
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono, monospace)',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: profitColor(profitPct),
                    padding: '2px 6px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                >
                  {profitPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
