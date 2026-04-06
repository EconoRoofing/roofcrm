'use client'

import type { Job } from '@/lib/types/database'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

interface PhotosGridProps {
  jobs: JobWithCompany[]
}

// Subtle dark gradient variations for placeholder photo cards
const PHOTO_GRADIENTS = [
  'linear-gradient(135deg, #151921, #1e2430)',
  'linear-gradient(135deg, #1a1f2e, #141820)',
  'linear-gradient(135deg, #0e1117, #1a2035)',
  'linear-gradient(135deg, #181f2a, #111520)',
  'linear-gradient(135deg, #0f1520, #1c2232)',
  'linear-gradient(135deg, #141c28, #0d1219)',
]

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 5L7.8 3H12.2L13 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M6 3H3C2.4 3 2 3.4 2 4V11C2 11.6 2.4 12 3 12H10C10.6 12 11 11.6 11 11V8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8 2H12V6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 2L7 7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PlaceholderPhoto({ index }: { index: number }) {
  const gradient = PHOTO_GRADIENTS[index % PHOTO_GRADIENTS.length]
  return (
    <div
      style={{
        aspectRatio: '1 / 1',
        background: gradient,
        borderRadius: '8px',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
      }}
    >
      <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
        <CameraIcon />
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          fontWeight: 500,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.5,
        }}
      >
        Photo
      </span>
    </div>
  )
}

export function PhotosGrid({ jobs }: PhotosGridProps) {
  const jobsWithCam = jobs.filter((j) => j.companycam_project_id)

  if (jobsWithCam.length === 0) {
    return (
      <div
        style={{
          padding: '64px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>
          <CameraIcon />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            textAlign: 'center',
          }}
        >
          No CompanyCam projects linked
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '0 16px' }}>
      {jobsWithCam.map((job) => {
        const companycamUrl = `companycam://projects/${job.companycam_project_id}`

        return (
          <div key={job.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Job label */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              {job.customer_name} &middot; {job.address}
            </span>

            {/* 3-column photo grid — Phase 4 placeholders */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
              }}
            >
              {Array.from({ length: 6 }, (_, i) => (
                <PlaceholderPhoto key={i} index={i} />
              ))}
            </div>

            {/* Open in CompanyCam */}
            <a
              href={companycamUrl}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, #2962ff, #448aff)',
                borderRadius: '8px',
                padding: '11px 16px',
                textDecoration: 'none',
                color: '#ffffff',
              }}
            >
              <ExternalLinkIcon />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Open in CompanyCam
              </span>
            </a>
          </div>
        )
      })}
    </div>
  )
}
