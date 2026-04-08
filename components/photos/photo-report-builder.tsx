'use client'

import { useState, useCallback } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Photo {
  url: string
  category: string
  created_at: string
  storage_path?: string
}

interface ReportSection {
  id: string
  title: string
  description: string
  photoIndexes: number[]
  columns: 1 | 2 | 3
}

interface PhotoReportBuilderProps {
  jobId: string
  photos: Photo[]
}

// ─── SVG Icons ──────────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="3" x2="11" y2="11" />
      <line x1="11" y1="3" x2="3" y2="11" />
    </svg>
  )
}

function IconArrowUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="11" x2="7" y2="3" />
      <polyline points="3,6 7,3 11,6" />
    </svg>
  )
}

function IconArrowDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="3" x2="7" y2="11" />
      <polyline points="3,8 7,11 11,8" />
    </svg>
  )
}

function IconFileText() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" />
      <polyline points="9,1 9,5 13,5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="10.5" x2="11" y2="10.5" />
    </svg>
  )
}

// ─── Template Presets ────────────────────────────────────────────────────────────

interface Preset {
  label: string
  sections: Array<{ title: string; description: string }>
}

const PRESETS: Preset[] = [
  {
    label: 'Insurance Claim',
    sections: [
      { title: 'Damage Overview', description: 'Summary of visible damage and affected areas.' },
      { title: 'Roof Condition', description: 'Current condition of the roofing system.' },
      { title: 'Detailed Damage', description: 'Close-up documentation of specific damage points.' },
      { title: 'Measurements', description: 'Dimensional measurements and scope of affected areas.' },
      { title: 'Recommendations', description: 'Recommended repairs and next steps.' },
    ],
  },
  {
    label: 'Progress Update',
    sections: [
      { title: 'Work Completed', description: 'Summary of work performed during this period.' },
      { title: 'Current Status', description: 'Current project status and milestones reached.' },
      { title: 'Before/After', description: 'Comparison documentation showing progress.' },
      { title: 'Next Steps', description: 'Planned work for the upcoming period.' },
    ],
  },
  {
    label: 'Final Inspection',
    sections: [
      { title: 'Completed Work', description: 'Overview of all completed work.' },
      { title: 'Quality Check', description: 'Quality inspection findings and sign-off items.' },
      { title: 'Final Photos', description: 'Final documentation of the completed project.' },
      { title: 'Warranty Info', description: 'Warranty details and maintenance recommendations.' },
    ],
  },
]

// ─── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex',
    gap: '24px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: '#e0e0e0',
    minHeight: '600px',
  } as React.CSSProperties,

  panel: {
    flex: '1 1 50%',
    minWidth: 0,
  } as React.CSSProperties,

  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
  } as React.CSSProperties,

  heading: {
    margin: '0 0 12px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '8px 10px',
    background: '#111',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#e0e0e0',
    fontSize: '13px',
    outline: 'none',
  } as React.CSSProperties,

  textarea: {
    width: '100%',
    padding: '8px 10px',
    background: '#111',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#e0e0e0',
    fontSize: '13px',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: '56px',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  btnSmall: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 8px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#999',
    cursor: 'pointer',
    fontSize: '12px',
  } as React.CSSProperties,

  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  } as React.CSSProperties,

  btnPreset: {
    padding: '6px 12px',
    background: '#222',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  } as React.CSSProperties,

  thumbGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
    gap: '6px',
    marginTop: '8px',
  } as React.CSSProperties,

  radioGroup: {
    display: 'flex',
    gap: '8px',
    marginTop: '6px',
  } as React.CSSProperties,

  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginBottom: '4px',
    display: 'block',
  } as React.CSSProperties,
}

// ─── Component ──────────────────────────────────────────────────────────────────

let sectionIdCounter = 0
function newId(): string {
  sectionIdCounter += 1
  return `sec_${sectionIdCounter}_${Date.now()}`
}

