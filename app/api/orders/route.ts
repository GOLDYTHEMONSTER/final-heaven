import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, readJson, text } from '@/lib/api'
import { fromMinor } from '@/lib/money'
import { parseCart, parsePromoCode } from '@/lib/checkout'
import { checkoutForRequest } from '@/lib/checkout/supabase-store'
import { getStorefront } from '@/lib/tenancy'
import { POLICY } from '@/lib/legal'
import { rateLimit } from '@/lib/rate-limit'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

/**
 * Begins a Checkout (lib/checkout) and returns its Flutterwave payment link.
 * No order exists yet: the Order is placed only when Flutterwave's payment is
 * verified (docs/adr/0001).
 */
export const POST = handle('orders.create', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'orders.create', 10, 600)
  if (limited) return limited

  const body = await readJson(req)
  const buyer = {
    email: email(body.email),
    shippingAddress: text(body.shippingAddress, 'Shipping address', { max: 300, required: true })!,
    shippingCity: text(body.shippingCity, 'City', { max: 100, required: true })!,
    shippingState: text(body.shippingState, 'State', { max: 100 }),
    shippingPostalCode: text(body.shippingPostalCode, 'Postal code', { max: 20, required: true })!,
    shippingCountry: text(body.shippingCountry, 'Country', { max: 100, required: true })!,
  }
  if (buyer.shippingCountry.toLowerCase() !== POLICY.shipsTo.toLowerCase()) throw new BadRequest(`We deliver within ${POLICY.shipsTo} only.`)
  if (body.termsAccepted !== true) throw new BadRequest('Please accept the Terms of Sale and Returns Policy to place your order.')

  const result = await (await checkoutForRequest(req)).begin({
    lines: parseCart(body.items), promoCode: parsePromoCode(body.promoCode), buyer,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.message, reason: result.reason }, { status: result.reason === 'cart_invalid' ? 400 : 503 })
  }
  return NextResponse.json({
    checkout: result.checkout,
    paymentUrl: result.paymentUrl,
    total: fromMinor(result.quote.totalMinor, result.quote.currency),
    currency: result.quote.currency,
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
