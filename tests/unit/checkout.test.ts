// The Checkout module, through its interface: quote, begin, resume, payments.
// In-memory CheckoutStore and a fake CheckoutPayments; nothing leaves the process.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkout, parseCart, parseDelivery, RESUME_HOURS,
  type CheckoutPayments, type CheckoutStore, type Held, type NewCheckout, type PromoContext, type SavedCheckout, type ShippingInputs,
} from '@/lib/checkout'
import { DEFAULT_SETTINGS, type Profile } from '@/lib/shipping/engine'

const NOW = new Date('2026-10-18T12:00:00Z')
const base = { status: 'active', images: [], stock: 5, price: 10000, category: 'Tees' }
const CATALOGUE = [
  { ...base, id: 'tee', name: 'Tee', sizes: ['S', 'M', 'L'], colors: ['black', 'white'] },
  { ...base, id: 'pendant', name: 'Pendant ', members_only: true },
  { ...base, id: 'drop', name: 'Drop', release_date: '2026-11-01' },
  { ...base, id: 'pre', name: 'Pre', stock: 0, preorder: true, preorder_ships_on: '2026-12-01', preorder_limit: 2 },
  { ...base, id: 'gone', name: 'Gone', stock: 0 },
  { ...base, id: 'vape', name: 'Vape', category: 'Vapes' },
  { ...base, id: 'odd', name: 'Odd', price: 3333.33 },
  { ...base, id: 'held', name: 'Held', purchases_paused: true },
  { ...base, id: 'mto', name: 'Custom Tee', fulfilment: 'made_to_order', lead_time_days: 10 },
  { ...base, id: 'lamp', name: 'Galaxy Projector', price: 18000, fulfilment: 'made_to_order', lead_time_days: 14, source_type: 'wholesale' },
  { ...base, id: 'heart', name: 'Heart Pendant', category: 'Gifts', price: 15000, colors: ['Red', 'Black'] },
  { ...base, id: 'cross', name: 'Cross Pendant', category: 'Gifts', price: 15000 },
  { ...base, id: 'gonegift', name: 'Gone Gift', category: 'Gifts', stock: 0 },
]
const promo = (over: Partial<PromoContext['promo']> = {}, uses = 0, customerUses = 0): PromoContext => ({
  uses, customerUses,
  promo: { id: 'p1', code: 'SAVE10', description: '10% off', kind: 'percent', value: 10, min_subtotal: 0,
    starts_at: null, ends_at: null, max_uses: null, once_per_customer: true, active: true, ...over },
})
const buyer = { email: 'ada@x.test', shippingAddress: '1 Test St', shippingCity: 'Lagos', shippingState: 'Lagos', shippingPostalCode: '100001', shippingCountry: 'Nigeria' }
const tee = (quantity = 1) => ({ id: 'tee', size: 'M', color: 'black', quantity })

/**
 * In-memory CheckoutStore, holding stock like the database does: open
 * Checkouts hold their lines; `others` are holds by other shoppers.
 */
function memoryStore(promos: Record<string, PromoContext> = {}) {
  const saved = new Map<string, NewCheckout & SavedCheckout>()
  const others = new Map<string, number>()
  const heldBy = (productId: string, except?: string) =>
    (others.get(productId) ?? 0) + [...saved.values()].filter((c) => c.status === 'open' && c.id !== except)
      .flatMap((c) => c.items).filter((i) => i.id === productId && !i.preorder).reduce((t, i) => t + i.quantity, 0)
  const check = (items: NewCheckout['items'], except?: string): Held | null => {
    for (const i of items) {
      const p = CATALOGUE.find((x) => x.id === i.id)
      if (!p || i.preorder) continue
      const free = p.stock - heldBy(i.id, except)
      if (free < i.quantity) return { productId: i.id, free: Math.max(0, free) }
    }
    return null
  }
  const store: CheckoutStore = {
    products: vi.fn(async (_storeId, ids) => CATALOGUE.filter((p) => ids.includes(p.id))),
    giftProducts: vi.fn(async (_storeId, category) => CATALOGUE.filter((p) => p.category === category)),
    promo: vi.fn(async (_tenant, code) => promos[code] ?? null),
    save: vi.fn(async (c) => {
      const held = check(c.items)
      if (held) return { ok: false as const, held }
      const id = `chk-${saved.size + 1}`
      saved.set(c.reference, { ...c, id, status: 'open', orderId: null, createdAt: NOW.toISOString() })
      return { ok: true as const, id }
    }),
    find: vi.fn(async (_storeId, reference) => saved.get(reference) ?? null),
    expire: vi.fn(async (id) => { for (const c of saved.values()) if (c.id === id) c.status = 'expired' }),
    renewHold: vi.fn(async (id) => {
      const c = [...saved.values()].find((x) => x.id === id)
      if (!c || c.status !== 'open') return 'closed' as const
      return check(c.items, id) ?? 'renewed' as const
    }),
    holds: vi.fn(async (_storeId: string, ids: string[]) =>
      ids.map((productId) => ({ productId, preorder: false, quantity: heldBy(productId) })).filter((h) => h.quantity > 0)),
  }
  return { store, saved, others }
}

