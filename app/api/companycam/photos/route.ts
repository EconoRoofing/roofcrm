import { NextRequest, NextResponse } from 'next/server'
import { getProjectPhotos } from '@/lib/companycam'

export const revalidate = 300 // Cache for 5 minutes via Next.js route segment config

export async function GET(req: NextRequest): Promise<NextResponse> {
  const projectId = req.nextUrl.searchParams.get('projectId')

  if (!projectId) {
    return NextResponse.json({ error: 'projectId query param is required' }, { status: 400 })
  }

  const photos = await getProjectPhotos(projectId)
  return NextResponse.json(photos)
}
