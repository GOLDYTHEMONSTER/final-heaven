import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, int, readJson, reference, text } from '@/lib/api'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || ''
const PAYSTACK_CURRENCY = process.env.PAYSTACK_CURRENCY || 'NGN'
const PAYSTACK_CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || ''

const MAX_LINES = 50
const MAX_QUANTITY = 20

async function initializePaystackTransaction(customerEmail: string, amountKobo: number, metadata: Record<string, string>) {
  if (!PAYSTACK_SECRET_KEY) return null

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: customerEmail,
      amount: amountKobo,
      currency: PAYSTACK_CURRENCY,
      metadata,
      callback_url: PAYSTACK_CALLBACK_URL || undefined,
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.status) {
    console.error('[orders] Paystack initialization failed:', response.status, data?.message)
    return null
  }

  return (data.data?.authorization_url as string) || null
}

type CartLine = { id: string; size: string | null; quantity: number }

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

/** Places an order. Prices and totals come from the database, never from the client. */
export const POST = handle('orders.create', async (req: NextRequest) => {
  const body = await readJson(req)

  const customerEmail = email(body.email)
  const shippingAddress = text(body.shippingAddress, 'Shipping address', { max: 300, required: true })
  const shippingCity = text(body.shippingCity, 'City', { max: 100, required: true })
  const shippingState = text(body.shippingState, 'State', { max: 100 })
  const shippingPostalCode = text(body.shippingPostalCode, 'Postal code', { max: 20, required: true })
  const shippingCountry = text(body.shippingCountry, 'Country', { max: 100, required: true })
  const lines = parseItems(body.items)

  const supabase = createSupabaseServiceClient()
  const ids = [...new Set(lines.map((line) => line.id))]
  const { data: products, error: productError } = await supabase
    .from('products')
    .select('id, name, price, stock, status, images')
    .in('id', ids)
  if (productError) throw productError

  const byId = new Map((products ?? []).map((p) => [p.id as string, p]))
  const orderItems = lines.map((line) => {
    const product = byId.get(line.id)
    if (!product || product.status !== 'active') {
      throw new BadRequest('An item in your cart is no longer available. Please review your cart.')
    }
    const totalForProduct = lines.filter((l) => l.id === line.id).reduce((sum, l) => sum + l.quantity, 0)
    if (typeof product.stock === 'number' && totalForProduct > product.stock) {
      throw new BadRequest(`Only ${product.stock} left of ${product.name}.`)
    }
    const images = Array.isArray(product.images) ? product.images : []
    return {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      quantity: line.quantity,
      size: line.size,
      image: images[0]?.url ?? null,
    }
  })

  const subtotal = Math.round(orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
  const total = subtotal // No shipping or tax yet; add them here, server-side, when they exist.

  const orderNumber = reference('FH')
  const trackingNumber = reference('TRK')
  const now = new Date().toISOString()

  const { error: insertError } = await supabase.from('orders').insert({
    order_number: orderNumber,
    email: customerEmail,
    status: 'ordered',
    tracking_number: trackingNumber,
    shipping_address: shippingAddress,
    shipping_city: shippingCity,
    shipping_state: shippingState,
    shipping_postal_code: shippingPostalCode,
    shipping_country: shippingCountry,
    subtotal,
    total,
    order_items: orderItems,
    timeline: [{ status: 'ordered', date: now.slice(0, 10), time: now.slice(11, 16), description: 'Order placed' }],
  })
  if (insertError) throw insertError

  const paystackUrl = await initializePaystackTransaction(customerEmail, Math.round(total * 100), {
    order_number: orderNumber,
    tracking_number: trackingNumber,
  })

  return NextResponse.json(
    { orderNumber, trackingNumber, total, paystackUrl, message: 'Order created successfully.' },
    { status: 201 }
  )
})

const REFERENCE = /^[A-Z0-9-]{4,40}$/

/**
 * Order tracking. The customer must give BOTH the order (or tracking) number and
 * the email it was placed with, and gets back only what tracking needs: no
 * street address and no email. Wrong number and wrong email return the same 404,
 * so the endpoint can't be used to check which emails or numbers exist.
 */
export const GET = handle('orders.track', async (req: NextRequest) => {
  const params = new URL(req.url).searchParams
  const ref = (params.get('reference') || '').trim().toUpperCase()
  const customerEmail = email(params.get('email'))
  if (!REFERENCE.test(ref)) throw new BadRequest('Enter your order or tracking number.')

  const { data, error } = await createSupabaseServiceClient()
    .from('orders')
    .select('order_number, tracking_number, email, status, created_at, total, order_items, timeline, shipping_city, shipping_country')
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
    name: item.name,
    quantity: item.quantity,
    size: item.size ?? null,
    price: item.price,
    image: item.image ?? null,
  }))

  return NextResponse.json(
    { order: { ...order, order_items: items } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
