import { describe, expect, it } from 'vitest'
import { eventAnalytics, sourceOf, type Input } from '@/lib/events/analytics'

const now = new Date('2026-11-05T12:00:00Z')
const startsAt = '2026-11-07T19:00:00Z'
const input = (over: Partial<Input> = {}): Input => ({
  currency: 'NGN',
  tiers: [{ id: 't1', name: 'Entry', capacity: 20, price: '2000.00' }, { id: 't2', name: 'VIP', capacity: 5, price: 5000 }],
  orders: [
    { id: 'o1', total: '4000.00', discount: '0', promo_code: null, status: 'confirmed', payment_status: 'paid', created_at: '2026-11-03T10:00:00Z' },
    { id: 'o2', total: '4500.00', discount: '500', promo_code: 'FHAB12CD', status: 'confirmed', payment_status: 'paid', created_at: '2026-11-04T23:30:00Z' },
    { id: 'o3', total: '2000.00', discount: '0', promo_code: null, status: 'cancelled', payment_status: 'refunded', created_at: '2026-11-04T09:00:00Z' },
  ],
  tickets: [
    { ticket_order_id: 'o1', ticket_type_id: 't1', status: 'checked_in', checked_in_at: '2026-11-07T20:05:00Z', checked_in_door: null },
    { ticket_order_id: 'o1', ticket_type_id: 't1', status: 'valid', checked_in_at: null, checked_in_door: null },
    { ticket_order_id: 'o2', ticket_type_id: 't2', status: 'checked_in', checked_in_at: '2026-11-07T19:10:00Z', checked_in_door: 'd1' },
    { ticket_order_id: 'o3', ticket_type_id: 't1', status: 'void', checked_in_at: null, checked_in_door: null },
  ],
  checkouts: [
    { created_at: '2026-11-03T09:55:00Z', ticket_order_id: 'o1' },
    { created_at: '2026-11-04T22:25:00Z', ticket_order_id: 'o2' },
    { created_at: '2026-11-04T08:55:00Z', ticket_order_id: 'o3' },
    { created_at: '2026-11-04T12:00:00Z', ticket_order_id: null },
  ],
  views: [
    { occurred_at: '2026-11-03T09:00:00Z', visitor_day: 'a', referrer_host: 'l.instagram.com', utm_source: null, device: 'mobile' },
    { occurred_at: '2026-11-03T09:30:00Z', visitor_day: 'a', referrer_host: null, utm_source: null, device: 'mobile' },
    { occurred_at: '2026-11-04T08:00:00Z', visitor_day: 'b', referrer_host: null, utm_source: 'whatsapp', device: 'desktop' },
    { occurred_at: '2026-11-04T23:30:00Z', visitor_day: 'c', referrer_host: 'www.google.com', utm_source: null, device: 'mobile' },
  ],
  doorLinks: [{ id: 'd1', label: 'Front door: Tobi' }],
  ...over,
})

describe('eventAnalytics', () => {
  const a = eventAnalytics(input(), { now, startsAt })

  it('counts sales from paid, confirmed orders only, and tickets that still open the door', () => {
    expect(a.totals).toMatchObject({
      paidOrders: 2, revenue: 8500, averageOrder: 4250, ticketsSold: 3, capacity: 25,
      discountGiven: 500, codesUsed: 1, cancelledOrders: 1, refunded: 1, checkedIn: 2,
    })
    expect(a.totals.checkInRate).toBeCloseTo(2 / 3)
  })

  it('builds the funnel from visitors (once a day each) to paid orders', () => {
    expect(a.totals).toMatchObject({ views: 4, visitors: 3, checkoutsStarted: 4, abandoned: 1 })
    expect(a.totals.conversion).toBeCloseTo(2 / 3)
    expect(a.funnel.map((f) => f.value)).toEqual([3, 4, 2])
  })

  it('puts each day in Lagos time: a 23:30 UTC sale is the next day', () => {
    const day = (key: string) => a.days.find((d) => d.key === key)
    expect(day('2026-11-03')).toMatchObject({ views: 2, tickets: 2, revenue: 4000 })
    expect(day('2026-11-04')).toMatchObject({ views: 1, tickets: 0, revenue: 0 })
    expect(day('2026-11-05')).toMatchObject({ views: 1, tickets: 1, revenue: 4500 })
    expect(a.days.length).toBeGreaterThanOrEqual(7)
  })

  it('breaks down tiers, sources, devices, check-in hours and who checked people in', () => {
    expect(a.tiers).toEqual([
      { name: 'Entry', sold: 2, capacity: 20, atPrice: 4000 },
      { name: 'VIP', sold: 1, capacity: 5, atPrice: 5000 },
    ])
    expect(a.sources).toEqual(expect.arrayContaining([{ label: 'Instagram', value: 1 }, { label: 'Direct', value: 1 }, { label: 'WhatsApp', value: 1 }, { label: 'Google', value: 1 }]))
    expect(a.devices).toEqual([{ label: 'Mobile', value: 3 }, { label: 'Desktop', value: 1 }])
    expect(a.checkInsByHour).toEqual([{ label: '8pm', value: 1 }, { label: '9pm', value: 1 }])
    expect(a.doors).toEqual(expect.arrayContaining([{ label: 'Front door: Tobi', value: 1 }, { label: 'Studio staff', value: 1 }]))
  })

  it('without analytics access, traffic is left out rather than shown as zero conversion', () => {
    const b = eventAnalytics(input({ views: null }), { now, startsAt })
    expect(b.traffic).toBe(false)
    expect(b.totals.conversion).toBeNull()
  })
})

it('sourceOf names the usual places', () => {
  expect(sourceOf({ referrer_host: 'lm.facebook.com', utm_source: null })).toBe('Facebook')
  expect(sourceOf({ referrer_host: 't.co', utm_source: null })).toBe('X')
  expect(sourceOf({ referrer_host: 'www.finalheaven.shop', utm_source: null })).toBe('Final Heaven site')
  expect(sourceOf({ referrer_host: 'blog.example.com', utm_source: null })).toBe('blog.example.com')
})
