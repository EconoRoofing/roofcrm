export function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '0 16px',
        marginBottom: '8px',
      }}
    >
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
        {label}
      </span>
    </div>
  )
}
