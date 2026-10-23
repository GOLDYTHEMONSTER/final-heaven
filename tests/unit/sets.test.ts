// Sets: a product whose options are picks from groups (the Drop 01 full set:
// any 3 tees, 1 hoodie, 1 cap). Checkout accepts exactly the right picks.
import { describe, expect, it } from 'vitest'
import { formatSetPick, isValidSetPick, setColors, setGroups } from '@/lib/sets'
import { DROP_01_SET, DROP_01_SET_COLORS } from '@/lib/drop-01'
import { quoteCart } from '@/lib/checkout/pricing'

const pick = (tees: string[], hoodie = 'Varsity 07', cap = 'Red') =>
  formatSetPick(DROP_01_SET, { Tees: tees, Hoodie: [hoodie], Cap: [cap] })

describe('set options', () => {
  it('stores 14 short options for the Drop 01 set and reads them back as its groups', () => {
    expect(DROP_01_SET_COLORS).toHaveLength(14)
    expect(DROP_01_SET_COLORS.every((c) => c.length <= 60)).toBe(true)
    expect(DROP_01_SET_COLORS[0]).toBe('Tees ×3: Big Mark')
    expect(setGroups(DROP_01_SET_COLORS)).toEqual(DROP_01_SET)
    expect(setColors(setGroups(DROP_01_SET_COLORS)!)).toEqual(DROP_01_SET_COLORS)
  })

  it('is not confused with ordinary colours', () => {
    expect(setGroups(['black', 'white'])).toBeNull()
    expect(setGroups([])).toBeNull()
  })

  it('writes picks in the set order, whatever order they were tapped', () => {
    expect(pick(['Ascend', 'Big Mark', 'Sculpted'])).toBe('Tees: Big Mark, Sculpted, Ascend · Hoodie: Varsity 07 · Cap: Red')
  })

  it('accepts exactly three different listed tees, one hoodie and one cap', () => {
    expect(isValidSetPick(DROP_01_SET, pick(['Big Mark', 'Sculpted', 'Ascend']))).toBe(true)
    expect(isValidSetPick(DROP_01_SET, pick(['Big Mark', 'Sculpted']))).toBe(false)
    expect(isValidSetPick(DROP_01_SET, pick(['Big Mark', 'Sculpted', 'Ascend', 'Spray Mark']))).toBe(false)
    expect(isValidSetPick(DROP_01_SET, 'Tees: Big Mark, Big Mark, Ascend · Hoodie: Varsity 07 · Cap: Red')).toBe(false)
    expect(isValidSetPick(DROP_01_SET, 'Tees: Big Mark, Sculpted, Not A Tee · Hoodie: Varsity 07 · Cap: Red')).toBe(false)
    expect(isValidSetPick(DROP_01_SET, pick(['Big Mark', 'Sculpted', 'Ascend'], 'Purple'))).toBe(false)
    expect(isValidSetPick(DROP_01_SET, 'Varsity 07 hoodie + Red cap')).toBe(false)
    expect(isValidSetPick(DROP_01_SET, null)).toBe(false)
  })
})

describe('checkout with a set', () => {
  const set = { id: 'set', name: 'Drop 01 — Full Set', price: 80000, stock: 5, status: 'active', images: [], sizes: ['S', 'M', 'L'], colors: DROP_01_SET_COLORS }
  const quote = (color: string | null) =>
    quoteCart([{ id: 'set', size: 'L', color, quantity: 1 }], [set], 'NGN', { today: '2026-10-23' })

  it('prices a valid set and records the picks', () => {
    const q = quote(pick(['Big Mark', 'Heaven Smoke', 'Ascend']))
    expect(q.lines[0].issue).toBeNull()
    expect(q.lines[0].color).toBe('Tees: Big Mark, Ascend, Heaven Smoke · Hoodie: Varsity 07 · Cap: Red')
  })

  it('asks for the picks again when they are incomplete or from the old set', () => {
    expect(quote(pick(['Big Mark'])).lines[0].issue).toMatch(/picks/)
    expect(quote('Varsity 07 hoodie + Red cap').lines[0].issue).toMatch(/picks/)
  })
})
