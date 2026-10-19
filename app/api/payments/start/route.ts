import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, readJson, text } from '@/lib/api'
import { toMinor } from '@/lib/money'
import { getStorefront } from '@/lib/tenancy'
import { rateLimit } from '@/lib/rate-limit'
import { paymentDeps, siteUrl } from '@/lib/payments'
import { startPayment } from '@/lib/payments/service'

export const dynamic = 'force-dynamic'

/** A checkout can be paid again (e.g. after a failed card) for this long; after that, start again from the cart. */
const RESUME_HOURS = 24

/**
 * "Try again" for a checkout whose payment failed or was abandoned. Requires
 * the checkout reference AND the email it was started with. Reuses a recent
 * payment link instead of creating a new one.
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

  const store = await getStorefront()
  const { data: c, error } = await createSupabaseServiceClient().from('checkouts')
    .select('id, tenant_id, email, total, currency, status, order_id, created_at')
    .eq('store_id', store.storeId).eq('reference', checkoutRef).maybeSingle()
  if (error) throw error
  if (!c || String(c.email).toLowerCase() !== customerEmail) {
    return NextResponse.json({ error: 'We couldn’t find that checkout. Please start again from your cart.' }, { status: 404 })
  }
  if (c.order_id) return NextResponse.json({ error: 'This order is already paid.' }, { status: 409 })
  if (c.status !== 'open' || Date.now() - new Date(c.created_at).getTime() > RESUME_HOURS * 3_600_000) {
    return NextResponse.json({ error: 'This checkout has expired. Please start again from your cart.' }, { status: 410 })
  }

  const result = await startPayment(paymentDeps(), {
    kind: 'checkout', id: c.id, tenantId: c.tenant_id, amountMinor: toMinor(c.total, c.currency),
    currency: c.currency, email: customerEmail, description: 'Final Heaven order',
  }, siteUrl(req))
  if (!result.ok) {
    return NextResponse.json({ error: 'Payment is unavailable right now. Please try again shortly.', reason: result.reason }, { status: 503 })
  }
  return NextResponse.json({ paymentUrl: result.checkoutUrl })
})
