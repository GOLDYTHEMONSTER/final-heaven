import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, errorOf, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const trends = (actor: string, tenant: string, days = 30) =>
  probe(db, { kind: 'user', id: actor }, (tx) =>
    tx.query<{ t: any }>(`select public.business_trends($1, $2) as t`, [tenant, days]).then((r) => r.rows[0].t))

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db) // FH-A1 and FH-A2 today in A (₦24,999.90 each), FH-B1 in B
  // A previous-period order from FH-A1's customer, so they count as returning.
  await db.query(
    `insert into public.orders (order_number, email, tracking_number, shipping_address, subtotal, total, order_items,
                                tenant_id, store_id, created_at)
     values ('FH-A0', 'FH-A1@customer.test', 'TRK-A0', '1 Test St', 10000, 10000, '[]', $1, $2, now() - interval '40 days')`,
    [f.tenantA, f.storeA])
  // FH-A1 is paid and shipped; FH-A2 is cancelled.
  await db.query(`update public.orders set payment_status = 'paid', status = 'confirmed' where id = $1`, [f.orders.a1])
  await db.query(`update public.orders set status = 'processing' where id = $1`, [f.orders.a1])
  await db.query(`update public.orders set status = 'shipped' where id = $1`, [f.orders.a1])
  await db.query(`update public.orders set status = 'cancelled' where id = $1`, [f.orders.a2])
  // Two messages this period, one handled.
  for (const name of ['Ada', 'Bola']) {
    await db.query(`insert into public.contact_messages (tenant_id, store_id, name, email, topic, message)
                    values ($1, $2, $3, 'x@x.co', 'other', 'Hello there, a question.')`, [f.tenantA, f.storeA, name])
  }
  await db.query(`update public.contact_messages set status = 'replied' where name = 'Ada'`)
  await db.query(`insert into public.newsletter_subscribers (email, tenant_id, store_id) values ('s@x.co', $1, $2)`, [f.tenantA, f.storeA])
})
afterAll(() => db.close())

describe('business trends', () => {
  it('compares sales with the previous period', async () => {
    const t = await trends(f.users.ownerA, f.tenantA)
    expect(t.days).toBe(30)
    expect(t.sales.placed).toEqual([2, 1])
    expect(t.sales.paid).toEqual([1, 0])
    expect(Number(t.sales.revenue[0])).toBeCloseTo(24999.9)
    expect(t.sales.cancelled).toEqual([1, 0])
    expect(t.sales.daily).toHaveLength(30)
    expect(t.sales.daily.at(-1).orders).toBe(2)
  })

  it('measures fulfilment: shipped orders and time from payment to shipping', async () => {
    const t = await trends(f.users.ownerA, f.tenantA)
    expect(t.fulfilment.shipped).toEqual([1, 0])
    expect(Number(t.fulfilment.hoursToShip[0])).toBeGreaterThanOrEqual(0)
    expect(t.fulfilment.hoursToShip[1]).toBeNull() // nothing shipped before: no comparison, not zero
  })

  it('splits customers into new and returning', async () => {
    const t = await trends(f.users.ownerA, f.tenantA)
    expect(t.customers.new).toEqual([1, 1]) // FH-A2 now; FH-A1’s customer first ordered last period
    expect(t.customers.returning).toEqual([1, 0])
    expect(t.customers.total).toBe(2)
    expect(t.customers.subscribers[0]).toBe(1)
  })

  it('tracks the message inbox', async () => {
    const t = await trends(f.users.ownerA, f.tenantA)
    expect(t.messages.received).toEqual([2, 0])
    expect(t.messages.handled).toEqual([1, 0])
    expect(t.messages.openNow).toBe(1)
  })

  it('includes only the sections the person may see', async () => {
    const fulfil = await trends(f.users.fulfilA, f.tenantA) // orders.read, no customers.read
    expect(fulfil.sales).not.toBeNull()
    expect(fulfil.customers).toBeNull()
    expect(fulfil.messages).toBeNull()
  })

  it('refuses other businesses and outsiders, and clamps the range', async () => {
    expect(await errorOf(trends(f.users.ownerB, f.tenantA))).toMatch(/not permitted/)
    expect(await errorOf(trends(f.users.outsider, f.tenantA))).toMatch(/not permitted/)
    expect((await trends(f.users.ownerA, f.tenantA, 5000)).days).toBe(90)
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select public.business_trends($1)`, [f.tenantA]))))
      .toMatch(/permission denied/)
  })
})
