export interface ThemeVars {
  '--bg-deep': string
  '--bg-surface': string
  '--bg-card': string
  '--bg-elevated': string
  '--border-subtle': string
  '--text-primary': string
  '--text-secondary': string
  '--text-muted': string
  '--accent': string
  '--accent-dim': string
  '--accent-glow': string
  '--nav-gradient-1': string
  '--nav-gradient-2': string
  '--nav-text': string
}

interface ThemePeriod {
  name: string
  startMin: number
  endMin: number
  vars: ThemeVars
}

// Helper: parse a hex color to [r, g, b]
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

// Helper: [r, g, b] back to hex
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  )
}

// Linearly interpolate between two hex colors
function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

// Keys that are solid hex values (can be lerped)
const HEX_KEYS: Array<keyof ThemeVars> = [
  '--bg-deep',
  '--bg-surface',
  '--bg-card',
  '--bg-elevated',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--accent',
  '--nav-gradient-1',
  '--nav-gradient-2',
  '--nav-text',
]

export const COMPANY_COLORS = {
  econo: { color: '#448aff', dim: 'rgba(68,138,255,0.12)' },
  dehart: { color: '#ffab00', dim: 'rgba(255,171,0,0.12)' },
  nushake: { color: '#b388ff', dim: 'rgba(179,136,255,0.12)' },
} as const

// Theme periods — times in minutes since midnight
const THEMES: ThemePeriod[] = [
  {
    name: 'earlyMorning',
    startMin: 300, // 5am
    endMin: 420,   // 7am
    vars: {
      '--bg-deep': '#0d0a06',
      '--bg-surface': '#14100a',
      '--bg-card': '#1c1610',
      '--bg-elevated': '#261e16',
      '--border-subtle': 'rgba(255,180,80,0.08)',
      '--text-primary': '#f5ede0',
      '--text-secondary': '#9c8a72',
      '--text-muted': '#6b5a44',
      '--accent': '#ffab40',
      '--accent-dim': 'rgba(255,171,64,0.12)',
      '--accent-glow': 'rgba(255,171,64,0.3)',
      '--nav-gradient-1': '#e65100',
      '--nav-gradient-2': '#ff9100',
      '--nav-text': '#3e1a00',
    },
  },
  {
    name: 'morning',
    startMin: 420, // 7am
    endMin: 600,   // 10am
    vars: {
      '--bg-deep': '#08090d',
      '--bg-surface': '#0e1117',
      '--bg-card': '#151921',
      '--bg-elevated': '#1e2430',
      '--border-subtle': 'rgba(255,255,255,0.06)',
      '--text-primary': '#f0f2f5',
      '--text-secondary': '#7a8294',
      '--text-muted': '#4a5168',
      '--accent': '#00e676',
      '--accent-dim': 'rgba(0,230,118,0.12)',
      '--accent-glow': 'rgba(0,230,118,0.25)',
      '--nav-gradient-1': '#00c853',
      '--nav-gradient-2': '#00e676',
      '--nav-text': '#003d00',
    },
  },
  {
    name: 'midday',
    startMin: 600, // 10am
    endMin: 840,   // 2pm
    vars: {
      '--bg-deep': '#0a0c10',
      '--bg-surface': '#10131a',
      '--bg-card': '#171c26',
      '--bg-elevated': '#1f2636',
      '--border-subtle': 'rgba(140,180,255,0.06)',
      '--text-primary': '#f4f6fa',
      '--text-secondary': '#8894aa',
      '--text-muted': '#5a6478',
      '--accent': '#40c4ff',
      '--accent-dim': 'rgba(64,196,255,0.12)',
      '--accent-glow': 'rgba(64,196,255,0.25)',
      '--nav-gradient-1': '#00b0ff',
      '--nav-gradient-2': '#40c4ff',
      '--nav-text': '#002f4a',
    },
  },
  {
    name: 'afternoon',
    startMin: 840,  // 2pm
    endMin: 1020,   // 5pm
    vars: {
      '--bg-deep': '#0c0a08',
      '--bg-surface': '#131110',
      '--bg-card': '#1c1916',
      '--bg-elevated': '#252220',
      '--border-subtle': 'rgba(255,200,120,0.07)',
      '--text-primary': '#f2ede6',
      '--text-secondary': '#8e8478',
      '--text-muted': '#5e564c',
      '--accent': '#ffc107',
      '--accent-dim': 'rgba(255,193,7,0.12)',
      '--accent-glow': 'rgba(255,193,7,0.25)',
      '--nav-gradient-1': '#f9a825',
      '--nav-gradient-2': '#ffc107',
      '--nav-text': '#3e2800',
    },
  },
  {
    name: 'sunset',
    startMin: 1020, // 5pm
    endMin: 1200,   // 8pm
    vars: {
      '--bg-deep': '#0e0608',
      '--bg-surface': '#160c10',
      '--bg-card': '#1e1218',
      '--bg-elevated': '#2a1a22',
      '--border-subtle': 'rgba(255,120,80,0.08)',
      '--text-primary': '#f5e8e0',
      '--text-secondary': '#9c7a70',
      '--text-muted': '#6b5048',
      '--accent': '#ff6e40',
      '--accent-dim': 'rgba(255,110,64,0.12)',
      '--accent-glow': 'rgba(255,110,64,0.3)',
      '--nav-gradient-1': '#d84315',
      '--nav-gradient-2': '#ff6e40',
      '--nav-text': '#3d1100',
    },
  },
  {
    name: 'night',
    startMin: 1200, // 8pm
    endMin: 1440,   // midnight
    vars: {
      '--bg-deep': '#060608',
      '--bg-surface': '#0a0a10',
      '--bg-card': '#101018',
      '--bg-elevated': '#181820',
      '--border-subtle': 'rgba(100,100,200,0.06)',
      '--text-primary': '#d8d8e8',
      '--text-secondary': '#6a6a88',
      '--text-muted': '#3e3e58',
      '--accent': '#7c4dff',
      '--accent-dim': 'rgba(124,77,255,0.12)',
      '--accent-glow': 'rgba(124,77,255,0.3)',
      '--nav-gradient-1': '#4527a0',
      '--nav-gradient-2': '#7c4dff',
      '--nav-text': '#e8deff',
    },
  },
]