function fakePayments(over: Partial<CheckoutPayments> = {}) {
  const payments: CheckoutPayments = {
    available: () => true,
    start: vi.fn(async (p) => ({ ok: true as const, paymentUrl: `https://pay.test/${p.checkoutId}` })),
    ...over,
  }
  return payments
}

let mem: ReturnType<typeof memoryStore>
let payments: CheckoutPayments
const shop = { tenantId: 't1', storeId: 's1', currency: 'NGN', hiddenCategories: ['Vapes'], timeZone: 'Africa/Lagos', paymentsOpenOn: '2026-10-01' as string | null, purchasesPaused: false, giftCategory: null as string | null, giftMinSubtotal: 0 }
let refs = 0
const make = (now = NOW, over: Partial<typeof shop> = {}) => checkout({ store: mem.store, payments, shop: { ...shop, ...over }, now: () => now, newReference: (prefix) => `${prefix}-TEST${++refs}` })

beforeEach(() => {
  mem = memoryStore({ SAVE10: promo() })
  payments = fakePayments()
})

describe('quote', () => {
  it('prices from the catalogue and reports each problem on its own line', async () => {
    const q = await make().quote({ lines: [
      tee(2),
      { id: 'pendant', size: null, quantity: 1 },
      { id: 'drop', size: null, quantity: 1 },
      { id: 'gone', size: null, quantity: 1 },
      { id: 'ghost', size: null, quantity: 1 },
    ] })
    expect(q.lines.map((l) => l.issue)).toEqual([
      null, 'Pendant is for members only.', 'Drop isn’t released yet.', 'Gone is sold out.',
      'An item in your cart is no longer available. Please remove it.',
    ])
    expect(q.subtotalMinor).toBe(2_000_000) // only the valid line counts
    expect(q.ok).toBe(false)
  })

  it('never sells hidden categories', async () => {
    const q = await make().quote({ lines: [{ id: 'vape', size: null, quantity: 1 }] })
    expect(q.lines[0].issue).toMatch(/no longer available/)
  })

  it('requires a valid size and colour where the product has them, and drops them where it has none', async () => {
    const q = await make().quote({ lines: [{ id: 'tee', size: 'XXL', color: 'black', quantity: 1 }, { id: 'tee', size: 'M', color: null, quantity: 1 }] })
    expect(q.lines.map((l) => l.issue)).toEqual(['Choose a size for Tee.', 'Choose a colour for Tee.'])
    const pre = await make().quote({ lines: [{ id: 'pre', size: 'M', color: 'red', quantity: 1 }] })
    expect(pre.lines[0]).toMatchObject({ size: null, color: null, issue: null, preorder: true, shipsOn: '2026-12-01' })
    expect(pre.isPreorder).toBe(true)
  })

  it('limits stock across sizes and pre-orders to their allowance', async () => {
    const q = await make().quote({ lines: [{ id: 'tee', size: 'S', color: 'black', quantity: 3 }, { id: 'tee', size: 'M', color: 'black', quantity: 3 }] })
    expect(q.lines[0].issue).toBe('Only 5 left of Tee.')
    const pre = await make().quote({ lines: [{ id: 'pre', size: null, quantity: 3 }] })
    expect(pre.lines[0].issue).toBe('Only 2 of Pre left to pre-order.')
  })

  it('is buyable from the release day, in the store’s time zone', async () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Lagos.
    const q = await make(new Date('2026-10-31T23:30:00Z')).quote({ lines: [{ id: 'drop', size: null, quantity: 1 }] })
    expect(q.lines[0].issue).toBeNull()
  })
})

