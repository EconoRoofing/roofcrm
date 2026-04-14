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

  // Calendar fix (2026-04): persist Google's refresh token onto
  // public.users.google_refresh_token. Without this, every sign-in
  // silently dropped Google's refresh token and Calendar sync relied on
  // a grandfathered token that was manually seeded via SQL. When
  // `invalid_grant` finally cleared that grandfathered row, Calendar
  // sync went permanently silent with nothing in the UI to recover it.
  //
  // provider_refresh_token is only present on first consent AND on
  // subsequent sign-ins that use `prompt: 'consent'` + `access_type:
  // 'offline'` — both of which lib/auth-client.ts sets. On the rare
  // response where Google omits it (network retry, edge case), we
  // preserve whatever is already in the DB instead of blanking it.
  //
  // Uses the service-role client because the just-exchanged session
  // cookie hasn't been set on this response yet, so the anon client's
  // auth.uid() evaluation can't see the user. Same pattern as
  // lib/google-calendar.ts and lib/actions/days-off-sync.ts.
  const providerRefreshToken = data.session.provider_refresh_token
  if (providerRefreshToken && data.session.user?.id) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/service')
      const svc = createServiceClient()
      if (svc) {
        const { error: updateErr } = await svc
          .from('users')
          .update({ google_refresh_token: providerRefreshToken })
          .eq('id', data.session.user.id)
        if (updateErr) {
          console.error(
            `Auth callback: failed to persist google_refresh_token for user ${data.session.user.id}:`,
            updateErr
          )
        } else {
          console.log(
            `Auth callback: persisted google_refresh_token for user ${data.session.user.id}`
          )
        }
      } else {
        console.error(
          'Auth callback: SUPABASE_SERVICE_ROLE_KEY not configured — cannot persist google_refresh_token'
        )
      }
    } catch (err) {
      // Never block sign-in on a calendar token write failure —
      // the user can still use the app, Calendar sync just won't work
      // until the next successful sign-in.
      console.error('Auth callback: unexpected error persisting google_refresh_token:', err)
    }
  } else if (!providerRefreshToken) {
    console.warn(
      `Auth callback: no provider_refresh_token in session for user ${data.session.user?.id ?? 'unknown'} — Calendar sync will not work until next sign-in with consent prompt`
    )
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
