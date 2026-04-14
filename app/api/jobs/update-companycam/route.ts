import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership } from '@/lib/auth-helpers'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let companyId: string
  try {
    ;({ companyId } = await getUserWithCompany())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { jobId?: string; projectId?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { jobId, projectId } = body
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  // Verify the job belongs to the caller's company before touching it
  try {
    await verifyJobOwnership(jobId, companyId)
  } catch {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const supabase = await createClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .update({ companycam_project_id: projectId ?? null })
    .eq('id', jobId)
    .eq('company_id', companyId)
    .select('id, companycam_project_id')
    .single()

  if (error) {
    console.error('update-companycam: failed', error)
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }

  return NextResponse.json(job)
}
