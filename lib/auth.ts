import 'server-only'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type JwtClaims = { sub: string; email?: string; app_metadata?: { role?: string } }

/**
 * Admins are users whose app_metadata.role is "admin". app_metadata can only be
 * set with the service key (SQL or dashboard), never by the user, unlike
 * user_metadata, which users can edit and must never be used for authorization.
 */
export function isAdminClaims(claims: unknown): claims is JwtClaims {
  return (claims as JwtClaims | null)?.app_metadata?.role === 'admin'
}

/** Verified admin session for Server Components and route handlers, or null. */
export async function getAdmin(): Promise<{ supabase: SupabaseClient; claims: JwtClaims } | null> {
  const supabase = createSupabaseServerClient()
  // getClaims() verifies the JWT signature; getSession() would trust the cookie as-is.
  const { data, error } = await supabase.auth.getClaims()
  if (error || !isAdminClaims(data?.claims)) return null
  return { supabase, claims: data.claims as JwtClaims }
}

/**
 * Guard for /api/admin route handlers. The middleware checks too, but each
 * handler re-checks so a middleware bypass cannot expose admin data.
 */
export async function requireAdmin() {
  const admin = await getAdmin()
  if (!admin) {
    return { admin: null, denied: NextResponse.json({ error: 'Not authorized.' }, { status: 401 }) } as const
  }
  return { admin, denied: null } as const
}
