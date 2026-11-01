// Held marketing batches: who can approve, skip and reword them, that an approval
// can't be forged or survive an edit, the send-budget counts, and the
// delivered / refunded notices queued by the orders trigger.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
let sub: string
const user = (id: string) => ({ kind: 'user' as const, id })
const service = { kind: 'service' as const }

const batch = async (trigger = 'welcome_backfill', list = 'footer', status = 'held') =>
  (await db.query<{ id: string }>(
    `insert into public.email_batches (tenant_id, trigger, list, subject, heading, body, status, approved_at)
     values ($1, $2, $3, 'Welcome', 'Hello', 'Thanks for signing up.', $4, case when $4 = 'held' then null else now() end) returning id`,
    [f.tenantA, trigger, list, status])).rows[0].id

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  sub = (await db.query<{ id: string }>(`insert into public.newsletter_subscribers (tenant_id, store_id, email, source, consent_text, consented_at)
    values ($1, $2, 's@x.test', 'footer', 'ok', now()) returning id`, [f.tenantA, f.storeA])).rows[0].id
})
afterAll(() => db.close())

describe('held batches', () => {
  it('only marketers read them; anon, other staff, strangers and other tenants see nothing', async () => {
    const id = await batch('nurture_3d')
    const seen = (actor: Parameters<typeof probe>[1]) => probe(db, actor, (tx) => tx.query(`select 1 from public.email_batches where id = $1`, [id]).then((r) => r.rows.length))
    expect(await seen(user(f.users.ownerA))).toBe(1)
    expect(await seen(user(f.users.adminA))).toBe(1)
    for (const id2 of [f.users.supportA, f.users.readonlyA, f.users.outsider, f.users.ownerB]) expect(await seen(user(id2))).toBe(0)
    expect(await errorOf(seen({ kind: 'anon' }))).toMatch(/permission denied/)
  })

  it('a marketer approves with their own id, and nobody can sign for someone else', async () => {
    const id = await batch('nurture_7d')
    const approve = (actor: string, as_: string) => probe(db, user(actor), (tx) =>
      tx.query(`update public.email_batches set status = 'approved', approved_by = $2, approved_at = now() where id = $1 returning id`, [id, as_]).then((r) => r.rows.length))
    expect(await errorOf(approve(f.users.ownerA, f.users.adminA))).toMatch(/row-level security/)
    expect(await approve(f.users.ownerA, f.users.ownerA)).toBe(1)
    expect(await approve(f.users.supportA, f.users.supportA)).toBe(0) // no permission: the row isn't visible to update
  })

  it('the browser can skip but never mark a batch sending or sent', async () => {
    const id = await batch('winback_120')
    for (const status of ['sending', 'sent']) {
      expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(`update public.email_batches set status = '${status}', approved_at = now() where id = $1`, [id])))).toMatch(/row-level security/)
    }
    expect(await probe(db, user(f.users.ownerA), (tx) => tx.query(`update public.email_batches set status = 'skipped' where id = $1 returning id`, [id]).then((r) => r.rows.length))).toBe(1)
  })

  it('rewording an approved batch withdraws the approval; a sent one cannot be reworded', async () => {
    const id = await batch('review_ask', 'footer', 'approved')
    await db.query(`update public.email_batches set approved_by = $2 where id = $1`, [id, f.users.ownerA])
    await db.query(`update public.email_batches set heading = 'Hello again' where id = $1`, [id])
    expect((await db.query(`select status, approved_by, approved_at from public.email_batches where id = $1`, [id])).rows[0]).toEqual({ status: 'held', approved_by: null, approved_at: null })

    const sent = await batch('rt_viewed', 'footer', 'sent')
    expect(await errorOf(db.query(`update public.email_batches set body = 'changed' where id = $1`, [sent]))).toMatch(/can't be edited/)
  })

  it('a trigger has one waiting batch per list, and an approved one can be followed by a new one', async () => {
    await batch('launch', 'launch_waitlist')
    expect(await errorOf(batch('launch', 'launch_waitlist'))).toMatch(/duplicate key|unique/)
    await db.query(`update public.email_batches set status = 'approved', approved_at = now() where trigger = 'launch'`)
    await batch('launch', 'launch_waitlist')
  })

  it('recipients are the server’s: staff read them, nobody writes them', async () => {
    const id = await batch('welcome', 'footer')
    await as(db, service, (tx) => tx.query(`insert into public.email_batch_recipients (batch_id, subscriber_id, tenant_id, email, trigger) values ($1, $2, $3, 's@x.test', 'welcome')`, [id, sub, f.tenantA]))
    expect(await probe(db, user(f.users.ownerA), (tx) => tx.query(`select 1 from public.email_batch_recipients where batch_id = $1`, [id]).then((r) => r.rows.length))).toBe(1)
    expect(await probe(db, user(f.users.ownerB), (tx) => tx.query(`select 1 from public.email_batch_recipients where batch_id = $1`, [id]).then((r) => r.rows.length))).toBe(0)
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(`update public.email_batch_recipients set status = 'sent' where batch_id = $1`, [id])))).toMatch(/permission denied/)
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(`insert into public.email_batch_recipients (batch_id, subscriber_id, tenant_id, email, trigger) values ($1, $2, $3, 'x@y.z', 'welcome')`, [id, sub, f.tenantA])))).toMatch(/permission denied/)
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select 1 from public.email_batch_recipients`)))).toMatch(/permission denied/)
  })
})

describe('template approvals', () => {
  it('a marketer approves in their own name; others can’t, and nobody else reads them', async () => {
    const insert = (actor: string, by: string) => probe(db, user(actor), (tx) =>
      tx.query(`insert into public.email_template_approvals (tenant_id, template, copy_hash, approved_by) values ($1, 'welcome:footer', 'abc12345', $2)`, [f.tenantA, by]))
    expect(await errorOf(insert(f.users.ownerA, f.users.ownerA))).toBeNull()
    expect(await errorOf(insert(f.users.ownerA, f.users.adminA))).toMatch(/row-level security/)
    expect(await errorOf(insert(f.users.supportA, f.users.supportA))).toMatch(/row-level security/)
    expect(await errorOf(insert(f.users.ownerB, f.users.ownerB))).toMatch(/row-level security/)
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select 1 from public.email_template_approvals`)))).toMatch(/permission denied/)
  })
})

