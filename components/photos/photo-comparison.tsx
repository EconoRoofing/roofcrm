'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface Photo {
  url: string
  category: string
  created_at: string
}

interface PhotoComparisonProps {
  jobId: string
  photos: Photo[]
}

export function PhotoComparison({ jobId, photos }: PhotoComparisonProps) {
  const beforePhotos = photos.filter((p) => p.category === 'Before')
  const afterPhotos = photos.filter((p) => p.category === 'After')

  const [beforeIdx, setBeforeIdx] = useState(0)
  const [afterIdx, setAfterIdx] = useState(0)
  const [mode, setMode] = useState<'side-by-side' | 'slider'>('side-by-side')
  const [swapped, setSwapped] = useState(false)

  const beforePhoto = beforePhotos[beforeIdx] ?? null
  const afterPhoto = afterPhotos[afterIdx] ?? null

  // Determine display order based on swap state
  const leftPhoto = swapped ? afterPhoto : beforePhoto
  const rightPhoto = swapped ? beforePhoto : afterPhoto
  const leftLabel = swapped ? 'After' : 'Before'
  const rightLabel = swapped ? 'Before' : 'After'
  const leftList = swapped ? afterPhotos : beforePhotos
  const rightList = swapped ? beforePhotos : afterPhotos
  const leftIdx = swapped ? afterIdx : beforeIdx
  const rightIdx = swapped ? beforeIdx : afterIdx
  const setLeftIdx = swapped ? setAfterIdx : setBeforeIdx
  const setRightIdx = swapped ? setBeforeIdx : setAfterIdx

  const hasPhotos = beforePhotos.length > 0 || afterPhotos.length > 0

  if (!hasPhotos) {
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
          No Before or After photos yet
        </div>
        <div
          style={{
            color: 'var(--text-tertiary, #666)',
            fontSize: '12px',
            marginTop: '4px',
          }}
        >
          Take photos categorized as "Before" or "After" to compare
        </div>
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
      {/* Header toolbar */}
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
          Compare Photos
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Mode toggle */}
          <div
            style={{
              display: 'flex',
              borderRadius: '6px',
              border: '1px solid var(--border, #333)',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setMode('side-by-side')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor:
                  mode === 'side-by-side'
                    ? 'var(--accent, #60a5fa)'
                    : 'transparent',
                color:
                  mode === 'side-by-side'
                    ? '#000'
                    : 'var(--text-secondary, #999)',
              }}
            >
              Side by Side
            </button>
            <button
              onClick={() => setMode('slider')}
              disabled={!leftPhoto || !rightPhoto}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderLeft: '1px solid var(--border, #333)',
                cursor:
                  !leftPhoto || !rightPhoto ? 'not-allowed' : 'pointer',
                backgroundColor:
                  mode === 'slider'
                    ? 'var(--accent, #60a5fa)'
                    : 'transparent',
                color:
                  mode === 'slider'
                    ? '#000'
                    : 'var(--text-secondary, #999)',
                opacity: !leftPhoto || !rightPhoto ? 0.4 : 1,
              }}
            >
              Slider
            </button>
          </div>

          {/* Swap button */}
          <button
            onClick={() => setSwapped((s) => !s)}
            title="Swap Before/After sides"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: '1px solid var(--border, #333)',
              backgroundColor: swapped
                ? 'rgba(96,165,250,0.15)'
                : 'transparent',
              color: swapped
                ? 'var(--accent, #60a5fa)'
                : 'var(--text-secondary, #999)',
              cursor: 'pointer',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Comparison area */}
      {mode === 'side-by-side' ? (
        <SideBySide
          leftPhoto={leftPhoto}
          rightPhoto={rightPhoto}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
          leftList={leftList}
          rightList={rightList}
          leftIdx={leftIdx}
          rightIdx={rightIdx}
          setLeftIdx={setLeftIdx}
          setRightIdx={setRightIdx}
        />
      ) : (
        <SliderView
          leftPhoto={leftPhoto}
          rightPhoto={rightPhoto}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Side-by-side view                                                  */
/* ------------------------------------------------------------------ */

function SideBySide({
  leftPhoto,
  rightPhoto,
  leftLabel,
  rightLabel,
  leftList,
  rightList,
  leftIdx,
  rightIdx,
  setLeftIdx,
  setRightIdx,
}: {
  leftPhoto: Photo | null
  rightPhoto: Photo | null
  leftLabel: string
  rightLabel: string
  leftList: Photo[]
  rightList: Photo[]
  leftIdx: number
  rightIdx: number
  setLeftIdx: (i: number) => void
  setRightIdx: (i: number) => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2px',
        backgroundColor: 'var(--border, #333)',
      }}
    >
      <PhotoPanel
        photo={leftPhoto}
        label={leftLabel}
        list={leftList}
        selectedIdx={leftIdx}
        onSelect={setLeftIdx}
      />
      <PhotoPanel
        photo={rightPhoto}
        label={rightLabel}
        list={rightList}
        selectedIdx={rightIdx}
        onSelect={setRightIdx}
      />
    </div>
  )
}

