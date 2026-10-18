import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const user = (id: string) => ({ kind: 'user' as const, id })
const service = { kind: 'service' as const }
let seq = 0

async function order(o: { tenant?: 'A' | 'B'; email: string; total: number; paid: boolean; createdAt?: string; items?: unknown[] }) {
  seq += 1
  const tenant = o.tenant === 'B' ? f.tenantB : f.tenantA
  const store = o.tenant === 'B' ? f.storeB : f.storeA
  await db.query(
    `insert into public.orders (order_number, email, tracking_number, shipping_address, shipping_city, subtotal, total,
       order_items, tenant_id, store_id, payment_status, created_at)
     values ($1, $2, $3, 'addr', 'Lagos', $4, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()))`,
    [`FH-AN${seq}`, o.email, `TRK-AN${seq}`, o.total, JSON.stringify(o.items ?? []), tenant, store, o.paid ? 'paid' : 'unpaid', o.createdAt ?? null])
}
const track = (event: string, seed: string, extra: { product?: string; source?: string; device?: string } = {}, store = () => f.storeA) =>
  as(db, service, (tx) => tx.query(
    `select public.track_event($1, $2, $3, '/shop', $4, $5, null, null, null, $6, 'NG')`,
    [store(), event, seed, extra.product ?? null, extra.source ?? null, extra.device ?? 'mobile']))
const summary = (actor: string, tenant: string, from: string, to: string) =>
  as(db, user(actor), (tx) => tx.query<{ s: any }>(`select public.analytics_summary($1, $2, $3) as s`, [tenant, from, to]))
    .then((r) => r.rows[0].s)
const today = () => new Date().toISOString().slice(0, 10)

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  await db.query(`update public.orders set payment_status = 'unpaid'`) // fixture orders
})
afterAll(() => db.close())

describe('hidden categories (vapes pending legal review)', () => {
  beforeAll(async () => {
    await db.query(`insert into public.products (id, name, price, category, status, tenant_id, store_id)
                    values ('vape1', 'Vape', 1000, 'Vapes', 'active', $1, $2)`, [f.tenantA, f.storeA])
  })

  it('are invisible to the public', async () => {
    const ids = await probe(db, { kind: 'anon' }, (tx) =>
      tx.query<{ id: string }>(`select id from public.products where store_id = $1`, [f.storeA]).then((r) => r.rows.map((x) => x.id)))
    expect(ids).not.toContain('vape1')
    expect(ids).toContain('pA1')
  })

  it('stay visible to staff, and come back when unhidden', async () => {
    const staff = await probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`select 1 from public.products where id = 'vape1'`).then((r) => r.rows.length))
    expect(staff).toBe(1)
    await db.query(`update public.stores set hidden_categories = '{}' where id = $1`, [f.storeA])
    const pub = await probe(db, { kind: 'anon' }, (tx) => tx.query(`select 1 from public.products where id = 'vape1'`).then((r) => r.rows.length))
    await db.query(`update public.stores set hidden_categories = array['Vapes'] where id = $1`, [f.storeA])
    expect(pub).toBe(1)
  })
})

describe('privacy-first tracker', () => {
  it('stores a daily hash, never the IP or user agent', async () => {
    await track('page_view', '203.0.113.9|Mozilla/5.0 test')
    const row = await one<{ visitor_day: string; payload: string }>(db,
      `select visitor_day, row_to_json(e)::text as payload from public.analytics_events e order by id desc limit 1`)
    expect(row.visitor_day).toMatch(/^[0-9a-f]{64}$/)
    expect(row.payload).not.toContain('203.0.113.9')
    expect(row.payload).not.toContain('Mozilla')
  })

  it('the same visitor on the same day gets the same hash; a different visitor does not', async () => {
    await track('page_view', 'visitor-1'); await track('product_view', 'visitor-1'); await track('page_view', 'visitor-2')
    const { rows } = await db.query<{ visitor_day: string }>(`select visitor_day from public.analytics_events order by id desc limit 3`)
    expect(rows[1].visitor_day).toBe(rows[2].visitor_day)
    expect(rows[0].visitor_day).not.toBe(rows[1].visitor_day)
  })

  it('only the server can record events; nobody can read the salts', async () => {
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) =>
      tx.query(`select public.track_event($1, 'page_view', 'x', null, null, null, null, null, null, 'mobile', null)`, [f.storeA])))).toMatch(/permission denied/)
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(`select * from private.analytics_salts`)))).toMatch(/permission denied/)
  })

  it('rejects event types outside the list', async () => {
    expect(await errorOf(track('keystroke', 'v'))).toMatch(/check constraint/)
  })
})

