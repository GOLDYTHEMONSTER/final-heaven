// Delivery estimates and the Express fee (lib/delivery), as agreed on 28 Oct 2026.
import { describe, expect, it } from 'vitest'
import { arrivalText, estimate, expressAvailable, expressFee, supplyOf } from '@/lib/delivery'

const day = '2026-11-13'

describe('delivery estimate', () => {
  it('in stock: 3–7 days', () => {
    expect(estimate([{ kind: 'stock' }], 'standard', day)).toEqual({ minDays: 3, maxDays: 7, from: '2026-11-16', to: '2026-11-20' })
  })

  it('from China: 14–21 days standard, 10–17 days by Express', () => {
    expect(estimate([{ kind: 'ordered_in' }], 'standard', day)).toMatchObject({ from: '2026-11-27', to: '2026-12-04' })
    expect(estimate([{ kind: 'ordered_in' }], 'express', day)).toMatchObject({ from: '2026-11-23', to: '2026-11-30' })
  })

  it('an order arrives together: the slowest line sets the dates', () => {
    expect(estimate([{ kind: 'stock' }, { kind: 'ordered_in' }], 'standard', day)).toMatchObject({ minDays: 14, maxDays: 21 })
    expect(estimate([{ kind: 'made', leadDays: 10 }, { kind: 'stock' }], 'standard', day)).toMatchObject({ minDays: 13, maxDays: 17 })
  })

  it('pre-orders arrive a few days after their ship date', () => {
    expect(estimate([{ kind: 'preorder', shipsOn: '2026-12-01' }], 'standard', day)).toMatchObject({ from: '2026-12-04', to: '2026-12-08' })
  })

  it('without an order day (no launch date yet) it gives days, not dates', () => {
    const e = estimate([{ kind: 'ordered_in' }], 'standard', null)
    expect(e).toEqual({ minDays: 14, maxDays: 21, from: null, to: null })
    expect(arrivalText(e)).toBe('in 14–21 days')
    expect(arrivalText(estimate([{ kind: 'stock' }], 'standard', day))).toBe('Mon 16 Nov – Fri 20 Nov')
  })
})

describe('express', () => {
  it('is only offered when something comes from China', () => {
    expect(expressAvailable([{ kind: 'stock' }])).toBe(false)
    expect(expressAvailable([{ kind: 'stock' }, { kind: 'ordered_in' }])).toBe(true)
    expect(expressAvailable([{ kind: 'preorder', shipsOn: day }])).toBe(false)
  })

  it('is taken away from the whole order by an item that can’t fly', () => {
    expect(expressAvailable([{ kind: 'ordered_in', seaOnly: true }])).toBe(false)
    expect(expressAvailable([{ kind: 'ordered_in' }, { kind: 'ordered_in', seaOnly: true }])).toBe(false)
    expect(supplyOf({ fulfilment: 'made_to_order', source_type: 'wholesale', ships_by_air: false }, { state: 'available' }))
      .toEqual({ kind: 'ordered_in', seaOnly: true })
    expect(supplyOf({ fulfilment: 'made_to_order', source_type: 'wholesale', ships_by_air: null }, { state: 'available' }))
      .toEqual({ kind: 'ordered_in' })
  })

  it('costs ₦2,500 for the first kg, then ₦1,000 per extra kg or part of one', () => {
    expect(expressFee(0.5)).toBe(250_000)
    expect(expressFee(1)).toBe(250_000)
    expect(expressFee(1.01)).toBe(350_000)
    expect(expressFee(2.3)).toBe(450_000)
    expect(expressFee(null)).toBe(250_000) // weight unknown: the base fee, never less
  })
})
