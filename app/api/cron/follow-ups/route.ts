import { NextResponse } from 'next/server'
import { processFollowUps } from '@/lib/actions/follow-ups'

// Called by Vercel Cron daily at 9 AM
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processFollowUps()
  return NextResponse.json(result)
}