describe('promo codes in a quote', () => {
  it('applies to the subtotal; percentages round down', async () => {
    mem = memoryStore({ SAVE10: promo(), ODD: promo({ code: 'ODD', value: 12.5 }) })
    const q = await make().quote({ lines: [tee(2)], promoCode: 'SAVE10' })
    expect(q).toMatchObject({ subtotalMinor: 2_000_000, discountMinor: 200_000, totalMinor: 1_800_000, ok: true })
    const odd = await make().quote({ lines: [{ id: 'odd', size: null, quantity: 1 }], promoCode: 'ODD' })
    expect(odd.discountMinor).toBe(41_666) // 12.5% of ₦3,333.33
  })

  it('never takes the total below ₦100', async () => {
    mem = memoryStore({ BIG: promo({ code: 'BIG', kind: 'fixed', value: 50_000 }) })
    const q = await make().quote({ lines: [tee(1)], promoCode: 'BIG' })
    expect(q.totalMinor).toBe(10_000)
  })

  it('honours dates, minimum order, total uses, one use per customer and switching off', async () => {
    const cases: [PromoContext, string][] = [
      [promo({ starts_at: '2026-10-19T00:00:00Z' }), 'That promo code isn’t active yet.'],
      [promo({ ends_at: '2026-10-18T00:00:00Z' }), 'That promo code has expired.'],
      [promo({ min_subtotal: 20000 }), 'That promo code needs an order of at least ₦20,000.00.'],
      [promo({ max_uses: 5 }, 5), 'That promo code has been fully used.'],
      [promo({}, 1, 1), 'You’ve already used that promo code.'],
      [promo({ active: false }), 'That promo code isn’t valid.'],
    ]
    for (const [ctx, message] of cases) {
      mem = memoryStore({ SAVE10: ctx })
      const q = await make().quote({ lines: [tee(1)], promoCode: 'SAVE10', email: 'ada@x.test' })
      expect(q.promoError).toBe(message)
      expect(q.ok).toBe(false)
    }
    mem = memoryStore({ SAVE10: promo({ once_per_customer: false }, 1, 1) })
    expect((await make().quote({ lines: [tee(1)], promoCode: 'SAVE10' })).discountMinor).toBe(100_000)
  })

  it('reports an unknown code', async () => {
    expect((await make().quote({ lines: [tee(1)], promoCode: 'NOPE' })).promoError).toBe('That promo code isn’t valid.')
  })
})

