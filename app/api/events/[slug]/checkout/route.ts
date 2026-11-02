import { NextRequest, NextResponse } from 'next/server'
import { handle, readJson } from '@/lib/api'
import { beginTicketCheckout, loadPublicEvent } from '@/lib/events/store'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Buys tickets: { items, name, email, phone?, code?, terms: true }. Returns the
 * Flutterwave payment link. The tickets are issued only when Flutterwave
 * confirms the payment (lib/events/store beginTicketCheckout).
 */
export const POST = handle('events.checkout', async (req: NextRequest, { params }: { params: { slug: string } }) => {
  const limited = await rateLimit(req, 'events.checkout', 10, 600)
  if (limited) return limited
  const ev = await loadPublicEvent(params.slug)
  if (!ev) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const body = await readJson(req, 4_000)
  const result = await beginTicketCheckout(req, ev, body)
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status })
  return NextResponse.json({ paymentUrl: result.paymentUrl, checkout: result.checkout }, { headers: { 'Cache-Control': 'private, no-store' } })
})
