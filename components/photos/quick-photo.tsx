'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type PhotoCategory, PHOTO_CATEGORIES } from '@/lib/types/photos'

type CaptureMode = 'photo' | 'video'
const MAX_VIDEO_DURATION = 60 // seconds
const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50 MB

interface QuickPhotoProps {
  jobId: string
  userId: string
  onPhotoCaptured?: (url: string, category: PhotoCategory, lat?: number, lng?: number) => void
  onVideoCaptured?: (url: string, category: PhotoCategory, lat?: number, lng?: number) => void
}

export function QuickPhoto({ jobId, userId, onPhotoCaptured, onVideoCaptured }: QuickPhotoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [category, setCategory] = useState<PhotoCategory>('General')
  const [error, setError] = useState<string | null>(null)
  const [successUrl, setSuccessUrl] = useState<string | null>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [mode, setMode] = useState<CaptureMode>('photo')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null)

  // Stop camera stream and clean up on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const startCamera = useCallback(async (withAudio = false) => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: withAudio,
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

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRecording(false)
  }, [])

  const startRecording = useCallback(() => {
    if (!streamRef.current) return
    setError(null)
    chunksRef.current = []

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'

    const recorder = new MediaRecorder(streamRef.current, { mimeType })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      if (blob.size > MAX_VIDEO_SIZE) {
        setError(`Video exceeds ${MAX_VIDEO_SIZE / 1024 / 1024} MB limit. Record a shorter clip.`)
        return
      }
      const url = URL.createObjectURL(blob)
      setVideoBlob(blob)
      setVideoPreviewUrl(url)
      stopCamera()
    }

    mediaRecorderRef.current = recorder
    recorder.start(1000) // collect data every second
    setIsRecording(true)
    setRecordingSeconds(0)

    timerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => {
        if (prev + 1 >= MAX_VIDEO_DURATION) {
          stopRecording()
          return prev + 1
        }
        return prev + 1
      })
    }, 1000)
  }, [stopCamera, stopRecording])

  const handleUploadVideo = useCallback(async () => {
    if (!videoBlob) return
    setIsUploading(true)
    setError(null)

    try {
      const timestamp = Date.now()
      const path = `job-videos/${jobId}/${category}/${userId}-${timestamp}.webm`

      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('estimates')
        .upload(path, videoBlob, { contentType: 'video/webm', upsert: false })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('estimates').getPublicUrl(path)

      // Store metadata — mark as video via notes column
      const { error: metaError } = await supabase.from('job_photos').insert({
        job_id: jobId,
        user_id: userId,
        storage_path: path,
        category,
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
        notes: 'video',
      })
      if (metaError) console.warn('[quick-photo] video metadata insert failed:', metaError.message)

      setSuccessUrl(publicUrl)
      onVideoCaptured?.(publicUrl, category, gps?.lat, gps?.lng)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video upload failed')
    } finally {
      setIsUploading(false)
    }
  }, [videoBlob, jobId, userId, category, gps, onVideoCaptured])

  const resetVideoState = useCallback(() => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    setVideoBlob(null)
    setVideoPreviewUrl(null)
    setRecordingSeconds(0)
  }, [videoPreviewUrl])

  const openModal = () => {
    setIsOpen(true)
    setSuccessUrl(null)
    setError(null)
    setMode('photo')
    resetVideoState()
    // Start camera after modal renders
    setTimeout(() => startCamera(false), 100)
  }

  const closeModal = () => {
    if (isRecording) stopRecording()
    stopCamera()
    resetVideoState()
    setIsOpen(false)
    setSuccessUrl(null)
    setError(null)
  }

  const handleModeSwitch = (newMode: CaptureMode) => {
    if (newMode === mode) return
    if (isRecording) stopRecording()
    resetVideoState()
    stopCamera()
    setMode(newMode)
    setTimeout(() => startCamera(newMode === 'video'), 100)
  }

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current

    // Scale down to max 2048px on longest side to prevent massive cellular uploads
    const MAX_DIM = 2048
    let w = video.videoWidth
    let h = video.videoHeight
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h)
      w = Math.round(w * ratio)
      h = Math.round(h * ratio)
    }
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)

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

      if (blob.size > 10 * 1024 * 1024) {
        setError('Photo exceeds 10 MB limit. Try moving closer or reducing resolution.')
        return
      }

      const timestamp = Date.now()
      const path = `job-photos/${jobId}/${category}/${userId}-${timestamp}.jpg`

      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('estimates')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('estimates').getPublicUrl(path)

      // Store photo metadata for querying by category/GPS
      const { error: metaError } = await supabase.from('job_photos').insert({
        job_id: jobId,
        user_id: userId,
        storage_path: path,
        category,
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
      })
      if (metaError) console.warn('[quick-photo] metadata insert failed:', metaError.message)

      stopCamera()
      setSuccessUrl(publicUrl)
      onPhotoCaptured?.(publicUrl, category, gps?.lat, gps?.lng)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
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
        Photo / Video
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
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', flex: 1 }}>Job Capture</div>
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

          {/* Mode toggle */}
          <div style={{ display: 'flex', borderRadius: '20px', border: '1px solid #444', overflow: 'hidden' }}>
            {(['photo', 'video'] as CaptureMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeSwitch(m)}
                disabled={isRecording || isUploading}
                style={{
                  padding: '6px 20px',
                  border: 'none',
                  backgroundColor: mode === m ? (m === 'video' ? 'rgba(239,68,68,0.2)' : 'rgba(96,165,250,0.15)') : 'transparent',
                  color: mode === m ? (m === 'video' ? '#ef4444' : 'var(--accent, #60a5fa)') : '#888',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isRecording || isUploading ? 'not-allowed' : 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {m}
              </button>
            ))}
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
              {mode === 'video' ? (
                <video
                  src={successUrl}
                  controls
                  style={{ maxWidth: '320px', maxHeight: '240px', borderRadius: '8px' }}
                />
              ) : (
                <img
                  src={successUrl}
                  alt="Captured"
                  style={{ maxWidth: '320px', maxHeight: '240px', borderRadius: '8px', objectFit: 'cover' }}
                />
              )}
              <div style={{ color: '#22c55e', fontSize: '14px', fontWeight: 600, marginTop: '12px' }}>
                {mode === 'video' ? 'Video' : 'Photo'} saved as {category}
                {gps && <span style={{ color: '#888', fontWeight: 400 }}> -- GPS captured</span>}
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
          ) : videoPreviewUrl ? (
            <div style={{ textAlign: 'center' }}>
              <video
                src={videoPreviewUrl}
                controls
                style={{ maxWidth: '320px', maxHeight: '240px', borderRadius: '8px' }}
              />
              <div style={{ color: '#aaa', fontSize: '13px', marginTop: '8px' }}>
                {recordingSeconds}s recorded
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '12px' }}>
                <button
                  onClick={() => {
                    resetVideoState()
                    setTimeout(() => startCamera(true), 100)
                  }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: '1px solid #444',
                    backgroundColor: 'transparent',
                    color: '#aaa',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Retake
                </button>
                <button
                  onClick={handleUploadVideo}
                  disabled={isUploading}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: isUploading ? '#333' : '#22c55e',
                    color: isUploading ? '#555' : '#000',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    opacity: isUploading ? 0.6 : 1,
                  }}
                >
                  {isUploading ? 'Uploading...' : 'Save Video'}
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                width: '320px',
                height: '240px',
                borderRadius: '12px',
                border: `2px solid ${isRecording ? '#ef4444' : 'var(--accent, #60a5fa)'}`,
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

          {/* GPS indicator + recording timer */}
          {!successUrl && !videoPreviewUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '11px', color: gps ? '#666' : '#888' }}>
                {gps
                  ? `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
                  : 'Acquiring GPS...'}
              </div>
              {isRecording && (
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                  {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
                </div>
              )}
            </div>
          )}

          {/* Capture / Record button */}
          {!successUrl && !videoPreviewUrl && (
            mode === 'photo' ? (
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
            ) : (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!isStreaming}
                style={{
                  width: '200px',
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: !isStreaming ? '#333' : isRecording ? '#dc2626' : '#ef4444',
                  color: !isStreaming ? '#555' : '#fff',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: isStreaming ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.15s',
                }}
              >
                {isRecording ? 'Stop Recording' : 'Record'}
              </button>
            )
          )}
        </div>
      )}
    </>
  )
}
