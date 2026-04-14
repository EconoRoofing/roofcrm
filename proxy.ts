import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Paths that are PUBLIC — they never require Supabase authentication,
 * never require a profile, and never get redirected to /login.
 *
 * Audit R5-#1: `/portal/*` was missing from this list. Every customer
 * clicking an emailed portal link arrived at `/portal/token` without a
 * Supabase session, hit the unauth redirect, and got 307'd to `/login`
 * — a dead end for customers. The bug was invisible to Mario because
 * he always tested the portal from his own browser with an active
 * Supabase session. Portal auth is TOKEN-based, not session-based; the
 * page handler (`app/portal/[token]/page.tsx`) validates the token via
 * `resolveLiveJobByPortalToken` and enforces the rate limit via
 * `check_portal_rate_limit` RPC. Middleware should stay out of its way.
 */
const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/auth/',
  '/portal/',  // customer-facing token-gated portal (R5-#1)
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Audit R5-#1: bail out immediately for public paths BEFORE touching
  // Supabase. The previous version called getUser() first and then
  // checked the path, which forced a Supabase round-trip on every
  // portal page view for a customer who has no session to refresh.
  // Bailing early saves that round-trip and ensures customers never
  // get near the auth-redirect branch.
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session if it exists
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Unauthenticated → redirect to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Skip profile check for select-profile route
  if (pathname.startsWith('/select-profile')) {
    return supabaseResponse
  }

  // If authenticated but no active profile cookie, redirect to profile selector
  if (user) {
    const activeProfileId = request.cookies.get('active_profile_id')?.value

    if (!activeProfileId) {
      const url = request.nextUrl.clone()
      url.pathname = '/select-profile'
      return NextResponse.redirect(url)
    }

    // Verify profile exists AND is active — security check
    const { data: profileCheck } = await supabase
      .from('users')
      .select('id, is_active')
      .eq('id', activeProfileId)
      .single()

    if (!profileCheck || !profileCheck.is_active) {
      // Profile is inactive or deleted — clear cookie and redirect
      const url = request.nextUrl.clone()
      url.pathname = '/select-profile'
      const response = NextResponse.redirect(url)
      response.cookies.delete('active_profile_id')
      return response
    }

    // Role-based routing — only redirect from root path
    if (pathname === '/') {
      // Check cookie cache first to avoid a DB query on every navigation
      const roleCookieName = `profile_role_${activeProfileId}`
      const cachedRole = request.cookies.get(roleCookieName)?.value

      let role: string | undefined

      if (cachedRole) {
        role = cachedRole
      } else {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', activeProfileId)
          .single()
        role = data?.role as string | undefined

        // Cache in cookie for 1 hour
        if (role) {
          supabaseResponse.cookies.set(roleCookieName, role, {
            path: '/',
            httpOnly: true,
            maxAge: 3600,
            sameSite: 'lax',
          })
        }
      }

      const url = request.nextUrl.clone()

      if (role === 'owner' || role === 'office_manager') {
        url.pathname = '/home'
        return NextResponse.redirect(url)
      } else if (role === 'sales') {
        url.pathname = '/today'
        return NextResponse.redirect(url)
      } else if (role === 'crew') {
        url.pathname = '/route'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  // Audit R5-#3: previously the matcher only excluded static assets and
  // image files, which meant middleware ran on `/api/*` routes too. That
  // caused two silent breakages:
  //
  //   1. Google Calendar webhook (POST /api/calendar/webhook) arrived
  //      without a Supabase session. Middleware saw `user === null` and
  //      307-redirected to /login. Google treats redirects as non-success
  //      and retries with exponential backoff until it gives up. External
  //      calendar-edit sync has been silently broken.
  //   2. Vercel Cron (GET /api/cron/daily) same issue. Cron requests
  //      carry a Bearer CRON_SECRET header that the route handler checks
  //      — middleware runs first and blocks them.
  //   3. /api/ping (the offline-banner probe from R4-#13) pays a full
  //      Supabase getUser() round-trip on every call, defeating its
  //      purpose as a zero-cost health check.
  //
  // API routes that need auth enforce it themselves via
  // `getUserWithCompany()` inside the handler. Routes that use custom
  // auth (webhooks, crons) verify their own credentials. Middleware's
  // session-refresh responsibility only matters for user-facing pages,
  // which still go through this matcher.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
