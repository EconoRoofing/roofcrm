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

  // Check if user already exists (don't overwrite their role)
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single()

  if (existingUser) {
    // Existing user — update name/avatar/refresh token but NOT role
    const updatePayload: Record<string, unknown> = { name, avatar_url }
    if (provider_refresh_token) {
      updatePayload.google_refresh_token = provider_refresh_token
    }
    await supabase.from('users').update(updatePayload).eq('id', user.id)
  } else {
    // New user — insert with default role 'crew'
    const insertPayload: Record<string, unknown> = {
      id: user.id,
      email,
      name,
      avatar_url,
      role: 'crew',
    }
    if (provider_refresh_token) {
      insertPayload.google_refresh_token = provider_refresh_token
    }
    await supabase.from('users').insert(insertPayload)
  }

  return NextResponse.redirect(`${origin}/`)
}
