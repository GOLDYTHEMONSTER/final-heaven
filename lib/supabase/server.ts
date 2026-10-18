import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { supabasePublishableKey, supabaseUrl } from './env'

/**
 * Request-scoped client that acts as the signed-in user (session from cookies).
 * Every query runs under RLS with that user's JWT. Create one per request.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}

/**
 * Anonymous client for public catalogue reads. No session, so RLS only
 * exposes what the public policies allow (active products, published drops).
 */
export function createSupabasePublicClient() {
  return createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
