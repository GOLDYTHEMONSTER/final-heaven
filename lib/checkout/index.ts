// The Checkout module: from a shopper's cart to a Flutterwave payment link.
//
//   quote(cart)          the server's price for a cart, problems per line
//   begin(cart, buyer)   save a Checkout and get its payment link
//   resume(ref, email)   a payment link again for an unpaid Checkout
//   payments()           whether checkout takes payments now (launch day, store pause)
//
// Guarantees (tested through this interface, tests/unit/checkout.test.ts):
//  - prices come only from the catalogue, never from the cart;
//  - the cart is checked before payment availability, so the shopper hears the
//    real problem;
//  - begin prices the cart once, and the saved total is the amount Flutterwave
//    is asked to charge;
//  - begin creates a Checkout, never an Order: the Order is placed only when
//    Payments verifies the payment (docs/adr/0001);
//  - no payment starts before the store's launch day or while the store is
//    paused (Shop.paymentsOpenOn, Shop.purchasesPaused);
//  - gift pieces (Shop.giftCategory) are never sold: one is added free, as the
//    last line, only when the cart earns it;
//  - begin saves the order's shipping allocation (lib/shipping/engine) with the
//    Checkout, worked out from the same server prices; it never changes the
//    total, and checkout doesn't wait on it: if it can't be worked out, the
//    Checkout is saved without one.
//
// Behind it: the purchase and pricing rules (./pricing, lib/catalog), the
// CheckoutStore seam (Supabase in production, in-memory in tests) and the
// CheckoutPayments seam (Flutterwave through lib/payments, a fake in tests).
import { BadRequest, int, reference, text } from '@/lib/api'
import { fromMinor, toMinor } from '@/lib/money'
import { paymentsClosed, paymentsState, storeToday, type CatalogueProduct, type PaymentsState } from '@/lib/catalog'
import { POLICY } from '@/lib/legal'
import { logger } from '@/lib/log'
import { allocateOrder, type Context, type Costs, type Profile, type Snapshot } from '@/lib/shipping/engine'
import { orderItems, quoteCart, quoteProblem, type CartLine, type GiftPick, type PromoContext, type Quote } from './pricing'

export type { CartLine, GiftOption, GiftPick, Quote, QuoteLine, PromoCode, PromoContext } from './pricing'

/**
 * The storefront a Checkout belongs to. Payments open on paymentsOpenOn
 * (YYYY-MM-DD; null = no launch day yet) unless staff pause the store. When
 * giftCategory is set, a cart whose subtotal reaches giftMinSubtotal earns one
 * free piece from that category.
 */
export type Shop = {
  tenantId: string; storeId: string; currency: string; hiddenCategories: string[]; timeZone: string
  paymentsOpenOn: string | null; purchasesPaused: boolean
  giftCategory: string | null; giftMinSubtotal: number | string
}

export type Buyer = {
  email: string
  shippingAddress: string
  shippingCity: string
  shippingState: string | null
  shippingPostalCode: string
  shippingCountry: string
}

export type NewCheckout = Buyer & {
  tenantId: string
  storeId: string
  reference: string
  orderNumber: string
  trackingNumber: string
  currency: string
  items: ReturnType<typeof orderItems>
  subtotal: string
  discount: string
  total: string
  promoCodeId: string | null
  promoCode: string | null
  isPreorder: boolean
  termsVersion: string
  termsAcceptedAt: string
  /** How the order's price is shared out to freight recovery, reserve and platform (staff-only). */
  shipping: Snapshot | null
}

/** What the shipping allocation needs for some products: policy, rates, campaigns, profiles, costs, categories. */
export type ShippingInputs = { context: Context; profiles: Profile[]; costs: Record<string, Costs | null>; categories: Record<string, string> }

export type SavedCheckout = {
  id: string
  tenantId: string
  email: string
  total: string
  currency: string
  status: 'open' | 'completed' | 'expired'
  orderId: string | null
  createdAt: string
}

