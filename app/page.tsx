import { COMPANY_COLORS } from '@/lib/theme'

export default function Home() {
  return (
    <div
      className="flex flex-1 items-center justify-center min-h-screen"
      style={{ backgroundColor: 'var(--bg-deep)' }}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-lg)] p-8 flex flex-col gap-6"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Heading */}
        <div className="flex flex-col gap-1">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            RoofCRM
          </h1>
          <p
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            Design system — Theme test card
          </p>
        </div>

        {/* Accent color swatch */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-[var(--radius-sm)]"
            style={{ backgroundColor: 'var(--accent)' }}
          />
          <div className="flex flex-col gap-0.5">
            <span
              className="text-xs font-medium uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              Current accent
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--accent)' }}
            >
              Time-of-day theme
            </span>
          </div>
        </div>

        {/* Company tags */}
        <div className="flex flex-wrap gap-2">
          <span
            className="inline-flex items-center px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium"
            style={{
              backgroundColor: COMPANY_COLORS.econo.dim,
              color: COMPANY_COLORS.econo.color,
              border: `1px solid ${COMPANY_COLORS.econo.color}22`,
            }}
          >
            Econo
          </span>
          <span
            className="inline-flex items-center px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium"
            style={{
              backgroundColor: COMPANY_COLORS.dehart.dim,
              color: COMPANY_COLORS.dehart.color,
              border: `1px solid ${COMPANY_COLORS.dehart.color}22`,
            }}
          >
            DeHart
          </span>
          <span
            className="inline-flex items-center px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium"
            style={{
              backgroundColor: COMPANY_COLORS.nushake.dim,
              color: COMPANY_COLORS.nushake.color,
              border: `1px solid ${COMPANY_COLORS.nushake.color}22`,
            }}
          >
            Nushake
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

        {/* Monospace job number */}
        <div className="flex items-center justify-between">
          <span
            className="text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Job number
          </span>
          <code
            className="text-sm font-medium tracking-wider"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--bg-elevated)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            26-0042
          </code>
        </div>

        {/* Nav gradient preview */}
        <div
          className="w-full h-8 rounded-[var(--radius-sm)] flex items-center justify-center"
          style={{
            background:
              'linear-gradient(90deg, var(--nav-gradient-1), var(--nav-gradient-2))',
          }}
        >
          <span
            className="text-xs font-bold tracking-wide"
            style={{ color: 'var(--nav-text)' }}
          >
            Nav gradient
          </span>
        </div>
      </div>
    </div>
  )
}
