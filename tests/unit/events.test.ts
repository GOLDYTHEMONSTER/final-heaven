import { describe, expect, it } from 'vitest'
import { quoteTickets, readRef, salesState, showCode, slugify, ticketDiscount, TICKETS, type CodeContext, type TierRow } from '@/lib/events'

const now = new Date('2026-11-10T12:00:00Z')
const event = {
  status: 'published' as const, sales_paused: false, sales_open_at: null, sales_close_at: null,
  starts_at: '2026-11-21T19:00:00Z', max_per_order: 6, currency: 'NGN',
}
const tiers: TierRow[] = [
  { id: 'reg', name: 'Regular', description: '', price: '10000.00', capacity: 100, sort: 0, active: true },
  { id: 'vip', name: 'VIP', description: '', price: 30000, capacity: 20, sort: 1, active: true },
  { id: 'old', name: 'Early bird', description: '', price: 5000, capacity: 50, sort: 2, active: false },
]
const free = { reg: 50, vip: 2, old: 10 }
const code = (over: Partial<CodeContext> = {}): CodeContext => ({
  promoCodeId: 'p1', code: 'FHABC123', personal: true, active: true, percent: 25,
  forOtherEmail: false, usedOnTickets: false, expired: false, ...over,
})

describe('salesState', () => {
  it('follows the event’s own window, not the shop’s launch day', () => {
    expect(salesState(event, now)).toEqual({ open: true, closesAt: event.starts_at })
    expect(salesState({ ...event, sales_open_at: '2026-11-11T00:00:00Z' }, now)).toMatchObject({ open: false, reason: 'not_yet' })
    expect(salesState({ ...event, sales_close_at: '2026-11-10T11:59:59Z' }, now)).toMatchObject({ open: false, reason: 'ended' })
    expect(salesState(event, new Date(event.starts_at))).toMatchObject({ open: false, reason: 'ended' })
  })

  it('is closed for drafts, cancellations and pauses, including the store-wide one', () => {
    expect(salesState({ ...event, status: 'draft' }, now)).toMatchObject({ reason: 'draft' })
    expect(salesState({ ...event, status: 'cancelled' }, now)).toMatchObject({ reason: 'cancelled' })
    expect(salesState({ ...event, sales_paused: true }, now)).toMatchObject({ reason: 'paused' })
    expect(salesState(event, now, true)).toMatchObject({ reason: 'paused' })
  })
})

describe('quoteTickets', () => {
  it('prices from the tiers and merges lines for the same tier', () => {
    const q = quoteTickets(event, tiers, free, [{ tierId: 'reg', quantity: 1 }, { tierId: 'reg', quantity: 2 }, { tierId: 'vip', quantity: 1 }], { now })
    expect(q.lines.map((l) => [l.tierId, l.quantity, l.lineMinor])).toEqual([['reg', 3, 3_000_000], ['vip', 1, 3_000_000]])
    expect(q).toMatchObject({ count: 4, subtotalMinor: 6_000_000, totalMinor: 6_000_000, ok: true, issue: null })
  })

  it('refuses unknown, switched-off and sold-out tiers, and more than are left', () => {
    expect(quoteTickets(event, tiers, free, [{ tierId: 'nope', quantity: 1 }], { now }).issue).toBe('This ticket isn’t available.')
    expect(quoteTickets(event, tiers, free, [{ tierId: 'old', quantity: 1 }], { now }).issue).toBe('This ticket isn’t on sale.')
    expect(quoteTickets(event, tiers, { ...free, vip: 0 }, [{ tierId: 'vip', quantity: 1 }], { now }).issue).toBe('VIP is sold out.')
    expect(quoteTickets(event, tiers, free, [{ tierId: 'vip', quantity: 3 }], { now }).issue).toBe('Only 2 VIP tickets are left.')
  })

  it('caps tickets per order and needs at least one', () => {
    expect(quoteTickets(event, tiers, free, [{ tierId: 'reg', quantity: 7 }], { now }).issue).toBe('You can buy up to 6 tickets per order.')
    expect(quoteTickets(event, tiers, free, [], { now }).issue).toBe('Choose at least one ticket.')
  })

  it('says when sales are closed before anything else', () => {
    expect(quoteTickets({ ...event, status: 'cancelled' }, tiers, free, [{ tierId: 'nope', quantity: 9 }], { now }).issue).toBe('This event has been cancelled.')
  })
})

describe('the early access discount on tickets', () => {
  it('takes the code’s percent off the two dearest tickets only', () => {
    const q = quoteTickets(event, tiers, free, [{ tierId: 'reg', quantity: 4 }, { tierId: 'vip', quantity: 1 }], { now, code: 'FHABC123', codeContext: code() })
    // 25% of 30,000 + 10,000
    expect(q.discount).toEqual({ promoCodeId: 'p1', code: 'FHABC123', percent: 25, minor: 1_000_000, tickets: 2 })
    expect(q.totalMinor).toBe(q.subtotalMinor - 1_000_000)
    expect(q.ok).toBe(true)
  })

  it('uses the percent their invites earned', () => {
    expect(ticketDiscount(code({ percent: 35 }), [1_000_000], 1_000_000)).toMatchObject({ minor: 350_000, tickets: 1 })
  })

  it('refuses shop codes, other people’s codes, used and expired codes', () => {
    const err = (over: Partial<CodeContext> | null) => {
      const r = ticketDiscount(over === null ? null : code(over), [1_000_000], 1_000_000)
      return 'error' in r ? r.error : null
    }
    expect(err(null)).toBe('That code isn’t valid.')
    expect(err({ active: false })).toBe('That code isn’t valid.')
    expect(err({ personal: false })).toMatch(/Shop promo codes don’t work on tickets/)
    expect(err({ forOtherEmail: true })).toMatch(/belongs to another email/)
    expect(err({ expired: true })).toBe('That code has expired.')
    expect(err({ usedOnTickets: true })).toBe('You’ve already used your code on tickets.')
  })

  it('a bad code stops the order, so nobody pays full price by surprise', () => {
    const q = quoteTickets(event, tiers, free, [{ tierId: 'reg', quantity: 1 }], { now, code: 'SHOP10', codeContext: code({ personal: false }) })
    expect(q.ok).toBe(false)
    expect(q.discount).toBeNull()
  })

  it('never takes an order below the smallest online charge', () => {
    const r = ticketDiscount(code({ percent: 100 }), [50_000], 50_000)
    expect(r).toMatchObject({ minor: 50_000 - TICKETS.minChargeMinor })
  })
})

describe('door codes', () => {
  it('shows codes in two groups and reads them back however they’re typed', () => {
    expect(showCode('k7m42q')).toBe('K7M 42Q')
    expect(readRef('K7M 42Q')).toEqual({ kind: 'code', value: 'k7m42q' })
    expect(readRef(' k7m-42q ')).toEqual({ kind: 'code', value: 'k7m42q' })
  })

  it('reads a token, or a whole scanned ticket link, and nothing else', () => {
    const token = 'a'.repeat(32)
    expect(readRef(token)).toEqual({ kind: 'token', value: token })
    expect(readRef(`https://www.finalheaven.shop/t/${token}?x=1`)).toEqual({ kind: 'token', value: token })
    expect(readRef('K7M 42O')).toBeNull() // O isn't in the alphabet
    expect(readRef('')).toBeNull()
    expect(readRef(42)).toBeNull()
  })
})

it('slugify', () => {
  expect(slugify('Final Heaven — Launch Night!')).toBe('final-heaven-launch-night')
})