/** Persistence the module needs; Supabase in production (./supabase-store), in-memory in tests. */
export interface CheckoutStore {
  products(storeId: string, ids: string[]): Promise<(CatalogueProduct & { category: string })[]>
  /** The active pieces in the store's gift category. */
  giftProducts(storeId: string, category: string): Promise<CatalogueProduct[]>
  /** The promo code and its uses on paid orders (overall, and by this email when given). */
  promo(tenantId: string, code: string, email: string | null): Promise<PromoContext | null>
  /**
   * Saves a Checkout holding its lines (HOLD_MINUTES). Refused, naming the
   * product and how many are still free, when other live holds leave too few.
   */
  save(checkout: NewCheckout): Promise<{ ok: true; id: string } | { ok: false; held: Held }>
  find(storeId: string, reference: string): Promise<SavedCheckout | null>
  expire(id: string): Promise<void>
  /** Renews an open Checkout's hold: 'closed' when it isn't open any more, or the line that's no longer free. */
  renewHold(id: string): Promise<'renewed' | 'closed' | Held>
  /** Units of these products held by live Checkouts (pre-order allowance counted apart). */
  holds(storeId: string, ids: string[]): Promise<{ productId: string; preorder: boolean; quantity: number }[]>
  /** Inputs for the shipping allocation; absent where shipping isn't tracked. */
  shipping?(tenantId: string, storeId: string, ids: string[], at: { now: Date; today: string }): Promise<ShippingInputs>
}

/** A line that can't be held: the product, and how many of it are still free. */
export type Held = { productId: string; free: number }

/** How long a Checkout keeps its lines for its shopper (set in the database, 20261026130000_checkout_holds.sql). */
export const HOLD_MINUTES = 30

/** Getting a payment link for a Checkout; Flutterwave via lib/payments in production. */
export interface CheckoutPayments {
  available(): boolean
  start(payFor: { checkoutId: string; tenantId: string; amountMinor: number; currency: string; email: string }):
    Promise<{ ok: true; paymentUrl: string } | { ok: false }>
}

export type CheckoutDeps = {
  store: CheckoutStore
  payments: CheckoutPayments
  shop: Shop
  now?: () => Date
  newReference?: (prefix: string, length?: number) => string
}

export type BeginResult =
  | { ok: true; checkout: string; paymentUrl: string; quote: Quote }
  | { ok: false; reason: 'cart_invalid'; message: string; quote: Quote }
  | { ok: false; reason: 'payment_unavailable'; message: string }

export type ResumeResult =
  | { ok: true; paymentUrl: string }
  | { ok: false; reason: 'not_found' | 'already_paid' | 'expired' | 'payment_unavailable'; message: string }

/** A Checkout can be paid again (e.g. after a declined card) for this long; then the shopper starts again. */
export const RESUME_HOURS = 24

const PAYMENT_UNAVAILABLE = 'Online payment is unavailable right now, so we can’t take orders. Please try again shortly.'
const FLUTTERWAVE_UNREACHABLE = 'We couldn’t reach Flutterwave just now. Nothing was charged. Please try again.'

