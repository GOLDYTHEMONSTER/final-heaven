import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, handle, readJson, text } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'
import { paymentDeps } from '@/lib/payments'
import { confirmPayment } from '@/lib/payments/service'
import { sendQueuedEmails } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * Called by /checkout/complete when the customer returns from Flutterwave.
 * The redirect's status is ignored: the server asks Flutterwave and only a
 * verified result can place the order. The order number and tracking number
 * are returned only once the order exists, i.e. once payment is verified.
 */
export const POST = handle('payments.verify', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'payments.verify', 30, 600)
  if (limited) return limited

  const body = await readJson(req, 2_000)
  const reference = text(body.reference, 'Payment reference', { max: 64, required: true })!.toUpperCase()
  const transactionId = text(body.transactionId, 'Transaction id', { max: 20 })
  if (!/^[A-Z0-9-]{8,64}$/.test(reference)) throw new BadRequest('Invalid payment reference.')
  if (transactionId && !/^\d+$/.test(transactionId)) throw new BadRequest('Invalid transaction id.')

  const result = await confirmPayment(paymentDeps(), reference, transactionId)
  if (!result.ok) {
    const status = result.reason === 'unknown_reference' ? 404 : result.reason === 'reference_mismatch' ? 400 : 503
    return NextResponse.json({ error: 'We couldn’t confirm this payment yet.', reason: result.reason }, { status })
  }
  // A payment just applied has placed the order and queued the receipt and the staff alert.
  if (result.outcome === 'applied' || result.outcome === 'applied_to_cancelled_order') await sendQueuedEmails()

  const db = createSupabaseServiceClient()
  const { data: payment, error: payError } = await db.from('payments')
    .select('status, order_id, checkouts(reference)').eq('reference', reference).single()
  if (payError) throw payError
  const checkout = (payment.checkouts as { reference?: string } | null)?.reference ?? null

  if (!payment.order_id) {
    // Not paid (yet): there is no order. The checkout reference lets the customer try again.
    return NextResponse.json(
      { paymentStatus: payment.status === 'failed' || payment.status === 'cancelled' ? 'failed' : 'pending', checkout, outcome: result.outcome },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const { data: order, error } = await db.from('orders')
    .select('order_number, tracking_number, status, payment_status, is_preorder').eq('id', payment.order_id).single()
  if (error) throw error
  const paid = ['paid', 'partially_refunded', 'refunded'].includes(order.payment_status)
  return NextResponse.json({
    paymentStatus: paid ? 'paid' : order.payment_status,
    orderStatus: order.status,
    outcome: result.outcome,
    checkout,
    ...(paid ? { orderNumber: order.order_number, trackingNumber: order.tracking_number, isPreorder: order.is_preorder } : {}),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
