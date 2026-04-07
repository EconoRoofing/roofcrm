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

// Format elapsed time as HH:MM:SS
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
