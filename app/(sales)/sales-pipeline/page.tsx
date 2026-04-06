export default function Page() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100%',
        padding: '48px 24px',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono, monospace)',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--accent)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Pipeline
      </span>
    </div>
  )
}
