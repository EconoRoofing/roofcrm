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
