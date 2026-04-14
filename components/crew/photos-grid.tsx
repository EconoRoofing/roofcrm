'use client'

import { useState, useEffect } from 'react'
import type { Job } from '@/lib/types/database'
import { getProjectDeepLink } from '@/lib/companycam'
import type { CompanyCamPhoto } from '@/lib/companycam'
import { CameraIcon, ExternalLinkIcon } from '@/components/icons'
import { formatPhotoDate } from '@/lib/utils'

// ─── Module-level photo cache ─────────────────────────────────────────────────
// Two layers:
//   1. inFlight:  Promise dedup — concurrent components requesting the same
//                 projectId share ONE network call instead of N.
//   2. resolved:  Result cache — TTL'd so the next mount within 60s renders
//                 instantly without a fetch (Mario opening Photos tab,
//                 navigating away, coming back).
//
// Lives for the tab session. CompanyCam project photos rarely change between
// page mounts, so 60s is conservative. Set to 0 to disable caching entirely.

const inFlight = new Map<string, Promise<CompanyCamPhoto[]>>()
const resolved = new Map<string, { data: CompanyCamPhoto[]; expiresAt: number }>()
const PHOTO_CACHE_TTL_MS = 60 * 1000

function fetchProjectPhotos(projectId: string): Promise<CompanyCamPhoto[]> {
  // Cache hit (still fresh)
  const cached = resolved.get(projectId)
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data)
  }

  // In-flight dedup — every concurrent caller awaits the same Promise
  const existing = inFlight.get(projectId)
  if (existing) return existing

  const promise = fetch(`/api/companycam/photos?projectId=${encodeURIComponent(projectId)}`)
    .then((r) => r.json())
    .then((data: CompanyCamPhoto[]) => {
      const arr = Array.isArray(data) ? data : []
      resolved.set(projectId, { data: arr, expiresAt: Date.now() + PHOTO_CACHE_TTL_MS })
      return arr
    })
    .catch(() => {
      // Cache empty result briefly so we don't hammer a failing endpoint
      const empty: CompanyCamPhoto[] = []
      resolved.set(projectId, { data: empty, expiresAt: Date.now() + 5000 })
      return empty
    })
    .finally(() => {
      inFlight.delete(projectId)
    })

  inFlight.set(projectId, promise)
  return promise
}

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

interface PhotosGridProps {
  jobs: JobWithCompany[]
}

// Subtle dark gradient variations for placeholder photo cards
const PHOTO_GRADIENTS = [
  'linear-gradient(135deg, #151921, #1e2430)',
  'linear-gradient(135deg, #1a1f2e, #141820)',
  'linear-gradient(135deg, #0e1117, #1a2035)',
  'linear-gradient(135deg, #181f2a, #111520)',
  'linear-gradient(135deg, #0f1520, #1c2232)',
  'linear-gradient(135deg, #141c28, #0d1219)',
]

function PlaceholderPhoto({ index }: { index: number }) {
  const gradient = PHOTO_GRADIENTS[index % PHOTO_GRADIENTS.length]
  return (
    <div
      style={{
        aspectRatio: '1 / 1',
        background: gradient,
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
      }}
    >
      <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
        <CameraIcon />
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          fontWeight: 500,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.5,
        }}
      >
        Photo
      </span>
    </div>
  )
}


function RealPhoto({ photo }: { photo: CompanyCamPhoto }) {
  const dateLabel = formatPhotoDate(photo.created_at)
  const thumbUrl = photo.urls?.thumbnail ?? photo.urls?.original ?? ''

  return (
    <div
      style={{
        aspectRatio: '1 / 1',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#0e1117',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl}
        alt="Job photo"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
        loading="lazy"
      />
      {dateLabel && (
        <span
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '8px',
            fontWeight: 700,
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.6)',
            borderRadius: '4px',
            padding: '2px 4px',
            letterSpacing: '0.04em',
          }}
        >
          {dateLabel}
        </span>
      )}
    </div>
  )
}

function JobPhotoSection({ job }: { job: JobWithCompany }) {
  const [photos, setPhotos] = useState<CompanyCamPhoto[] | null>(null)
  const [loading, setLoading] = useState(true)

  const projectId = job.companycam_project_id!
  const deepLink = getProjectDeepLink(projectId)

  useEffect(() => {
    let cancelled = false

    fetchProjectPhotos(projectId)
      .then((data) => {
        if (!cancelled) {
          setPhotos(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhotos([])
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  const hasPhotos = photos && photos.length > 0
  const displayPhotos = photos?.slice(0, 6) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Job label */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
        }}
      >
        {job.customer_name} &middot; {job.address}
      </span>

      {/* 3-column photo grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
        }}
      >
        {loading ? (
          Array.from({ length: 6 }, (_, i) => <PlaceholderPhoto key={i} index={i} />)
        ) : hasPhotos ? (
          <>
            {displayPhotos.map((photo) => (
              <RealPhoto key={photo.id} photo={photo} />
            ))}
            {/* Fill remaining slots with placeholders if fewer than 6 */}
            {displayPhotos.length < 6 &&
              Array.from({ length: 6 - displayPhotos.length }, (_, i) => (
                <PlaceholderPhoto key={`pad-${i}`} index={displayPhotos.length + i} />
              ))}
          </>
        ) : (
          // No photos or API not configured — show placeholder grid with message
          <>
            {Array.from({ length: 6 }, (_, i) => (
              <PlaceholderPhoto key={i} index={i} />
            ))}
          </>
        )}
      </div>

      {/* Status message when no photos */}
      {!loading && !hasPhotos && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            textAlign: 'center',
          }}
        >
          {photos === null ? 'CompanyCam not connected' : 'No photos yet'}
        </span>
      )}

      {/* Open in CompanyCam */}
      <a
        href={deepLink}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          background: 'linear-gradient(135deg, #2962ff, #448aff)',
          borderRadius: '8px',
          padding: '11px 16px',
          textDecoration: 'none',
          color: '#ffffff',
        }}
      >
        <ExternalLinkIcon />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Open in CompanyCam
        </span>
      </a>
    </div>
  )
}

export function PhotosGrid({ jobs }: PhotosGridProps) {
  const jobsWithCam = jobs.filter((j) => j.companycam_project_id)

  if (jobsWithCam.length === 0) {
    return (
      <div
        style={{
          padding: '64px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>
          <CameraIcon />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            textAlign: 'center',
          }}
        >
          No CompanyCam projects linked
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '0 16px' }}>
      {jobsWithCam.map((job) => (
        <JobPhotoSection key={job.id} job={job} />
      ))}
    </div>
  )
}
