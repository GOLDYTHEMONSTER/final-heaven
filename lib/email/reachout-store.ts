import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { paymentsState, storeMoment, storeToday } from '@/lib/catalog'
import type { StoreContext } from '@/lib/tenancy'
import { isAudience } from './campaign'
import { addToHeldBatch, batchContent, copyHash, lastContacts, type NewRecipient } from './batches-store'
import { isEarly } from '@/lib/early-access'
import { suppressedAmong } from './suppression'
import {
  RETARGET_REPEAT_DAYS, TRIGGERS, eligible, launchDue, lowStockViewedDue, nurtureDue, reviewAskDue, triggerContent, viewedTwiceDue, welcomeBackfillDue, winbackDue,
  type BatchTrigger, type DeliveredOrder, type Due, type PaidOrder, type Person, type View,
} from './reachout'

const DAY_MS = 86_400_000

/**
 * Views of products by subscribers, for retargeting (R1, R2).
 * TODO: nothing links a view to a subscriber yet. analytics_events keeps only a
 * daily-rotating visitor hash (visitor_day) and no email, by design (02-analytics-and-compliance),
 * so "this subscriber viewed this product twice" can't be answered without new tracking: for
 * example a first-party cookie set when someone subscribes, with the owner's consent wording
 * extended to cover it. Until that exists this returns nothing and R1/R2 queue nobody.
 */
async function subscriberViews(_db: SupabaseClient, _tenantId: string, _since: Date): Promise<View[]> {
  return []
}

/**
 * Held welcome batches made before the early access offer existed still have
 * the plain welcome. One whose words are exactly the plain welcome (nobody has
 * reworded it) gets the early access welcome instead; an edited one is left alone.
 */
async function addEarlyToHeldWelcomes(db: SupabaseClient, tenantId: string) {
  const { data, error } = await db.from('email_batches').select('id, trigger, list, subject, preheader, heading, body, cta_label, cta_url')
    .eq('tenant_id', tenantId).eq('status', 'held').in('trigger', ['welcome_backfill', 'welcome'])
  if (error) throw error
  for (const b of data ?? []) {
    if (copyHash(batchContent(b)) !== copyHash(triggerContent(b.trigger as BatchTrigger, b.list))) continue
    const c = triggerContent(b.trigger as BatchTrigger, b.list, true)
    const { error: ue } = await db.from('email_batches').update({ body: c.body, preheader: c.preheader }).eq('id', b.id).eq('status', 'held')
    if (ue) throw ue
  }
}

export type ReachoutRun = Partial<Record<BatchTrigger, number>> & { retargeting?: string; skipped?: string }

/**
 * The daily job's marketing step: finds who qualifies for each trigger and
 * puts them in that trigger's held batch (Studio → Outbox). Nothing is sent
 * from here. Every trigger obeys the same rules: consented and still
 * subscribed, not suppressed, nobody contacted in the last 3 days, and no
 * trigger twice to the same person. Safe to re-run: people already in a batch
 * are not added again.
 */
