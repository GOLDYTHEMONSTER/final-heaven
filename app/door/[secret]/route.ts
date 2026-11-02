import { NextRequest, NextResponse } from 'next/server'
import { DOOR_COOKIE, liveDoorLink } from '@/lib/events/store'

export const dynamic = 'force-dynamic'

/**
 * A door link (Studio → Events → Door links), opened on a helper's phone:
 * keeps its secret in a cookie until the link expires, then opens the door
 * page. A revoked link stops working on the next scan.
 */
export async function GET(req: NextRequest, { params }: { params: { secret: string } }) {
  const link = await liveDoorLink(params.secret).catch(() => null)
  const res = NextResponse.redirect(new URL(link ? '/door' : '/door?closed=1', req.nextUrl.origin), 303)
  res.headers.set('Cache-Control', 'private, no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  if (link) {
    res.cookies.set(DOOR_COOKIE, params.secret, {
      httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', expires: new Date(link.expiresAt),
    })
  }
  return res
}