describe('begin', () => {
  it('saves a Checkout and asks for exactly its total; no Order exists yet', async () => {
    const r = await make().begin({ lines: [tee(2)], promoCode: 'SAVE10', buyer })
    expect(r).toMatchObject({ ok: true, checkout: expect.stringMatching(/^CHK-/), paymentUrl: 'https://pay.test/chk-1' })
    const saved = [...mem.saved.values()][0]
    expect(saved).toMatchObject({ total: '18000.00', subtotal: '20000.00', discount: '2000.00', promoCodeId: 'p1', promoCode: 'SAVE10', status: 'open', orderId: null })
    expect(saved.items[0]).toMatchObject({ id: 'tee', size: 'M', color: 'black', quantity: 2, price: 10000 })
    expect(payments.start).toHaveBeenCalledWith(expect.objectContaining({ checkoutId: 'chk-1', amountMinor: 1_800_000, email: 'ada@x.test' }))
  })

  it('prices the cart once', async () => {
    await make().begin({ lines: [tee(1)], buyer })
    expect(mem.store.products).toHaveBeenCalledTimes(1)
  })

  it('checks the cart before payment availability, so the shopper hears the real problem', async () => {
    payments = fakePayments({ available: () => false })
    const bad = await make().begin({ lines: [{ id: 'tee', size: 'M', color: 'black', quantity: 9 }], buyer })
    expect(bad).toMatchObject({ ok: false, reason: 'cart_invalid', message: 'Only 5 left of Tee.' })
    const good = await make().begin({ lines: [tee(1)], buyer })
    expect(good).toMatchObject({ ok: false, reason: 'payment_unavailable' })
    expect(mem.store.save).not.toHaveBeenCalled()
  })

  it('refuses a promo code that does not apply, naming why', async () => {
    const r = await make().begin({ lines: [tee(1)], promoCode: 'NOPE', buyer })
    expect(r).toMatchObject({ ok: false, reason: 'cart_invalid', message: 'That promo code isn’t valid.' })
  })

  it('says on every line, and on the saved Checkout, when an item is made to order and how long it takes', async () => {
    const q = await make().quote({ lines: [{ id: 'mto', size: null, quantity: 1 }, tee(1)] })
    expect(q.lines.map((l) => l.madeToOrderDays)).toEqual([10, null])
    await make().begin({ lines: [{ id: 'mto', size: null, quantity: 1 }, tee(1)], buyer })
    const items = [...mem.saved.values()][0].items
    expect(items[0]).toMatchObject({ id: 'mto', made_to_order: true, lead_time_days: 10 })
    expect(items[1]).not.toHaveProperty('made_to_order')
  })

  it('marks pre-orders on the Checkout and its lines', async () => {
    await make().begin({ lines: [{ id: 'pre', size: null, quantity: 1 }], buyer })
    const saved = [...mem.saved.values()][0]
    expect(saved.isPreorder).toBe(true)
    expect(saved.items[0]).toMatchObject({ preorder: true, ships_on: '2026-12-01' })
  })

  it('expires the Checkout when Flutterwave gives no link, and says nothing was charged', async () => {
    payments = fakePayments({ start: vi.fn(async () => ({ ok: false as const })) })
    const r = await make().begin({ lines: [tee(1)], buyer })
    expect(r).toMatchObject({ ok: false, reason: 'payment_unavailable', message: expect.stringMatching(/Nothing was charged/) })
    expect([...mem.saved.values()][0].status).toBe('expired')
  })
})

describe('holding the last pieces', () => {
  it('a quote counts what other shoppers are holding, and says when the last ones are in a checkout', async () => {
    mem.others.set('tee', 4)
    expect((await make().quote({ lines: [tee(2)] })).lines[0].issue).toBe('Only 1 left of Tee.')
    mem.others.set('tee', 5)
    expect((await make().quote({ lines: [tee(1)] })).lines[0].issue).toBe('The last Tee is in someone else’s checkout right now. It may come back within 30 minutes.')
  })

  it('refuses a checkout when someone else holds the last pieces by the time it is saved, and starts no payment', async () => {
    mem.store.holds = vi.fn(async () => []) // free when priced...
    mem.others.set('tee', 5) // ...taken by the time it's saved
    const r = await make().begin({ lines: [tee(1)], buyer })
    expect(r).toMatchObject({ ok: false, reason: 'cart_invalid', message: 'The last Tee is in someone else’s checkout right now. It may come back within 30 minutes.' })
    expect(payments.start).not.toHaveBeenCalled()
    mem.others.set('tee', 3)
    expect(await make().begin({ lines: [tee(3)], buyer })).toMatchObject({ ok: false, message: 'Only 2 of Tee can be bought right now. Please change the quantity.' })
  })

  it('resuming holds the lines again, or says something went while the shopper was away', async () => {
    const r = await make().begin({ lines: [tee(5)], buyer })
    if (!r.ok) throw new Error('begin failed')
    expect(await make().resume({ reference: r.checkout, email: buyer.email })).toMatchObject({ ok: true })
    mem.others.set('tee', 1)
    expect(await make().resume({ reference: r.checkout, email: buyer.email }))
      .toMatchObject({ ok: false, reason: 'expired', message: 'Something in this checkout was bought while you were away. Please start again from your cart.' })
    expect(payments.start).toHaveBeenCalledTimes(2) // begin and the first resume only
  })
})

