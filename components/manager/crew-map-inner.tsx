'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatElapsed } from '@/lib/utils'

type ActiveEntry = {
  id: string
  clock_in: string
  clock_in_lat?: number | null
  clock_in_lng?: number | null
  flagged?: boolean
  job?: { job_number: string; customer_name: string; address: string; city: string } | null
  user?: { id: string; name: string; email: string } | null
}

// Fix Leaflet default icon issue with webpack
function fixLeafletIcons() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  })
}

function createMarkerIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  })
}

function getMarkerColor(entry: ActiveEntry): string {
  if (entry.flagged) return '#ff5252'
  // Cycle through distinct colors for different crew members
  const colors = ['#00e676', '#ffab00', '#7c4dff', '#00b0ff', '#ff6d00', '#f06292']
  const idx = entry.id.charCodeAt(0) % colors.length
  return colors[idx]
}

interface CrewMapInnerProps {
  entries: ActiveEntry[]
}

// Fresno, CA default center
const DEFAULT_CENTER: [number, number] = [36.7378, -119.7871]
const DEFAULT_ZOOM = 11

export default function CrewMapInner({ entries }: CrewMapInnerProps) {
  useEffect(() => {
    fixLeafletIcons()
  }, [])

  // Compute center: average of all GPS coords with valid data, else Fresno
  const geoEntries = entries.filter(
    (e) => e.clock_in_lat != null && e.clock_in_lng != null
  )

  let center: [number, number] = DEFAULT_CENTER
  if (geoEntries.length > 0) {
    const avgLat =
      geoEntries.reduce((sum, e) => sum + Number(e.clock_in_lat), 0) / geoEntries.length
    const avgLng =
      geoEntries.reduce((sum, e) => sum + Number(e.clock_in_lng), 0) / geoEntries.length
    center = [avgLat, avgLng]
  }

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      style={{ height: '400px', width: '100%', borderRadius: '12px' }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />

      {geoEntries.map((entry) => {
        const lat = Number(entry.clock_in_lat)
        const lng = Number(entry.clock_in_lng)
        const color = getMarkerColor(entry)
        const elapsed = formatElapsed(Date.now() - new Date(entry.clock_in).getTime())
        const name = entry.user?.name ?? 'Unknown'
        const jobLabel = entry.job
          ? `#${entry.job.job_number} — ${entry.job.customer_name}`
          : 'No job'
        const address = entry.job
          ? `${entry.job.address}, ${entry.job.city}`
          : ''

        return (
          <Marker
            key={entry.id}
            position={[lat, lng]}
            icon={createMarkerIcon(color)}
          >
            <Popup>
              <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', lineHeight: 1.5, minWidth: '160px' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>{name}</div>
                <div style={{ color: '#666', marginBottom: '2px' }}>{jobLabel}</div>
                {address && <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>{address}</div>}
                <div style={{ fontWeight: 600, color: '#1a73e8' }}>{elapsed} elapsed</div>
                {entry.flagged && (
                  <div style={{ color: '#d32f2f', fontSize: '11px', marginTop: '4px' }}>Flagged</div>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
