import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const origin = new URL(request.url).origin

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const { session, user } = data

  // Upsert the user into the users table
  const email = user.email ?? ''
  const name =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    email.split('@')[0] ??
    'Unknown'
  const avatar_url = user.user_metadata?.avatar_url ?? null
  const provider_refresh_token = session.provider_refresh_token ?? null

  // Build the upsert payload
  const upsertPayload: {
    id: string
    email: string
    name: string
    avatar_url: string | null
    role: string
    google_refresh_token?: string | null
  } = {
    id: user.id,
    email,
    name,
    avatar_url,
    role: 'crew',
  }

  if (provider_refresh_token) {
    upsertPayload.google_refresh_token = provider_refresh_token
  }

  await supabase
    .from('users')
    .upsert(upsertPayload, {
      onConflict: 'id',
      ignoreDuplicates: false,
    })

  return NextResponse.redirect(`${origin}/`)
}
