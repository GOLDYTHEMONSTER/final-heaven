// Discovery ranking: the order of the homepage feed, the shop's Featured sort
// and related products. Deterministic per seed, never repeats across pages,
// follows the shopper's interests without collapsing into one category.
import { describe, expect, it } from 'vitest'
import { EMPTY_PROFILE, buildProfile, rankProducts, scoreProduct } from '@/lib/discovery'
import type { Product, PurchaseState } from '@/lib/catalog'

const NOW = Date.parse('2026-10-22T12:00:00Z')
const available: PurchaseState = { state: 'available', maxQuantity: 5 }
const p = (id: string, category: string, extra: Partial<Product> = {}): Product => ({
  id, name: id, price: 10000, category, stock: 5, status: 'active', purchase: available, tags: [], ...extra,
})

const catalogue = [
  p('tee1', 'T-Shirts', { tags: ['angel'] }), p('tee2', 'T-Shirts', { tags: ['angel'] }), p('tee3', 'T-Shirts'),
  p('tee4', 'T-Shirts'), p('hood1', 'Hoodies'), p('hood2', 'Hoodies'), p('cap', 'Accessories'),
  p('shoe', 'Shoes'), p('gone', 'T-Shirts', { purchase: { state: 'sold_out' } }),
]

describe('rankProducts', () => {
  it('returns every product once, and the same order for the same seed', () => {
    const a = rankProducts(catalogue, EMPTY_PROFILE, { seed: 7, now: NOW })
    expect(new Set(a.map((x) => x.id)).size).toBe(catalogue.length)
    expect(rankProducts(catalogue, EMPTY_PROFILE, { seed: 7, now: NOW }).map((x) => x.id)).toEqual(a.map((x) => x.id))
  })

  it('never repeats a product across pages', () => {
    const shown: string[] = []
    let tail: string[] = []
    for (let page = 0; page < 4; page++) {
      const next = rankProducts(catalogue, EMPTY_PROFILE, { seed: 3, exclude: shown, tail, limit: 3, now: NOW })
      shown.push(...next.map((x) => x.id))
      tail = next.map((x) => x.category)
    }
    expect(shown).toHaveLength(catalogue.length)
    expect(new Set(shown).size).toBe(catalogue.length)
  })

  it('puts sold-out products after everything that can be bought', () => {
    const order = rankProducts(catalogue, EMPTY_PROFILE, { seed: 1, now: NOW }).map((x) => x.id)
    expect(order.at(-1)).toBe('gone')
  })

  it('leans toward what the shopper browses, but keeps other categories in the mix', () => {
    const profile = { ...EMPTY_PROFILE, categories: { 'T-Shirts': 5 }, tags: { angel: 3 } }
    const first4 = rankProducts(catalogue, profile, { seed: 2, limit: 4, now: NOW })
    expect(first4[0].category).toBe('T-Shirts')
    expect(first4.filter((x) => x.category === 'T-Shirts').length).toBeGreaterThanOrEqual(2)
    expect(first4.some((x) => x.category !== 'T-Shirts')).toBe(true)
  })

  it('never runs more than three of a category in a row while others remain', () => {
    const profile = { ...EMPTY_PROFILE, categories: { 'T-Shirts': 10 } }
    const order = rankProducts(catalogue, profile, { seed: 5, now: NOW }).map((x) => x.category)
    for (let i = 3; i < order.length - 2; i++) {
      expect(order.slice(i - 3, i + 1).every((c) => c === order[i])).toBe(false)
    }
  })

  it('prefers a picked category and products not opened yet', () => {
    const picked = { ...EMPTY_PROFILE, picked: ['Accessories'] }
    expect(scoreProduct(catalogue[6], picked, 1, NOW)).toBeGreaterThan(scoreProduct(catalogue[6], EMPTY_PROFILE, 1, NOW))
    const seen = { ...EMPTY_PROFILE, viewed: ['shoe'] }
    expect(scoreProduct(catalogue[7], seen, 1, NOW)).toBeLessThan(scoreProduct(catalogue[7], EMPTY_PROFILE, 1, NOW))
  })
})

describe('buildProfile', () => {
  it('weights recent views above old ones and keeps the profile small', () => {
    const day = 86_400_000
    const profile = buildProfile({
      viewedProducts: [
        { productId: 'old', category: 'Shoes', tags: [], viewedAt: NOW - 30 * day },
        { productId: 'new', category: 'Hoodies', tags: ['angel'], viewedAt: NOW - day },
      ],
      favoritedCategories: [],
      cartAdditions: [],
      pickedCategories: ['Accessories'],
    }, NOW)
    expect(profile.categories.Hoodies).toBeGreaterThan(profile.categories.Shoes)
    expect(profile.tags.angel).toBeGreaterThan(0)
    expect(profile.picked).toEqual(['Accessories'])
    expect(profile.viewed).toEqual(['old', 'new'])
  })
})
