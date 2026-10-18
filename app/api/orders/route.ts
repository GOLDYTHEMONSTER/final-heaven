import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, int, readJson, reference, text } from '@/lib/api'
import { fromMinor } from '@/lib/money'
import { priceOrder, type CartLine } from '@/lib/orders'
import { getStorefront } from '@/lib/tenancy'
import { rateLimit } from '@/lib/rate-limit'
import { paymentDeps, siteUrl } from '@/lib/payments'
import { startPayment } from '@/lib/payments/service'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

const MAX_LINES = 50
const MAX_QUANTITY = 20

function parseItems(value: unknown): CartLine[] {
  if (!Array.isArray(value) || value.length === 0) throw new BadRequest('Your cart is empty.')
  if (value.length > MAX_LINES) throw new BadRequest(`Orders are limited to ${MAX_LINES} lines.`)

  // Merge duplicate product/size lines so quantity limits can't be dodged.
  const merged = new Map<string, CartLine>()
  for (const raw of value) {
    const item = (raw ?? {}) as Record<string, unknown>
    const id = text(item.id, 'Item id', { max: 100, required: true })!
    const size = text(item.size, 'Size', { max: 20 })
    const quantity = int(item.quantity, 'Quantity', { min: 1, max: MAX_QUANTITY })
    const key = `${id}::${size ?? ''}`
    const line = merged.get(key) ?? { id, size, quantity: 0 }
    line.quantity += quantity
    if (line.quantity > MAX_QUANTITY) throw new BadRequest(`You can order up to ${MAX_QUANTITY} of each item.`)
    merged.set(key, line)
  }
  return [...merged.values()]
}

/** Places an order for this storefront and starts payment. Prices come from the database, never the client. */
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
  const lines = parseItems(body.items)

  const store = await getStorefront()
  const db = createSupabaseServiceClient()
  const { data: products, error: productError } = await db
    .from('products')
    .select('id, name, price, stock, status, images')
    .eq('store_id', store.storeId)
    .in('id', [...new Set(lines.map((l) => l.id))])
  if (productError) throw productError

  const priced = priceOrder(lines, products ?? [], store.currency)
  const orderNumber = reference('FH')
  const now = new Date().toISOString()

  const { data: order, error: insertError } = await db.from('orders').insert({
    tenant_id: store.tenantId,
    store_id: store.storeId,
    order_number: orderNumber,
    tracking_number: reference('TRK'),
    email: customerEmail,
    status: 'pending_payment',
    payment_status: 'unpaid',
    currency: store.currency,
    shipping_address: shippingAddress,
    shipping_city: shippingCity,
    shipping_state: shippingState,
    shipping_postal_code: shippingPostalCode,
    shipping_country: shippingCountry,
    subtotal: fromMinor(priced.subtotalMinor, store.currency),
    total: fromMinor(priced.totalMinor, store.currency),
    order_items: priced.items,
    timeline: [{ status: 'pending_payment', date: now.slice(0, 10), time: now.slice(11, 16), description: 'Order placed' }],
  }).select('id, tracking_number').single()
  if (insertError) throw insertError

  // The order exists regardless of what happens next; payment can be retried.
  const payment = await startPayment(paymentDeps(), {
    id: order.id, tenantId: store.tenantId, orderNumber, amountMinor: priced.totalMinor,
    currency: store.currency, email: customerEmail,
  }, siteUrl(req))

  return NextResponse.json({
    orderNumber,
    trackingNumber: order.tracking_number,
    total: fromMinor(priced.totalMinor, store.currency),
    currency: store.currency,
    paymentUrl: payment.ok ? payment.checkoutUrl : null,
    paymentIssue: payment.ok ? null : payment.reason,
  }, { status: 201 })
})

const REFERENCE = /^[A-Z0-9-]{4,40}$/

/**
 * Order tracking. The customer must give BOTH the order (or tracking) number and
 * the email it was placed with, and gets back only what tracking needs: no
 * street address and no email. Wrong number and wrong email return the same 404.
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
    .select('order_number, tracking_number, email, status, payment_status, currency, created_at, total, order_items, timeline, shipping_city, shipping_country')
    .eq('store_id', store.storeId)
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
    name: item.name, quantity: item.quantity, size: item.size ?? null, price: item.price, image: item.image ?? null,
  }))

  return NextResponse.json(
    { order: { ...order, order_items: items } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
