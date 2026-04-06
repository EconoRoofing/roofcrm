import { NextRequest, NextResponse } from 'next/server'

interface WeatherResponse {
  temp: number
  description: string
  city: string
  windSpeed: number
  rainProbability: number
}

// In-memory cache: { key -> { data, expiresAt } }
const cache = new Map<string, { data: WeatherResponse; expiresAt: number }>()
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? 'Fresno'
  const apiKey = process.env.OPENWEATHERMAP_API_KEY

  // Return mock data if no API key
  if (!apiKey) {
    return NextResponse.json<WeatherResponse>({
      temp: 78,
      description: 'Clear',
      city,
      windSpeed: 5,
      rainProbability: 0,
    })
  }

  // Check cache
  const cacheKey = city.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},CA,US&appid=${apiKey}&units=imperial`
    const res = await fetch(url, { next: { revalidate: 900 } })

    if (!res.ok) {
      throw new Error(`OpenWeatherMap returned ${res.status}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await res.json()

    const data: WeatherResponse = {
      temp: Math.round(raw.main?.temp ?? 78),
      description: raw.weather?.[0]?.main ?? 'Clear',
      city,
      windSpeed: Math.round(raw.wind?.speed ?? 0),
      // OWM current weather doesn't include rain probability; use rain volume as proxy
      // If rain.1h > 0 treat as 70%, else 0
      rainProbability: raw.rain?.['1h'] > 0 ? 70 : 0,
    }

    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return NextResponse.json(data)
  } catch {
    // Fall back to mock on error
    return NextResponse.json<WeatherResponse>({
      temp: 78,
      description: 'Clear',
      city,
      windSpeed: 5,
      rainProbability: 0,
    })
  }
}