// The default (morning) theme
export const DEFAULT_THEME = THEMES[1].vars

// Night theme — used for midnight-5AM (after night period ends, before early morning starts)
const NIGHT_THEME = THEMES[THEMES.length - 1].vars

/**
 * Returns interpolated CSS variables for the given date/time.
 * In the last 30% of each period, smoothly blends into the next theme.
 * Midnight-5AM uses the night theme (not morning — nobody wants bright green at 2 AM).
 */
export function getThemeForTime(date: Date): ThemeVars {
  const mins = date.getHours() * 60 + date.getMinutes()

  // Find which period we're in
  let currentIndex = -1
  for (let i = 0; i < THEMES.length; i++) {
    const t = THEMES[i]
    if (mins >= t.startMin && mins < t.endMin) {
      currentIndex = i
      break
    }
  }

  // Midnight to 5AM (0-300 mins) → use night theme (cool purple, easy on eyes)
  if (currentIndex === -1) {
    return { ...NIGHT_THEME }
  }

  const current = THEMES[currentIndex]
  const periodDuration = current.endMin - current.startMin
  const elapsed = mins - current.startMin
  const progress = elapsed / periodDuration

  // Blend threshold: last 30% of the current period
  const BLEND_START = 0.7
  if (progress < BLEND_START) {
    return { ...current.vars }
  }

  // Calculate blend factor (0 at BLEND_START, 1 at period end)
  const blendT = (progress - BLEND_START) / (1 - BLEND_START)

  // Determine the next theme to blend into
  let nextVars: ThemeVars
  if (currentIndex === THEMES.length - 1) {
    // Night (last theme) → blend into itself (stay night through midnight)
    // This prevents the jarring jump from warm amber to cool green at midnight
    nextVars = current.vars
  } else {
    nextVars = THEMES[currentIndex + 1].vars
  }

  const result = { ...current.vars } as ThemeVars

  // Lerp hex keys
  for (const key of HEX_KEYS) {
    result[key] = lerpHex(
      current.vars[key] as string,
      nextVars[key] as string,
      blendT
    )
  }

  // Non-lerpable rgba keys: use current theme (no blending)
  // '--border-subtle', '--accent-dim', '--accent-glow' remain from current

  return result
}
