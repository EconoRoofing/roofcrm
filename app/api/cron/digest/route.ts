import { NextResponse } from 'next/server'
import { sendDailyDigest } from '@/lib/actions/digest'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await sendDailyDigest()
  return NextResponse.json({ sent: result })
}