describe('free gift', () => {
  const gifts = (over: Partial<typeof shop> = {}) => make(NOW, { giftCategory: 'Gifts', ...over })

  it('offers the gift pieces, at their value, once the cart has something to pay for', async () => {
    const q = await gifts().quote({ lines: [tee(1)] })
    expect(q.gift).toMatchObject({ eligible: true, minMinor: 0, line: null, issue: null })
    expect(q.gift!.options.map((o) => [o.id, o.valueMinor, o.available])).toEqual([
      ['heart', 1_500_000, true], ['cross', 1_500_000, true], ['gonegift', 1_000_000, false],
    ])
    const empty = await gifts().quote({ lines: [{ id: 'gone', size: null, quantity: 1 }] })
    expect(empty.gift!.eligible).toBe(false)
  })

  it('adds the picked gift last, free, and charges only for the cart', async () => {
    const r = await gifts().begin({ lines: [tee(1)], gift: { id: 'heart', color: 'Red' }, buyer })
    expect(r.ok).toBe(true)
    const saved = [...mem.saved.values()][0]
    expect(saved).toMatchObject({ subtotal: '10000.00', total: '10000.00' })
    expect(saved.items).toHaveLength(2)
    expect(saved.items[1]).toMatchObject({ id: 'heart', name: 'Heart Pendant', price: 0, quantity: 1, color: 'Red', size: null, gift: true })
    expect(payments.start).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 1_000_000 }))
  })

  it('holds the gift back until the cart reaches the minimum, without blocking payment', async () => {
    const below = await gifts({ giftMinSubtotal: 20000 }).quote({ lines: [tee(1)], gift: { id: 'cross' } })
    expect(below.gift).toMatchObject({ eligible: false, minMinor: 2_000_000, line: null, issue: null })
    expect(below.ok).toBe(true)
    const at = await gifts({ giftMinSubtotal: 20000 }).quote({ lines: [tee(2)], gift: { id: 'cross' } })
    expect(at.gift!.line).toMatchObject({ id: 'cross', color: null, unitMinor: 0 })
  })

  it('refuses a gift that is gone, or without a colour it needs, naming why', async () => {
    const gone = await gifts().begin({ lines: [tee(1)], gift: { id: 'gonegift' }, buyer })
    expect(gone).toMatchObject({ ok: false, reason: 'cart_invalid', message: 'Your free gift is no longer available. Please pick another.' })
    const colour = await gifts().quote({ lines: [tee(1)], gift: { id: 'heart', color: 'Green' } })
    expect(colour.gift!.issue).toBe('Choose a colour for your free Heart Pendant.')
    expect(colour.ok).toBe(false)
    const notAGift = await gifts().quote({ lines: [tee(1)], gift: { id: 'tee', color: 'black' } })
    expect(notAGift.gift!.issue).toMatch(/no longer available/)
  })

  it('never sells gift pieces as cart lines', async () => {
    const q = await gifts().quote({ lines: [{ id: 'heart', size: null, color: 'Red', quantity: 1 }] })
    expect(q.lines[0].issue).toMatch(/no longer available/)
  })

  it('offers nothing, and ignores a pick, when the store has no gift', async () => {
    const q = await make().quote({ lines: [tee(1)], gift: { id: 'heart', color: 'Red' } })
    expect(q.gift).toBeNull()
    expect(mem.store.giftProducts).not.toHaveBeenCalled()
    await make().begin({ lines: [tee(1)], gift: { id: 'heart', color: 'Red' }, buyer })
    expect([...mem.saved.values()][0].items).toHaveLength(1)
  })
})

