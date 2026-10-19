import { NextRequest, NextResponse } from 'next/server'
import { handle, readJson } from '@/lib/api'
import { fromMinor } from '@/lib/money'
import { parseCart, parsePromoCode, type Quote } from '@/lib/checkout'
import { checkoutForRequest } from '@/lib/checkout/supabase-store'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** A Quote as the cart and checkout pages receive it: amounts as decimal strings, no images. */
function quoteJson(quote: Quote) {
  const m = (minor: number) => fromMinor(minor, quote.currency)
  return {
    currency: quote.currency,
    lines: quote.lines.map((l) => ({
      id: l.id, name: l.name, size: l.size, color: l.color, quantity: l.quantity, unitPrice: m(l.unitMinor),
      lineTotal: m(l.lineMinor), preorder: l.preorder, shipsOn: l.shipsOn, issue: l.issue,
    })),
    subtotal: m(quote.subtotalMinor),
    discount: m(quote.discountMinor),
    total: m(quote.totalMinor),
    isPreorder: quote.isPreorder,
    promo: quote.promo ? { code: quote.promo.code, description: quote.promo.description } : null,
    promoError: quote.promoError,
    ok: quote.ok,
  }
}

/**
 * The server's price for a cart: what the cart and checkout pages show, and
 * exactly what checkout will charge. Problems are reported per line so the
 * shopper can fix them before paying.
 */
export const POST = handle('checkout.quote', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'checkout.quote', 300, 600)
  if (limited) return limited

  const body = await readJson(req, 16_000)
  const email = typeof body.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())
    ? body.email.trim().toLowerCase().slice(0, 254) : null
  const quote = await (await checkoutForRequest(req)).quote({ lines: parseCart(body.items), promoCode: parsePromoCode(body.promoCode), email })
  return NextResponse.json(quoteJson(quote), { headers: { 'Cache-Control': 'private, no-store' } })
})
