'use client'

import { useRef, useEffect, useCallback } from 'react'
import SignatureCanvas from 'react-signature-canvas'

interface SignaturePadProps {
  onSave: (dataUrl: string) => void
  onClear?: () => void
  label: string
}

const CANVAS_HEIGHT = 200

export function SignaturePad({ onSave, onClear, label }: SignaturePadProps) {
  const canvasRef = useRef<SignatureCanvas>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Track the last applied logical width so we don't re-init on no-op resizes
  // (iOS Safari fires window 'resize' events on EVERY toolbar show/hide,
  // which would otherwise wipe the customer's signature mid-stroke).
  const lastWidthRef = useRef<number>(0)

  /**
   * Resize the underlying <canvas>:
   *   - Only if logical width actually changed
   *   - Use devicePixelRatio so the line is crisp on Retina/iPhone
   *   - Preserve existing strokes by snapshotting → resizing → restoring
   *
   * The DPR trick: the backing store is `width * dpr` pixels but the CSS
   * size stays at `width` × `CANVAS_HEIGHT` logical pixels. Then we
   * `ctx.scale(dpr, dpr)` so subsequent draws use the logical coordinate
   * system and look identical regardless of pixel density.
   */
  const setCanvasSize = useCallback(() => {
    if (!containerRef.current || !canvasRef.current) return
    const canvas = canvasRef.current.getCanvas()
    const width = containerRef.current.clientWidth

    // Skip if nothing actually changed (iOS toolbar show/hide → spurious resize)
    if (width === lastWidthRef.current) return
    lastWidthRef.current = width

    // Snapshot current strokes
    const wasEmpty = canvasRef.current.isEmpty()
    const dataUrl = wasEmpty ? null : canvas.toDataURL()

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(CANVAS_HEIGHT * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${CANVAS_HEIGHT}px`

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      // Restore previous strokes if any
      if (dataUrl) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, width, CANVAS_HEIGHT)
        img.src = dataUrl
      }
    }
  }, [])

  useEffect(() => {
    setCanvasSize()

    // Debounce the resize handler so iOS Safari toolbar show/hide doesn't
    // wipe the canvas mid-stroke. 150ms is below human reaction time but
    // long enough to coalesce the toolbar animation events.
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(setCanvasSize, 150)
    }

    window.addEventListener('resize', onResize)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [setCanvasSize])

  function handleClear() {
    canvasRef.current?.clear()
    onClear?.()
  }

  function handleConfirm() {
    const canvas = canvasRef.current
    if (!canvas || canvas.isEmpty()) return
    onSave(canvas.toDataURL('image/png'))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <span
        style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          fontWeight: 500,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>

      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: `${CANVAS_HEIGHT}px`,
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          touchAction: 'none',
        }}
      >
        <SignatureCanvas
          ref={canvasRef}
          penColor="#000000"
          backgroundColor="#ffffff"
          canvasProps={{
            style: {
              width: '100%',
              height: `${CANVAS_HEIGHT}px`,
              display: 'block',
            },
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleClear}
          style={{
            padding: '8px 20px',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            color: 'var(--text-muted)',
            fontSize: '14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          style={{
            padding: '8px 20px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '8px',
            color: '#000000',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Confirm Signature
        </button>
      </div>
    </div>
  )
}
