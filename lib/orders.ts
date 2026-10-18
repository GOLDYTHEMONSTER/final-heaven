// Cart pricing, kept pure so it can be tested without a database. The same
// quote drives the cart and checkout pages and the amount sent to Flutterwave.
import { BadRequest } from '@/lib/api'
import { formatMinor, toMinor } from '@/lib/money'
import { canBuy, purchaseState, stringList, unavailableReason, type CatalogueProduct } from '@/lib/catalog'

export type { CatalogueProduct } from '@/lib/catalog'

export type CartLine = { id: string; size: string | null; color?: string | null; quantity: number }

export type PromoCode = {
  id: string
  code: string
  description: string | null
  kind: 'percent' | 'fixed'
  value: number | string
  min_subtotal: number | string
  starts_at: string | null
  ends_at: string | null
  max_uses: number | null
  once_per_customer: boolean
  active: boolean
}

/** A promo code plus how often it has been used on paid orders. */
export type PromoContext = { promo: PromoCode; uses: number; customerUses: number }

export type QuoteLine = {
  id: string
  name: string
  size: string | null
  color: string | null
  quantity: number
  unitMinor: number
  lineMinor: number
  price: number
  image: string | null
  preorder: boolean
  shipsOn: string | null
  issue: string | null
}

export type Quote = {
  lines: QuoteLine[]
  currency: string
  subtotalMinor: number
  discountMinor: number
  totalMinor: number
  isPreorder: boolean
  promo: { id: string; code: string; description: string | null; discountMinor: number } | null
  promoError: string | null
  /** True when every line can be bought and any promo code entered applies. */
  ok: boolean
}

/** Flutterwave won't take a tiny charge; a discount never brings the total below this. */
export const MIN_CHARGE_MAJOR = 100

/**
 * Whether a promo code applies to this subtotal right now, and how much it
 * takes off (minor units). Percentages round down, so we never over-discount.
 */
export function evaluatePromo(ctx: PromoContext | null, subtotalMinor: number, currency: string, now = new Date()):
  { discountMinor: number } | { error: string } {
  if (!ctx || !ctx.promo.active) return { error: 'That promo code isn’t valid.' }
  const { promo } = ctx
  if (promo.starts_at && new Date(promo.starts_at) > now) return { error: 'That promo code isn’t active yet.' }
  if (promo.ends_at && new Date(promo.ends_at) <= now) return { error: 'That promo code has expired.' }
  if (promo.max_uses != null && ctx.uses >= promo.max_uses) return { error: 'That promo code has been fully used.' }
  if (promo.once_per_customer && ctx.customerUses > 0) return { error: 'You’ve already used that promo code.' }
  const minMinor = toMinor(promo.min_subtotal, currency)
  if (subtotalMinor < minMinor) {
    return { error: `That promo code needs an order of at least ${formatMinor(minMinor, currency)}.` }
  }
  const raw = promo.kind === 'percent'
    ? Math.floor((subtotalMinor * toMinor(promo.value, 'NGN')) / 10_000) // value has 2 decimals: 12.5% -> 1250
    : toMinor(promo.value, currency)
  const cap = subtotalMinor - toMinor(MIN_CHARGE_MAJOR, currency)
  const discountMinor = Math.max(0, Math.min(raw, cap))
  if (discountMinor === 0) return { error: 'That promo code doesn’t apply to this order.' }
  return { discountMinor }
}

/**
 * Authoritative quote from catalogue prices: the browser's prices are never
 * read. Every line is checked (members-only, release date, pre-order
 * allowance, stock across sizes, valid size and colour); problems are reported
 * per line rather than thrown, so the cart can show them.
 */