function PhotoPanel({
  photo,
  label,
  list,
  selectedIdx,
  onSelect,
}: {
  photo: Photo | null
  label: string
  list: Photo[]
  selectedIdx: number
  onSelect: (i: number) => void
}) {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface, #1a1a1a)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Label badge */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color:
              label === 'Before'
                ? '#f59e0b'
                : '#22c55e',
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor:
              label === 'Before'
                ? 'rgba(245,158,11,0.12)'
                : 'rgba(34,197,94,0.12)',
          }}
        >
          {label}
        </span>

        {/* Photo selector dropdown */}
        {list.length > 1 && (
          <select
            value={selectedIdx}
            onChange={(e) => onSelect(Number(e.target.value))}
            style={{
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border, #333)',
              backgroundColor: 'var(--bg-card, #222)',
              color: 'var(--text-secondary, #999)',
              cursor: 'pointer',
              maxWidth: '120px',
            }}
          >
            {list.map((p, i) => (
              <option key={i} value={i}>
                Photo {i + 1} — {formatTimestamp(p.created_at)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Photo display */}
      {photo ? (
        <div style={{ position: 'relative' }}>
          <img
            src={photo.url}
            alt={`${label} photo`}
            style={{
              width: '100%',
              aspectRatio: '4 / 3',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <div
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              color: 'var(--text-tertiary, #666)',
            }}
          >
            {formatTimestamp(photo.created_at)}
          </div>
        </div>
      ) : (
        <div
          style={{
            aspectRatio: '4 / 3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '8px',
            backgroundColor: 'var(--bg-card, #222)',
            margin: '0 12px 12px',
            borderRadius: '8px',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-tertiary, #555)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-tertiary, #555)',
              fontWeight: 500,
            }}
          >
            No {label.toLowerCase()} photos
          </span>
        </div>
      )}

      {/* Thumbnail strip */}
      {list.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '0 12px 12px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {list.map((p, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              style={{
                flexShrink: 0,
                width: '48px',
                height: '48px',
                borderRadius: '6px',
                border:
                  i === selectedIdx
                    ? '2px solid var(--accent, #60a5fa)'
                    : '1px solid var(--border, #333)',
                padding: 0,
                cursor: 'pointer',
                overflow: 'hidden',
                opacity: i === selectedIdx ? 1 : 0.6,
                transition: 'opacity 0.15s',
                backgroundColor: 'transparent',
              }}
            >
              <img
                src={p.url}
                alt={`${label} thumbnail ${i + 1}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Slider overlay view                                                */
/* ------------------------------------------------------------------ */

function SliderView({
  leftPhoto,
  rightPhoto,
  leftLabel,
  rightLabel,
}: {
  leftPhoto: Photo | null
  rightPhoto: Photo | null
  leftLabel: string
  rightLabel: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [sliderPos, setSliderPos] = useState(50)
  const isDragging = useRef(false)

  const updatePosition = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = clientX - rect.left
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
      setSliderPos(pct)
    },
    []
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      updatePosition(e.clientX)
    },
    [updatePosition]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      updatePosition(e.clientX)
    },
    [updatePosition]
  )

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  if (!leftPhoto || !rightPhoto) return null

  return (
    <div style={{ padding: '12px' }}>
      {/* Labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: leftLabel === 'Before' ? '#f59e0b' : '#22c55e',
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor:
              leftLabel === 'Before'
                ? 'rgba(245,158,11,0.12)'
                : 'rgba(34,197,94,0.12)',
          }}
        >
          {leftLabel}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: rightLabel === 'Before' ? '#f59e0b' : '#22c55e',
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor:
              rightLabel === 'Before'
                ? 'rgba(245,158,11,0.12)'
                : 'rgba(34,197,94,0.12)',
          }}
        >
          {rightLabel}
        </span>
      </div>

      {/* Slider container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          borderRadius: '8px',
          overflow: 'hidden',
          cursor: 'col-resize',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* Right (bottom) image — full width */}
        <img
          src={rightPhoto.url}
          alt={`${rightLabel} photo`}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />

        {/* Left (top) image — clipped */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
          }}
        >
          <img
            src={leftPhoto.url}
            alt={`${leftLabel} photo`}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>

        {/* Slider line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${sliderPos}%`,
            width: '3px',
            backgroundColor: '#fff',
            transform: 'translateX(-50%)',
            boxShadow: '0 0 8px rgba(0,0,0,0.5)',
            zIndex: 2,
          }}
        />

        {/* Slider handle */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${sliderPos}%`,
            transform: 'translate(-50%, -50%)',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#333"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </div>
      </div>

      {/* Timestamps */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '6px',
          fontSize: '11px',
          color: 'var(--text-tertiary, #666)',
        }}
      >
        <span>{formatTimestamp(leftPhoto.created_at)}</span>
        <span>{formatTimestamp(rightPhoto.created_at)}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', {
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
