'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type PhotoCategory = 'Before' | 'During' | 'After' | 'Damage' | 'General'

const PHOTO_CATEGORIES: PhotoCategory[] = ['Before', 'During', 'After', 'Damage', 'General']

interface QuickPhotoProps {
  jobId: string
  userId: string
  onPhotoCaptured?: (url: string, category: PhotoCategory, lat?: number, lng?: number) => void
}

export function QuickPhoto({ jobId, userId, onPhotoCaptured }: QuickPhotoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [category, setCategory] = useState<PhotoCategory>('General')
  const [error, setError] = useState<string | null>(null)
  const [successUrl, setSuccessUrl] = useState<string | null>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)

  // Capture GPS when modal opens
  useEffect(() => {
    if (!isOpen) return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGps(null),
      { timeout: 8000 }
    )
  }, [isOpen])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setIsStreaming(true)
      }
    } catch {
      setError('Camera access denied or unavailable.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setIsStreaming(false)
  }, [])

  const openModal = () => {
    setIsOpen(true)
    setSuccessUrl(null)
    setError(null)
    // Start camera after modal renders
    setTimeout(startCamera, 100)
  }

  const closeModal = () => {
    stopCamera()
    setIsOpen(false)
    setSuccessUrl(null)
    setError(null)
  }

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    setIsUploading(true)
    setError(null)

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Capture failed'))),
          'image/jpeg',
          0.85
        )
      })

      const timestamp = Date.now()
      const path = `job-photos/${jobId}/${category}/${userId}-${timestamp}.jpg`

      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('estimates')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('estimates').getPublicUrl(path)

      // Store metadata in job_photos table if it exists, fallback gracefully
      try {
        await supabase.from('job_photos').insert({
          job_id: jobId,
          user_id: userId,
          url: publicUrl,
          category,
          lat: gps?.lat ?? null,
          lng: gps?.lng ?? null,
          taken_at: new Date().toISOString(),
        })
      } catch {
        // table may not exist yet — non-fatal
      }

      stopCamera()
      setSuccessUrl(publicUrl)
      onPhotoCaptured?.(publicUrl, category, gps?.lat, gps?.lng)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setIsUploading(false)
    } finally {
      setIsUploading(false)
    }
  }, [jobId, userId, category, gps, stopCamera, onPhotoCaptured])

  return (
    <>
      {/* Camera trigger button */}
      <button
        onClick={openModal}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'background-color 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-card)')}
      >
        {/* Camera icon SVG */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        Take Photo
      </button>

      {/* Modal overlay */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            padding: '24px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', maxWidth: '400px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', flex: 1 }}>Job Photo</div>
            <button
              onClick={closeModal}
              style={{
                background: 'none',
                border: 'none',
                color: '#aaa',
                fontSize: '24px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '4px',
              }}
            >
              &times;
            </button>
          </div>

          {/* Category selector */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {PHOTO_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: category === cat ? '2px solid var(--accent, #60a5fa)' : '1px solid #444',
                  backgroundColor: category === cat ? 'rgba(96,165,250,0.15)' : 'transparent',
                  color: category === cat ? 'var(--accent, #60a5fa)' : '#aaa',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Viewfinder */}
          {successUrl ? (
            <div style={{ textAlign: 'center' }}>
              <img
                src={successUrl}
                alt="Captured"
                style={{ maxWidth: '320px', maxHeight: '240px', borderRadius: '8px', objectFit: 'cover' }}
              />
              <div style={{ color: '#22c55e', fontSize: '14px', fontWeight: 600, marginTop: '12px' }}>
                Photo saved as {category}
                {gps && <span style={{ color: '#888', fontWeight: 400 }}> — GPS captured</span>}
              </div>
              <button
                onClick={closeModal}
                style={{
                  marginTop: '16px',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'var(--accent, #60a5fa)',
                  color: '#000',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <div
              style={{
                width: '320px',
                height: '240px',
                borderRadius: '12px',
                border: '2px solid var(--accent, #60a5fa)',
                overflow: 'hidden',
                backgroundColor: '#111',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              {!isStreaming && !error && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '13px' }}>
                  Starting camera...
                </div>
              )}
              {error && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: '13px', padding: '16px', textAlign: 'center' }}>
                  {error}
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: isStreaming ? 'block' : 'none',
                }}
              />
            </div>
          )}

          {/* Hidden canvas */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* GPS indicator */}
          {gps && !successUrl && (
            <div style={{ fontSize: '11px', color: '#666' }}>
              GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
            </div>
          )}

          {/* Capture button */}
          {!successUrl && (
            <button
              onClick={handleCapture}
              disabled={!isStreaming || isUploading}
              style={{
                width: '200px',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: isStreaming && !isUploading ? 'var(--accent, #60a5fa)' : '#333',
                color: isStreaming && !isUploading ? '#000' : '#555',
                fontSize: '15px',
                fontWeight: 800,
                cursor: isStreaming && !isUploading ? 'pointer' : 'not-allowed',
                transition: 'opacity 0.15s',
                opacity: isUploading ? 0.6 : 1,
              }}
            >
              {isUploading ? 'Saving...' : 'Capture'}
            </button>
          )}
        </div>
      )}
    </>
  )
}
