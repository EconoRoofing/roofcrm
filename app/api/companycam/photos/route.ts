import { NextRequest, NextResponse } from 'next/server'
import { getProjectPhotos } from '@/lib/companycam'
import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany } from '@/lib/auth-helpers'

// NO route-segment cache. Previously had `export const revalidate = 300`
// which keys the Next.js data cache by URL only — meaning two different
// authenticated users requesting `?projectId=X` within 5 minutes shared the
// same cached JSON, completely bypassing the per-request ownership check
// below. Audit finding R2-#1: removed entirely.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  let companyId: string
  try {
    ;({ companyId } = await getUserWithCompany())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = req.nextUrl.searchParams.get('projectId')

  if (!projectId) {
    return NextResponse.json({ error: 'projectId query param is required' }, { status: 400 })
  }

  // Verify the requested CompanyCam project is linked to a job in the caller's
  // company. Without this, any logged-in user could pull photos from another
  // company's projects by guessing the project id.
  const supabase = await createClient()
  const { data: linkedJob } = await supabase
    .from('jobs')
    .select('id')
    .eq('company_id', companyId)
    .eq('companycam_project_id', projectId)
    .limit(1)
    .maybeSingle()

  if (!linkedJob) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const photos = await getProjectPhotos(projectId)
  return NextResponse.json(photos)
}
