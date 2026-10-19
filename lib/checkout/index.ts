// The Checkout module: from a shopper's cart to a Flutterwave payment link.
//
//   quote(cart)          the server's price for a cart, problems per line
//   begin(cart, buyer)   save a Checkout and get its payment link
//   resume(ref, email)   a payment link again for an unpaid Checkout
//
// Guarantees (tested through this interface, tests/unit/checkout.test.ts):
//  - prices come only from the catalogue, never from the cart;
//  - the cart is checked before payment availability, so the shopper hears the
//    real problem;
//  - begin prices the cart once, and the saved total is the amount Flutterwave
//    is asked to charge;
//  - begin creates a Checkout, never an Order: the Order is placed only when
//    Payments verifies the payment (docs/adr/0001).
//
// Behind it: the purchase and pricing rules (./pricing, lib/catalog), the
// CheckoutStore seam (Supabase in production, in-memory in tests) and the
// CheckoutPayments seam (Flutterwave through lib/payments, a fake in tests).
import { BadRequest, int, reference, text } from '@/lib/api'
import { fromMinor, toMinor } from '@/lib/money'
import { storeToday, type CatalogueProduct } from '@/lib/catalog'
import { POLICY } from '@/lib/legal'
import { orderItems, quoteCart, quoteProblem, type CartLine, type PromoContext, type Quote } from './pricing'

export type { CartLine, Quote, QuoteLine, PromoCode, PromoContext } from './pricing'

/** The storefront a Checkout belongs to. */
export type Shop = { tenantId: string; storeId: string; currency: string; hiddenCategories: string[]; timeZone: string }

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
}

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
  /** The promo code and its uses on paid orders (overall, and by this email when given). */
  promo(tenantId: string, code: string, email: string | null): Promise<PromoContext | null>
  save(checkout: NewCheckout): Promise<{ id: string }>
  find(storeId: string, reference: string): Promise<SavedCheckout | null>
  expire(id: string): Promise<void>
}

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

  async function quote({ lines, promoCode = null, email = null }: { lines: CartLine[]; promoCode?: string | null; email?: string | null }): Promise<Quote> {
    const ids = [...new Set(lines.map((l) => l.id))]
    const [rows, promo] = await Promise.all([
      deps.store.products(shop.storeId, ids),
      promoCode ? deps.store.promo(shop.tenantId, promoCode, email) : Promise.resolve(null),
    ])
    // Hidden categories can't be bought even by calling the API directly.
    const products = rows.filter((p) => !shop.hiddenCategories.includes(p.category))
    return quoteCart(lines, products, shop.currency, { today: storeToday(shop.timeZone, now()), promo, promoCode, now: now() })
  }

  async function begin({ lines, promoCode = null, buyer }: { lines: CartLine[]; promoCode?: string | null; buyer: Buyer }): Promise<BeginResult> {
    const priced = await quote({ lines, promoCode, email: buyer.email })
    const problem = quoteProblem(priced)
    if (problem) return { ok: false, reason: 'cart_invalid', message: problem, quote: priced }
    if (!deps.payments.available()) return { ok: false, reason: 'payment_unavailable', message: PAYMENT_UNAVAILABLE }

    const m = (minor: number) => fromMinor(minor, shop.currency)
    const checkoutRef = ref('CHK', 12)
    const { id } = await deps.store.save({
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
    })

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
    const payment = await deps.payments.start({
      checkoutId: saved.id, tenantId: saved.tenantId, amountMinor: toMinor(saved.total, saved.currency), currency: saved.currency, email,
    })
    return payment.ok
      ? { ok: true, paymentUrl: payment.paymentUrl }
      : { ok: false, reason: 'payment_unavailable', message: 'Payment is unavailable right now. Please try again shortly.' }
  }

  return { quote, begin, resume }
}

// ---------------------------------------------------------------------------
// Reading a cart from a request body (shared by the endpoints)
// ---------------------------------------------------------------------------

const MAX_LINES = 50
const MAX_QUANTITY = 20

/** Cart lines from a request, merged per product, size and colour so quantity limits can't be dodged. */
export function parseCart(value: unknown): CartLine[] {
  if (!Array.isArray(value) || value.length === 0) throw new BadRequest('Your cart is empty.')
  if (value.length > MAX_LINES) throw new BadRequest(`Orders are limited to ${MAX_LINES} lines.`)
  const merged = new Map<string, CartLine>()
  for (const raw of value) {
    const item = (raw ?? {}) as Record<string, unknown>
    const id = text(item.id, 'Item id', { max: 100, required: true })!
    const size = text(item.size, 'Size', { max: 20 })
    const color = text(item.color, 'Colour', { max: 40 })
    const quantity = int(item.quantity, 'Quantity', { min: 1, max: MAX_QUANTITY })
    const key = `${id}::${size ?? ''}::${color ?? ''}`
    const line = merged.get(key) ?? { id, size, color, quantity: 0 }
    line.quantity += quantity
    if (line.quantity > MAX_QUANTITY) throw new BadRequest(`You can order up to ${MAX_QUANTITY} of each item.`)
    merged.set(key, line)
  }
  return [...merged.values()]
}

export function parsePromoCode(value: unknown): string | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!code) return null
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new BadRequest('That promo code isn’t valid.')
  return code
}
