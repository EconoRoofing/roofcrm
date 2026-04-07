'use client'

import { useRef, useEffect, useCallback } from 'react'
import SignatureCanvas from 'react-signature-canvas'

interface SignaturePadProps {
  onSave: (dataUrl: string) => void
  onClear?: () => void
  label: string
}

export function SignaturePad({ onSave, onClear, label }: SignaturePadProps) {
  const canvasRef = useRef<SignatureCanvas>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const setCanvasSize = useCallback(() => {
    if (!containerRef.current || !canvasRef.current) return
    const canvas = canvasRef.current.getCanvas()
    const width = containerRef.current.clientWidth
    // Preserve existing drawing data
    const dataUrl = canvas.toDataURL()
    canvas.width = width
    canvas.height = 200
    // Restore drawing if there was content
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = dataUrl
    }
  }, [])

  useEffect(() => {
    setCanvasSize()
    window.addEventListener('resize', setCanvasSize)
    return () => window.removeEventListener('resize', setCanvasSize)
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
          height: '200px',
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
              height: '200px',
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
