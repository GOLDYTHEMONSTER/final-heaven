// What can be bought, at what price, with which promo code. Pure rules shared
// by the storefront, the cart quote and checkout.
import { describe, expect, it } from 'vitest'
import { purchaseState, saleOriginalPrice, storeToday, toPublicProduct } from '@/lib/catalog'
import { evaluatePromo, priceOrder, quoteCart, type PromoContext } from '@/lib/orders'

const TODAY = '2026-10-18'
const base = { status: 'active', images: [], stock: 5, price: 10000 }
const catalogue = [
  { ...base, id: 'tee', name: 'Tee', sizes: ['S', 'M', 'L'], colors: ['black', 'white'] },
  { ...base, id: 'pendant', name: 'Pendant', members_only: true },
  { ...base, id: 'drop', name: 'Drop', release_date: '2026-11-01' },
  { ...base, id: 'pre', name: 'Pre', stock: 0, preorder: true, preorder_ships_on: '2026-12-01', preorder_limit: 2 },
  { ...base, id: 'gone', name: 'Gone', stock: 0 },
]
const promo = (over: Partial<PromoContext['promo']> = {}, uses = 0, customerUses = 0): PromoContext => ({
  uses, customerUses,
  promo: { id: 'p1', code: 'SAVE10', description: '10% off', kind: 'percent', value: 10, min_subtotal: 0,
    starts_at: null, ends_at: null, max_uses: null, once_per_customer: true, active: true, ...over },
})

describe('purchase state', () => {
  it('blocks members-only items while membership is not live', () => {
    expect(purchaseState(catalogue[1], TODAY)).toEqual({ state: 'members_only' })
  })
  it('shows unreleased items as coming soon, and buyable from the release day', () => {
    expect(purchaseState(catalogue[2], TODAY)).toEqual({ state: 'coming_soon', releaseDate: '2026-11-01' })
    expect(purchaseState(catalogue[2], '2026-11-01').state).toBe('available')
  })
  it('sells pre-orders against their own allowance, not stock', () => {
    expect(purchaseState(catalogue[3], TODAY)).toEqual({ state: 'preorder', shipsOn: '2026-12-01', maxQuantity: 2 })
    expect(purchaseState({ ...catalogue[3], preorder_limit: 0 }, TODAY).state).toBe('sold_out')
  })
  it('is sold out at zero stock and unavailable when not active', () => {
    expect(purchaseState(catalogue[4], TODAY).state).toBe('sold_out')
    expect(purchaseState({ ...base, id: 'x', name: 'X', status: 'draft' }, TODAY).state).toBe('unavailable')
  })
  it('uses the store’s own date, not the server’s', () => {
    // 23:30 UTC on the 17th is already the 18th in Lagos (UTC+1).
    expect(storeToday('Africa/Lagos', new Date('2026-10-17T23:30:00Z'))).toBe('2026-10-18')
  })
})

describe('sale prices', () => {
  it('only counts as a sale when the original price is higher', () => {
    expect(saleOriginalPrice({ price: 15000, original_price: 40 })).toBeNull()
    expect(saleOriginalPrice({ price: 20000, original_price: 40000 })).toBe(40000)
    expect(toPublicProduct({ ...catalogue[0], original_price: 40 }, TODAY).originalPrice).toBeUndefined()
  })
})

