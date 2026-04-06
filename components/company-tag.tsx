interface CompanyTagProps {
  name: string
  color: string
}

export function CompanyTag({ name, color }: CompanyTagProps) {
  // Convert hex color to rgba with 12% opacity for background
  const bg = hexToRgba(color, 0.12)

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: '6px',
        backgroundColor: bg,
        color: color,
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        lineHeight: '1.4',
      }}
    >
      {name}
    </span>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
