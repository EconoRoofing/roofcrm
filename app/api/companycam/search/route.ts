import { NextRequest, NextResponse } from 'next/server'
import { searchProjectsByAddress } from '@/lib/companycam'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const address = req.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'address query param is required' }, { status: 400 })
  }

  const projects = await searchProjectsByAddress(address)
  return NextResponse.json(projects)
}
