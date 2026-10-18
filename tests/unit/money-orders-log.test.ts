import { describe, expect, it } from 'vitest'
import { fromMinor, toMinor } from '@/lib/money'
import { priceOrder } from '@/lib/orders'
import { scrub } from '@/lib/log'

describe('money', () => {
  it('converts major to minor units exactly, without float drift', () => {
    expect(toMinor(24999.9, 'NGN')).toBe(2499990)
    expect(toMinor('24999.90', 'NGN')).toBe(2499990)
    expect(toMinor(0.1, 'NGN') + toMinor(0.2, 'NGN')).toBe(toMinor(0.3, 'NGN')) // 0.1 + 0.2 !== 0.3 in floats
    expect(toMinor(1005, 'XOF')).toBe(1005)
  })

  it('refuses to silently round extra decimals', () => {
    expect(() => toMinor('10.005', 'NGN')).toThrow(/at most 2 decimal/)
    expect(() => toMinor('10.5', 'XOF')).toThrow(/at most 0 decimal/)
    expect(toMinor('10.500', 'NGN')).toBe(1050) // trailing zeros are fine
  })

  it('rejects garbage', () => {
    for (const bad of ['', 'abc', '1e5', '--1', 'NaN']) expect(() => toMinor(bad, 'NGN'), bad).toThrow()
    expect(() => toMinor(Number.NaN, 'NGN')).toThrow()
  })

  it('formats minor units back to a decimal string', () => {
    expect(fromMinor(2499990, 'NGN')).toBe('24999.90')
    expect(fromMinor(5, 'NGN')).toBe('0.05')
    expect(fromMinor(1005, 'XOF')).toBe('1005')
  })
})

describe('order pricing', () => {
  const catalogue = [
    { id: 'shoe', name: 'Shoe', price: '24999.90', stock: 3, status: 'active', images: [{ url: '/s.png' }] },
    { id: 'tee', name: 'Tee', price: 18500, stock: null, status: 'active', images: [] },
    { id: 'old', name: 'Old', price: 100, stock: 5, status: 'draft', images: [] },
  ]

  it('uses catalogue prices, never anything from the cart', () => {
    const priced = priceOrder([{ id: 'shoe', size: 'M', quantity: 2 }, { id: 'tee', size: null, quantity: 1 }], catalogue, 'NGN', { today: '2026-10-18' })
    expect(priced.totalMinor).toBe(2 * 2499990 + 1850000)
    expect(priced.items[0]).toMatchObject({ id: 'shoe', price: 24999.9, quantity: 2, image: '/s.png' })
  })

  it('refuses unavailable products and overselling, counting all sizes of a product', () => {
    expect(() => priceOrder([{ id: 'old', size: null, quantity: 1 }], catalogue, 'NGN', { today: '2026-10-18' })).toThrow(/no longer available/)
    expect(() => priceOrder([{ id: 'ghost', size: null, quantity: 1 }], catalogue, 'NGN', { today: '2026-10-18' })).toThrow(/no longer available/)
    expect(() => priceOrder([{ id: 'shoe', size: 'M', quantity: 2 }, { id: 'shoe', size: 'L', quantity: 2 }], catalogue, 'NGN', { today: '2026-10-18' }))
      .toThrow(/Only 3 left/)
  })
})

describe('log scrubbing', () => {
  it('redacts secrets and masks emails', () => {
    const out = scrub({
      authorization: 'Bearer FLWSECK-123', password: 'hunter2', 'verif-hash': 'abc',
      nested: { apiKey: 'k', note: 'paid by jane.doe@example.com' }, ok: 'fine',
    }) as Record<string, any>
    expect(out.authorization).toBe('[redacted]')
    expect(out.password).toBe('[redacted]')
    expect(out['verif-hash']).toBe('[redacted]')
    expect(out.nested.apiKey).toBe('[redacted]')
    expect(out.nested.note).toBe('paid by j***@example.com')
    expect(out.ok).toBe('fine')
  })
})
