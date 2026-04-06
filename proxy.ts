import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname

  // Allow unauthenticated access to login and auth routes
  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth/')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Role-based routing — only redirect from root path
  if (user && pathname === '/') {
    const { data } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = data?.role as string | undefined

    const url = request.nextUrl.clone()

    if (role === 'manager') {
      url.pathname = '/pipeline'
      return NextResponse.redirect(url)
    } else if (role === 'sales') {
      url.pathname = '/today'
      return NextResponse.redirect(url)
    } else if (role === 'crew') {
      url.pathname = '/route'
      return NextResponse.redirect(url)
    } else if (role === 'sales_crew') {
      const preferredView = request.cookies.get('preferred_view')?.value
      url.pathname = preferredView === 'sales' ? '/today' : '/route'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
