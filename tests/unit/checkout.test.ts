// The Checkout module, through its interface: quote, begin, resume, payments.
// In-memory CheckoutStore and a fake CheckoutPayments; nothing leaves the process.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkout, parseCart, RESUME_HOURS,
  type CheckoutPayments, type CheckoutStore, type NewCheckout, type PromoContext, type SavedCheckout,
} from '@/lib/checkout'

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

function memoryStore(promos: Record<string, PromoContext> = {}) {
  const saved = new Map<string, NewCheckout & SavedCheckout>()
  const store: CheckoutStore = {
    products: vi.fn(async (_storeId, ids) => CATALOGUE.filter((p) => ids.includes(p.id))),
    giftProducts: vi.fn(async (_storeId, category) => CATALOGUE.filter((p) => p.category === category)),
    promo: vi.fn(async (_tenant, code) => promos[code] ?? null),
    save: vi.fn(async (c) => {
      const id = `chk-${saved.size + 1}`
      saved.set(c.reference, { ...c, id, status: 'open', orderId: null, createdAt: NOW.toISOString() })
      return { id }
    }),
    find: vi.fn(async (_storeId, reference) => saved.get(reference) ?? null),
    expire: vi.fn(async (id) => { for (const c of saved.values()) if (c.id === id) c.status = 'expired' }),
  }
  return { store, saved }
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
    expect(await c.begin({ lines: [tee(1)], buyer })).toEqual({ ok: false, reason: 'payment_unavailable', message: 'Checkout opens on launch day.' })
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
      .toEqual({ ok: false, reason: 'payment_unavailable', message: 'Checkout opens on launch day.' })
    expect(await make(NOW, { purchasesPaused: true }).resume({ reference: r.checkout, email: buyer.email }))
      .toMatchObject({ ok: false, reason: 'payment_unavailable', message: expect.stringMatching(/paused/) })
  })
})