export async function queueMarketingBatches(store: StoreContext, db: SupabaseClient = createSupabaseServiceClient(), now = new Date()): Promise<ReachoutRun> {
  const tenantId = store.tenantId
  const ok = <T>(r: { data: T[] | null; error: unknown }): T[] => { if (r.error) throw r.error; return r.data ?? [] }

  const subs = ok<{ id: string; email: string; source: string | null; subscribed_at: string; consented_at: string | null; unsubscribed_at: string | null }>(
    await db.from('newsletter_subscribers').select('id, email, source, subscribed_at, consented_at, unsubscribed_at')
      .eq('tenant_id', tenantId).is('unsubscribed_at', null).not('consented_at', 'is', null).limit(5000))
  const people: Person[] = subs.map((s) => ({ id: s.id, email: s.email, source: s.source, subscribedAt: s.subscribed_at, consentedAt: s.consented_at, unsubscribedAt: s.unsubscribed_at }))
  const run: ReachoutRun = {}
  if (!people.length) return run

  const [suppressed, lastContact] = await Promise.all([suppressedAmong(db, tenantId, people.map((p) => p.email)), lastContacts(db, tenantId, now)])
  const { data: shop, error: se } = await db.from('stores').select('payments_open_on, payments_open_time, purchases_paused, launch_email_sent_at').eq('id', store.storeId).single()
  if (se) throw se
  // Before checkout opens, welcomes carry the early access offer (lib/early-access).
  const early = isEarly(shop.payments_open_on ?? null, storeMoment(store.timeZone, now), shop.payments_open_time ?? null)
  if (early) await addEarlyToHeldWelcomes(db, tenantId)
  const hadIn = async (triggers: BatchTrigger[], withinDays?: number) => {
    let q = db.from('email_batch_recipients').select('subscriber_id').eq('tenant_id', tenantId).in('trigger', triggers)
    if (withinDays) q = q.gte('created_at', new Date(now.getTime() - withinDays * DAY_MS).toISOString())
    return new Set(ok<{ subscriber_id: string }>(await q).map((r) => r.subscriber_id))
  }

  /** Applies the rules to `due` and adds whoever remains to the trigger's held batch (one per list for the welcome). */
  async function submit(trigger: BatchTrigger, due: Due[], had: Set<string>) {
    const gate = { now, suppressed, lastContact, had }
    const lists = new Map<string, Due[]>()
    for (const d of eligible(due, gate)) {
      const list = trigger === 'welcome_backfill' || trigger === 'welcome' ? (isAudience(d.person.source) ? d.person.source : 'footer') : ''
      lists.set(list, [...(lists.get(list) ?? []), d])
    }
    let added = 0
    for (const [list, group] of lists) {
      const recipients: NewRecipient[] = group.map((d) => ({ subscriberId: d.person.id, email: d.person.email, productId: d.productId, why: d.why }))
      added += (await addToHeldBatch(db, {
        tenantId, trigger, list: list || null, content: triggerContent(trigger, list || null, early), reason: TRIGGERS[trigger].why, recipients,
      })).added
      // Whoever just got a place can't also be put in another batch today.
      for (const d of group) lastContact.set(d.person.id, now)
    }
    run[trigger] = added
  }

  // M1: everyone never welcomed (the welcome the sign-up sends, or one already held or sent in a batch, counts).
  const welcomedRows = ok<{ subscriber_id: string }>(await db.from('email_outbox').select('subscriber_id')
    .eq('tenant_id', tenantId).eq('kind', 'subscriber.welcome').in('status', ['queued', 'sending', 'sent']))
  await submit('welcome_backfill', welcomeBackfillDue(people, new Set(welcomedRows.map((r) => r.subscriber_id))), await hadIn(['welcome_backfill', 'welcome']))

  // Who has ordered, and when: the paid orders that weren't cancelled.
  const orders = ok<{ id: string; email: string; created_at: string; status: string; order_items: unknown }>(
    await db.from('orders').select('id, email, created_at, status, order_items')
      .eq('tenant_id', tenantId).in('payment_status', ['paid', 'partially_refunded']).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(5000))
  const buyers = new Set(orders.map((o) => o.email.trim().toLowerCase()))
  const firstPiece = (items: unknown) => {
    const list = Array.isArray(items) ? (items as Record<string, unknown>[]) : []
    const pick = list.find((i) => typeof i.id === 'string' && !i.gift)
    return pick ? String(pick.id) : null
  }

  // M3, M4: nurture.
  await submit('nurture_3d', nurtureDue('nurture_3d', people, buyers, now), await hadIn(['nurture_3d']))
  await submit('nurture_7d', nurtureDue('nurture_7d', people, buyers, now), await hadIn(['nurture_7d']))

  // M5: the launch waitlist, once checkout has opened (and never after the launch email has gone).
  if (!shop.launch_email_sent_at && paymentsState({ paymentsOpenOn: shop.payments_open_on ?? null, paymentsOpenTime: shop.payments_open_time ?? null, purchasesPaused: shop.purchases_paused === true }, storeMoment(store.timeZone, now)).open) {
    await submit('launch', launchDue(people), await hadIn(['launch']))
  }

  // R1, R2: retargeting. See subscriberViews: no views can be tied to a subscriber yet.
  const views = await subscriberViews(db, tenantId, new Date(now.getTime() - 7 * DAY_MS))
  if (!views.length) run.retargeting = 'no product views are linked to subscribers yet'
  else {
    const byId = new Map(people.map((p) => [p.id, p]))
    const { data: lowRows, error: le } = await db.from('products').select('id').eq('store_id', store.storeId).eq('status', 'active').eq('fulfilment', 'stock').gte('stock', 1).lte('stock', 3)
    if (le) throw le
    const low = new Set((lowRows ?? []).map((r) => String(r.id)))
    const noPurchases = new Map<string, Set<string>>() // TODO: map orders to subscriber ids when views are linked
    await submit('rt_viewed', viewedTwiceDue(views, byId, noPurchases, now), await hadIn(['rt_viewed'], RETARGET_REPEAT_DAYS))
    await submit('rt_low_stock', lowStockViewedDue(views, byId, low, noPurchases, now), await hadIn(['rt_low_stock'], RETARGET_REPEAT_DAYS))
  }

  // W1: a review ask three weeks after delivery.
  const byOrder = new Map(orders.map((o) => [o.id, o]))
  const delivered = ok<{ order_id: string; occurred_at: string }>(
    await db.from('order_events').select('order_id, occurred_at').eq('tenant_id', tenantId).eq('event_type', 'status_changed').eq('to_value', 'delivered')
      .gte('occurred_at', new Date(now.getTime() - 28 * DAY_MS).toISOString()).lte('occurred_at', new Date(now.getTime() - 21 * DAY_MS).toISOString()))
  const deliveredOrders: DeliveredOrder[] = delivered.flatMap((d) => {
    const o = byOrder.get(d.order_id)
    return o && o.status === 'delivered' ? [{ email: o.email, deliveredAt: d.occurred_at, productId: firstPiece(o.order_items) }] : []
  })
  await submit('review_ask', reviewAskDue(deliveredOrders, people, now), await hadIn(['review_ask']))

  // W2, W3: win-back after 120 and 180 days.
  const paid: PaidOrder[] = orders.map((o) => ({ email: o.email, paidAt: o.created_at, productId: null }))
  await submit('winback_120', winbackDue('winback_120', paid, people, now), await hadIn(['winback_120']))
  await submit('winback_180', winbackDue('winback_180', paid, people, now), await hadIn(['winback_180']))
  return run
}
