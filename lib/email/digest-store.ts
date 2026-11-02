import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { storeToday } from '@/lib/catalog'
import type { StoreContext } from '@/lib/tenancy'
import { createResendSender } from './resend'
import { emailConfigFromEnv } from './index'
import { digestIsEmpty, LOW_STOCK_AT, staffDigestEmail, topReasons, type DigestData } from './digest'

const DAY_MS = 86_400_000

/** What happened in the 24 hours up to `now`, for this store. */
export async function gatherDigest(store: StoreContext, db: SupabaseClient, now = new Date()): Promise<DigestData> {
  const since = new Date(now.getTime() - DAY_MS).toISOString()
  const ok = <T>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return (r.data ?? []) as T }

  const [paid, messages, subs, low, outbox, events, held, tickets] = await Promise.all([
    db.from('orders').select('total, currency').eq('tenant_id', store.tenantId).eq('payment_status', 'paid').gte('created_at', since),
    db.from('contact_messages').select('id', { count: 'exact', head: true }).eq('tenant_id', store.tenantId).gte('created_at', since),
    db.from('newsletter_subscribers').select('source').eq('tenant_id', store.tenantId).gte('subscribed_at', since),
    db.from('products').select('id, name, stock').eq('store_id', store.storeId).eq('status', 'active').eq('fulfilment', 'stock')
      .lte('stock', LOW_STOCK_AT).order('stock').order('name').limit(20),
    db.from('email_outbox').select('status, last_error').eq('tenant_id', store.tenantId).in('status', ['failed', 'skipped']).gte('created_at', since),
    db.from('email_events').select('type').in('type', ['email.bounced', 'email.complained']).gte('created_at', since),
    db.from('email_batches').select('id', { count: 'exact', head: true }).eq('tenant_id', store.tenantId).eq('status', 'held'),
    db.from('ticket_orders').select('total, tickets(id)').eq('tenant_id', store.tenantId).eq('payment_status', 'paid').gte('created_at', since),
  ])
  if (messages.error) throw messages.error
  if (held.error) throw held.error

  const paidRows = ok<{ total: string | number; currency: string }[]>(paid)
  const subscribers: Record<string, number> = {}
  for (const s of ok<{ source: string | null }[]>(subs)) subscribers[s.source ?? 'footer'] = (subscribers[s.source ?? 'footer'] ?? 0) + 1
  const problems = ok<{ status: string; last_error: string | null }[]>(outbox)
  const eventTypes = ok<{ type: string }[]>(events)
  const ticketRows = ok<{ total: string | number; tickets: unknown[] | null }[]>(tickets)
  return {
    paid: { count: paidRows.length, total: paidRows.reduce((sum, r) => sum + Number(r.total), 0), currency: paidRows[0]?.currency ?? store.currency },
    messages: messages.count ?? 0,
    subscribers,
    lowStock: ok<{ id: string; name: string; stock: number }[]>(low).map((p) => ({ id: p.id, name: p.name, stock: Number(p.stock) })),
    emailsFailed: problems.filter((r) => r.status === 'failed').length,
    emailsSkipped: problems.filter((r) => r.status === 'skipped').length,
    emailProblems: topReasons(problems.map((r) => r.last_error)),
    bounces: eventTypes.filter((e) => e.type === 'email.bounced').length,
    complaints: eventTypes.filter((e) => e.type === 'email.complained').length,
    heldBatches: held.count ?? 0,
    tickets: { count: ticketRows.reduce((n, r) => n + (r.tickets?.length ?? 0), 0), total: ticketRows.reduce((sum, r) => sum + Number(r.total), 0) },
  }
}

/**
 * The daily job's digest step. One email a day to STAFF_ALERT_EMAIL; nothing
 * when everything is zero, when no staff address is set, or when email isn't
 * configured. The idempotency key is the store day, so a re-run the same day
 * can't send a second one.
 */
export async function sendStaffDigest(store: StoreContext, db: SupabaseClient = createSupabaseServiceClient(), now = new Date()): Promise<{ state: 'sent' | 'empty' | 'not_configured' }> {
  const config = emailConfigFromEnv()
  const apiKey = process.env.RESEND_API_KEY
  if (!config || !apiKey || !config.staffTo.length) return { state: 'not_configured' }
  const data = await gatherDigest(store, db, now)
  if (digestIsEmpty(data)) return { state: 'empty' }
  const day = storeToday(store.timeZone, now)
  const email = staffDigestEmail(data, { site: config.siteUrl.replace(/\/$/, ''), day })
  await createResendSender({ apiKey }).send(
    { from: config.from, to: config.staffTo, replyTo: null, ...email, tags: [{ name: 'kind', value: 'staff_digest' }] },
    `staff-digest:${store.storeId}:${day}`,
  )
  return { state: 'sent' }
}
