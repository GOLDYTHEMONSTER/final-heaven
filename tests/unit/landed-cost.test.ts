import { describe, expect, it } from 'vitest'
import { grossMargin, landedCost } from '@/lib/landed-cost'

const base = { unitCost: 36, currency: 'CNY', fxRate: 215, shipping: 1500, customs: 400, other: 300 }

describe('landed cost', () => {
  it('converts the unit cost at the recorded rate and adds each cost once', () => {
    const r = landedCost(base)
    expect(r).toMatchObject({ ok: true, landed: 9940 }) // 36 × 215 = 7740, + 1500 + 400 + 300
    if (r.ok) expect(r.parts.map((p) => p.amount)).toEqual([7740, 1500, 400, 300])
  })

  it('needs no rate for naira costs, and leaves out costs not recorded', () => {
    expect(landedCost({ ...base, currency: 'NGN', unitCost: 5000, fxRate: null, customs: null, other: null })).toMatchObject({ ok: true, landed: 6500 })
  })

  it('says what’s missing instead of guessing', () => {
    expect(landedCost({ ...base, unitCost: null })).toEqual({ ok: false, missing: 'the unit cost' })
    expect(landedCost({ ...base, fxRate: null })).toEqual({ ok: false, missing: 'the CNY to naira rate' })
  })
})

describe('gross margin', () => {
  it('is profit over the selling price', () => {
    expect(grossMargin(25000, 9940)).toEqual({ profit: 15060, marginPct: 60.2 })
    expect(grossMargin(5000, 6500)).toEqual({ profit: -1500, marginPct: -30 })
  })

  it('has no percentage for a zero or invalid price', () => {
    expect(grossMargin(0, 100).marginPct).toBeNull()
    expect(grossMargin(Number.NaN, 100).marginPct).toBeNull()
  })
})
