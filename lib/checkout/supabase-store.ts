import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { getStorefront } from '@/lib/tenancy'
import { paymentDeps, siteUrl } from '@/lib/payments'
import { startPayment } from '@/lib/payments/service'
import { checkout, type CheckoutPayments, type CheckoutStore, type PromoCode } from './index'

const PRODUCT_COLUMNS =
  'id, name, price, original_price, stock, status, images, category, members_only, purchases_paused, release_date, preorder, preorder_ships_on, preorder_limit, sizes, colors'
const PAID = ['paid', 'partially_refunded', 'refunded']

/** CheckoutStore on Supabase. Server-only: uses the service key. */
export function supabaseCheckoutStore(db: SupabaseClient = createSupabaseServiceClient()): CheckoutStore {
  return {
    async products(storeId, ids) {
      const { data, error } = await db.from('products').select(PRODUCT_COLUMNS).eq('store_id', storeId).in('id', ids)
      if (error) throw error
      return data ?? []
    },

    async giftProducts(storeId, category) {
      const { data, error } = await db.from('products').select(PRODUCT_COLUMNS)
        .eq('store_id', storeId).eq('category', category).eq('status', 'active').order('created_at').limit(40)
      if (error) throw error
      return data ?? []
    },

    async promo(tenantId, code, email) {
      const { data: promo, error } = await db.from('promo_codes')
        .select('id, code, description, kind, value, min_subtotal, starts_at, ends_at, max_uses, once_per_customer, active')
        .eq('tenant_id', tenantId).eq('code', code).maybeSingle()
      if (error) throw error
      if (!promo) return null
      const count = async (byEmail: boolean) => {
        let q = db.from('orders').select('id', { head: true, count: 'exact' })
          .eq('tenant_id', tenantId).eq('promo_code_id', promo.id).in('payment_status', PAID)
        if (byEmail) q = q.ilike('email', email!.replace(/[%_]/g, ''))
        const { count: n, error: e } = await q
        if (e) throw e
        return n ?? 0
      }
      const [uses, customerUses] = await Promise.all([count(false), email ? count(true) : Promise.resolve(0)])
      return { promo: promo as PromoCode, uses, customerUses }
    },

    async save(c) {
      const { data, error } = await db.from('checkouts').insert({
        tenant_id: c.tenantId, store_id: c.storeId, reference: c.reference, order_number: c.orderNumber,
        tracking_number: c.trackingNumber, email: c.email, shipping_address: c.shippingAddress,
        shipping_city: c.shippingCity, shipping_state: c.shippingState, shipping_postal_code: c.shippingPostalCode,
        shipping_country: c.shippingCountry, currency: c.currency, items: c.items, subtotal: c.subtotal,
        discount: c.discount, total: c.total, promo_code_id: c.promoCodeId, promo_code: c.promoCode,
        is_preorder: c.isPreorder, terms_version: c.termsVersion, terms_accepted_at: c.termsAcceptedAt,
      }).select('id').single()
      if (error) throw error
      return { id: data.id }
    },

    async find(storeId, reference) {
      const { data, error } = await db.from('checkouts')
        .select('id, tenant_id, email, total, currency, status, order_id, created_at')
        .eq('store_id', storeId).eq('reference', reference).maybeSingle()
      if (error) throw error
      return data ? {
        id: data.id, tenantId: data.tenant_id, email: String(data.email), total: String(data.total), currency: data.currency,
        status: data.status, orderId: data.order_id, createdAt: data.created_at,
      } : null
    },

    async expire(id) {
      const { error } = await db.from('checkouts').update({ status: 'expired' }).eq('id', id).is('order_id', null)
      if (error) throw error
    },
  }
}

/** CheckoutPayments through lib/payments (Flutterwave), redirecting back to this site. */
function flutterwavePayments(req: Request): CheckoutPayments {
  const deps = paymentDeps()
  return {
    available: () => Boolean(deps.provider),
    async start(p) {
      const result = await startPayment(deps, {
        kind: 'checkout', id: p.checkoutId, tenantId: p.tenantId, amountMinor: p.amountMinor,
        currency: p.currency, email: p.email, description: 'Final Heaven order',
      }, siteUrl(req))
      return result.ok ? { ok: true, paymentUrl: result.checkoutUrl } : { ok: false }
    },
  }
}

/**
 * The store's launch day, pause switch and free-gift offer, read on every
 * request (getStorefront is cached) so a change from the admin applies at once.
 */
async function sellingSwitches(storeId: string, db: SupabaseClient = createSupabaseServiceClient()) {
  const { data, error } = await db.from('stores')
    .select('payments_open_on, purchases_paused, gift_category, gift_min_subtotal').eq('id', storeId).single()
  if (error) throw error
  return {
    paymentsOpenOn: (data.payments_open_on as string | null) ?? null, purchasesPaused: data.purchases_paused === true,
    giftCategory: (data.gift_category as string | null) ?? null, giftMinSubtotal: data.gift_min_subtotal ?? 0,
  }
}

/** The Checkout module wired for this request: Supabase, Flutterwave, this storefront. */
export async function checkoutForRequest(req: Request) {
  const s = await getStorefront()
  return checkout({
    store: supabaseCheckoutStore(),
    payments: flutterwavePayments(req),
    shop: { tenantId: s.tenantId, storeId: s.storeId, currency: s.currency, hiddenCategories: s.hiddenCategories, timeZone: s.timeZone, ...(await sellingSwitches(s.storeId)) },
  })
}
