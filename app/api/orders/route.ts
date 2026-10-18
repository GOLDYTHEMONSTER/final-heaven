import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, readJson, reference, text } from '@/lib/api'
import { fromMinor } from '@/lib/money'
import { priceOrder } from '@/lib/orders'
import { parseItems, parsePromoCode, quoteForStore } from '@/lib/checkout'
import { getStorefront } from '@/lib/tenancy'
import { POLICY } from '@/lib/legal'
import { rateLimit } from '@/lib/rate-limit'
import { paymentDeps, siteUrl } from '@/lib/payments'
import { startPayment } from '@/lib/payments/service'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

/**
 * Checkout. Prices the cart from the database (never the browser), saves a
 * checkout and returns a Flutterwave payment link. No order exists yet: the
 * order, its number and tracking are created only when Flutterwave confirms
 * the payment (apply_verified_payment). Without online payment, nothing is
 * taken at all.
 */
export const POST = handle('orders.create', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'orders.create', 10, 600)
  if (limited) return limited

  const body = await readJson(req)
  const customerEmail = email(body.email)
  const shippingAddress = text(body.shippingAddress, 'Shipping address', { max: 300, required: true })
  const shippingCity = text(body.shippingCity, 'City', { max: 100, required: true })
  const shippingState = text(body.shippingState, 'State', { max: 100 })
  const shippingPostalCode = text(body.shippingPostalCode, 'Postal code', { max: 20, required: true })
  const shippingCountry = text(body.shippingCountry, 'Country', { max: 100, required: true })
  if (shippingCountry!.toLowerCase() !== POLICY.shipsTo.toLowerCase()) throw new BadRequest(`We deliver within ${POLICY.shipsTo} only.`)
  const lines = parseItems(body.items)
  const promoCode = parsePromoCode(body.promoCode)
  if (body.termsAccepted !== true) throw new BadRequest('Please accept the Terms of Sale and Returns Policy to place your order.')

  // The cart is checked first, so the customer hears the real problem (stock, availability, promo).
  const store = await getStorefront()
  const db = createSupabaseServiceClient()
  const { products, options } = await quoteForStore(db, store, { lines, promoCode, email: customerEmail })
  const priced = priceOrder(lines, products, store.currency, options)

  const deps = paymentDeps()
  if (!deps.provider) {
    return NextResponse.json({ error: 'Online payment is unavailable right now, so we can’t take orders. Please try again shortly.' }, { status: 503 })
  }

  const checkoutRef = reference('CHK', 12)
  const { data: checkout, error: insertError } = await db.from('checkouts').insert({
    tenant_id: store.tenantId,
    store_id: store.storeId,
    reference: checkoutRef,
    order_number: reference('FH'),
    tracking_number: reference('TRK'),
    email: customerEmail,
    shipping_address: shippingAddress,
    shipping_city: shippingCity,
    shipping_state: shippingState,
    shipping_postal_code: shippingPostalCode,
    shipping_country: shippingCountry,
    currency: store.currency,
    items: priced.items,
    subtotal: fromMinor(priced.subtotalMinor, store.currency),
    discount: fromMinor(priced.discountMinor, store.currency),
    total: fromMinor(priced.totalMinor, store.currency),
    promo_code_id: priced.promo?.id ?? null,
    promo_code: priced.promo?.code ?? null,
    is_preorder: priced.isPreorder,
    terms_version: POLICY.termsVersion,
    terms_accepted_at: new Date().toISOString(),
  }).select('id').single()
  if (insertError) throw insertError

  const payment = await startPayment(deps, {
    kind: 'checkout', id: checkout.id, tenantId: store.tenantId, amountMinor: priced.totalMinor,
    currency: store.currency, email: customerEmail, description: 'Final Heaven order',
  }, siteUrl(req))
  if (!payment.ok) {
    return NextResponse.json({ error: 'We couldn’t reach Flutterwave just now. Nothing was charged. Please try again.' }, { status: 503 })
  }

  return NextResponse.json({
    checkout: checkoutRef,
    paymentUrl: payment.checkoutUrl,
    total: fromMinor(priced.totalMinor, store.currency),
    currency: store.currency,
  }, { status: 201 })
})

const REFERENCE = /^[A-Z0-9-]{4,40}$/

/**
 * Order tracking. The customer must give BOTH the order (or tracking) number and
 * the email it was placed with, and gets back only what tracking needs: no
 * street address and no email. Wrong number and wrong email return the same 404.
 * Only placed (paid) orders exist here.
 */
export const GET = handle('orders.track', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'orders.track', 20, 600)
  if (limited) return limited

  const params = new URL(req.url).searchParams
  const ref = (params.get('reference') || '').trim().toUpperCase()
  const customerEmail = email(params.get('email'))
  if (!REFERENCE.test(ref)) throw new BadRequest('Enter your order or tracking number.')

  const store = await getStorefront()
  const { data, error } = await createSupabaseServiceClient()
    .from('orders')
    .select('order_number, tracking_number, email, status, payment_status, currency, created_at, subtotal, discount, promo_code, total, is_preorder, order_items, timeline, shipping_city, shipping_country, shipping_carrier, shipping_reference')
    .eq('store_id', store.storeId)
    .neq('status', 'pending_payment') // unpaid legacy orders were never placed
    // `ref` is validated to [A-Z0-9-] above, so it can't inject PostgREST filter syntax.
    .or(`order_number.eq.${ref},tracking_number.eq.${ref}`)
    .limit(1)
    .maybeSingle()
  if (error) throw error

  if (!data || String(data.email).toLowerCase() !== customerEmail) {
    return NextResponse.json({ error: 'We couldn’t find an order matching those details.' }, { status: 404 })
  }

  const { email: _omit, order_items, ...order } = data
  const items = (Array.isArray(order_items) ? order_items : []).map((item: Record<string, unknown>) => ({
    name: item.name, quantity: item.quantity, size: item.size ?? null, color: item.color ?? null, price: item.price,
    image: item.image ?? null, preorder: Boolean(item.preorder), shipsOn: item.ships_on ?? null,
  }))

  return NextResponse.json(
    { order: { ...order, order_items: items } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
