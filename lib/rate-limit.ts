import 'server-only'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/log'

/** The client IP as Vercel reports it. Only used, hashed, as a rate-limit key. */
export function clientIp(req: Request) {
  return req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

/**
 * Fixed-window limit shared by every serverless instance (counted in Postgres).
 * Returns a 429 response when over the limit, or null to continue.
 * Fails open: if the limiter itself is unavailable the request proceeds and the
 * failure is logged, so a limiter outage cannot take checkout down.
 */
export async function rateLimit(req: Request, bucket: string, limit: number, windowSeconds: number) {
  const salt = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const key = `${bucket}:${createHash('sha256').update(salt).update(clientIp(req)).digest('hex').slice(0, 32)}`
  try {
    const { data, error } = await createSupabaseServiceClient().rpc('rate_limit_hit', {
      p_key: key, p_limit: limit, p_window_seconds: windowSeconds,
    })
    if (error) throw error
    if (data === false) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(windowSeconds) } }
      )
    }
  } catch (error) {
    logger.warn('rate_limit.unavailable', { bucket, error })
  }
  return null
}