export function checkout(deps: CheckoutDeps) {
  const now = () => deps.now?.() ?? new Date()
  const ref = deps.newReference ?? reference
  const { shop } = deps

  /** Whether checkout takes payments now, and if not, why. */
  function payments(): PaymentsState {
    return paymentsState(shop, storeToday(shop.timeZone, now()))
  }

  async function quote({ lines, promoCode = null, email = null, gift = null }:
    { lines: CartLine[]; promoCode?: string | null; email?: string | null; gift?: GiftPick | null }): Promise<Quote> {
    const ids = [...new Set(lines.map((l) => l.id))]
    const [rows, promo, giftProducts] = await Promise.all([
      deps.store.products(shop.storeId, ids),
      promoCode ? deps.store.promo(shop.tenantId, promoCode, email) : Promise.resolve(null),
      shop.giftCategory ? deps.store.giftProducts(shop.storeId, shop.giftCategory) : Promise.resolve([]),
    ])
    // Hidden categories, and gift pieces, can't be bought even by calling the API directly.
    const sellable = rows.filter((p) => !shop.hiddenCategories.includes(p.category) && p.category !== shop.giftCategory)

    // What's really left: stock (or pre-order allowance) less other shoppers' live holds.
    const held = new Map<string, number>()
    const heldIds = [...new Set([...sellable, ...giftProducts].map((p) => p.id))]
    for (const h of heldIds.length ? await deps.store.holds(shop.storeId, heldIds) : []) held.set(`${h.productId}:${h.preorder}`, h.quantity)
    const lessHolds = <T extends CatalogueProduct>(p: T): T => {
      const stock = held.get(`${p.id}:false`) ?? 0
      const pre = held.get(`${p.id}:true`) ?? 0
      if (!stock && !pre) return p
      return {
        ...p,
        ...(p.stock != null && stock ? { stock: Math.max(0, p.stock - stock) } : {}),
        ...(p.preorder_limit != null && pre ? { preorder_limit: Math.max(0, p.preorder_limit - pre) } : {}),
      }
    }
    const products = sellable.map(lessHolds)
    const giftOffer = giftProducts.length ? { minMinor: toMinor(shop.giftMinSubtotal, shop.currency), products: giftProducts.map(lessHolds) } : null
    const priced = quoteCart(lines, products, shop.currency, { today: storeToday(shop.timeZone, now()), promo, promoCode, now: now(), giftOffer, giftPick: gift })

    // "Sold out" because someone else is checking out with the last pieces says so: they may come back.
    for (const line of priced.lines) {
      const real = sellable.find((p) => p.id === line.id)
      const after = products.find((p) => p.id === line.id)
      if (line.issue && real && after && real !== after && line.issue.endsWith('is sold out.')) {
        line.issue = `The last ${line.name} is in someone else’s checkout right now. It may come back within ${HOLD_MINUTES} minutes.`
      }
    }
    return priced
  }

  /** The order's shipping allocation, or null when it can't be worked out: checkout never waits on it. */
  async function allocate(priced: Quote): Promise<Snapshot | null> {
    if (!deps.store.shipping || shop.currency !== 'NGN') return null
    try {
      const lines = priced.gift?.line ? [...priced.lines, priced.gift.line] : priced.lines
      const input = await deps.store.shipping(shop.tenantId, shop.storeId, [...new Set(lines.map((l) => l.id))],
        { now: now(), today: storeToday(shop.timeZone, now()) })
      return allocateOrder(lines.map((l) => ({ productId: l.id, size: l.size, quantity: l.quantity, unitKobo: l.unitMinor, category: input.categories[l.id] ?? null, gift: l.gift })),
        priced.discountMinor, input.context, input.profiles, input.costs)
    } catch (e) {
      logger.error('checkout.shipping_allocation_failed', { error: e })
      return null
    }
  }

  async function begin({ lines, promoCode = null, gift = null, buyer }:
    { lines: CartLine[]; promoCode?: string | null; gift?: GiftPick | null; buyer: Buyer }): Promise<BeginResult> {
    const priced = await quote({ lines, promoCode, email: buyer.email, gift })
    const problem = quoteProblem(priced)
    if (problem) return { ok: false, reason: 'cart_invalid', message: problem, quote: priced }
    const state = payments()
    if (!state.open) return { ok: false, reason: 'payment_unavailable', message: paymentsClosed(state).message }
    if (!deps.payments.available()) return { ok: false, reason: 'payment_unavailable', message: PAYMENT_UNAVAILABLE }

    const m = (minor: number) => fromMinor(minor, shop.currency)
    const checkoutRef = ref('CHK', 12)
    const saved = await deps.store.save({
      ...buyer,
      tenantId: shop.tenantId,
      storeId: shop.storeId,
      reference: checkoutRef,
      orderNumber: ref('FH'),
      trackingNumber: ref('TRK'),
      currency: shop.currency,
      items: orderItems(priced),
      subtotal: m(priced.subtotalMinor),
      discount: m(priced.discountMinor),
      total: m(priced.totalMinor),
      promoCodeId: priced.promo?.id ?? null,
      promoCode: priced.promo?.code ?? null,
      isPreorder: priced.isPreorder,
      termsVersion: POLICY.termsVersion,
      termsAcceptedAt: now().toISOString(),
      shipping: await allocate(priced),
    })
    // Someone else started a checkout for the last pieces between pricing and saving.
    if (!saved.ok) {
      const name = [...priced.lines, ...(priced.gift?.line ? [priced.gift.line] : [])].find((l) => l.id === saved.held.productId)?.name ?? 'An item'
      const message = saved.held.free > 0
        ? `Only ${saved.held.free} of ${name} can be bought right now. Please change the quantity.`
        : `The last ${name} is in someone else’s checkout right now. It may come back within ${HOLD_MINUTES} minutes.`
      return { ok: false, reason: 'cart_invalid', message, quote: priced }
    }
    const id = saved.id

    const payment = await deps.payments.start({
      checkoutId: id, tenantId: shop.tenantId, amountMinor: priced.totalMinor, currency: shop.currency, email: buyer.email,
    })
    if (!payment.ok) {
      await deps.store.expire(id) // the shopper presses Pay again and gets a fresh Checkout
      return { ok: false, reason: 'payment_unavailable', message: FLUTTERWAVE_UNREACHABLE }
    }
    return { ok: true, checkout: checkoutRef, paymentUrl: payment.paymentUrl, quote: priced }
  }

  async function resume({ reference: checkoutRef, email }: { reference: string; email: string }): Promise<ResumeResult> {
    const saved = await deps.store.find(shop.storeId, checkoutRef)
    if (!saved || saved.email.toLowerCase() !== email.toLowerCase()) {
      return { ok: false, reason: 'not_found', message: 'We couldn’t find that checkout. Please start again from your cart.' }
    }
    if (saved.orderId) return { ok: false, reason: 'already_paid', message: 'This order is already paid.' }
    if (saved.status !== 'open' || now().getTime() - new Date(saved.createdAt).getTime() > RESUME_HOURS * 3_600_000) {
      return { ok: false, reason: 'expired', message: 'This checkout has expired. Please start again from your cart.' }
    }
    const state = payments()
    if (!state.open) return { ok: false, reason: 'payment_unavailable', message: paymentsClosed(state).message }
    // Paying again holds the lines again, but only if nobody has taken them meanwhile.
    const hold = await deps.store.renewHold(saved.id)
    if (hold === 'closed') return { ok: false, reason: 'expired', message: 'This checkout has expired. Please start again from your cart.' }
    if (hold !== 'renewed') {
      return { ok: false, reason: 'expired', message: 'Something in this checkout was bought while you were away. Please start again from your cart.' }
    }
    const payment = await deps.payments.start({
      checkoutId: saved.id, tenantId: saved.tenantId, amountMinor: toMinor(saved.total, saved.currency), currency: saved.currency, email,
    })
    return payment.ok
      ? { ok: true, paymentUrl: payment.paymentUrl }
      : { ok: false, reason: 'payment_unavailable', message: 'Payment is unavailable right now. Please try again shortly.' }
  }

  return { quote, begin, resume, payments }
}

