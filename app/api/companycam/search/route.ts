import { NextRequest, NextResponse } from 'next/server'
import { searchProjectsByAddress } from '@/lib/companycam'
import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, requireEstimateEditor } from '@/lib/auth-helpers'

export async function GET(req: NextRequest): Promise<NextResponse> {
  let companyId: string
  let role: string | null
  try {
    ;({ companyId, role } = await getUserWithCompany())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Searching for a CompanyCam project to link is a job-edit operation —
  // crew shouldn't be enumerating projects across the shared CompanyCam tenant.
  try {
    requireEstimateEditor(role)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const address = req.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'address query param is required' }, { status: 400 })
  }

  // Only allow searching by an address that belongs to a real job in the caller's
  // company. This prevents a sales user from one company from enumerating
  // CompanyCam projects from another company under the same shared tenant.
  const supabase = await createClient()
  const { data: matchingJob } = await supabase
    .from('jobs')
    .select('id')
    .eq('company_id', companyId)
    .eq('address', address)
    .limit(1)
    .maybeSingle()

  if (!matchingJob) {
    return NextResponse.json({ error: 'No matching job in your company' }, { status: 404 })
  }

  const projects = await searchProjectsByAddress(address)
  return NextResponse.json(projects)
}
