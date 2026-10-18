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
 * verified result can mark the order paid.
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
  // A payment just applied has queued the receipt and the staff alert.
  if (result.outcome === 'applied' || result.outcome === 'applied_to_cancelled_order') await sendQueuedEmails()

  const { data: order, error } = await createSupabaseServiceClient()
    .from('orders').select('order_number, status, payment_status').eq('id', result.payment.orderId).single()
  if (error) throw error
  return NextResponse.json(
    { orderNumber: order.order_number, paymentStatus: order.payment_status, orderStatus: order.status, outcome: result.outcome },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
