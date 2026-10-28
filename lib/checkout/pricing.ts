// Pricing rules inside the Checkout module: pure, so the module's own tests
// can exercise every case. Only the Checkout module calls these.
import { formatMinor, toMinor } from '@/lib/money'
import { canBuy, purchaseState, stringList, unavailableReason, type CatalogueProduct } from '@/lib/catalog'
import { isValidSetPick, setGroups } from '@/lib/sets'
import { estimate, expressAvailable, expressFee, supplyOf, type DeliveryOption, type Supply } from '@/lib/delivery'

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
  /** Made after the order: about this many days before it ships. Null when it ships from stock. */
  madeToOrderDays: number | null
  issue: string | null
  /** How it reaches the customer: in stock, made, ordered in from China, or a pre-order (lib/delivery). */
  supply: Supply
  /** The free gift: never charged, never counted in the subtotal. */
  gift?: true
}

/** Delivery for a quote: the options on offer, the one chosen, its fee and when the order should arrive. */
export type QuoteDelivery = {
  option: DeliveryOption
  /** Express is offered only when something comes from China; null otherwise. */
  expressFeeMinor: number | null
  feeMinor: number
  estimates: Record<DeliveryOption, ReturnType<typeof estimate>> | { standard: ReturnType<typeof estimate> }
  /** The weight Express was priced on is incomplete (a product has no packed weight yet): the base fee applies to it. */
  weightIncomplete: boolean
}

/** The free gift a shopper picked: one of the store's gift pieces. */
export type GiftPick = { id: string; color?: string | null }

/** The store's free-gift offer: the pieces on offer and the subtotal that earns one. */
export type GiftOffer = { minMinor: number; products: CatalogueProduct[] }

export type GiftOption = { id: string; name: string; image: string | null; colors: string[]; valueMinor: number; available: boolean }

