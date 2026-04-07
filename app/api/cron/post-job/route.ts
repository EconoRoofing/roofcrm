import { NextResponse } from 'next/server'
import { processPostJobAutomation } from '@/lib/actions/post-job'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await processPostJobAutomation()
  return NextResponse.json(result)
}
