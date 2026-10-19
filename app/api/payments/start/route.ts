import { NextRequest, NextResponse } from 'next/server'
import { BadRequest, email, handle, readJson, text } from '@/lib/api'
import { checkoutForRequest } from '@/lib/checkout/supabase-store'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const STATUS = { not_found: 404, already_paid: 409, expired: 410, payment_unavailable: 503 } as const

/**
 * "Try again" for a Checkout whose payment failed or was abandoned. Requires
 * the checkout reference AND the email it was started with.
 */
export const POST = handle('payments.start', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'payments.start', 10, 600)
  if (limited) return limited

  const body = await readJson(req, 2_000)
  const customerEmail = email(body.email)
  const checkoutRef = text(body.checkout, 'Checkout', { max: 40 })?.toUpperCase() ?? null
  if (!checkoutRef || !/^[A-Z0-9-]{8,40}$/.test(checkoutRef)) {
    throw new BadRequest('This payment link is incomplete. Please start again from your cart.')
  }

  const result = await (await checkoutForRequest(req)).resume({ reference: checkoutRef, email: customerEmail })
  if (!result.ok) return NextResponse.json({ error: result.message, reason: result.reason }, { status: STATUS[result.reason] })
  return NextResponse.json({ paymentUrl: result.paymentUrl })
})
