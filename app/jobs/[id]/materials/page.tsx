import { notFound } from 'next/navigation'
import { getJob } from '@/lib/actions/jobs'
import { getMaterialList, generateMaterialList } from '@/lib/actions/materials'
import { MaterialListUI } from '@/components/estimate/material-list'
import type { MaterialCalcInput } from '@/lib/material-calculator'
import Link from 'next/link'
import { ChevronLeftNavIcon } from '@/components/icons'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MaterialsPage({ params }: PageProps) {
  const { id } = await params

  const job = await getJob(id)
  if (!job) notFound()

  // Try to get existing list; auto-generate if job has squares but no list yet
  let list = await getMaterialList(id)
  if (!list && (job.squares ?? 0) > 0) {
    try {
      list = await generateMaterialList(id)
    } catch {
      // Non-fatal; the UI will show the generate button
    }
  }

  // Build calc input so the client component can re-run the calculator locally
  const calcInput: MaterialCalcInput = {
    squares: job.squares ?? 0,
    job_type: job.job_type,
    material: job.material ?? undefined,
    felt_type: job.felt_type ?? undefined,
    layers: job.layers ?? undefined,
    gutter_length_ft: job.gutters_length ?? undefined,
    ridge_vent_ft: job.estimate_specs?.ridge_vent_ft ?? undefined,
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-deep)',
        paddingTop: '8px',
        paddingBottom: '32px',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          margin: '0 auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Back nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link
            href={`/jobs/${id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontFamily: 'var(--font-sans)',
              fontWeight: '600',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
          >
            <ChevronLeftNavIcon />
            Back to Job
          </Link>
        </div>

        {/* Page title */}
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '22px',
              fontWeight: '900',
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {job.customer_name}
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {job.job_number} — Materials
          </p>
        </div>

        {/* Job specs summary */}
        {(job.squares ?? 0) > 0 && (
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              padding: '12px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            {job.squares != null && (
              <Spec label="Squares" value={String(job.squares)} />
            )}
            {job.material && (
              <Spec label="Material" value={job.material} />
            )}
            {job.felt_type && (
              <Spec label="Felt" value={job.felt_type} />
            )}
            {job.layers != null && (
              <Spec label="Layers" value={String(job.layers)} />
            )}
          </div>
        )}

        {/* Material list component */}
        <MaterialListUI jobId={id} initialList={list} calcInput={calcInput} />
      </div>
    </main>
  )
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '500' }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600' }}>
        {value}
      </span>
    </div>
  )
}
