// The analytics funnel: furthest step reached per visitor per day.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const today = () => new Date().toISOString().slice(0, 10)

const track = (visitor: string, ...events: string[]) =>
  as(db, { kind: 'service' }, async (tx) => {
    for (const e of events) {
      await tx.query(`select public.track_event($1, $2, $3, '/x', null, null, null, null, null, 'mobile', null)`, [f.storeA, e, visitor])
    }
  })
const funnel = async () => {
  const s = await as(db, { kind: 'user', id: f.users.ownerA }, (tx) =>
    tx.query<{ s: any }>(`select public.analytics_summary($1, $2, $2) as s`, [f.tenantA, today()])).then((r) => r.rows[0].s)
  const t = s.traffic
  return [t.visitorDays, t.productViewers, t.addedToCart, t.startedCheckout, t.placedOrder, t.paidVisitors]
}

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

describe('funnel', () => {
  it('accepts the order and payment steps as tracked events', async () => {
    expect(await errorOf(track('setup', 'order_placed', 'payment_completed'))).toBeNull()
    expect(await errorOf(track('setup', 'refund_issued'))).toMatch(/check constraint/)
  })

  it('a quick add from the shop grid (no product page) still counts as having looked at a product', async () => {
    const before = await funnel()
    await track('quick-adder', 'page_view', 'add_to_cart')
    const after = await funnel()
    expect(after.map((v, i) => v - before[i])).toEqual([1, 1, 1, 0, 0, 0])
  })

  it('a buyer who skipped steps is counted at every step up to the furthest one', async () => {
    const before = await funnel()
    await track('direct-buyer', 'checkout_started', 'order_placed', 'payment_completed')
    const after = await funnel()
    expect(after.map((v, i) => v - before[i])).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('repeated events from one visitor count once', async () => {
    const before = await funnel()
    await track('repeat', 'page_view', 'page_view', 'product_view', 'product_view', 'product_view')
    const after = await funnel()
    expect(after.map((v, i) => v - before[i])).toEqual([1, 1, 0, 0, 0, 0])
  })

  it('can never widen, whatever mix of visitors and steps', async () => {
    const steps = ['page_view', 'product_view', 'add_to_cart', 'checkout_started', 'order_placed', 'payment_completed']
    for (let i = 0; i < 40; i++) {
      // Deterministic pseudo-random subset of steps per visitor, in any order.
      const picked = steps.filter((_, j) => ((i * 7 + j * 13) % 5) < 2 + (j % 2))
      if (picked.length) await track(`v${i}`, ...picked.reverse())
    }
    const counts = await funnel()
    for (let k = 1; k < counts.length; k++) expect(counts[k], `step ${k}`).toBeLessThanOrEqual(counts[k - 1])
  })

  it('reports when tracking last recorded a visit', async () => {
    const s = await as(db, { kind: 'user', id: f.users.ownerA }, (tx) =>
      tx.query<{ s: any }>(`select public.analytics_summary($1, $2, $2) as s`, [f.tenantA, today()])).then((r) => r.rows[0].s)
    expect(Date.now() - new Date(s.lastEventAt).getTime()).toBeLessThan(60_000)
  })
})