// ---------------------------------------------------------------------------
// Reading a cart from a request body (shared by the endpoints)
// ---------------------------------------------------------------------------

const MAX_LINES = 50
const MAX_QUANTITY = 20
// A colour, or a set's picks ("Tees: a, b, c · Hoodie: d · Cap: e", see lib/sets).
const MAX_OPTION = 160

/** Cart lines from a request, merged per product, size and colour so quantity limits can't be dodged. */
export function parseCart(value: unknown): CartLine[] {
  if (!Array.isArray(value) || value.length === 0) throw new BadRequest('Your cart is empty.')
  if (value.length > MAX_LINES) throw new BadRequest(`Orders are limited to ${MAX_LINES} lines.`)
  const merged = new Map<string, CartLine>()
  for (const raw of value) {
    const item = (raw ?? {}) as Record<string, unknown>
    const id = text(item.id, 'Item id', { max: 100, required: true })!
    const size = text(item.size, 'Size', { max: 20 })
    const color = text(item.color, 'Colour', { max: MAX_OPTION })
    const quantity = int(item.quantity, 'Quantity', { min: 1, max: MAX_QUANTITY })
    const key = `${id}::${size ?? ''}::${color ?? ''}`
    const line = merged.get(key) ?? { id, size, color, quantity: 0 }
    line.quantity += quantity
    if (line.quantity > MAX_QUANTITY) throw new BadRequest(`You can order up to ${MAX_QUANTITY} of each item.`)
    merged.set(key, line)
  }
  return [...merged.values()]
}

/** The free gift picked in the cart, if any: a piece id and, where it has colours, one of them. */
export function parseGift(value: unknown): GiftPick | null {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequest('That free gift isn’t valid.')
  const item = value as Record<string, unknown>
  return { id: text(item.id, 'Gift', { max: 100, required: true })!, color: text(item.color, 'Gift colour', { max: MAX_OPTION }) }
}

export function parsePromoCode(value: unknown): string | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!code) return null
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new BadRequest('That promo code isn’t valid.')
  return code
}
