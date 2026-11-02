import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, handle, readJson, text } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'
import { paymentDeps } from '@/lib/payments'
import { confirmPayment } from '@/lib/payments/service'
import { sendQueuedEmails } from '@/lib/email'

export const dynamic = 'force-dynamic'
// Calls Flutterwave (15 s timeout) and may send emails: room to finish, never left hanging by the platform default.
export const maxDuration = 30

/**
 * Called by /events/complete when a ticket buyer returns from Flutterwave. As
 * for shop orders, the redirect's status is ignored: the server asks
 * Flutterwave, and only a verified payment issues tickets. The link to the
 * tickets is returned only with the email the tickets were bought with, so a
 * leaked return address alone doesn't hand them over (they're emailed too).
 */
export const POST = handle('events.verify', async (req: NextRequest) => {
  const started = Date.now()
  const limited = await rateLimit(req, 'events.verify', 30, 600)
  if (limited) return limited

  const body = await readJson(req, 2_000)
  const reference = text(body.reference, 'Payment reference', { max: 64, required: true })!.toUpperCase()
  const transactionId = text(body.transactionId, 'Transaction id', { max: 20 })
  const buyer = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[A-Z0-9-]{8,64}$/.test(reference)) throw new BadRequest('Invalid payment reference.')
  if (transactionId && !/^\d+$/.test(transactionId)) throw new BadRequest('Invalid transaction id.')

  const db = createSupabaseServiceClient()
  const { data: target, error: te } = await db.from('payments').select('ticket_checkout_id').eq('reference', reference).maybeSingle()
  if (te) throw te
  if (!target?.ticket_checkout_id) return NextResponse.json({ error: 'We couldn’t find this payment.' }, { status: 404 })

  const result = await confirmPayment(paymentDeps(), reference, transactionId)
  if (!result.ok) {
    const status = result.reason === 'unknown_reference' ? 404 : result.reason === 'reference_mismatch' ? 400 : 503
    return NextResponse.json({ error: 'We couldn’t confirm this payment yet.', reason: result.reason }, { status })
  }
  // A payment just applied has issued the tickets and queued their email.
  if (result.outcome === 'applied') await sendQueuedEmails(5, { deadline: started + 20_000 })

  const { data: payment, error } = await db.from('payments')
    .select('status, ticket_order_id, ticket_checkouts(email, event_id, events(slug)), ticket_orders(order_number, access_token, email, status)')
    .eq('reference', reference).single()
  if (error) throw error
  const checkout = payment.ticket_checkouts as unknown as { email: string; events: { slug: string } | null } | null
  const order = payment.ticket_orders as unknown as { order_number: string; access_token: string; email: string; status: string } | null
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!order) {
    return NextResponse.json({
      paymentStatus: payment.status === 'failed' || payment.status === 'cancelled' ? 'failed' : 'pending',
      event: checkout?.events?.slug ?? null,
    }, { headers })
  }
  const theirs = buyer && order.email.trim().toLowerCase() === buyer
  return NextResponse.json({
    paymentStatus: 'paid',
    orderNumber: order.order_number,
    event: checkout?.events?.slug ?? null,
    ...(theirs ? { tickets: `/tickets/${order.access_token}` } : {}),
  }, { headers })
})
