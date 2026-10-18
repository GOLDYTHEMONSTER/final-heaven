import { NextResponse } from 'next/server'
import { createSupabasePublicClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Liveness for uptime monitors. Deliberately reveals nothing beyond up/degraded. */
export async function GET() {
  const started = Date.now()
  let db: 'up' | 'down' = 'down'
  try {
    const { error } = await createSupabasePublicClient().from('stores').select('id', { head: true, count: 'exact' }).limit(1)
    if (!error) db = 'up'
  } catch {
    // reported as down
  }
  return NextResponse.json(
    { status: db === 'up' ? 'ok' : 'degraded', db, ms: Date.now() - started, time: new Date().toISOString() },
    { status: db === 'up' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
