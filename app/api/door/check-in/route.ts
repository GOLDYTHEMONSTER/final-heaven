import { NextRequest, NextResponse } from 'next/server'
import { BadRequest, handle, readJson } from '@/lib/api'
import { readRef } from '@/lib/events'
import { doorActor, doorAs } from '@/lib/events/door'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * The door: { ref, checkIn? }. `ref` is a scanned ticket link or token, or a
 * typed code. Without `checkIn` it only looks the ticket up. Door staff only:
 * a live door link on this phone, or Studio staff with events.checkin. A
 * ticket is checked in once; the database refuses the second time.
 */
export const POST = handle('door.check_in', async (req: NextRequest) => {
  // The door uses cookies, so refuse writes from other sites outright, as /api/admin does.
  const origin = req.headers.get('origin')
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 })
  const limited = await rateLimit(req, 'door.check_in', 600, 600)
  if (limited) return limited

  const actor = await doorActor()
  if (!actor) return NextResponse.json({ error: 'This phone isn’t set up for the door.' }, { status: 401 })
  const body = await readJson(req, 2_000)
  const ref = readRef(body.ref)
  if (!ref) throw new BadRequest('That isn’t a ticket code. Codes are 6 letters and numbers, like K7M 42Q.')
  const event = typeof body.event === 'string' && /^[0-9a-f-]{36}$/.test(body.event) ? body.event : null
  if (ref.kind === 'code' && actor.kind === 'staff' && !event) throw new BadRequest('Choose the event first, then type the code.')

  const result = await doorAs(actor, ref.value, { event, checkIn: body.checkIn === true })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
})
