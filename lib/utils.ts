// Shared utility functions used across the app.

// Format job type enum to display label
export function formatJobType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Convert hex color to rgba
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Build Apple Maps URL
export function buildMapsUrl(address: string, city: string, state = 'CA'): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(`${address}, ${city}, ${state}`)}`
}

// Format currency
export function formatCurrency(amount: number): string {
  return '$' + amount.toLocaleString('en-US')
}

// Format time from ISO string to "3:45 PM"
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  })
}

// Format date from ISO string to "Apr 6, 2026"
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

// Format relative time "2h ago", "3d ago"
export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Format currency for display with null handling: null → "—"
export function formatAmount(amount: number | null): string {
  if (amount == null || amount === 0) return '—'
  return '$' + amount.toLocaleString('en-US')
}

// Format money for PDF display — no $ prefix, 2 decimal places
export function formatMoneyPdf(amount: number | null | undefined): string {
  if (amount == null) return '0.00'
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Format display date: "Monday, Apr 6"
export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

// Format elapsed time as HH:MM:SS
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Format a CompanyCam unix timestamp (seconds) to "Apr 6" style
export function formatPhotoDate(unixTimestamp: string): string {
  try {
    const d = new Date(Number(unixTimestamp) * 1000)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// Format milliseconds as MM:SS countdown/elapsed (e.g. for break timers)
export function formatMinutes(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Format compact currency for KPI cards: $1.2K, $2.3M, $456
export function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

// Format time or return dash for null (used in time reports)
export function formatTimeOrDash(iso: string | null): string {
  if (!iso) return '—'
  return formatTime(iso)
}

// Format a numeric currency value for input fields — no $ prefix, no symbol
// Returns empty string for falsy values
export function formatNumericInput(val: number | null | undefined): string {
  if (!val) return ''
  return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// Format money with $0.00 fallback (used in review/summary screens)
export function formatMoneyDisplay(val: number | null | undefined): string {
  if (val == null) return '$0.00'
  return formatCurrency(val)
}
