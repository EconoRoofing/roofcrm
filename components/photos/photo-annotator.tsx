'use client'

import { useRef, useEffect, useState } from 'react'

interface AnnotationData {
  type: 'circle' | 'arrow' | 'text'
  x: number
  y: number
  x2?: number
  y2?: number
  text?: string
  color?: string
}

interface PhotoAnnotatorProps {
  imageUrl: string
  onSaveAnnotations?: (annotations: AnnotationData[]) => void
  initialAnnotations?: AnnotationData[]
}

export function PhotoAnnotator({
  imageUrl,
  onSaveAnnotations,
  initialAnnotations = [],
}: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [annotations, setAnnotations] = useState<AnnotationData[]>(initialAnnotations)
  const [drawing, setDrawing] = useState(false)
  const [tool, setTool] = useState<'circle' | 'arrow' | 'text'>('circle')
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
  const [scale, setScale] = useState(1)

  // Load and draw image on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imageRef.current

    if (!canvas || !img) return

    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set canvas size to match image
      canvas.width = img.width
      canvas.height = img.height

      // Draw image
      ctx.drawImage(img, 0, 0)

      // Redraw annotations
      redrawAnnotations()
    }

    img.src = imageUrl
  }, [imageUrl])

  const redrawAnnotations = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    const ctx = canvas?.getContext('2d')

    if (!canvas || !ctx || !img) return

    // Clear and redraw image
    ctx.drawImage(img, 0, 0)

    // Draw all annotations
    annotations.forEach((ann) => {
      drawAnnotation(ctx, ann)
    })
  }

  const drawAnnotation = (ctx: CanvasRenderingContext2D, ann: AnnotationData) => {
    ctx.strokeStyle = ann.color || 'var(--accent)'
    ctx.fillStyle = ann.color || 'var(--accent)'
    ctx.lineWidth = 2

    if (ann.type === 'circle') {
      const radius = Math.sqrt((ann.x2 || ann.x - 20 - ann.x) ** 2 + (ann.y2 || ann.y - 20 - ann.y) ** 2)
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
      ctx.fillStyle = ann.color || 'var(--accent)'
      ctx.fillText(ann.text, ann.x, ann.y)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    if (tool === 'text') {
      const text = prompt('Enter annotation text:')
      if (text) {
        const newAnn: AnnotationData = { type: 'text', x, y, text }
        setAnnotations([...annotations, newAnn])
        redrawAnnotations()
      }
    } else {
      setDrawing(true)
      setStartPos({ x, y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !startPos) return

    const canvas = canvasRef.current
    const img = imageRef.current
    const ctx = canvas?.getContext('2d')

    if (!canvas || !ctx || !img) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    // Redraw with preview
    ctx.drawImage(img, 0, 0)
    annotations.forEach((ann) => drawAnnotation(ctx, ann))

    const preview: AnnotationData = {
      type: tool,
      x: startPos.x,
      y: startPos.y,
      x2: x,
      y2: y,
    }
    drawAnnotation(ctx, preview)
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !startPos) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    const newAnn: AnnotationData = {
      type: tool,
      x: startPos.x,
      y: startPos.y,
      x2: x,
      y2: y,
    }

    setAnnotations([...annotations, newAnn])
    setDrawing(false)
    setStartPos(null)
    redrawAnnotations()
  }

  const handleSave = () => {
    onSaveAnnotations?.(annotations)
  }

  const handleClear = () => {
    setAnnotations([])
    const canvas = canvasRef.current
    const img = imageRef.current
    const ctx = canvas?.getContext('2d')

    if (ctx && img) {
      ctx.drawImage(img, 0, 0)
    }
  }

  const handleUndo = () => {
    const newAnnotations = annotations.slice(0, -1)
    setAnnotations(newAnnotations)
    redrawAnnotations()
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
        style={{
          padding: '16px',
          display: 'flex',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-deep)',
          maxHeight: '600px',
          overflowY: 'auto',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setDrawing(false)}
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            cursor: 'crosshair',
            maxWidth: '100%',
            height: 'auto',
          }}
        />
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
        {annotations.length} annotation(s) • Use {tool} tool to add • Double-click to add text
      </div>
    </div>
  )
}
