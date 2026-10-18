import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabasePublishableKey, supabaseUrl } from './env'

/**
 * Refreshes the Supabase session cookie and turns signed-out visitors away
 * from the admin area (pages redirect to /login, API routes get a 401).
 * It only checks for a valid session: which tenant and which permissions a
 * user has is decided per request by app/admin/layout.tsx, every admin route
 * (requirePermission) and RLS, which this middleware never replaces.
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
  const signedIn = Boolean(data?.claims?.sub)
  const { pathname } = request.nextUrl

  // Any redirect or 401 must carry over the refreshed cookies from `response`.
  const withCookies = (res: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => res.cookies.set(cookie))
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  }

  if (pathname.startsWith('/api/admin') && !signedIn) {
    return withCookies(NextResponse.json({ error: 'Not signed in.' }, { status: 401 }))
  }

  if (pathname.startsWith('/admin') && !signedIn) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname)}`
    return withCookies(NextResponse.redirect(url))
  }

  return response
}
