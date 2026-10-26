import { describe, expect, it } from 'vitest'
import { collectionProducts, matchesRule, parseRule, slugify, sourceLabel, supplyLabel } from '@/lib/collections'
import type { Product } from '@/lib/catalog'

const p = (id: string, over: Partial<Product> = {}): Product => ({
  id, name: id, price: 10000, category: 'T-Shirts', stock: 1, status: 'active', tags: [], sourceType: 'original',
  createdAt: `2026-10-${String(10 + id.length).padStart(2, '0')}T00:00:00Z`, ...over,
})

describe('collection rules', () => {
  it('keeps only known, sensible values', () => {
    expect(parseRule(null)).toBeNull()
    expect(parseRule({})).toBeNull()
    expect(parseRule({ categories: [], sources: ['nope'] })).toBeNull()
    expect(parseRule({ sources: ['local_maker', 'thrift'], maxPrice: 10000, minPrice: -5, tags: ['Night'], extra: 1, newOnly: 'yes' }))
      .toEqual({ sources: ['local_maker'], maxPrice: 10000, tags: ['night'] })
  })

  it('matches only when every condition holds', () => {
    const rule = parseRule({ categories: ['Jackets'], maxPrice: 50000 })!
    expect(matchesRule(p('a', { category: 'Jackets', price: 45000 }), rule)).toBe(true)
    expect(matchesRule(p('b', { category: 'Jackets', price: 55000 }), rule)).toBe(false)
    expect(matchesRule(p('c', { category: 'Hoodies', price: 45000 }), rule)).toBe(false)
    expect(matchesRule(p('d', { tags: ['After-Hours'] }), parseRule({ tags: ['after-hours'] })!)).toBe(true)
    expect(matchesRule(p('e', { sourceType: 'independent' }), parseRule({ sources: ['independent'] })!)).toBe(true)
    expect(matchesRule(p('f'), parseRule({ sources: ['independent'] })!)).toBe(false)
  })
})

describe('a collection’s products', () => {
  const all = [p('one'), p('three', { category: 'Jackets' }), p('fourrr', { category: 'Jackets' }), p('fivevv')]

  it('lists hand-picked products in order, then rule matches newest first, each once', () => {
    const out = collectionProducts(all, [{ productId: 'fivevv', position: 2 }, { productId: 'three', position: 1 }], parseRule({ categories: ['Jackets'] }))
    expect(out.map((x) => x.id)).toEqual(['three', 'fivevv', 'fourrr'])
  })

  it('skips picks the public can’t see (sold elsewhere, hidden or deleted)', () => {
    expect(collectionProducts(all, [{ productId: 'gone', position: 0 }, { productId: 'one', position: 1 }], null).map((x) => x.id)).toEqual(['one'])
  })

  it('is empty when nothing is picked and there is no rule', () => {
    expect(collectionProducts(all, [], null)).toEqual([])
  })
})

describe('slugs', () => {
  it('are lower-case words joined by hyphens', () => {
    expect(slugify('After Hours')).toBe('after-hours')
    expect(slugify('  Lagos Label Co. — 2026! ')).toBe('lagos-label-co-2026')
    expect(slugify('!!!')).toBe('')
  })
})

describe('source labels', () => {
  it('names originals and labels, and says nothing about how bought-in stock was sourced', () => {
    expect(sourceLabel({ sourceType: 'original' })).toBe('Final Heaven Original')
    expect(sourceLabel({ sourceType: 'independent', brand: { id: 'x', name: 'Lagos Label', slug: 'lagos-label' } })).toBe('Lagos Label')
    for (const sourceType of ['wholesale', 'distributor', 'local_maker']) expect(sourceLabel({ sourceType })).toBeNull()
  })

  it('labels made-to-order products with their lead time, and nothing else', () => {
    expect(supplyLabel({ fulfilment: 'made_to_order', leadTimeDays: 10 })).toBe('Made to order · ships in about 10 days')
    expect(supplyLabel({ fulfilment: 'stock' })).toBeNull()
    expect(supplyLabel({})).toBeNull()
  })
})
