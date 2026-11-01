import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/log'
import { createResendSender } from './resend'
import { isSuppressed } from './suppression'
import { canBuy, purchaseState, storeToday, type CatalogueProduct } from '@/lib/catalog'
import { ALERT_PRODUCT_COLUMNS } from './alerts-store'
import { deliverQueuedEmails, type DeliverySummary, type EmailConfig, type EmailDeps, type EmailStore } from './outbox'

/** Outbox persistence on Supabase. Server-only: uses the service key. */
export function supabaseEmailStore(db: SupabaseClient = createSupabaseServiceClient()): EmailStore {
  return {
    async claim(limit, maxAttempts) {
      const { data, error } = await db.rpc('claim_email_outbox', { p_limit: limit, p_max_attempts: maxAttempts })
      if (error) throw error
      return (data ?? []).map((r: Record<string, any>) => ({
        id: Number(r.id), tenantId: r.tenant_id, kind: r.kind, orderId: r.order_id, messageId: r.message_id, subscriberId: r.subscriber_id, alertId: r.alert_id, dedupeKey: r.dedupe_key, attempts: r.attempts,
      }))
    },

    async loadOrder(id) {
      const { data, error } = await db.from('orders')
        .select('order_number, email, subtotal, discount, promo_code, total, currency, delivery_option, delivery_fee, delivery_estimate, is_preorder, stock_shortfall, order_items, tracking_number, shipping_city, shipping_state, shipping_carrier, shipping_reference, status, payment_status')
        .eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null
      const items = Array.isArray(data.order_items) ? data.order_items : []
      return {
        orderNumber: data.order_number, email: data.email, subtotal: data.subtotal, discount: data.discount,
        promoCode: data.promo_code, total: data.total, currency: data.currency, isPreorder: Boolean(data.is_preorder),
        deliveryOption: data.delivery_option ?? 'standard', deliveryFee: data.delivery_fee ?? 0, deliveryEstimate: data.delivery_estimate ?? null,
        stockShortfall: Array.isArray(data.stock_shortfall) ? data.stock_shortfall : null,
        items: items.map((i: Record<string, any>) => ({
          name: String(i.name ?? 'Item'), quantity: Number(i.quantity ?? 1), size: i.size ?? null, color: i.color ?? null,
          price: i.price ?? 0, preorder: Boolean(i.preorder), shipsOn: i.ships_on ?? null, gift: Boolean(i.gift), productId: typeof i.id === 'string' ? i.id : null,
          madeToOrderDays: i.made_to_order ? Number(i.lead_time_days) || null : null,
        })),
        trackingNumber: data.tracking_number, shippingCity: data.shipping_city, shippingState: data.shipping_state,
        shippingCarrier: data.shipping_carrier, shippingReference: data.shipping_reference, status: data.status, paymentStatus: data.payment_status,
      }
    },

    async loadMessage(id) {
      const { data, error } = await db.from('contact_messages')
        .select('name, email, topic, order_number, message').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? { name: data.name, email: data.email, topic: data.topic, orderNumber: data.order_number, message: data.message } : null
    },

    async loadSubscriber(id) {
      const { data, error } = await db.from('newsletter_subscribers')
        .select('email, source, unsubscribe_token, unsubscribed_at').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? { email: data.email, source: data.source ?? null, unsubscribeToken: data.unsubscribe_token, unsubscribed: data.unsubscribed_at != null } : null
    },

    async loadAlert(id) {
      const { data, error } = await db.from('product_alerts')
        .select(`email, unsubscribe_token, product:products(${ALERT_PRODUCT_COLUMNS})`).eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null
      const p = data.product as unknown as Record<string, any> | null
      const images = Array.isArray(p?.images) ? (p!.images as { url?: string }[]) : []
      const state = p ? purchaseState(p as CatalogueProduct, storeToday()) : null
      return {
        email: data.email, unsubscribeToken: data.unsubscribe_token,
        product: p ? { id: p.id, name: p.name, price: Number(p.price), image: images[0]?.url ?? null, shipsOn: state?.state === 'preorder' ? state.shipsOn : null } : null,
        buyable: state ? canBuy(state) : false,
      }
    },

    async suppressed(tenantId, email) {
      return isSuppressed(db, tenantId, email)
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
export async function sendQueuedEmails(limit = 5, { deadline }: { deadline?: number } = {}): Promise<DeliverySummary> {
  try {
    // With a deadline (epoch ms), claim only as many as fit: each send takes ~0.9 s with the pause for Resend's rate limit.
    const fit = deadline == null ? limit : Math.min(limit, Math.max(0, Math.floor((deadline - Date.now()) / 900)))
    if (fit === 0) return { configured: true, sent: 0, failed: 0, skipped: 0 }
    return await deliverQueuedEmails(emailDeps(), { limit: fit })
  } catch (error) {
    logger.error('email.delivery_failed', { error })
    return { configured: false, sent: 0, failed: 0, skipped: 0 }
  }
}
