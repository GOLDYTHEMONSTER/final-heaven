import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, readJson, text } from '@/lib/api'
import { toMinor } from '@/lib/money'
import { getStorefront } from '@/lib/tenancy'
import { rateLimit } from '@/lib/rate-limit'
import { paymentDeps, siteUrl } from '@/lib/payments'
import { startPayment } from '@/lib/payments/service'

export const dynamic = 'force-dynamic'

/**
 * Customer-initiated "pay now" for an unpaid order, e.g. after a payment link
 * failed to generate. Requires the order number AND email, like tracking.
 * Reuses a recent checkout link instead of creating a new one.
 */
export const POST = handle('payments.start', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'payments.start', 10, 600)
  if (limited) return limited

  const body = await readJson(req, 2_000)
  const orderNumber = text(body.orderNumber, 'Order number', { max: 40, required: true })!.toUpperCase()
  const customerEmail = email(body.email)
  if (!/^[A-Z0-9-]{4,40}$/.test(orderNumber)) throw new BadRequest('Enter your order number.')

  const store = await getStorefront()
  const { data: order, error } = await createSupabaseServiceClient()
    .from('orders').select('id, tenant_id, order_number, email, total, currency, status, payment_status')
    .eq('store_id', store.storeId).eq('order_number', orderNumber).maybeSingle()
  if (error) throw error
  if (!order || String(order.email).toLowerCase() !== customerEmail) {
    return NextResponse.json({ error: 'We couldn’t find an order matching those details.' }, { status: 404 })
  }
  if (order.status !== 'pending_payment' || !['unpaid', 'failed', 'pending'].includes(order.payment_status)) {
    return NextResponse.json({ error: 'This order doesn’t need a payment.' }, { status: 409 })
  }

  const result = await startPayment(paymentDeps(), {
    id: order.id, tenantId: order.tenant_id, orderNumber: order.order_number,
    amountMinor: toMinor(order.total, order.currency), currency: order.currency, email: customerEmail,
  }, siteUrl(req))
  if (!result.ok) {
    return NextResponse.json({ error: 'Payment is unavailable right now. Please try again shortly.', reason: result.reason }, { status: 503 })
  }
  return NextResponse.json({ paymentUrl: result.checkoutUrl })
})
