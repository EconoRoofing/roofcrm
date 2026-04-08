'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { type PhotoCategory, PHOTO_CATEGORIES } from '@/lib/types/photos'

interface AnnotationData {
  type: 'circle' | 'arrow' | 'text'
  x: number
  y: number
  x2?: number
  y2?: number
  text?: string
  color?: string
  category?: PhotoCategory
}

interface PhotoAnnotatorProps {
  imageUrl: string
  onSaveAnnotations?: (annotations: AnnotationData[], category: PhotoCategory) => void
  initialAnnotations?: AnnotationData[]
  initialCategory?: PhotoCategory
}

export function PhotoAnnotator({
  imageUrl,
  onSaveAnnotations,
  initialAnnotations = [],
  initialCategory = 'General',
}: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [annotations, setAnnotations] = useState<AnnotationData[]>(initialAnnotations)
  const [drawing, setDrawing] = useState(false)
  const [tool, setTool] = useState<'circle' | 'arrow' | 'text'>('circle')
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
  const [scale, setScale] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<PhotoCategory>(initialCategory)
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null)
  const [annotationColor, setAnnotationColor] = useState('#ff4444')
  const containerRef = useRef<HTMLDivElement>(null)

  const COLOR_PALETTE = ['#ff4444', '#ffffff', '#ffaa00', '#44ff44', '#4488ff', '#ff44ff']

  // Sync local annotations when the parent provides new initialAnnotations
  useEffect(() => {
    setAnnotations(initialAnnotations)
  }, [initialAnnotations])

  const MAX_CANVAS = 2000
  const MAX_ANNOTATIONS = 50

  const ANNOTATION_COLOR = '#ff4444'
  const TEXT_COLOR = '#ffffff'

  // Load and draw image on canvas, calculate scale from display vs natural dimensions
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imageRef.current

    if (!canvas || !img) return

    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Cap canvas dimensions to prevent memory exhaustion on huge images
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > MAX_CANVAS || h > MAX_CANVAS) {
        const ratio = Math.min(MAX_CANVAS / w, MAX_CANVAS / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      canvas.width = w
      canvas.height = h

      // Calculate scale: canvas display size vs natural size
      const rect = canvas.getBoundingClientRect()
      if (rect.width > 0) {
        setScale(w / rect.width)
      }

      ctx.drawImage(img, 0, 0, w, h)
      redrawAnnotations(initialAnnotations)
    }

    img.onerror = () => setError('Failed to load image')

    img.src = imageUrl
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl])

  // Recalculate scale when the canvas container resizes
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width > 0 && canvas.width > 0) {
        setScale(canvas.width / rect.width)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const redrawAnnotations = (anns: AnnotationData[]) => {
    const canvas = canvasRef.current
    const img = imageRef.current
    const ctx = canvas?.getContext('2d')

    if (!canvas || !ctx || !img) return

    // Clear and redraw image at canvas dimensions (respects size cap)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // Draw all annotations from the provided array (avoids stale closure)
    anns.forEach((ann) => {
      drawAnnotation(ctx, ann)
    })
  }

  const drawAnnotation = (ctx: CanvasRenderingContext2D, ann: AnnotationData) => {
    // Use hardcoded hex colors — canvas cannot read CSS variables
    ctx.strokeStyle = ann.color || ANNOTATION_COLOR
    ctx.fillStyle = ann.color || ANNOTATION_COLOR
    ctx.lineWidth = 2

    if (ann.type === 'circle') {
      const dx = (ann.x2 ?? ann.x - 20) - ann.x
      const dy = (ann.y2 ?? ann.y - 20) - ann.y
      const radius = Math.sqrt(dx * dx + dy * dy) || 20
      ctx.beginPath()
      ctx.arc(ann.x, ann.y, radius, 0, 2 * Math.PI)
      ctx.stroke()
    } else if (ann.type === 'arrow') {
      // Draw arrow from (x, y) to (x2, y2)
      const x2 = ann.x2 || ann.x + 50
      const y2 = ann.y2 || ann.y + 50
      const headlen = 15
      const angle = Math.atan2(y2 - ann.y, x2 - ann.x)

      ctx.beginPath()
      ctx.moveTo(ann.x, ann.y)
      ctx.lineTo(x2, y2)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
    } else if (ann.type === 'text' && ann.text) {
      ctx.font = '14px Arial'
      ctx.fillStyle = ann.color || TEXT_COLOR
      ctx.fillText(ann.text, ann.x, ann.y)
    }
  }

  // Convert a pointer position (client coords) to canvas-space coords
  const canvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left) * scale,
        y: (clientY - rect.top) * scale,
      }
    },
    [scale]
  )

  // Commit inline text input as an annotation
  const commitTextInput = useCallback(
    (value: string) => {
      if (!textInput) return
      if (value.trim() && annotations.length < MAX_ANNOTATIONS) {
        const newAnn: AnnotationData = { type: 'text', x: textInput.x, y: textInput.y, text: value.trim(), color: annotationColor }
        const updated = [...annotations, newAnn]
        setAnnotations(updated)
        redrawAnnotations(updated)
      }
      setTextInput(null)
    },
    [textInput, annotations, annotationColor]
  )

  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      const { x, y } = canvasCoords(clientX, clientY)

      if (tool === 'text') {
        if (annotations.length >= MAX_ANNOTATIONS) return
        // Show inline input instead of blocking prompt()
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        setTextInput({
          x,
          y,
          value: '',
        })
      } else {
        setDrawing(true)
        setStartPos({ x, y })
      }
    },
    [tool, annotations, canvasCoords]
  )

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!drawing || !startPos) return

      const canvas = canvasRef.current
      const img = imageRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx || !img) return

      const { x, y } = canvasCoords(clientX, clientY)

      // Redraw with preview (pass current annotations array to avoid stale state)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      annotations.forEach((ann) => drawAnnotation(ctx, ann))

      const preview: AnnotationData = {
        type: tool,
        x: startPos.x,
        y: startPos.y,
        x2: x,
        y2: y,
        color: annotationColor,
      }
      drawAnnotation(ctx, preview)
    },
    [drawing, startPos, tool, annotations, canvasCoords]
  )

  const handlePointerUp = useCallback(
    (clientX: number, clientY: number) => {
      if (!drawing || !startPos) return

      const canvas = canvasRef.current
      if (!canvas) return

      const { x, y } = canvasCoords(clientX, clientY)

      if (annotations.length >= MAX_ANNOTATIONS) {
        setDrawing(false)
        setStartPos(null)
        return
      }

      const newAnn: AnnotationData = {
        type: tool,
        x: startPos.x,
        y: startPos.y,
        x2: x,
        y2: y,
        color: annotationColor,
      }

      const updated = [...annotations, newAnn]
      setAnnotations(updated)
      setDrawing(false)
      setStartPos(null)
      redrawAnnotations(updated)
    },
    [drawing, startPos, tool, annotations, canvasCoords]
  )

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerDown(e.clientX, e.clientY)
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerMove(e.clientX, e.clientY)
  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerUp(e.clientX, e.clientY)

  // Touch event handlers — convert first touch to same coordinate system as mouse
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const touch = e.touches[0]
    if (touch) handlePointerDown(touch.clientX, touch.clientY)
  }
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const touch = e.touches[0]
    if (touch) handlePointerMove(touch.clientX, touch.clientY)
  }
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const touch = e.changedTouches[0]
    if (touch) handlePointerUp(touch.clientX, touch.clientY)
  }

  const handleSave = () => {
    onSaveAnnotations?.(annotations, category)
  }

  const handleClear = () => {
    setAnnotations([])
    const canvas = canvasRef.current
    const img = imageRef.current
    const ctx = canvas?.getContext('2d')

    if (ctx && canvas && img) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
  }

  const handleUndo = () => {
    const newAnnotations = annotations.slice(0, -1)
    setAnnotations(newAnnotations)
    redrawAnnotations(newAnnotations)
  }

  if (error) {
    return (
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '8px',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-danger, #ef4444)',
          fontSize: '14px',
        }}
      >
        {error}
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          padding: '12px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* Category selector */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PhotoCategory)}
          style={{
            padding: '5px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {PHOTO_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: '4px' }}>
          {(['circle', 'arrow', 'text'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: tool === t ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
                backgroundColor: tool === t ? 'var(--accent-dim)' : 'transparent',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Color picker */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: '4px' }}>
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setAnnotationColor(c)}
              title={c}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: annotationColor === c ? '2px solid var(--accent, #60a5fa)' : '2px solid var(--border-subtle)',
                backgroundColor: c,
                cursor: 'pointer',
                padding: 0,
                outline: annotationColor === c ? '1px solid var(--accent, #60a5fa)' : 'none',
                outlineOffset: '1px',
              }}
            />
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            onClick={handleUndo}
            disabled={annotations.length === 0}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: annotations.length === 0 ? 'var(--bg-secondary)' : 'transparent',
              color: annotations.length === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: annotations.length === 0 ? 'default' : 'pointer',
            }}
          >
            Undo
          </button>

          <button
            onClick={handleClear}
            disabled={annotations.length === 0}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: annotations.length === 0 ? 'var(--bg-secondary)' : 'transparent',
              color: annotations.length === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: annotations.length === 0 ? 'default' : 'pointer',
            }}
          >
            Clear All
          </button>

          <button
            onClick={handleSave}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--accent)',
              backgroundColor: 'var(--accent)',
              color: 'var(--bg-deep)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save Annotations
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          padding: '16px',
          display: 'flex',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-deep)',
          maxHeight: '600px',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setDrawing(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            cursor: 'crosshair',
            maxWidth: '100%',
            height: 'auto',
            touchAction: 'none',
          }}
        />

        {/* Inline text input — replaces blocking prompt() */}
        {textInput && (
          <input
            autoFocus
            type="text"
            value={textInput.value}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTextInput(textInput.value)
              if (e.key === 'Escape') setTextInput(null)
            }}
            onBlur={() => commitTextInput(textInput.value)}
            placeholder="Type annotation..."
            style={{
              position: 'absolute',
              left: `${(textInput.x / scale) + 16}px`,
              top: `${(textInput.y / scale) + 16}px`,
              width: '160px',
              padding: '4px 8px',
              fontSize: '13px',
              fontWeight: 500,
              border: '2px solid var(--accent, #60a5fa)',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-card, #1a1a1a)',
              color: 'var(--text-primary, #fff)',
              outline: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>

      {/* Status */}
      <div
        style={{
          padding: '12px',
          backgroundColor: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        {annotations.length} / {MAX_ANNOTATIONS} annotations{annotations.length >= MAX_ANNOTATIONS ? ' — limit reached' : ''} • Active tool: {tool}
      </div>
    </div>
  )
}