describe('analytics summary', () => {
  let baseline: any
  beforeAll(async () => {
    // Earlier tests in this file already recorded some events; measure our own changes.
    baseline = (await summary(f.users.ownerA, f.tenantA, today(), today())).traffic
    const shoe = { id: 'pA1', name: 'Shoe', price: 1000, quantity: 2 }
    const tee = { id: 'pA9', name: 'Tee', price: 500, quantity: 1 }
    await order({ email: 'Ada@x.co', total: 2000, paid: true, items: [shoe] })
    await order({ email: 'ada@x.co', total: 500, paid: true, items: [tee] })   // same customer, different case
    await order({ email: 'bola@x.co', total: 9999, paid: false })              // unpaid: not in sales
    await order({ tenant: 'B', email: 'rival@x.co', total: 777777, paid: true }) // other tenant
    for (const v of ['v1', 'v2', 'v3']) await track('page_view', v, { source: 'instagram.com' })
    await track('product_view', 'v1', { product: 'pA1' }); await track('product_view', 'v2', { product: 'pA1' })
    await track('add_to_cart', 'v1', { product: 'pA1' }); await track('checkout_started', 'v1')
  })

  it('needs analytics.read in that tenant', async () => {
    expect(await errorOf(summary(f.users.supportA, f.tenantA, today(), today()))).toMatch(/not permitted/)
    expect(await errorOf(summary(f.users.ownerB, f.tenantA, today(), today()))).toMatch(/not permitted/)
    expect(await errorOf(summary(f.users.outsider, f.tenantA, today(), today()))).toMatch(/not permitted/)
  })

  it('counts verified-paid orders only, for this tenant only', async () => {
    const s = await summary(f.users.ownerA, f.tenantA, today(), today())
    expect(s.sales.gross).toBe(2500)
    expect(s.orders.paid).toBe(2)
    expect(Number(s.sales.averageOrderValue)).toBe(1250)
    expect(s.orders.awaitingPayment).toBeGreaterThanOrEqual(1) // bola, plus fixture orders
    expect(JSON.stringify(s)).not.toContain('777777')
  })

  it('treats one email in different cases as one customer, and spots repeats', async () => {
    const s = await summary(f.users.ownerA, f.tenantA, today(), today())
    expect(s.customers).toEqual({ paying: 1, new: 1, repeat: 1 })
  })

  it('ranks top products by paid revenue', async () => {
    const s = await summary(f.users.ownerA, f.tenantA, today(), today())
    expect(s.topProducts[0]).toMatchObject({ productId: 'pA1', units: 2, revenue: 2000 })
  })

  it('builds the funnel from distinct visitors per day', async () => {
    const t = (await summary(f.users.ownerA, f.tenantA, today(), today())).traffic
    // v1 and v2 viewed a product (v1 twice-counted as one), v1 carted and checked out, v3 only browsed.
    expect(t.productViewers - baseline.productViewers).toBe(2)
    expect(t.addedToCart - baseline.addedToCart).toBe(1)
    expect(t.startedCheckout - baseline.startedCheckout).toBe(1)
    expect(t.visitorDays - baseline.visitorDays).toBe(3)
  })

  it('reports days in the store’s time zone (Lagos, UTC+1)', async () => {
    // 23:30 UTC on 1 Jan is 00:30 on 2 Jan in Lagos.
    await order({ email: 'late@x.co', total: 300, paid: true, createdAt: '2026-01-01T23:30:00Z' })
    const jan1 = await summary(f.users.ownerA, f.tenantA, '2026-01-01', '2026-01-01')
    const jan2 = await summary(f.users.ownerA, f.tenantA, '2026-01-02', '2026-01-02')
    expect([jan1.orders.paid, jan2.orders.paid]).toEqual([0, 1])
  })

  it('rejects absurd ranges', async () => {
    expect(await errorOf(summary(f.users.ownerA, f.tenantA, '2026-02-01', '2026-01-01'))).toMatch(/invalid date range/)
  })
})