describe('resume', () => {
  async function begun() {
    const r = await make().begin({ lines: [tee(1)], buyer })
    if (!r.ok) throw new Error('begin failed')
    return r.checkout
  }

  it('gives a payment link again for an open Checkout, with the same email in any case', async () => {
    const ref = await begun()
    expect(await make().resume({ reference: ref, email: 'ADA@x.test' })).toEqual({ ok: true, paymentUrl: 'https://pay.test/chk-1' })
  })

  it('refuses a different email, a paid Checkout, an expired one, and one older than the resume window', async () => {
    const ref = await begun()
    expect(await make().resume({ reference: ref, email: 'eve@x.test' })).toMatchObject({ ok: false, reason: 'not_found' })
    const saved = mem.saved.get(ref)!
    saved.orderId = 'order-1'
    expect(await make().resume({ reference: ref, email: buyer.email })).toMatchObject({ ok: false, reason: 'already_paid' })
    saved.orderId = null
    saved.status = 'expired'
    expect(await make().resume({ reference: ref, email: buyer.email })).toMatchObject({ ok: false, reason: 'expired' })
    saved.status = 'open'
    const later = new Date(NOW.getTime() + (RESUME_HOURS + 1) * 3_600_000)
    expect(await make(later).resume({ reference: ref, email: buyer.email })).toMatchObject({ ok: false, reason: 'expired' })
  })
})

describe('reading a cart from a request', () => {
  it('merges duplicate lines so quantity limits can’t be dodged', () => {
    expect(parseCart([tee(2), tee(3)])).toEqual([{ id: 'tee', size: 'M', color: 'black', quantity: 5 }])
    expect(() => parseCart([tee(15), tee(10)])).toThrow(/up to 20/)
    expect(() => parseCart([])).toThrow(/empty/)
  })
})

describe('launch day and pauses', () => {
  it('takes no payments before a launch day is set, but still prices the cart', async () => {
    const c = make(NOW, { paymentsOpenOn: null })
    expect(c.payments()).toEqual({ open: false, closedFor: 'launch', opensOn: null })
    expect((await c.quote({ lines: [tee(1)] })).ok).toBe(true)
    expect(await c.begin({ lines: [tee(1)], buyer })).toEqual({ ok: false, reason: 'payment_unavailable', message: 'Checkout opens in November.' })
    expect(mem.store.save).not.toHaveBeenCalled()
    expect(payments.start).not.toHaveBeenCalled()
  })

  it('names the launch day until it comes, then opens at midnight in the store’s time zone', async () => {
    const before = make(new Date('2026-10-31T22:30:00Z'), { paymentsOpenOn: '2026-11-01' }) // 23:30 in Lagos
    expect(before.payments()).toEqual({ open: false, closedFor: 'launch', opensOn: '2026-11-01' })
    expect(await before.begin({ lines: [tee(1)], buyer })).toMatchObject({ ok: false, message: 'Checkout opens on 1 November 2026.' })
    const after = make(new Date('2026-10-31T23:30:00Z'), { paymentsOpenOn: '2026-11-01' }) // 00:30 on 1 Nov in Lagos
    expect(after.payments().open).toBe(true)
    expect(await after.begin({ lines: [tee(1)], buyer })).toMatchObject({ ok: true })
  })

  it('takes no payments while the store is paused, and says so', async () => {
    const c = make(NOW, { purchasesPaused: true })
    expect(c.payments()).toEqual({ open: false, closedFor: 'paused', opensOn: '2026-10-01' })
    expect(await c.begin({ lines: [tee(1)], buyer })).toEqual({ ok: false, reason: 'payment_unavailable', message: 'Purchases are paused right now. Please check back soon.' })
    expect(payments.start).not.toHaveBeenCalled()
  })

  it('refuses a paused product in a quote, while the rest of the cart can still be bought', async () => {
    const q = await make().quote({ lines: [tee(1), { id: 'held', size: null, quantity: 1 }] })
    expect(q.lines.map((l) => l.issue)).toEqual([null, 'Held can’t be bought right now.'])
    expect(q.ok).toBe(false)
  })

  it('still reports a cart problem first', async () => {
    const r = await make(NOW, { paymentsOpenOn: null }).begin({ lines: [{ id: 'gone', size: null, quantity: 1 }], buyer })
    expect(r).toMatchObject({ ok: false, reason: 'cart_invalid' })
  })

  it('gives no payment link for an earlier Checkout while payments are closed', async () => {
    const r = await make().begin({ lines: [tee(1)], buyer })
    if (!r.ok) throw new Error('begin failed')
    expect(await make(NOW, { paymentsOpenOn: null }).resume({ reference: r.checkout, email: buyer.email }))
      .toEqual({ ok: false, reason: 'payment_unavailable', message: 'Checkout opens in November.' })
    expect(await make(NOW, { purchasesPaused: true }).resume({ reference: r.checkout, email: buyer.email }))
      .toMatchObject({ ok: false, reason: 'payment_unavailable', message: expect.stringMatching(/paused/) })
  })
})

