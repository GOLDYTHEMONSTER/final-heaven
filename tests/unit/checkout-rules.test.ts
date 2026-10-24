// Purchase state and sale prices: the catalogue rules the storefront shows and
// the Checkout module enforces. Pricing and promo codes are tested through the
// Checkout module (checkout.test.ts).
import { describe, expect, it } from 'vitest'
import { purchaseState, saleOriginalPrice, storeToday, toPublicProduct } from '@/lib/catalog'

const TODAY = '2026-10-18'
const base = { status: 'active', images: [], stock: 5, price: 10000 }
const catalogue = [
  { ...base, id: 'tee', name: 'Tee', sizes: ['S', 'M', 'L'], colors: ['black', 'white'] },
  { ...base, id: 'pendant', name: 'Pendant', members_only: true },
  { ...base, id: 'drop', name: 'Drop', release_date: '2026-11-01' },
  { ...base, id: 'pre', name: 'Pre', stock: 0, preorder: true, preorder_ships_on: '2026-12-01', preorder_limit: 2 },
  { ...base, id: 'gone', name: 'Gone', stock: 0 },
]

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
  it('blocks a product paused from the admin, whatever its stock or pre-order', () => {
    expect(purchaseState({ ...catalogue[0], purchases_paused: true }, TODAY)).toEqual({ state: 'paused' })
    expect(purchaseState({ ...catalogue[3], purchases_paused: true }, TODAY)).toEqual({ state: 'paused' })
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
