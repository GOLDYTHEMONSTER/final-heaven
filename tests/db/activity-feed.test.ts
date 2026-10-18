import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const user = (id: string) => ({ kind: 'user' as const, id })
const feed = (actor: string) =>
  probe(db, user(actor), (tx) => tx.query<{ kind: string; title: string; detail: string; link: string }>(
    `select kind, title, detail, link from public.activity_feed order by id`).then((r) => r.rows))

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db) // inserts 2 orders in A and 1 in B
})
afterAll(() => db.close())

describe('activity feed', () => {
  it('shows nothing for an order until it is paid', async () => {
    expect((await feed(f.users.ownerA)).filter((r) => r.kind === 'order.placed')).toEqual([])
  })

  it('announces a new order once paid, with amount and a link; and failures and cancellations', async () => {
    const pay = await as(db, { kind: 'service' }, (tx) => tx.query<{ id: string }>(
      `insert into public.payments (tenant_id, order_id, provider, reference, amount_minor, currency)
       values ($1, $2, 'flutterwave', 'FHP-ACTIVITY0001', 2499990, 'NGN') returning id`, [f.tenantA, f.orders.a1]))
    expect(pay.rows).toHaveLength(1)
    await as(db, { kind: 'service' }, (tx) => tx.query(`select public.apply_verified_payment('FHP-ACTIVITY0001', '1', 'successful', 2499990, 'NGN')`))
    const placed = (await feed(f.users.ownerA)).filter((r) => r.kind === 'order.placed')
    expect(placed.map((r) => r.title)).toEqual(['New order FH-A1'])
    expect(placed[0].detail).toBe('₦24,999.90 paid · ready to fulfil')
    expect(placed[0].link).toBe('/admin/orders?q=FH-A1')

    await db.query(`update public.orders set payment_status = 'failed' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set status = 'cancelled' where id = $1`, [f.orders.a2])
    const kinds = (await feed(f.users.ownerA)).map((r) => r.kind)
    expect(kinds).toEqual(expect.arrayContaining(['order.placed', 'payment.failed', 'order.cancelled']))
  })

  it('records messages, new subscribers and low stock', async () => {
    await db.query(`insert into public.contact_messages (tenant_id, store_id, name, email, topic, message, order_number)
                    values ($1, $2, 'Ada', 'ada@x.co', 'return', 'I would like to return this.', 'FH-A1')`, [f.tenantA, f.storeA])
    await db.query(`insert into public.newsletter_subscribers (email, tenant_id, store_id) values ('n@x.co', $1, $2)`, [f.tenantA, f.storeA])
    await db.query(`update public.products set stock = 2 where id = 'pA1'`)
    await db.query(`update public.products set stock = 1 where id = 'pA1'`) // already low: no second alert
    const rows = await feed(f.users.ownerA)
    expect(rows.find((r) => r.kind === 'message.received')).toMatchObject({ title: 'New message from Ada', detail: 'Return or refund · FH-A1' })
    expect(rows.filter((r) => r.kind === 'subscriber.new')).toHaveLength(1)
    expect(rows.filter((r) => r.kind === 'stock.low').map((r) => r.title)).toEqual(['Low stock: Product pA1'])
  })

  it('each person only sees activity their role allows', async () => {
    const fulfil = (await feed(f.users.fulfilA)).map((r) => r.kind)
    expect(fulfil).toContain('order.placed')
    expect(fulfil).not.toContain('message.received') // no customers.read
    expect(fulfil).not.toContain('payment.failed') // no payments.read
    const support = (await feed(f.users.supportA)).map((r) => r.kind)
    expect(support).toContain('message.received')
  })

  it('never shows another business’s activity', async () => {
    await db.query(`update public.orders set payment_status = 'paid', status = 'confirmed' where id = $1`, [f.orders.b1])
    const titles = (await feed(f.users.ownerB)).map((r) => r.title)
    expect(titles).toEqual(['New order FH-B1'])
    expect((await feed(f.users.ownerA)).map((r) => r.title)).not.toContain('New order FH-B1')
    expect(await feed(f.users.outsider)).toHaveLength(0)
  })

  it('nobody can write to the feed directly; it comes only from real changes', async () => {
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(
      `insert into public.activity_feed (tenant_id, kind, title, required_permission) values ($1, 'order.placed', 'fake', 'orders.read')`,
      [f.tenantA])))).toMatch(/permission denied/)
  })

  it('tracks what each person has seen, privately', async () => {
    await as(db, user(f.users.ownerA), (tx) => tx.query(`select public.mark_activity_seen($1)`, [f.tenantA]))
    const own = await probe(db, user(f.users.ownerA), (tx) => tx.query(`select 1 from public.activity_seen`).then((r) => r.rows.length))
    const others = await probe(db, user(f.users.adminA), (tx) => tx.query(`select 1 from public.activity_seen`).then((r) => r.rows.length))
    expect([own, others]).toEqual([1, 0])
    expect(await errorOf(probe(db, user(f.users.ownerB), (tx) => tx.query(`select public.mark_activity_seen($1)`, [f.tenantA])))).toMatch(/row-level security/)
  })

  it('retention keeps 90 days of activity', async () => {
    await db.query(`insert into public.activity_feed (tenant_id, kind, title, required_permission, occurred_at)
                    values ($1, 'order.placed', 'old', 'orders.read', now() - interval '100 days')`, [f.tenantA])
    const r = await as(db, { kind: 'service' }, (tx) => tx.query<{ r: any }>(`select public.run_retention() as r`))
    expect(r.rows[0].r.activity).toBe(1)
  })
})
