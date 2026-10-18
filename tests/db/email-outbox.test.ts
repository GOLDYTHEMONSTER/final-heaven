import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const service = { kind: 'service' as const }
const outbox = async () =>
  (await db.query<{ kind: string; order_id: string | null; status: string; attempts: number }>(
    `select kind, order_id, status, attempts from public.email_outbox order by id`)).rows
const claim = (limit = 10) =>
  as(db, service, (tx) => tx.query<{ id: number; kind: string }>(`select id, kind from public.claim_email_outbox($1)`, [limit]).then((r) => r.rows))

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

describe('email outbox', () => {
  it('queues nothing for a new, unpaid order', async () => {
    expect(await outbox()).toEqual([])
  })

  it('queues the receipt and staff alert once when a payment is applied, however often it is confirmed', async () => {
    await as(db, service, async (tx) => {
      await tx.query(`insert into public.payments (tenant_id, order_id, provider, reference, amount_minor, currency)
                      values ($1, $2, 'flutterwave', 'FHP-EMAIL0000001', 2499990, 'NGN')`, [f.tenantA, f.orders.a1])
      await tx.query(`select public.apply_verified_payment('FHP-EMAIL0000001', '9', 'successful', 2499990, 'NGN')`)
      await tx.query(`select public.apply_verified_payment('FHP-EMAIL0000001', '9', 'successful', 2499990, 'NGN')`)
    })
    // A later payment-status flip back and forth must not queue a second receipt either.
    await db.query(`update public.orders set payment_status = 'partially_refunded' where id = $1`, [f.orders.a1])
    await db.query(`update public.orders set payment_status = 'paid' where id = $1`, [f.orders.a1])
    const rows = await outbox()
    expect(rows.map((r) => r.kind).sort()).toEqual(['order.paid', 'staff.order_paid'])
    expect(rows.every((r) => r.order_id === f.orders.a1 && r.status === 'queued')).toBe(true)
  })

  it('alerts staff but sends no receipt when payment lands on a cancelled order', async () => {
    await db.query(`update public.orders set status = 'cancelled' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set payment_status = 'paid' where id = $1`, [f.orders.a2])
    const kinds = (await outbox()).filter((r) => r.order_id === f.orders.a2).map((r) => r.kind)
    expect(kinds).toEqual(['staff.order_paid'])
  })

  it('queues a shipping notice when the order ships, and a staff alert for each contact message', async () => {
    await db.query(`update public.orders set status = 'processing' where id = $1`, [f.orders.a1])
    await db.query(`update public.orders set status = 'shipped' where id = $1`, [f.orders.a1])
    await db.query(`insert into public.contact_messages (tenant_id, store_id, name, email, topic, message)
                    values ($1, $2, 'Ada', 'ada@x.co', 'order', 'Where is my parcel please?')`, [f.tenantA, f.storeA])
    const kinds = (await outbox()).map((r) => r.kind)
    expect(kinds).toContain('order.shipped')
    expect(kinds).toContain('staff.message')
  })

  it('claims each row once: a second claim gets nothing until the lock expires', async () => {
    const first = await claim(50)
    expect(first.length).toBe((await outbox()).length)
    expect(await claim(50)).toEqual([])
    await db.query(`update public.email_outbox set locked_until = now() - interval '1 second' where id = $1`, [first[0].id])
    expect((await claim(50)).map((r) => r.id)).toEqual([first[0].id]) // a crashed sender's row is retaken
  })

  it('stops after the attempt limit and expires emails older than 3 days', async () => {
    await db.query(`update public.email_outbox set status = 'failed', locked_until = null, attempts = 5 where kind = 'order.shipped'`)
    await db.query(`update public.email_outbox set status = 'queued', locked_until = null, attempts = 0,
                    created_at = now() - interval '4 days' where kind = 'staff.message'`)
    expect(await claim(50)).toEqual([])
    const rows = await outbox()
    expect(rows.find((r) => r.kind === 'order.shipped')?.status).toBe('failed')
    expect(rows.find((r) => r.kind === 'staff.message')?.status).toBe('skipped')
  })

  it('is invisible and unwritable to the public and to staff', async () => {
    for (const actor of [{ kind: 'anon' as const }, { kind: 'user' as const, id: f.users.ownerA }]) {
      await expect(probe(db, actor, (tx) => tx.query(`select * from public.email_outbox`))).rejects.toThrow(/permission denied/)
      await expect(probe(db, actor, (tx) => tx.query(`select public.claim_email_outbox(1)`))).rejects.toThrow(/permission denied/)
    }
  })

  it('retention keeps recent rows and reports the email count', async () => {
    const result = await as(db, service, (tx) => tx.query<{ r: Record<string, number> }>(`select public.run_retention() as r`))
    expect(result.rows[0].r.emails).toBe(0)
  })
})
