import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabasePublishableKey, supabaseUrl } from './env'

const isAdmin = (claims: unknown) =>
  (claims as { app_metadata?: { role?: string } } | null)?.app_metadata?.role === 'admin'

/**
 * Refreshes the Supabase session cookie and gates the admin area.
 * Pages redirect to /login; API routes get a 401.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        // Stops CDNs from caching a response that carries a session cookie.
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // Nothing may run between creating the client and this call.
  const { data } = await supabase.auth.getClaims()
  const admin = isAdmin(data?.claims)
  const { pathname } = request.nextUrl

  // Any redirect or 401 must carry over the refreshed cookies from `response`.
  const withCookies = (res: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => res.cookies.set(cookie))
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  }

  if (pathname.startsWith('/api/admin') && !admin) {
    return withCookies(NextResponse.json({ error: 'Not authorized.' }, { status: 401 }))
  }

  if (pathname.startsWith('/admin') && !admin) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname)}`
    return withCookies(NextResponse.redirect(url))
  }

  if (pathname === '/login' && admin) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    url.search = ''
    return withCookies(NextResponse.redirect(url))
  }

  return response
}
