'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface PhotoCaptureProps {
  onCapture: (url: string) => void
  onSkip: () => void
  userId: string
}

export function PhotoCapture({ onCapture, onSkip, userId }: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Start camera on mount
  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          setIsStreaming(true)
        }
      } catch {
        if (!cancelled) {
          setError('Camera access denied. You can skip and continue.')
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

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
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to capture image'))),
          'image/jpeg',
          0.85
        )
      })

      const timestamp = Date.now()
      const path = `clock-photos/${userId}/${timestamp}.jpg`

      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('clock-photos')
        .upload(path, blob, { contentType: 'image/jpeg' })

      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from('clock-photos').getPublicUrl(path)

      // Stop camera
      streamRef.current?.getTracks().forEach((t) => t.stop())

      onCapture(publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Try again or skip.')
      setIsUploading(false)
    }
  }, [userId, onCapture])

  const handleSkip = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    onSkip()
  }, [onSkip])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '24px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          textAlign: 'center',
        }}
      >
        Clock-In Photo
      </div>

      {/* Circular viewfinder */}
      <div
        style={{
          width: '280px',
          height: '280px',
          borderRadius: '50%',
          border: '3px solid var(--accent)',
          overflow: 'hidden',
          flexShrink: 0,
          backgroundColor: 'var(--bg-elevated)',
          position: 'relative',
        }}
      >
        {!isStreaming && !error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
            }}
          >
            Starting camera...
          </div>
        )}
        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-red)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              textAlign: 'center',
              padding: '16px',
            }}
          >
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
            transform: 'scaleX(-1)', // mirror effect
          }}
        />
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Take Photo button */}
      <button
        type="button"
        onClick={handleCapture}
        disabled={!isStreaming || isUploading}
        style={{
          width: '220px',
          padding: '16px',
          background:
            isStreaming && !isUploading
              ? 'linear-gradient(135deg, #00c853, #00e676)'
              : 'var(--bg-elevated)',
          border: 'none',
          borderRadius: '12px',
          fontFamily: 'var(--font-sans)',
          fontSize: '16px',
          fontWeight: 800,
          color: isStreaming && !isUploading ? '#003d00' : 'var(--text-muted)',
          cursor: isStreaming && !isUploading ? 'pointer' : 'not-allowed',
          transition: 'opacity 0.15s',
          opacity: isUploading ? 0.6 : 1,
        }}
      >
        {isUploading ? 'Uploading...' : 'Take Photo'}
      </button>

      {/* Skip link */}
      <button
        type="button"
        onClick={handleSkip}
        disabled={isUploading}
        style={{
          background: 'none',
          border: 'none',
          padding: '4px 8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          color: 'var(--text-muted)',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
        }}
      >
        Skip
      </button>
    </div>
  )
}
