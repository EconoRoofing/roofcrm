'use client'

import { useState } from 'react'
import type { CompanyCamProject } from '@/lib/companycam'

interface CompanyCamLinkerProps {
  jobId: string
  address: string
  currentProjectId: string | null
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function UnlinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-3 3a5 5 0 0 0 .54 7.54"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l3-3a5 5 0 0 0-.54-7.54"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 5L7.8 3H12.2L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

async function updateJobCompanyCam(jobId: string, projectId: string | null) {
  const res = await fetch('/api/jobs/update-companycam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, projectId }),
  })
  if (!res.ok) throw new Error('Failed to update job')
  return res.json()
}

export function CompanyCamLinker({ jobId, address, currentProjectId }: CompanyCamLinkerProps) {
  const [projectId, setProjectId] = useState<string | null>(currentProjectId)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<CompanyCamProject[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSearch() {
    setIsSearching(true)
    setError(null)
    setResults(null)

    try {
      const res = await fetch(`/api/companycam/search?address=${encodeURIComponent(address)}`)
      const data: CompanyCamProject[] = await res.json()
      setResults(data)
    } catch {
      setError('Failed to search CompanyCam. Check your connection.')
    } finally {
      setIsSearching(false)
    }
  }

  async function handleLink(project: CompanyCamProject) {
    setIsSaving(true)
    setError(null)

    try {
      await updateJobCompanyCam(jobId, project.id)
      setProjectId(project.id)
      setProjectName(project.name)
      setResults(null)
    } catch {
      setError('Failed to link project.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUnlink() {
    setIsSaving(true)
    setError(null)

    try {
      await updateJobCompanyCam(jobId, null)
      setProjectId(null)
      setProjectName(null)
    } catch {
      setError('Failed to unlink project.')
    } finally {
      setIsSaving(false)
    }
  }

  // Linked state
  if (projectId) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: 'rgba(68, 138, 255, 0.08)',
          border: '1px solid rgba(68, 138, 255, 0.2)',
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#448aff' }}>
            <CameraIcon />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: '700',
                color: '#448aff',
              }}
            >
              Linked to CompanyCam
            </span>
            {projectName && (
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                {projectName}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleUnlink}
          disabled={isSaving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            backgroundColor: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '5px 10px',
            cursor: 'pointer',
            opacity: isSaving ? 0.5 : 1,
          }}
        >
          <UnlinkIcon />
          Unlink
        </button>
      </div>
    )
  }

  // Unlinked state
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Search trigger button */}
      {results === null && (
        <button
          onClick={handleSearch}
          disabled={isSearching}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '11px 16px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            cursor: 'pointer',
            opacity: isSearching ? 0.6 : 1,
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            <LinkIcon />
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-secondary)',
            }}
          >
            {isSearching ? 'Searching...' : 'Link CompanyCam'}
          </span>
        </button>
      )}

      {/* Search results */}
      {results !== null && (
        <div
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              {results.length > 0 ? `${results.length} project${results.length !== 1 ? 's' : ''} found` : 'No matching projects found'}
            </span>
            <button
              onClick={() => setResults(null)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              Close
            </button>
          </div>

          {results.length === 0 ? (
            <div style={{ padding: '20px 14px', textAlign: 'center' }}>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                }}
              >
                No matching projects found in CompanyCam
              </span>
            </div>
          ) : (
            <div>
              {results.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleLink(project)}
                  disabled={isSaving}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    width: '100%',
                    padding: '12px 14px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    opacity: isSaving ? 0.5 : 1,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {project.name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {[project.address.street_address_1, project.address.city, project.address.state]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--accent-red)',
            padding: '4px 0',
          }}
        >
          {error}
        </span>
      )}
    </div>
  )
}