export type Quote = {
  lines: QuoteLine[]
  currency: string
  subtotalMinor: number
  discountMinor: number
  /** Subtotal less discount plus delivery. */
  totalMinor: number
  delivery: QuoteDelivery
  isPreorder: boolean
  promo: { id: string; code: string; description: string | null; discountMinor: number } | null
  promoError: string | null
  /**
   * The free gift, when the store offers one: whether this cart earns it (its
   * subtotal reaches minMinor), the pieces to pick from, and the picked one as
   * a line at no charge. A pick is ignored until the cart earns a gift.
   */
  gift: { minMinor: number; eligible: boolean; options: GiftOption[]; line: QuoteLine | null; issue: string | null } | null
  /** True when every line can be bought, any promo code entered applies and any gift picked can be given. */
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
  { today, promo = null, promoCode = null, now = new Date(), giftOffer = null, giftPick = null, delivery = 'standard', expressKg = null, weightIncomplete = false, orderDay = null }:
    { today: string; promo?: PromoContext | null; promoCode?: string | null; now?: Date; giftOffer?: GiftOffer | null; giftPick?: GiftPick | null
      /** The delivery the shopper chose; Express falls back to standard when nothing in the cart comes from China. */
      delivery?: DeliveryOption
      /** Chargeable weight (kg) of the ordered-in items, from the server's shipping profiles. */
      expressKg?: number | null
      weightIncomplete?: boolean
      /** The day an order placed now counts from (today, or launch day while checkout is closed); null: no dates yet. */
      orderDay?: string | null }
): Quote {
  const byId = new Map(products.map((p) => [p.id, p]))
  const quantityById = new Map<string, number>()
  for (const l of lines) quantityById.set(l.id, (quantityById.get(l.id) ?? 0) + l.quantity)

  let subtotalMinor = 0
  const quoted = lines.map((line): QuoteLine => {
    const product = byId.get(line.id)
    const base = { id: line.id, size: line.size, color: line.color ?? null, quantity: line.quantity }
    if (!product) {
      return { ...base, name: 'This item', unitMinor: 0, lineMinor: 0, price: 0, image: null, preorder: false, shipsOn: null, madeToOrderDays: null,
        supply: { kind: 'stock' }, issue: 'An item in your cart is no longer available. Please remove it.' }
    }
    const state = purchaseState(product, today)
    const name = product.name.trim()
    const unitMinor = toMinor(product.price, currency)
    const images = Array.isArray(product.images) ? (product.images as { url?: string }[]) : []
    const sizes = stringList(product.sizes)
    const colors = stringList(product.colors)
    const out: QuoteLine = {
      ...base,
      size: sizes.length ? line.size : null,
      color: colors.length ? (line.color ?? null) : null,
      name: name,
      unitMinor,
      lineMinor: unitMinor * line.quantity,
      price: Number(product.price),
      image: images[0]?.url ?? null,
      preorder: state.state === 'preorder',
      shipsOn: state.state === 'preorder' ? state.shipsOn : null,
      madeToOrderDays: product.fulfilment === 'made_to_order' ? Number(product.lead_time_days) || null : null,
      supply: supplyOf(product, state),
      issue: null,
    }
    if (!canBuy(state)) out.issue = unavailableReason(name, state)
    else if ('maxQuantity' in state && quantityById.get(line.id)! > state.maxQuantity) {
      out.issue = state.state === 'preorder'
        ? `Only ${state.maxQuantity} of ${name} left to pre-order.`
        : `Only ${state.maxQuantity} left of ${name}.`
    } else if (sizes.length && (!line.size || !sizes.includes(line.size))) out.issue = `Choose a size for ${name}.`
    else if (colors.length) {
      const groups = setGroups(colors)
      if (groups) { if (!isValidSetPick(groups, line.color)) out.issue = `Choose your picks for ${name} again.` }
      else if (!line.color || !colors.includes(line.color)) out.issue = `Choose a colour for ${name}.`
    }
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

  const gift = giftOffer ? quoteGift(giftOffer, giftPick, subtotalMinor, currency, today) : null
  const issues = quoted.some((l) => l.issue)

  // Delivery: Express (air) only when something comes from China; its fee is the server's, by weight.
  const supplies = quoted.filter((l) => !l.issue).map((l) => l.supply)
  const canExpress = expressAvailable(supplies)
  const option: DeliveryOption = delivery === 'express' && canExpress ? 'express' : 'standard'
  const expressFeeMinor = canExpress ? expressFee(expressKg) : null
  const feeMinor = option === 'express' ? expressFeeMinor! : 0
  const deliveryQuote: QuoteDelivery = {
    option, expressFeeMinor, feeMinor, weightIncomplete: canExpress && weightIncomplete,
    estimates: canExpress
      ? { standard: estimate(supplies, 'standard', orderDay), express: estimate(supplies, 'express', orderDay) }
      : { standard: estimate(supplies, 'standard', orderDay) },
  }
  return {
    lines: quoted,
    currency,
    subtotalMinor,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor + feeMinor,
    delivery: deliveryQuote,
    isPreorder: quoted.some((l) => l.preorder && !l.issue),
    promo: promoResult,
    promoError,
    gift,
    ok: !issues && !promoError && !gift?.issue && quoted.length > 0,
  }
}

/** The gift offer for a subtotal (minor units of what's being bought), and the picked gift as a free line. */
function quoteGift(offer: GiftOffer, pick: GiftPick | null, subtotalMinor: number, currency: string, today: string): NonNullable<Quote['gift']> {
  const firstImage = (p: CatalogueProduct) => (Array.isArray(p.images) ? (p.images as { url?: string }[])[0]?.url : null) ?? null
  const options = offer.products.map((p): GiftOption => ({
    id: p.id, name: p.name.trim(), image: firstImage(p), colors: stringList(p.colors),
    valueMinor: toMinor(p.price, currency), available: canBuy(purchaseState(p, today)),
  }))
  const eligible = subtotalMinor > 0 && subtotalMinor >= offer.minMinor
  if (!pick || !eligible) return { minMinor: offer.minMinor, eligible, options, line: null, issue: null }

  const option = options.find((o) => o.id === pick.id)
  if (!option || !option.available) return { minMinor: offer.minMinor, eligible, options, line: null, issue: 'Your free gift is no longer available. Please pick another.' }
  if (option.colors.length && (!pick.color || !option.colors.includes(pick.color))) {
    return { minMinor: offer.minMinor, eligible, options, line: null, issue: `Choose a colour for your free ${option.name}.` }
  }
  const line: QuoteLine = {
    id: option.id, name: option.name, size: null, color: option.colors.length ? pick.color! : null, quantity: 1,
    unitMinor: 0, lineMinor: 0, price: 0, image: option.image, preorder: false, shipsOn: null, madeToOrderDays: null, supply: { kind: 'stock' }, issue: null, gift: true,
  }
  return { minMinor: offer.minMinor, eligible, options, line, issue: null }
}

/** The first thing stopping this quote from being paid, in words for the shopper; null when it can be paid. */
export function quoteProblem(quote: Quote): string | null {
  const issue = quote.lines.find((l) => l.issue)?.issue ?? quote.promoError ?? quote.gift?.issue
  if (issue) return issue
  if (!quote.lines.length) return 'Your cart is empty.'
  if (quote.totalMinor < toMinor(MIN_CHARGE_MAJOR, quote.currency)) return 'Your order total is too small to pay online.'
  return null
}

/** The lines as saved on a checkout, and later on its order: the free gift goes last, at price 0. */
export function orderItems(quote: Quote) {
  const lines = quote.gift?.line ? [...quote.lines, quote.gift.line] : quote.lines
  return lines.map((l) => ({
    // Embedded (data:) images are left out: they can be hundreds of KB each and nothing reads them from an order.
    id: l.id, name: l.name, price: l.price, quantity: l.quantity, size: l.size, color: l.color,
    image: l.image && !l.image.startsWith('data:') ? l.image : null,
    ...(l.preorder ? { preorder: true, ships_on: l.shipsOn } : {}),
    ...(l.madeToOrderDays ? { made_to_order: true, lead_time_days: l.madeToOrderDays } : {}),
    ...(l.gift ? { gift: true } : {}),
  }))
}
