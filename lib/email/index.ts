import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/log'
import { createResendSender } from './resend'
import { deliverQueuedEmails, type DeliverySummary, type EmailConfig, type EmailDeps, type EmailStore } from './outbox'

/** Outbox persistence on Supabase. Server-only: uses the service key. */
export function supabaseEmailStore(db: SupabaseClient = createSupabaseServiceClient()): EmailStore {
  return {
    async claim(limit, maxAttempts) {
      const { data, error } = await db.rpc('claim_email_outbox', { p_limit: limit, p_max_attempts: maxAttempts })
      if (error) throw error
      return (data ?? []).map((r: Record<string, any>) => ({
        id: Number(r.id), kind: r.kind, orderId: r.order_id, messageId: r.message_id, dedupeKey: r.dedupe_key, attempts: r.attempts,
      }))
    },

    async loadOrder(id) {
      const { data, error } = await db.from('orders')
        .select('order_number, email, subtotal, discount, promo_code, total, currency, is_preorder, stock_shortfall, order_items, tracking_number, shipping_city, shipping_state, shipping_carrier, shipping_reference, status')
        .eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null
      const items = Array.isArray(data.order_items) ? data.order_items : []
      return {
        orderNumber: data.order_number, email: data.email, subtotal: data.subtotal, discount: data.discount,
        promoCode: data.promo_code, total: data.total, currency: data.currency, isPreorder: Boolean(data.is_preorder),
        stockShortfall: Array.isArray(data.stock_shortfall) ? data.stock_shortfall : null,
        items: items.map((i: Record<string, any>) => ({
          name: String(i.name ?? 'Item'), quantity: Number(i.quantity ?? 1), size: i.size ?? null, color: i.color ?? null,
          price: i.price ?? 0, preorder: Boolean(i.preorder), shipsOn: i.ships_on ?? null,
        })),
        trackingNumber: data.tracking_number, shippingCity: data.shipping_city, shippingState: data.shipping_state,
        shippingCarrier: data.shipping_carrier, shippingReference: data.shipping_reference, status: data.status,
      }
    },

    async loadMessage(id) {
      const { data, error } = await db.from('contact_messages')
        .select('name, email, topic, order_number, message').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? { name: data.name, email: data.email, topic: data.topic, orderNumber: data.order_number, message: data.message } : null
    },

    async finish(id, result, maxAttempts) {
      const update = result.status === 'sent'
        ? { status: 'sent', provider_message_id: result.providerMessageId, sent_at: new Date().toISOString(), last_error: null, locked_until: null }
        : {
            status: result.status, last_error: result.error.slice(0, 500), locked_until: null,
            // A permanent failure isn't retried: it is given its final attempt.
            ...(result.final ? { attempts: maxAttempts } : {}),
          }
      const { error } = await db.from('email_outbox').update(update).eq('id', id)
      if (error) throw error
    },
  }
}

/** Email settings from the environment, or null when sending isn't set up. */
export function emailConfigFromEnv(): EmailConfig | null {
  const from = process.env.EMAIL_FROM
  if (!process.env.RESEND_API_KEY || !from) return null
  return {
    from,
    replyTo: process.env.EMAIL_REPLY_TO || null,
    staffTo: (process.env.STAFF_ALERT_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    siteUrl: process.env.SITE_URL || 'http://localhost:3000',
  }
}

export function emailDeps(): EmailDeps {
  const apiKey = process.env.RESEND_API_KEY
  return {
    store: supabaseEmailStore(),
    sender: apiKey ? createResendSender({ apiKey }) : null,
    config: emailConfigFromEnv(),
    log: (event, fields) => logger.info(event, fields),
  }
}

/**
 * Sends whatever the database has queued. Called right after the changes that
 * queue email (payment confirmed, order shipped, message received) and by the
 * daily job as the catch-up. Never throws.
 */
export async function sendQueuedEmails(limit = 5): Promise<DeliverySummary> {
  try {
    return await deliverQueuedEmails(emailDeps(), { limit })
  } catch (error) {
    logger.error('email.delivery_failed', { error })
    return { configured: false, sent: 0, failed: 0, skipped: 0 }
  }
}
