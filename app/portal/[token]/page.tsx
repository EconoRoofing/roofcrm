'use client'

import { useEffect, useState } from 'react'
import { getJobByPortalToken } from '@/lib/actions/portal'

const STATUS_STEPS = [
  { key: 'lead', label: 'Lead' },
  { key: 'estimate_scheduled', label: 'Estimate' },
  { key: 'pending', label: 'Pending' },
  { key: 'sold', label: 'Sold' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Complete' },
]

export default function PortalPage({ params }: { params: { token: string } }) {
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchJob() {
      try {
        const data = await getJobByPortalToken(params.token)
        if (!data) {
          setError('Project not found')
        } else {
          setJob(data)
        }
      } catch (err) {
        setError('Failed to load project')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchJob()
  }, [params.token])

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-deep)',
          color: 'var(--text-secondary)',
        }}
      >
        <div>Loading project...</div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-deep)',
        }}
      >
        <div
          style={{
            maxWidth: '400px',
            padding: '32px',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Project not found
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            The project link you provided is invalid or has expired. Please contact your roofing company for assistance.
          </p>
        </div>
      </div>
    )
  }

  const currentStatusIndex = STATUS_STEPS.findIndex((s) => s.key === job.status)
  const progressPercent = currentStatusIndex >= 0 ? ((currentStatusIndex + 1) / STATUS_STEPS.length) * 100 : 0

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)' }}>
      {/* Header */}
      <header
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {job.companies?.name || 'Roofing Project'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Project #{job.job_number}
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 24px' }}>
        {/* Status Progress Bar */}
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Project Status
          </h2>
          
          {/* Progress Bar */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                height: '8px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  backgroundColor: 'var(--accent)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Status Steps */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            {STATUS_STEPS.map((step, idx) => {
              const isActive = idx <= currentStatusIndex
              return (
                <div
                  key={step.key}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: isActive ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: isActive ? 'var(--bg-deep)' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 500 : 400,
                    }}
                  >
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Project Details */}
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Project Details
          </h2>
          
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '24px',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                CUSTOMER
              </label>
              <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                {job.customer_name}
              </p>
            </div>

            {job.scheduled_date && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  SCHEDULED DATE
                </label>
                <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {new Date(job.scheduled_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Contact Section */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Questions?
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
            Contact the roofing company directly for more information about your project.
          </p>
          <button
            onClick={() => window.history.back()}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = 'var(--accent-dim)'
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)'
            }}
          >
            Go Back
          </button>
        </div>
      </main>
    </div>
  )
}
