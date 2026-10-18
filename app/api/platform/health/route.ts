import { NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/auth'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { handle } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Operational health for platform admins: payment pipeline backlog, stuck
 * payments and the last reconciliation run. Counts and timestamps only, no
 * customer or order details, and access is audited by the caller's session.
 */
export const GET = handle('platform.health', async () => {
  if (!(await isPlatformAdmin())) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })

  const db = createSupabaseServiceClient()
  const started = Date.now()
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  }

  const [received, failed, stuck, failedToday, lastRun] = await Promise.all([
    count(db.from('payment_events').select('id', { head: true, count: 'exact' }).eq('status', 'received')),
    count(db.from('payment_events').select('id', { head: true, count: 'exact' }).eq('status', 'failed')),
    count(db.from('payments').select('id', { head: true, count: 'exact' }).in('status', ['initiated', 'pending']).lt('created_at', hourAgo)),
    count(db.from('payment_events').select('id', { head: true, count: 'exact' }).eq('status', 'failed').gte('received_at', dayAgo)),
    db.from('audit_events').select('occurred_at, metadata').eq('action', 'job.payments_reconciled')
      .order('occurred_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const dbMs = Date.now() - started

  return NextResponse.json({
    database: { reachable: true, queryMs: dbMs },
    payments: {
      providerConfigured: Boolean(process.env.FLW_SECRET_KEY && process.env.FLW_SECRET_HASH),
      webhookEventsAwaiting: received,
      webhookEventsFailed: failed,
      webhookFailuresLast24h: failedToday,
      paymentsOpenOverOneHour: stuck,
    },
    jobs: {
      reconcileConfigured: Boolean(process.env.CRON_SECRET),
      lastReconcile: lastRun.data?.occurred_at ?? null,
      lastReconcileSummary: lastRun.data?.metadata ?? null,
    },
    time: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
