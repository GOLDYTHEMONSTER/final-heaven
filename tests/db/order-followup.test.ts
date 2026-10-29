// orders_due_followup: delivered 3 to 14 days ago, once per order, in the right tenant.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

async function deliver(orderId: string, daysAgo: number) {
  await db.query(`update public.orders set payment_status = 'paid' where id = $1`, [orderId])
  for (const s of ['confirmed', 'processing', 'shipped', 'delivered']) await db.query(`update public.orders set status = $2 where id = $1`, [orderId, s])
  await db.query(`update public.order_events set occurred_at = now() - make_interval(days => $2) where order_id = $1 and to_value = 'delivered'`, [orderId, daysAgo])
}
const due = (tenant = f.tenantA) =>
  db.query<{ order_id: string }>(`select order_id from public.orders_due_followup($1, 3, 14, 30)`, [tenant]).then((r) => r.rows.map((x) => x.order_id))

describe('orders due a follow-up', () => {
  it('finds orders delivered 3 or more days ago, but not newer ones', async () => {
    await deliver(f.orders.a1, 4)
    expect(await due()).toEqual([f.orders.a1])
    await deliver(f.orders.a2, 1)
    expect(await due()).toEqual([f.orders.a1])
  })

  it('does not reach back past 14 days, so a first run does not email old orders', async () => {
    await db.query(`update public.order_events set occurred_at = now() - interval '20 days' where order_id = $1 and to_value = 'delivered'`, [f.orders.a1])
    expect(await due()).toEqual([])
    await db.query(`update public.order_events set occurred_at = now() - interval '5 days' where order_id = $1 and to_value = 'delivered'`, [f.orders.a1])
  })

  it('is once per order: queued, then no longer due', async () => {
    const { rows } = await db.query<{ r: string }>(`select public.queue_email_capped($1, 'order.followup', 'order_id', $2, 30) as r`, [f.tenantA, f.orders.a1])
    expect(rows[0].r).toBe('queued')
    expect(await due()).toEqual([])
  })

  it('stays within its tenant, and is server-only', async () => {
    await deliver(f.orders.b1, 5)
    expect(await due(f.tenantA)).not.toContain(f.orders.b1)
    expect(await due(f.tenantB)).toEqual([f.orders.b1])
    for (const actor of [{ kind: 'anon' as const }, { kind: 'user' as const, id: f.users.ownerA }]) {
      await expect(probe(db, actor, (tx) => tx.query(`select * from public.orders_due_followup($1, 3, 14, 30)`, [f.tenantA]))).rejects.toThrow(/permission denied/)
    }
  })
})