describe('email_usage', () => {
  it('counts sends today and this month across the outbox, campaigns and batches, marketing apart', async () => {
    const o = (await db.query<{ id: string }>(`select id from public.orders where tenant_id = $1 limit 1`, [f.tenantA])).rows[0].id
    await db.query(`insert into public.email_outbox (tenant_id, kind, order_id, dedupe_key, status, sent_at) values
      ($1, 'order.paid', $2, 'u1', 'sent', now()), ($1, 'order.shipped', $2, 'u2', 'sent', now() - interval '2 days'),
      ($1, 'order.paid', $2, 'u3', 'queued', null)`, [f.tenantA, o])
    await db.query(`insert into public.email_outbox (tenant_id, kind, subscriber_id, dedupe_key, status, sent_at) values ($1, 'subscriber.welcome', $2, 'u4', 'sent', now())`, [f.tenantA, sub])
    const camp = (await db.query<{ id: string }>(`insert into public.email_campaigns (tenant_id, subject) values ($1, 'C') returning id`, [f.tenantA])).rows[0].id
    await db.query(`insert into public.email_campaign_recipients (campaign_id, subscriber_id, tenant_id, email, status, sent_at) values ($1, $2, $3, 's@x.test', 'sent', now())`, [camp, sub, f.tenantA])
    const b = await batch('winback_180', 'footer', 'sent')
    await db.query(`insert into public.email_batch_recipients (batch_id, subscriber_id, tenant_id, email, trigger, status, sent_at) values ($1, $2, $3, 's@x.test', 'winback_180', 'sent', now())`, [b, sub, f.tenantA])

    const usage = (await as(db, service, (tx) => tx.query<{ u: any }>(`select public.email_usage($1) as u`, [f.tenantA]))).rows[0].u
    // today: receipt + welcome + campaign + batch = 4, 3 of them marketing (a "2 days ago" shipping notice only counts in the month, unless it is the 1st)
    expect(usage.today).toEqual({ total: 4, marketing: 3 })
    expect(usage.month.marketing).toBe(3)
    expect(usage.month.total).toBeGreaterThanOrEqual(4)
    expect(usage.month.total).toBeLessThanOrEqual(5)
  })

  it('is the server’s alone', async () => {
    await expect(probe(db, user(f.users.ownerA), (tx) => tx.query(`select public.email_usage($1)`, [f.tenantA]))).rejects.toThrow(/permission denied/)
  })
})

describe('delivered and refunded notices', () => {
  it('queues one delivered notice when an order is delivered', async () => {
    await db.query(`update public.orders set payment_status = 'paid' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set status = 'confirmed' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set status = 'processing' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set status = 'shipped' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set status = 'delivered' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set status = 'delivered' where id = $1`, [f.orders.a2])
    const rows = (await db.query(`select kind from public.email_outbox where order_id = $1 and kind = 'order.delivered'`, [f.orders.a2])).rows
    expect(rows).toHaveLength(1)
  })

  it('queues a refund notice for each refund state an order reaches, once each', async () => {
    await db.query(`update public.orders set payment_status = 'paid' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set payment_status = 'partially_refunded' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set payment_status = 'refunded' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set payment_status = 'paid' where id = $1`, [f.orders.a2])
    await db.query(`update public.orders set payment_status = 'refunded' where id = $1`, [f.orders.a2])
    const keys = (await db.query<{ dedupe_key: string }>(`select dedupe_key from public.email_outbox where order_id = $1 and kind = 'order.refunded' order by id`, [f.orders.a2])).rows.map((r) => r.dedupe_key.split(':')[2])
    expect(keys).toEqual(['partially_refunded', 'refunded'])
  })
})
