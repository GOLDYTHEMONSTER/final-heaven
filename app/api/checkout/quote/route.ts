import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { handle, readJson } from '@/lib/api'
import { fromMinor } from '@/lib/money'
import { parseItems, parsePromoCode, quoteForStore } from '@/lib/checkout'
import { getStorefront } from '@/lib/tenancy'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * The server's price for a cart: what the cart and checkout pages show, and
 * exactly what checkout will charge. Problems are reported per line so the
 * customer can fix them before paying.
 */
export const POST = handle('checkout.quote', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'checkout.quote', 60, 600)
  if (limited) return limited

  const body = await readJson(req, 16_000)
  const lines = parseItems(body.items)
  const promoCode = parsePromoCode(body.promoCode)
  const customerEmail = typeof body.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())
    ? body.email.trim().toLowerCase().slice(0, 254) : null

  const store = await getStorefront()
  const { quote } = await quoteForStore(createSupabaseServiceClient(), store, { lines, promoCode, email: customerEmail })
  const m = (minor: number) => fromMinor(minor, store.currency)

  return NextResponse.json({
    currency: quote.currency,
    lines: quote.lines.map((l) => ({
      id: l.id, name: l.name, size: l.size, color: l.color, quantity: l.quantity, unitPrice: m(l.unitMinor),
      lineTotal: m(l.lineMinor), image: l.image, preorder: l.preorder, shipsOn: l.shipsOn, issue: l.issue,
    })),
    subtotal: m(quote.subtotalMinor),
    discount: m(quote.discountMinor),
    total: m(quote.totalMinor),
    isPreorder: quote.isPreorder,
    promo: quote.promo ? { code: quote.promo.code, description: quote.promo.description } : null,
    promoError: quote.promoError,
    ok: quote.ok,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
