import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import type { StoreContext } from '@/lib/tenancy'
import { FOLLOWUP_AFTER_DAYS, FOLLOWUP_DAILY_CAP, FOLLOWUP_WITHIN_DAYS } from './lifecycle'

/**
 * The daily job's follow-up step: queues "How's it fitting?" for orders
 * delivered 3 to 14 days ago, one per order (dedupe key order.followup:<id>),
 * at most FOLLOWUP_DAILY_CAP a day. Orders over the cap are picked up tomorrow.
 */
export async function queueOrderFollowups(store: StoreContext, db: SupabaseClient = createSupabaseServiceClient()): Promise<{ queued: number }> {
  const { data, error } = await db.rpc('orders_due_followup', {
    p_tenant: store.tenantId, p_min_days: FOLLOWUP_AFTER_DAYS, p_max_days: FOLLOWUP_WITHIN_DAYS, p_limit: FOLLOWUP_DAILY_CAP,
  })
  if (error) throw error
  let queued = 0
  for (const row of (data ?? []) as { order_id: string }[]) {
    const { data: result, error: qe } = await db.rpc('queue_email_capped', {
      p_tenant: store.tenantId, p_kind: 'order.followup', p_ref_col: 'order_id', p_ref: row.order_id, p_cap: FOLLOWUP_DAILY_CAP, p_skip_over_cap: false,
    })
    if (qe) throw qe
    if (result === 'capped') break
    if (result === 'queued') queued += 1
  }
  return { queued }
}
