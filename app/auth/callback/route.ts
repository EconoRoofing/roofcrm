import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Audit R5-#10: preserves the `next` query param so a user who was
 * bounced from /jobs/abc → /login → /auth/callback lands back at
 * /jobs/abc after successful sign-in (via /select-profile for profile
 * picking). The `next` value is stashed in a short-lived cookie during
 * the OAuth roundtrip; /select-profile reads it post-selection and
 * redirects there, then clears the cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const origin = new URL(request.url).origin

  // Sanitize to same-origin paths only — prevent open-redirect abuse
  // from a crafted login URL like `?next=https://evil.example/...`.
  // Double-leading-slash also blocked (`//evil.com` is a protocol-relative URL).
  const nextParam = searchParams.get('next')
  const safeNext =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  // Redirect to profile selector — the user will pick their profile there
  const response = NextResponse.redirect(`${origin}/select-profile`)

  if (safeNext) {
    response.cookies.set('post_login_next', safeNext, {
      path: '/',
      httpOnly: true,
      maxAge: 10 * 60, // 10 min — long enough to pick a profile, short enough not to linger
      sameSite: 'lax',
    })
  }
  return response
}
