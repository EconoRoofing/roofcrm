'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PhotoComparison } from './photo-comparison'

type PhotoCategory = 'Before' | 'During' | 'After' | 'Damage' | 'General'

const ALL_CATEGORIES: PhotoCategory[] = ['Before', 'During', 'After', 'Damage', 'General']

const CATEGORY_COLORS: Record<PhotoCategory, string> = {
  Before: '#f59e0b',
  During: '#3b82f6',
  After: '#22c55e',
  Damage: '#ef4444',
  General: '#8b5cf6',
}

interface JobPhoto {
  id: string
  job_id: string
  user_id: string
  storage_path: string
  category: PhotoCategory
  latitude: number | null
  longitude: number | null
  notes: string | null
  created_at: string
}

interface PhotoGalleryProps {
  jobId: string
}

export function PhotoGallery({ jobId }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<JobPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'All' | PhotoCategory>('All')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showComparison, setShowComparison] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)

  // Audit R5-#2: was a sync `getPublicUrl` helper that returned
  // `.../object/public/estimates/...` URLs. The estimates bucket is
  // now private (migration 039) so those URLs 400. Photos load as a
  // single DB fetch, then a single batch `createSignedUrls` round-trip
  // to Supabase Storage populates this path→signedUrl map. Consumers
  // read from the map via `getSignedUrl(path)` which is sync (falls
  // back to empty string for unsigned paths — the RealPhoto/VideoCard
  // components already handle broken image sources gracefully).
  const [signedUrlMap, setSignedUrlMap] = useState<Map<string, string>>(new Map())

  const supabase = createClient()

  // Fetch photos AND their signed URLs in one effect
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (error) {
        console.warn('[photo-gallery] fetch failed:', error.message)
        setPhotos([])
        setSignedUrlMap(new Map())
        setLoading(false)
        return
      }

      const rows = (data ?? []) as JobPhoto[]
      setPhotos(rows)

      // Batch-sign every storage_path in one round-trip. 1-hour TTL is
      // enough for a gallery session; subsequent mounts re-sign. Keeps
      // URLs from lingering in browser history / referer headers.
      if (rows.length > 0) {
        const paths = rows.map((p) => p.storage_path)
        const ONE_HOUR = 60 * 60
        const { data: signedBatch } = await supabase.storage
          .from('estimates')
          .createSignedUrls(paths, ONE_HOUR)

        if (cancelled) return
        const map = new Map<string, string>()
        if (signedBatch) {
          for (const entry of signedBatch) {
            if (entry.signedUrl && entry.path) {
              map.set(entry.path, entry.signedUrl)
            }
          }
        }
        setSignedUrlMap(map)
      } else {
        setSignedUrlMap(new Map())
      }

      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered photos
  const filtered = activeFilter === 'All'
    ? photos
    : photos.filter((p) => p.category === activeFilter)

  // Category counts
  const counts: Record<string, number> = { All: photos.length }
  for (const cat of ALL_CATEGORIES) {
    counts[cat] = photos.filter((p) => p.category === cat).length
  }

  // Sync accessor into the signed-URL map. Returns '' for missing
  // entries — the downstream img tags have an onError handler that
  // shows a placeholder when the src fails to load.
  const getSignedUrl = useCallback(
    (storagePath: string): string => signedUrlMap.get(storagePath) ?? '',
    [signedUrlMap]
  )

  // Before/After comparison data
  const hasBeforeAndAfter = counts['Before'] > 0 && counts['After'] > 0
  const comparisonPhotos = photos
    .filter((p) => p.category === 'Before' || p.category === 'After')
    .map((p) => ({
      url: getSignedUrl(p.storage_path),
      category: p.category,
      created_at: p.created_at,
    }))

  // Lightbox navigation
  const openLightbox = (index: number) => setLightboxIndex(index)
  const closeLightbox = () => setLightboxIndex(null)

  const goLightboxPrev = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + filtered.length) % filtered.length : null
    )
  }, [filtered.length])

  const goLightboxNext = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev + 1) % filtered.length : null
    )
  }, [filtered.length])

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goLightboxPrev()
      else if (e.key === 'ArrowRight') goLightboxNext()
      else if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIndex, goLightboxPrev, goLightboxNext])

  // Generate report handler
  const handleGenerateReport = useCallback(async () => {
    setGeneratingReport(true)
    try {
      const { generatePhotoReport } = await import('@/lib/actions/photo-reports')
      const result = await generatePhotoReport(jobId)
      const blob = new Blob([result.html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      // Clean up blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (err) {
      console.error('[photo-gallery] report generation failed:', err)
    } finally {
      setGeneratingReport(false)
    }
  }, [jobId])

  // Loading state
  if (loading) {
    return (
      <div
        style={{
          padding: '40px 24px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-surface, #1a1a1a)',
          borderRadius: '12px',
          border: '1px solid var(--border, #333)',
        }}
      >
        <div style={{ color: 'var(--text-tertiary, #666)', fontSize: '14px' }}>
          Loading photos...
        </div>
      </div>
    )
  }

  // Empty state
  if (photos.length === 0) {
    return (
      <div
        style={{
          padding: '40px 24px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-surface, #1a1a1a)',
          borderRadius: '12px',
          border: '1px solid var(--border, #333)',
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-tertiary, #666)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginBottom: '12px' }}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <div
          style={{
            color: 'var(--text-secondary, #999)',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          No photos yet
        </div>
        <div
          style={{
            color: 'var(--text-tertiary, #666)',
            fontSize: '12px',
            marginTop: '4px',
          }}
        >
          Use the camera to capture job photos.
        </div>
      </div>
    )
  }

  // Comparison view
  if (showComparison) {
    return (
      <div>
        <button
          onClick={() => setShowComparison(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border, #333)',
            backgroundColor: 'var(--bg-card, #222)',
            color: 'var(--text-secondary, #999)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '12px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Gallery
        </button>
        <PhotoComparison jobId={jobId} photos={comparisonPhotos} />
      </div>
    )
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface, #1a1a1a)',
        borderRadius: '12px',
        border: '1px solid var(--border, #333)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border, #333)',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--text-primary, #fff)',
          }}
        >
          Photos ({photos.length})
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Compare button */}
          {hasBeforeAndAfter && (
            <button
              onClick={() => setShowComparison(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border, #333)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary, #999)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
              Compare Before/After
            </button>
          )}

          {/* Report button */}
          <button
            onClick={handleGenerateReport}
            disabled={generatingReport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border, #333)',
              backgroundColor: 'transparent',
              color: generatingReport ? 'var(--text-tertiary, #555)' : 'var(--text-secondary, #999)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: generatingReport ? 'not-allowed' : 'pointer',
              opacity: generatingReport ? 0.6 : 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            {generatingReport ? 'Generating...' : 'Photo Report'}
          </button>
        </div>
      </div>

      {/* Category filter tabs */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          padding: '12px 16px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          borderBottom: '1px solid var(--border, #333)',
        }}
      >
        {(['All', ...ALL_CATEGORIES] as const).map((cat) => {
          const isActive = activeFilter === cat
          const count = counts[cat] ?? 0
          const color = cat === 'All' ? 'var(--accent, #60a5fa)' : CATEGORY_COLORS[cat]

          return (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                border: isActive ? `2px solid ${color}` : '1px solid var(--border, #333)',
                backgroundColor: isActive ? `${color}15` : 'transparent',
                color: isActive ? color : 'var(--text-tertiary, #666)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {cat} ({count})
            </button>
          )
        })}
      </div>

      {/* Photo grid */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: '32px 24px',
            textAlign: 'center',
            color: 'var(--text-tertiary, #666)',
            fontSize: '13px',
          }}
        >
          No {activeFilter.toLowerCase()} photos
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '8px',
            padding: '12px',
          }}
        >
          {filtered.map((photo, idx) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              publicUrl={getSignedUrl(photo.storage_path)}
              onClick={() => openLightbox(idx)}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && filtered[lightboxIndex] && (
        <Lightbox
          photo={filtered[lightboxIndex]}
          publicUrl={getSignedUrl(filtered[lightboxIndex].storage_path)}
          currentIndex={lightboxIndex}
          total={filtered.length}
          onClose={closeLightbox}
          onPrev={goLightboxPrev}
          onNext={goLightboxNext}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Photo Card                                                         */
/* ------------------------------------------------------------------ */

function PhotoCard({
  photo,
  publicUrl,
  onClick,
}: {
  photo: JobPhoto
  publicUrl: string
  onClick: () => void
}) {
  const color = CATEGORY_COLORS[photo.category] ?? '#888'

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border, #333)',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-card, #222)',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'left',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent, #60a5fa)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border, #333)')}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative' }}>
        <img
          src={publicUrl}
          alt={`${photo.category} photo`}
          loading="lazy"
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            objectFit: 'cover',
            display: 'block',
          }}
        />
        {/* GPS indicator */}
        {photo.latitude != null && photo.longitude != null && (
          <div
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={`${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        {/* Category badge */}
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: color,
            backgroundColor: `${color}18`,
            padding: '2px 8px',
            borderRadius: '4px',
          }}
        >
          {photo.category}
        </span>

        {/* Relative time */}
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-tertiary, #666)',
          }}
        >
          {relativeTime(photo.created_at)}
        </span>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Lightbox                                                           */
/* ------------------------------------------------------------------ */

function Lightbox({
  photo,
  publicUrl,
  currentIndex,
  total,
  onClose,
  onPrev,
  onNext,
}: {
  photo: JobPhoto
  publicUrl: string
  currentIndex: number
  total: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const color = CATEGORY_COLORS[photo.category] ?? '#888'

  // Touch swipe support
  const touchStartX = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(diff) > 50) {
      if (diff > 0) onPrev()
      else onNext()
    }
    touchStartX.current = null
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0,0,0,0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          zIndex: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Category badge */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: color,
              backgroundColor: `${color}18`,
              padding: '3px 10px',
              borderRadius: '4px',
            }}
          >
            {photo.category}
          </span>
          <span style={{ fontSize: '12px', color: '#888' }}>
            {currentIndex + 1} / {total}
          </span>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#aaa',
            fontSize: '28px',
            cursor: 'pointer',
            lineHeight: 1,
            padding: '4px 8px',
          }}
        >
          &times;
        </button>
      </div>

      {/* Navigation arrows */}
      {total > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onPrev() }}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onNext() }}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        </>
      )}

      {/* Full-size image */}
      <img
        src={publicUrl}
        alt={`${photo.category} photo`}
        style={{
          maxWidth: '90vw',
          maxHeight: '75vh',
          objectFit: 'contain',
          borderRadius: '8px',
        }}
      />

      {/* Info bar */}
      <div
        style={{
          marginTop: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '12px', color: '#888' }}>
          {formatTimestamp(photo.created_at)}
        </span>
        {photo.latitude != null && photo.longitude != null && (
          <span style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
          </span>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string): string {
  try {
    const now = Date.now()
    const then = new Date(iso).getTime()
    const diffSec = Math.floor((now - then) / 1000)

    if (diffSec < 60) return 'just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`

    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
