import { describe, expect, it } from 'vitest'
import { feedCsv, feedLabel, feedPrice, feedRows, FEED_CACHE, FEED_COLUMNS } from '@/lib/ads/meta-feed'
import { toPublicProduct, type Product } from '@/lib/catalog'

const TODAY = '2026-11-01'
const SITE = 'https://www.finalheaven.shop'

/** A product as the storefront receives it (toPublicProduct), purchase state included. */
const p = (id: string, over: Record<string, unknown> = {}) =>
  toPublicProduct({ id, name: `Piece ${id}`, price: 25000, category: 'Pendants', stock: 5, status: 'active', images: [{ url: `/products/${id}.jpg` }], ...over }, TODAY) as Product
const rows = (products: Product[], hiddenCategories: string[] = []) => feedRows(products, { site: SITE, hiddenCategories })

describe('Meta catalogue feed', () => {
  it('lists a buyable piece with the fields Meta needs', () => {
    expect(rows([p('p1', { description: 'Heavy chain.', is_limited: false })])).toEqual([{
      id: 'p1', title: 'Piece p1', description: 'Heavy chain.', availability: 'in stock', availability_date: '', condition: 'new',
      price: '25000.00 NGN', link: `${SITE}/product/p1`, image_link: `${SITE}/products/p1.jpg`, brand: 'Final Heaven', custom_label_0: 'core',
    }])
  })

  it('leaves out what can’t be bought: sold out, members-only, paused, not yet released, draft, hidden category', () => {
    const out = rows([
      p('ok'), p('sold', { stock: 0 }), p('members', { members_only: true }), p('paused', { purchases_paused: true }),
      p('soon', { release_date: '2026-12-01' }), p('draft', { status: 'draft' }), p('vape', { category: 'Vapes' }),
    ], ['Vapes'])
    expect(out.map((r) => r.id)).toEqual(['ok'])
  })

  it('lists a pre-order with places left, with its ship day, and marks it; a full pre-order is out', () => {
    const [pre] = rows([p('pre', { preorder: true, preorder_ships_on: '2026-12-05', preorder_limit: 3 })])
    expect(pre).toMatchObject({ availability: 'preorder', availability_date: '2026-12-05', custom_label_0: 'preorder' })
    expect(rows([p('full', { preorder: true, preorder_ships_on: '2026-12-05', preorder_limit: 0 })])).toEqual([])
  })

  it('marks limited drops, and pieces made after the order as available for order', () => {
    expect(rows([p('d', { is_limited: true })])[0].custom_label_0).toBe('drop')
    expect(feedLabel(p('d', { is_limited: true }))).toBe('drop')
    expect(rows([p('m', { fulfilment: 'made_to_order' })])[0].availability).toBe('available for order')
  })

  it('takes prices only from the product, in naira with two decimals, and never lists an unpriced piece', () => {
    expect(feedPrice(24999.9)).toBe('24999.90 NGN')
    expect(feedPrice('7500.00')).toBe('7500.00 NGN')
    expect(rows([p('sale', { price: 17000, original_price: 45000 })])[0].price).toBe('17000.00 NGN')
    expect(rows([p('free', { price: 0 })])).toEqual([])
    expect(rows([p('odd', { price: 10.005 })])).toEqual([])
  })

  it('needs a photo, uses the first one, and makes addresses absolute', () => {
    expect(rows([p('none', { images: [] })])).toEqual([])
    const [r] = rows([p('x', { images: [{ url: 'https://cdn.example/a.jpg' }, { url: '/products/b.jpg' }] })])
    expect(r.image_link).toBe('https://cdn.example/a.jpg')
    expect(rows([p('y')], [])[0].link).toBe(`${SITE}/product/y`)
  })

  it('gives every row a description and flattens line breaks', () => {
    expect(rows([p('d1')])[0].description).toBe('Piece d1. Pendants from Final Heaven.')
    expect(rows([p('d2', { name: 'Two\nlines', description: 'A\n\n  B' })])[0]).toMatchObject({ title: 'Two lines', description: 'A B' })
  })

  it('writes a CSV that quotes commas, quotes and line breaks', () => {
    const csv = feedCsv(rows([p('c', { name: 'Chain, "iced"', description: 'Line one' })]))
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(FEED_COLUMNS.join(','))
    expect(lines[1]).toContain('"Chain, ""iced"""')
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(feedCsv([])).toBe(`${FEED_COLUMNS.join(',')}\r\n`)
  })

  it('is cacheable by the CDN for an hour', () => {
    expect(FEED_CACHE['Cache-Control']).toMatch(/s-maxage=3600/)
    expect(FEED_CACHE['Cache-Control']).toMatch(/stale-while-revalidate/)
  })
})
