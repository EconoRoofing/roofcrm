import { hexToRgba } from '@/lib/utils'

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
        borderRadius: '8px',
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
