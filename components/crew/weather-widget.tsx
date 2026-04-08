'use client'

import { useEffect, useState } from 'react'

interface WeatherData {
  temp: number
  description: string
  city: string
  windSpeed: number
  rainProbability: number
}

interface WeatherWidgetProps {
  city: string
}

export function WeatherWidget({ city }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setWeather(null)
    setError(false)
    fetch(`/api/weather?city=${encodeURIComponent(city)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d: WeatherData) => setWeather(d))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(true)
      })
    return () => controller.abort()
  }, [city])

  if (error) {
    return (
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          minWidth: '140px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          Weather unavailable
        </span>
      </div>
    )
  }

  if (!weather) {
    return (
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          minWidth: '140px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          Loading...
        </span>
      </div>
    )
  }

  const highWind = weather.windSpeed > 25
  const rainLikely = weather.rainProbability > 50

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'baseline',
          gap: '6px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          {weather.temp}°
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {weather.city} · {weather.description}
        </span>
      </div>

      {highWind && (
        <div
          style={{
            backgroundColor: 'var(--accent-red-dim)',
            border: '1px solid var(--accent-red)',
            borderRadius: '8px',
            padding: '6px 10px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--accent-red)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            High winds ({weather.windSpeed}mph) — use caution
          </span>
        </div>
      )}

      {rainLikely && !highWind && (
        <div
          style={{
            backgroundColor: 'var(--accent-red-dim)',
            border: '1px solid var(--accent-red)',
            borderRadius: '8px',
            padding: '6px 10px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--accent-red)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Rain likely — jobs may be affected
          </span>
        </div>
      )}
    </div>
  )
}
