import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { paymentsState, storeToday } from '@/lib/catalog'
import type { StoreContext } from '@/lib/tenancy'
import { ALERT_DAILY_CAP, ALERT_SCAN_LIMIT, readyAlerts } from './alerts'

/** The columns purchaseState reads, plus what the alert email shows. */
export const ALERT_PRODUCT_COLUMNS = 'id, name, price, images, category, status, purchases_paused, members_only, preorder, preorder_ships_on, preorder_limit, release_date, stock'

export type AlertRun = { queued: number; waiting: number; skipped?: string }

/**
 * The daily job's alert step: queues the email for every waiting alert whose
 * product can now be bought, up to the day's cap, and stamps notified_at so it
 * is never queued again. Nothing is queued while checkout is closed (an
 * "available now" email that leads to a closed checkout would only disappoint).
 */
export async function queueProductAlerts(store: StoreContext, db: SupabaseClient = createSupabaseServiceClient(), now = new Date()): Promise<AlertRun> {
  const today = storeToday(store.timeZone, now)
  const { data: shop, error: se } = await db.from('stores').select('payments_open_on, purchases_paused').eq('id', store.storeId).single()
  if (se) throw se
  if (!paymentsState({ paymentsOpenOn: shop.payments_open_on ?? null, purchasesPaused: shop.purchases_paused === true }, today).open) {
    return { queued: 0, waiting: 0, skipped: 'checkout is closed' }
  }

  const { data, error } = await db.from('product_alerts')
    .select(`id, product:products(${ALERT_PRODUCT_COLUMNS})`)
    .eq('tenant_id', store.tenantId).is('notified_at', null).order('created_at').limit(ALERT_SCAN_LIMIT)
  if (error) throw error
  const rows = (data ?? []) as unknown as { id: string; product: Record<string, any> | null }[]
  const ready = readyAlerts(rows.map((r) => ({ id: r.id, product: r.product })), today, store.hiddenCategories)

  const done: string[] = []
  for (const id of ready) {
    const { data: result, error: qe } = await db.rpc('queue_email_capped', {
      p_tenant: store.tenantId, p_kind: 'product.available', p_ref_col: 'alert_id', p_ref: id, p_cap: ALERT_DAILY_CAP, p_skip_over_cap: false,
    })
    if (qe) throw qe
    if (result === 'capped') break // the rest wait for tomorrow
    done.push(id) // queued, or already was
  }
  if (done.length) {
    const { error: ue } = await db.from('product_alerts').update({ notified_at: now.toISOString() }).in('id', done)
    if (ue) throw ue
  }
  return { queued: done.length, waiting: rows.length - done.length }
}
