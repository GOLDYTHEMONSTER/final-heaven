import { NextResponse } from 'next/server'
import { ticketUrl, validToken } from '@/lib/events'
import { qrPng } from '@/lib/events/qr'

export const dynamic = 'force-dynamic'

/**
 * A ticket's QR code as a PNG, for the ticket email (Gmail doesn't show SVG).
 * It only draws the ticket's own address; whether the ticket still works is
 * decided at the door. Not cached by shared caches: the token is the ticket.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (!validToken(params.token)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const site = process.env.SITE_URL || new URL(req.url).origin
  const png = await qrPng(ticketUrl(site, params.token))
  return new NextResponse(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400', 'X-Robots-Tag': 'noindex' },
  })
}
