'use client'

import dynamic from 'next/dynamic'

type ActiveEntry = {
  id: string
  clock_in: string
  clock_in_lat?: number | null
  clock_in_lng?: number | null
  flagged?: boolean
  job?: { job_number: string; customer_name: string; address: string; city: string } | null
  user?: { id: string; name: string; email: string } | null
}

// Must use dynamic import with ssr: false — Leaflet accesses window on load
const CrewMapInner = dynamic(() => import('./crew-map-inner'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-elevated)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-sans)',
        fontSize: '13px',
        color: 'var(--text-muted)',
      }}
    >
      Loading map...
    </div>
  ),
})

interface CrewMapProps {
  entries: ActiveEntry[]
}

export default function CrewMap({ entries }: CrewMapProps) {
  return (
    <div
      style={{
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <CrewMapInner entries={entries} />
    </div>
  )
}