describe('shipping allocation', () => {
  // The brief's illustrative ₦12,000/kg, as test data only.
  const rate = { id: 'air-1', method: 'air' as const, provider: 'Test Cargo', currency: 'NGN', fxRate: null, billingUnit: 'kg' as const, ratePerUnit: 12000,
    volumetricDivisor: null, minChargeable: null, roundingIncrement: null, minShipmentCharge: null, surchargePerUnit: null, handlingPerShipment: null,
    clearanceIncluded: true, clearancePerUnit: null, insurancePct: null, contingencyPct: null, typicalShipmentUnits: null,
    effectiveFrom: '2026-10-01', effectiveTo: null, status: 'active' as const, confirmed: true }
  const profile = (productId: string, weightKg: number): Profile => ({
    productId, variant: '', method: 'air', weightKg, lengthCm: null, widthCm: null, heightCm: null, packagingKg: null, dataStatus: 'verified', classKey: null,
    valueTier: 'standard', targetPct: null, minContributionKobo: null, maxContributionKobo: null, adjustmentFactor: 1, clearanceEligible: true,
    subsidyEligible: true, platformContributionKobo: null, competitorPriceKobo: null, override: null })
  const inputs = (over: Partial<ShippingInputs['context']> = {}): ShippingInputs => ({
    context: { today: '2026-10-18', now: NOW, settings: DEFAULT_SETTINGS, classes: [], rates: [rate], campaigns: [], seaFreightKobo: {}, ...over },
    profiles: [profile('tee', 0.2), profile('heart', 0.05)], costs: {}, categories: { tee: 'Tees', heart: 'Gifts' },
  })

  it('saves the order’s allocation with the Checkout and leaves the total exactly as priced', async () => {
    mem.store.shipping = vi.fn(async () => inputs())
    const r = await make().begin({ lines: [tee(2)], promoCode: 'SAVE10', buyer })
    expect(r.ok).toBe(true)
    const saved = [...mem.saved.values()][0]
    expect(saved).toMatchObject({ subtotal: '20000.00', discount: '2000.00', total: '18000.00' })
    expect(payments.start).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 1_800_000 }))
    expect(saved.shipping).toMatchObject({ status: 'estimated', rates: { air: { id: 'air-1' } } })
    expect(saved.shipping!.lines[0]).toMatchObject({ productId: 'tee', quantity: 2, freightKobo: 480_000, contributionKobo: 240_000, discountKobo: 200_000 })
  })

  it('allocates freight to the free gift too, with nothing to recover it from', async () => {
    mem.store.shipping = vi.fn(async () => inputs())
    await make(NOW, { giftCategory: 'Gifts' }).begin({ lines: [tee(1)], gift: { id: 'heart', color: 'Red' }, buyer })
    const s = [...mem.saved.values()][0].shipping!
    expect(s.lines.map((l) => [l.productId, l.gift, l.freightKobo, l.contributionKobo])).toEqual([['tee', false, 240_000, 120_000], ['heart', true, 60_000, 0]])
  })

  it('ignores anything a shopper sends about prices or contributions', async () => {
    mem.store.shipping = vi.fn(async () => inputs())
    const lines = parseCart([{ id: 'tee', size: 'M', color: 'black', quantity: 1, price: 1, contribution: 0, shippingContribution: 999999, freight: 0 }])
    expect(lines).toEqual([{ id: 'tee', size: 'M', color: 'black', quantity: 1 }])
    await make().begin({ lines, buyer })
    expect([...mem.saved.values()][0].shipping!.lines[0]).toMatchObject({ contributionKobo: 120_000, freightKobo: 240_000 })
  })

  it('still takes the order, with no allocation, when shipping can’t be worked out', async () => {
    mem.store.shipping = vi.fn(async () => { throw new Error('database unavailable') })
    const r = await make().begin({ lines: [tee(1)], buyer })
    expect(r.ok).toBe(true)
    expect([...mem.saved.values()][0]).toMatchObject({ total: '10000.00', shipping: null })
  })

  it('with no rate set, the allocation says it is incomplete rather than guessing', async () => {
    mem.store.shipping = vi.fn(async () => inputs({ rates: [] }))
    await make().begin({ lines: [tee(1)], buyer })
    expect([...mem.saved.values()][0].shipping).toMatchObject({ status: 'incomplete', totals: { freightKobo: 0 } })
  })
})

