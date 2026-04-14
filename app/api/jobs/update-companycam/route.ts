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

  // SECURITY: prevent cross-company CompanyCam link hijack.
  // Audit finding R2-#2. Without this check, user A in company 1 could link
  // their job to company 2's CompanyCam project id, then read all of
  // company 2's photos via /api/companycam/photos (which trusts the
  // jobs.companycam_project_id link as proof of ownership).
  //
  // The rule: a projectId may only be linked to ONE company at a time.
  // If ANY job in a DIFFERENT company already has this projectId, reject.
  if (projectId) {
    const { data: conflict } = await supabase
      .from('jobs')
      .select('id, company_id')
      .eq('companycam_project_id', projectId)
      .neq('company_id', companyId)
      .limit(1)
      .maybeSingle()

    if (conflict) {
      console.warn('[update-companycam] cross-company link attempt blocked', {
        jobId,
        projectId,
        callerCompany: companyId,
        existingCompany: conflict.company_id,
      })
      return NextResponse.json(
        { error: 'This CompanyCam project is linked to another company' },
        { status: 409 }
      )
    }
  }

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
