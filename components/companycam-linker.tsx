'use client'

import { useEffect, useRef, useState } from 'react'
import type { CompanyCamProject } from '@/lib/companycam'
import { LinkIcon, UnlinkIcon, CameraIcon } from '@/components/icons'

interface CompanyCamLinkerProps {
  jobId: string
  address: string
  currentProjectId: string | null
}

async function updateJobCompanyCam(
  jobId: string,
  projectId: string | null,
  signal?: AbortSignal,
) {
  const res = await fetch('/api/jobs/update-companycam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, projectId }),
    signal,
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

  // Audit R3-#8: previously every async handler spread setState calls after
  // an `await` with no unmount check and no AbortController, so navigating
  // away from the job detail page mid-CompanyCam-fetch (these calls can take
  // 5+ seconds) leaked "setState on unmounted component" warnings AND the
  // network requests themselves never aborted. The mountedRef gates all
  // post-await setState; a single AbortController is reset between handler
  // invocations and aborted on unmount so any in-flight fetch is cancelled.
  const mountedRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  function freshAbortController(): AbortController {
    abortRef.current?.abort()
    const c = new AbortController()
    abortRef.current = c
    return c
  }

  async function handleSearch() {
    if (isSearching) return
    setIsSearching(true)
    setError(null)
    setResults(null)
    const controller = freshAbortController()

    try {
      const res = await fetch(
        `/api/companycam/search?address=${encodeURIComponent(address)}`,
        { signal: controller.signal },
      )
      const data: CompanyCamProject[] = await res.json()
      if (!mountedRef.current || controller.signal.aborted) return
      setResults(data)
    } catch (err) {
      if (controller.signal.aborted) return
      if (!mountedRef.current) return
      setError('Failed to search CompanyCam. Check your connection.')
    } finally {
      if (mountedRef.current) setIsSearching(false)
    }
  }

  async function handleLink(project: CompanyCamProject) {
    if (isSaving) return
    setIsSaving(true)
    setError(null)
    const controller = freshAbortController()

    try {
      await updateJobCompanyCam(jobId, project.id, controller.signal)
      if (!mountedRef.current || controller.signal.aborted) return
      setProjectId(project.id)
      setProjectName(project.name)
      setResults(null)
    } catch (err) {
      if (controller.signal.aborted) return
      if (!mountedRef.current) return
      setError('Failed to link project.')
    } finally {
      if (mountedRef.current) setIsSaving(false)
    }
  }

  async function handleUnlink() {
    if (isSaving) return
    setIsSaving(true)
    setError(null)
    const controller = freshAbortController()

    try {
      await updateJobCompanyCam(jobId, null, controller.signal)
      if (!mountedRef.current || controller.signal.aborted) return
      setProjectId(null)
      setProjectName(null)
    } catch (err) {
      if (controller.signal.aborted) return
      if (!mountedRef.current) return
      setError('Failed to unlink project.')
    } finally {
      if (mountedRef.current) setIsSaving(false)
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
          type="button"
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
            borderRadius: '8px',
            padding: '8px 10px',
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
          type="button"
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
              type="button"
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
                  type="button"
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
