import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

// Only the routes that need a session. The storefront stays fully static.
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/login'],
}
