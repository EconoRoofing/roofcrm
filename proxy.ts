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

  // Unauthenticated → redirect to login, preserving the original target
  // so the login handler can send the user back after a successful sign-in.
  // Audit R5-#10: previously the `next` param was dropped, so every user
  // who tried to open /jobs/abc unauthenticated got bounced through /login
  // → role home, never to their actual target.
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Only preserve `next` for non-root paths — /login?next=/ is noise.
    if (pathname !== '/') {
      url.searchParams.set('next', pathname + request.nextUrl.search)
    }
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

    // Audit R5-#11: avoid a Supabase round-trip on every navigation by
    // caching "this profile id exists and is active" in a short-lived
    // cookie. The check is still a security signal — we want a deleted
    // or deactivated profile to lose access quickly — but 5 minutes is
    // the right tradeoff for a small-team CRM (admin actions already
    // clear this cookie on role changes via updateProfile, and a
    // deleted profile gets caught on its next mutation attempt via the
    // server-action layer, not just the middleware).
    //
    // Also switched `.single()` → `.maybeSingle()` so a deleted profile
    // row doesn't raise PGRST116 as an error. The null check below
    // already handles the "not found" case.
    const validityCookieName = `profile_valid_${activeProfileId}`
    const validityCache = request.cookies.get(validityCookieName)?.value

    if (validityCache !== 'true') {
      const { data: profileCheck } = await supabase
        .from('users')
        .select('id, is_active')
        .eq('id', activeProfileId)
        .maybeSingle()

      if (!profileCheck || !profileCheck.is_active) {
        // Profile is inactive or deleted — clear both cookies and redirect
        const url = request.nextUrl.clone()
        url.pathname = '/select-profile'
        const response = NextResponse.redirect(url)
        response.cookies.delete('active_profile_id')
        response.cookies.delete(`profile_role_${activeProfileId}`)
        return response
      }

      // Cache validity for 5 minutes. Short TTL keeps deleted profiles
      // from lingering too long; long enough to skip the check on the
      // typical page-navigation burst.
      supabaseResponse.cookies.set(validityCookieName, 'true', {
        path: '/',
        httpOnly: true,
        maxAge: 5 * 60,
        sameSite: 'lax',
      })
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
  //
  // Audit 2026-04-19: also exclude /manifest.webmanifest and /sw.js.
  // Browsers fetch BOTH without credentials by default (PWA manifest
  // fetches are anonymous unless <link rel="manifest" crossOrigin=
  // "use-credentials">; service worker registration checks are
  // credentialless on every page load). Running middleware on these
  // treated every fetch as "no user" and redirected to /login, so the
  // browser burned TWO extra round-trips on EVERY page navigation:
  //   1. GET /manifest.webmanifest → 307 /login → 304
  //   2. GET /sw.js                → 307 /login → 304
  // On mobile networks that's 200-400ms of pure waste per navigation.
  // These files are static and contain no user data — middleware has
  // no reason to touch them.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