describe('delivery', () => {
  const lamp = (quantity = 1) => ({ id: 'lamp', size: null, quantity })

  it('in-stock orders have standard delivery only, free, and say when they arrive', async () => {
    const q = await make().quote({ lines: [tee(1)], delivery: 'express' })
    expect(q.delivery).toMatchObject({ option: 'standard', expressFeeMinor: null, feeMinor: 0 })
    expect(q.delivery.estimates.standard).toEqual({ minDays: 3, maxDays: 7, from: '2026-10-21', to: '2026-10-25' })
    expect(q.totalMinor).toBe(1_000_000)
  })

  it('Express is offered for items from China and adds its fee to the total that is charged', async () => {
    mem.store.weights = vi.fn(async () => ({ lamp: 0.6 }))
    const standard = await make().quote({ lines: [lamp(1)] })
    expect(standard.delivery).toMatchObject({ option: 'standard', expressFeeMinor: 250_000, feeMinor: 0 })
    expect(standard.delivery.estimates).toMatchObject({ standard: { minDays: 14, maxDays: 21 }, express: { minDays: 10, maxDays: 17 } })

    const r = await make().begin({ lines: [lamp(1)], delivery: 'express', buyer })
    expect(r.ok).toBe(true)
    const saved = [...mem.saved.values()][0]
    expect(saved).toMatchObject({ subtotal: '18000.00', deliveryOption: 'express', deliveryFee: '2500.00', total: '20500.00' })
    expect(saved.deliveryEstimate).toMatchObject({ minDays: 10, maxDays: 17 })
    expect(payments.start).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 2_050_000 }))
  })

  it('prices Express on the server’s weights: ₦1,000 more per extra kg or part', async () => {
    mem.store.weights = vi.fn(async () => ({ lamp: 0.6 }))
    const q = await make().quote({ lines: [lamp(4)], delivery: 'express' }) // 2.4 kg
    expect(q.delivery.feeMinor).toBe(450_000)
    expect(q.totalMinor).toBe(4 * 1_800_000 + 450_000)
  })

  it('charges the base fee, never less, when a product has no packed weight yet, and says so', async () => {
    mem.store.weights = vi.fn(async () => ({ lamp: null }))
    const q = await make().quote({ lines: [lamp(3)], delivery: 'express' })
    expect(q.delivery).toMatchObject({ feeMinor: 250_000, weightIncomplete: true })
  })

  it('counts dates from launch day while checkout is closed, and gives days when there is no launch day', async () => {
    const before = await make(NOW, { paymentsOpenOn: '2026-11-13' }).quote({ lines: [tee(1)] })
    expect(before.delivery.estimates.standard).toMatchObject({ from: '2026-11-16', to: '2026-11-20' })
    const none = await make(NOW, { paymentsOpenOn: null }).quote({ lines: [tee(1)] })
    expect(none.delivery.estimates.standard).toMatchObject({ from: null, to: null, minDays: 3, maxDays: 7 })
  })

  it('reads only standard or express from a request', () => {
    expect(parseDelivery(undefined)).toBe('standard')
    expect(parseDelivery('express')).toBe('express')
    expect(() => parseDelivery('overnight')).toThrow('Choose standard or express delivery.')
  })
})