describe('customer summaries', () => {
  const list = (actor: string, tenant: string, search: string | null = null) =>
    as(db, user(actor), (tx) => tx.query<{ email: string; orders: string; paid_total: string }>(
      `select * from public.customer_summaries($1, $2)`, [tenant, search])).then((r) => r.rows)

  it('needs customers.read; fulfilment staff cannot list customers', async () => {
    expect(await errorOf(list(f.users.fulfilA, f.tenantA))).toMatch(/not permitted/)
  })

  it('groups by email case-insensitively and totals paid orders only', async () => {
    const ada = (await list(f.users.supportA, f.tenantA)).find((c) => c.email === 'ada@x.co')!
    expect(Number(ada.orders)).toBe(2)
    expect(Number(ada.paid_total)).toBe(2500)
  })

  it('never includes another tenant’s customers', async () => {
    expect((await list(f.users.ownerA, f.tenantA)).map((c) => c.email)).not.toContain('rival@x.co')
    expect(await errorOf(list(f.users.ownerA, f.tenantB))).toMatch(/not permitted/)
  })

  it('search can’t be widened with wildcards', async () => {
    expect(await list(f.users.ownerA, f.tenantA, '%')).toHaveLength((await list(f.users.ownerA, f.tenantA)).length)
    expect((await list(f.users.ownerA, f.tenantA, 'bola')).map((c) => c.email)).toEqual(['bola@x.co'])
  })
})

describe('compliance fields', () => {
  it('fulfilment staff can record a courier reference but not terms acceptance', async () => {
    expect(await errorOf(as(db, user(f.users.fulfilA), (tx) =>
      tx.query(`update public.orders set shipping_carrier = 'GIG', shipping_reference = 'GIG123' where id = $1`, [f.orders.a1])))).toBeNull()
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`update public.orders set terms_accepted_at = now() where id = $1`, [f.orders.a1])))).toMatch(/permission denied/)
  })

  it('read-only staff cannot change the courier reference', async () => {
    const n = await probe(db, user(f.users.readonlyA), (tx) =>
      tx.query(`update public.orders set shipping_reference = 'x' where id = $1`, [f.orders.a1]).then((r) => r.affectedRows))
    expect(n).toBe(0)
  })

  it('newsletter unsubscribe works by token, server-side only', async () => {
    const s = await one<{ token: string }>(db,
      `insert into public.newsletter_subscribers (email, tenant_id, store_id, consented_at) values ('n@x.co', $1, $2, now())
       returning unsubscribe_token as token`, [f.tenantA, f.storeA])
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select public.newsletter_unsubscribe($1)`, [s.token])))).toMatch(/permission denied/)
    const ok = await as(db, service, (tx) => tx.query<{ ok: boolean }>(`select public.newsletter_unsubscribe($1) as ok`, [s.token]))
    expect(ok.rows[0].ok).toBe(true)
    const unknown = await as(db, service, (tx) =>
      tx.query<{ ok: boolean }>(`select public.newsletter_unsubscribe(gen_random_uuid()) as ok`))
    expect(unknown.rows[0].ok).toBe(false)
  })
})

describe('retention job', () => {
  it('expires old analytics and rate-limit rows, and never touches financial records', async () => {
    await db.query(`insert into public.analytics_events (tenant_id, store_id, event_type, visitor_day, occurred_at)
                    values ($1, $2, 'page_view', repeat('a', 64), now() - interval '14 months')`, [f.tenantA, f.storeA])
    await db.query(`insert into private.rate_limits (key, window_start) values ('old', now() - interval '3 days')`)
    await db.query(`insert into private.analytics_salts (day) values (current_date - 5)`)
    await db.query(`update public.orders set created_at = now() - interval '10 years' where id = $1`, [f.orders.a2])

    const before = await one<{ o: number; a: number }>(db,
      `select (select count(*)::int from public.orders) o, (select count(*)::int from public.audit_events) a`)
    const res = await as(db, service, (tx) => tx.query<{ r: any }>(`select public.run_retention() as r`)).then((r) => r.rows[0].r)
    expect(res.analyticsEvents).toBe(1)
    expect(res.rateLimitWindows).toBeGreaterThanOrEqual(1)
    expect(res.analyticsSalts).toBeGreaterThanOrEqual(1)
    const after = await one<{ o: number; a: number }>(db,
      `select (select count(*)::int from public.orders) o, (select count(*)::int from public.audit_events) a`)
    expect(after).toEqual(before)
  })

  it('can only be run by the server', async () => {
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(`select public.run_retention()`)))).toMatch(/permission denied/)
  })
})