describe('cart quote', () => {
  it('reports each problem on its line instead of failing the whole cart', () => {
    const q = quoteCart([
      { id: 'tee', size: 'M', color: 'black', quantity: 1 },
      { id: 'pendant', size: null, quantity: 1 },
      { id: 'drop', size: null, quantity: 1 },
      { id: 'gone', size: null, quantity: 1 },
    ], catalogue, 'NGN', { today: TODAY })
    expect(q.lines.map((l) => l.issue)).toEqual([null, 'Pendant is for members only.', 'Drop isn’t released yet.', 'Gone is sold out.'])
    expect(q.subtotalMinor).toBe(1_000_000) // only the valid line counts
    expect(q.ok).toBe(false)
  })

  it('requires a valid size and colour where the product has them, and drops them where it has none', () => {
    const q = quoteCart([
      { id: 'tee', size: 'XXL', color: 'black', quantity: 1 },
      { id: 'tee', size: 'M', color: null, quantity: 1 },
    ], catalogue, 'NGN', { today: TODAY })
    expect(q.lines.map((l) => l.issue)).toEqual(['Choose a size for Tee.', 'Choose a colour for Tee.'])
    const pre = quoteCart([{ id: 'pre', size: 'M', color: 'red', quantity: 1 }], catalogue, 'NGN', { today: TODAY })
    expect(pre.lines[0]).toMatchObject({ size: null, color: null, issue: null, preorder: true, shipsOn: '2026-12-01' })
    expect(pre.isPreorder).toBe(true)
  })

  it('limits pre-orders to the allowance, across sizes', () => {
    const q = quoteCart([{ id: 'pre', size: null, quantity: 3 }], catalogue, 'NGN', { today: TODAY })
    expect(q.lines[0].issue).toBe('Only 2 of Pre left to pre-order.')
  })

  it('applies a promo code to the subtotal and charges exactly the discounted total', () => {
    const lines = [{ id: 'tee', size: 'M', color: 'black', quantity: 2 }]
    const priced = priceOrder(lines, catalogue, 'NGN', { today: TODAY, promoCode: 'SAVE10', promo: promo() })
    expect(priced).toMatchObject({ subtotalMinor: 2_000_000, discountMinor: 200_000, totalMinor: 1_800_000 })
    expect(priced.promo).toMatchObject({ code: 'SAVE10', discountMinor: 200_000 })
    expect(priced.items[0]).toMatchObject({ id: 'tee', size: 'M', color: 'black', quantity: 2, price: 10000 })
  })

  it('refuses to place an order with any problem or a promo code that does not apply', () => {
    expect(() => priceOrder([{ id: 'pendant', size: null, quantity: 1 }], catalogue, 'NGN', { today: TODAY })).toThrow(/members only/)
    expect(() => priceOrder([{ id: 'tee', size: 'M', color: 'black', quantity: 1 }], catalogue, 'NGN',
      { today: TODAY, promoCode: 'NOPE', promo: null })).toThrow(/isn’t valid/)
  })
})

describe('promo codes', () => {
  const now = new Date('2026-10-18T12:00:00Z')
  it('rounds percentages down and caps any discount so at least ₦100 is charged', () => {
    expect(evaluatePromo(promo({ value: 12.5 }), 333_333, 'NGN', now)).toEqual({ discountMinor: 41_666 })
    expect(evaluatePromo(promo({ kind: 'fixed', value: 50_000 }), 1_000_000, 'NGN', now)).toEqual({ discountMinor: 990_000 })
  })
  it('honours dates, minimum order, total uses and one use per customer', () => {
    expect(evaluatePromo(promo({ starts_at: '2026-10-19T00:00:00Z' }), 1_000_000, 'NGN', now)).toEqual({ error: 'That promo code isn’t active yet.' })
    expect(evaluatePromo(promo({ ends_at: '2026-10-18T00:00:00Z' }), 1_000_000, 'NGN', now)).toEqual({ error: 'That promo code has expired.' })
    expect(evaluatePromo(promo({ min_subtotal: 20000 }), 1_000_000, 'NGN', now)).toEqual({ error: 'That promo code needs an order of at least ₦20,000.00.' })
    expect(evaluatePromo(promo({ max_uses: 5 }, 5), 1_000_000, 'NGN', now)).toEqual({ error: 'That promo code has been fully used.' })
    expect(evaluatePromo(promo({}, 1, 1), 1_000_000, 'NGN', now)).toEqual({ error: 'You’ve already used that promo code.' })
    expect(evaluatePromo(promo({ once_per_customer: false }, 1, 1), 1_000_000, 'NGN', now)).toEqual({ discountMinor: 100_000 })
    expect(evaluatePromo(promo({ active: false }), 1_000_000, 'NGN', now)).toEqual({ error: 'That promo code isn’t valid.' })
  })
})
