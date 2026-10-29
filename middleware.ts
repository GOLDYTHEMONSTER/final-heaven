import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function middleware(request: NextRequest) {
  // Admin writes must come from this site. Session cookies are SameSite=Lax,
  // which already keeps them off cross-site form posts; this refuses any such
  // request outright instead of relying on that alone.
  if (request.nextUrl.pathname.startsWith('/api/admin/') && !SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get('origin')
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 })
    }
  }
  return updateSession(request)
}

// Only the routes that need a session. The storefront stays fully static.
export const config = {
  matcher: ['/studio/:path*', '/api/admin/:path*'],
}