export function quoteCart(
  lines: CartLine[],
  products: CatalogueProduct[],
  currency: string,
  { today, promo = null, promoCode = null, now = new Date() }:
    { today: string; promo?: PromoContext | null; promoCode?: string | null; now?: Date }
): Quote {
  const byId = new Map(products.map((p) => [p.id, p]))
  const quantityById = new Map<string, number>()
  for (const l of lines) quantityById.set(l.id, (quantityById.get(l.id) ?? 0) + l.quantity)

  let subtotalMinor = 0
  const quoted = lines.map((line): QuoteLine => {
    const product = byId.get(line.id)
    const base = { id: line.id, size: line.size, color: line.color ?? null, quantity: line.quantity }
    if (!product) {
      return { ...base, name: 'This item', unitMinor: 0, lineMinor: 0, price: 0, image: null, preorder: false, shipsOn: null,
        issue: 'An item in your cart is no longer available. Please remove it.' }
    }
    const state = purchaseState(product, today)
    const unitMinor = toMinor(product.price, currency)
    const images = Array.isArray(product.images) ? (product.images as { url?: string }[]) : []
    const sizes = stringList(product.sizes)
    const colors = stringList(product.colors)
    const out: QuoteLine = {
      ...base,
      size: sizes.length ? line.size : null,
      color: colors.length ? (line.color ?? null) : null,
      name: product.name,
      unitMinor,
      lineMinor: unitMinor * line.quantity,
      price: Number(product.price),
      image: images[0]?.url ?? null,
      preorder: state.state === 'preorder',
      shipsOn: state.state === 'preorder' ? state.shipsOn : null,
      issue: null,
    }
    if (!canBuy(state)) out.issue = unavailableReason(product.name, state)
    else if ('maxQuantity' in state && quantityById.get(line.id)! > state.maxQuantity) {
      out.issue = state.state === 'preorder'
        ? `Only ${state.maxQuantity} of ${product.name} left to pre-order.`
        : `Only ${state.maxQuantity} left of ${product.name}.`
    } else if (sizes.length && (!line.size || !sizes.includes(line.size))) out.issue = `Choose a size for ${product.name}.`
    else if (colors.length && (!line.color || !colors.includes(line.color))) out.issue = `Choose a colour for ${product.name}.`
    if (!out.issue) subtotalMinor += out.lineMinor
    return out
  })

  // Shipping is free; tax isn't charged separately.
  let discountMinor = 0
  let promoResult: Quote['promo'] = null
  let promoError: string | null = null
  if (promoCode) {
    const r = evaluatePromo(promo, subtotalMinor, currency, now)
    if ('error' in r) promoError = r.error
    else {
      discountMinor = r.discountMinor
      promoResult = { id: promo!.promo.id, code: promo!.promo.code, description: promo!.promo.description, discountMinor }
    }
  }

  const issues = quoted.some((l) => l.issue)
  return {
    lines: quoted,
    currency,
    subtotalMinor,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor,
    isPreorder: quoted.some((l) => l.preorder && !l.issue),
    promo: promoResult,
    promoError,
    ok: !issues && !promoError && quoted.length > 0,
  }
}

/** The quote, or a 400 naming the first problem. Used when placing an order. */
export function priceOrder(lines: CartLine[], products: CatalogueProduct[], currency: string,
  opts: Parameters<typeof quoteCart>[3]) {
  const quote = quoteCart(lines, products, currency, opts)
  const issue = quote.lines.find((l) => l.issue)?.issue ?? quote.promoError
  if (issue) throw new BadRequest(issue)
  if (quote.totalMinor < toMinor(MIN_CHARGE_MAJOR, currency)) throw new BadRequest('Your order total is too small to pay online.')
  return {
    ...quote,
    items: quote.lines.map((l) => ({
      // Embedded (data:) images are left out: they can be hundreds of KB each and nothing reads them from an order.
      id: l.id, name: l.name, price: l.price, quantity: l.quantity, size: l.size, color: l.color,
      image: l.image && !l.image.startsWith('data:') ? l.image : null,
      ...(l.preorder ? { preorder: true, ships_on: l.shipsOn } : {}),
    })),
  }
}
