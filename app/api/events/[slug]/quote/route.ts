import { NextRequest, NextResponse } from 'next/server'
import { handle, readJson } from '@/lib/api'
import { ticketQuoteJson } from '@/lib/events'
import { loadPublicEvent, quoteForEvent } from '@/lib/events/store'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** The server's price for tickets: { items: [{ id, quantity }], email?, code? }. Prices come from the tiers only. */
export const POST = handle('events.quote', async (req: NextRequest, { params }: { params: { slug: string } }) => {
  const limited = await rateLimit(req, 'events.quote', 120, 600)
  if (limited) return limited
  const ev = await loadPublicEvent(params.slug)
  if (!ev) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const body = await readJson(req, 4_000)
  return NextResponse.json(ticketQuoteJson(await quoteForEvent(ev, body)), { headers: { 'Cache-Control': 'private, no-store' } })
})