export function PhotoReportBuilder({ jobId, photos }: PhotoReportBuilderProps) {
  const [sections, setSections] = useState<ReportSection[]>([])

  // ─── Section CRUD ───────────────────────────────────────────────────────

  const addSection = useCallback(() => {
    setSections((prev) => [
      ...prev,
      { id: newId(), title: '', description: '', photoIndexes: [], columns: 2 },
    ])
  }, [])

  const removeSection = useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const updateSection = useCallback((id: string, patch: Partial<ReportSection>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  const moveSection = useCallback((id: string, direction: 'up' | 'down') => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }, [])

  const togglePhoto = useCallback((sectionId: string, photoIndex: number) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const has = s.photoIndexes.includes(photoIndex)
        return {
          ...s,
          photoIndexes: has
            ? s.photoIndexes.filter((i) => i !== photoIndex)
            : [...s.photoIndexes, photoIndex],
        }
      })
    )
  }, [])

  // ─── Presets ────────────────────────────────────────────────────────────

  const applyPreset = useCallback((preset: Preset) => {
    setSections(
      preset.sections.map((s) => ({
        id: newId(),
        title: s.title,
        description: s.description,
        photoIndexes: [],
        columns: 2,
      }))
    )
  }, [])

  // ─── Generate Report ───────────────────────────────────────────────────

  const generateReport = useCallback(() => {
    const reportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const sectionHtml = sections
      .map((section) => {
        const colCount = section.columns
        const selectedPhotos = section.photoIndexes.map((i) => photos[i]).filter(Boolean)

        const photoCards = selectedPhotos
          .map((p) => {
            const timestamp = new Date(p.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
            return `
            <div style="break-inside:avoid;border:1px solid #ddd;border-radius:6px;overflow:hidden;background:#fff;">
              <img src="${escapeForHtml(p.url)}" alt="Photo" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;" />
              <div style="padding:6px 8px;">
                <div style="font-size:11px;color:#666;">${escapeForHtml(p.category)} &middot; ${escapeForHtml(timestamp)}</div>
              </div>
            </div>`
          })
          .join('\n')

        const descriptionHtml = section.description
          ? `<p style="margin:0 0 12px;font-size:13px;color:#555;">${escapeForHtml(section.description)}</p>`
          : ''

        return `
        <div style="margin-bottom:32px;break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="width:4px;height:20px;border-radius:2px;background:#3b82f6;"></div>
            <h2 style="margin:0;font-size:18px;font-weight:700;color:#222;">${escapeForHtml(section.title || 'Untitled Section')}</h2>
          </div>
          ${descriptionHtml}
          <div style="display:grid;grid-template-columns:repeat(${colCount},1fr);gap:12px;">
            ${photoCards || '<div style="font-size:13px;color:#aaa;grid-column:1/-1;">No photos selected</div>'}
          </div>
        </div>`
      })
      .join('\n')

    const totalPhotos = sections.reduce((sum, s) => sum + s.photoIndexes.length, 0)

    const html = buildReportHtml(jobId, reportDate, sections.length, totalPhotos, sectionHtml)

    // Open in new tab using Blob URL (avoids document.write)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }, [sections, photos, jobId])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={S.root}>
      {/* ── Left: Builder ──────────────────────────────────────────────── */}
      <div style={S.panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ ...S.heading, margin: 0 }}>Report Builder</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                style={S.btnPreset}
                onClick={() => applyPreset(preset)}
                title={`Load "${preset.label}" template`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {sections.length === 0 && (
          <div style={{ ...S.card, textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ color: '#666', fontSize: '13px', marginBottom: '12px' }}>
              No sections yet. Add a section or pick a template preset above.
            </div>
            <button type="button" style={S.btnPrimary} onClick={addSection}>
              <IconPlus /> Add Section
            </button>
          </div>
        )}

        {sections.map((section, idx) => (
          <div key={section.id} style={S.card}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#666' }}>
                Section {idx + 1}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  style={S.btnSmall}
                  onClick={() => moveSection(section.id, 'up')}
                  disabled={idx === 0}
                  title="Move up"
                >
                  <IconArrowUp />
                </button>
                <button
                  type="button"
                  style={S.btnSmall}
                  onClick={() => moveSection(section.id, 'down')}
                  disabled={idx === sections.length - 1}
                  title="Move down"
                >
                  <IconArrowDown />
                </button>
                <button
                  type="button"
                  style={{ ...S.btnSmall, color: '#ef4444', borderColor: '#3a2020' }}
                  onClick={() => removeSection(section.id)}
                  title="Remove section"
                >
                  <IconX />
                </button>
              </div>
            </div>

            {/* Title */}
            <div style={{ marginBottom: '8px' }}>
              <label style={S.label}>Title</label>
              <input
                type="text"
                style={S.input}
                value={section.title}
                onChange={(e) => updateSection(section.id, { title: e.target.value })}
                placeholder="Section title..."
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: '8px' }}>
              <label style={S.label}>Description</label>
              <textarea
                style={S.textarea}
                value={section.description}
                onChange={(e) => updateSection(section.id, { description: e.target.value })}
                placeholder="Section description..."
              />
            </div>

            {/* Layout */}
            <div style={{ marginBottom: '8px' }}>
              <label style={S.label}>Photo Layout</label>
              <div style={S.radioGroup}>
                {([1, 2, 3] as const).map((col) => (
                  <label
                    key={col}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      color: section.columns === col ? '#3b82f6' : '#888',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name={`cols_${section.id}`}
                      checked={section.columns === col}
                      onChange={() => updateSection(section.id, { columns: col })}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    {col}-col
                  </label>
                ))}
              </div>
            </div>

            {/* Photo picker */}
            <div>
              <label style={S.label}>
                Photos ({section.photoIndexes.length} selected)
              </label>
              <div style={S.thumbGrid}>
                {photos.map((photo, pIdx) => {
                  const selected = section.photoIndexes.includes(pIdx)
                  return (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => togglePhoto(section.id, pIdx)}
                      style={{
                        padding: 0,
                        border: selected ? '2px solid #3b82f6' : '2px solid #333',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: '#111',
                        aspectRatio: '1',
                        position: 'relative',
                      }}
                      title={`${photo.category} - ${new Date(photo.created_at).toLocaleDateString()}`}
                    >
                      <img
                        src={photo.url}
                        alt={photo.category}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: selected ? 1 : 0.5 }}
                        loading="lazy"
                      />
                      {selected && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            background: '#3b82f6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1,4.5 3,6.5 7,2" />
                          </svg>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ))}

        {sections.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button type="button" style={{ ...S.btnSmall, gap: '4px', display: 'inline-flex', alignItems: 'center' }} onClick={addSection}>
              <IconPlus /> Add Section
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Preview ─────────────────────────────────────────────── */}
      <div style={S.panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ ...S.heading, margin: 0 }}>Preview</h3>
          <button
            type="button"
            style={{
              ...S.btnPrimary,
              opacity: sections.length === 0 ? 0.4 : 1,
              pointerEvents: sections.length === 0 ? 'none' : 'auto',
            }}
            onClick={generateReport}
            disabled={sections.length === 0}
          >
            <IconFileText /> Generate Report
          </button>
        </div>

        <div
          style={{
            background: '#f5f5f5',
            borderRadius: '8px',
            padding: '24px',
            minHeight: '400px',
            border: '1px solid #2a2a2a',
          }}
        >
          {sections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: '#999', fontSize: '13px' }}>
              Your report preview will appear here as you build it.
            </div>
          ) : (
            <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
              <h1 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800, color: '#111' }}>Photo Report</h1>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '20px' }}>
                {sections.length} section{sections.length !== 1 ? 's' : ''} &middot;{' '}
                {sections.reduce((s, sec) => s + sec.photoIndexes.length, 0)} photos
              </div>

              {sections.map((section) => {
                const selectedPhotos = section.photoIndexes.map((i) => photos[i]).filter(Boolean)

                return (
                  <div key={section.id} style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <div style={{ width: '3px', height: '16px', borderRadius: '2px', background: '#3b82f6' }} />
                      <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#222' }}>
                        {section.title || 'Untitled Section'}
                      </h2>
                    </div>

                    {section.description && (
                      <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#555' }}>{section.description}</p>
                    )}

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${section.columns}, 1fr)`,
                        gap: '8px',
                      }}
                    >
                      {selectedPhotos.length > 0 ? (
                        selectedPhotos.map((p, i) => (
                          <div
                            key={i}
                            style={{
                              borderRadius: '4px',
                              overflow: 'hidden',
                              border: '1px solid #ddd',
                              background: '#fff',
                            }}
                          >
                            <img
                              src={p.url}
                              alt={p.category}
                              style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                              loading="lazy"
                            />
                            <div style={{ padding: '4px 6px', fontSize: '10px', color: '#888' }}>
                              {p.category}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '12px', color: '#bbb', gridColumn: '1 / -1' }}>No photos selected</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Utilities ──────────────────────────────────────────────────────────────────

function escapeForHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
  )
}

/** Build the full HTML string for the generated report (Blob-based, no document.write) */
function buildReportHtml(
  jobId: string,
  reportDate: string,
  sectionCount: number,
  totalPhotos: number,
  sectionHtml: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Photo Report</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      img { max-height: 280px; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #222; }
  </style>
</head>
<body>
  <div style="max-width:900px;margin:0 auto;padding:32px 24px;">
    <div class="no-print" style="text-align:right;margin-bottom:16px;">
      <button onclick="window.print()" style="padding:8px 20px;border-radius:6px;border:1px solid #ccc;background:#fff;font-size:13px;font-weight:600;cursor:pointer;">
        Print Report
      </button>
    </div>

    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:24px;margin-bottom:24px;">
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#111;">Photo Report</h1>
      <div style="font-size:13px;color:#888;">Generated ${escapeForHtml(reportDate)} &middot; ${sectionCount} section${sectionCount !== 1 ? 's' : ''} &middot; ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}</div>
    </div>

    ${sectionHtml}

    <div style="text-align:center;padding:24px 0 8px;border-top:1px solid #e0e0e0;margin-top:16px;">
      <div style="font-size:11px;color:#aaa;">Photo Report &mdash; ${escapeForHtml(reportDate)}</div>
    </div>
  </div>
</body>
</html>`
}
