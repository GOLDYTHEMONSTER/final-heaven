// Orders exist only once payment is confirmed: checkout -> verified payment ->
// order, with stock, pre-orders, promo use, alerts and receipts following.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const service = { kind: 'service' as const }
const user = (id: string) => ({ kind: 'user' as const, id })
let n = 0

/** A checkout plus its Flutterwave payment, as the server creates them. */
async function checkout(items: ({ price: number; quantity: number } & Record<string, unknown>)[], { total = items.reduce((t, i) => t + i.price * i.quantity, 0), promo = null as string | null, email = 'buyer@x.test', createdAt = null as string | null } = {}) {
  n += 1
  const ref = `CHK-TEST${String(n).padStart(8, '0')}`
  const pay = `FHP-TEST${String(n).padStart(8, '0')}`
  const c = await one<{ id: string }>(db,
    `insert into public.checkouts (tenant_id, store_id, reference, order_number, tracking_number, email, shipping_address,
       shipping_city, currency, items, subtotal, discount, total, promo_code_id, is_preorder, created_at)
     values ($1, $2, $3, $4, $5, $6, '1 Test St', 'Lagos', 'NGN', $7, $8, 0, $8, $9,
       exists (select 1 from jsonb_array_elements($7::jsonb) i where (i ->> 'preorder')::boolean), coalesce($10::timestamptz, now()))
     returning id`,
    [f.tenantA, f.storeA, ref, `FH-T${n}`, `TRK-T${n}`, email, JSON.stringify(items), total, promo, createdAt])
  await db.query(`insert into public.payments (tenant_id, checkout_id, provider, reference, amount_minor, currency)
                  values ($1, $2, 'flutterwave', $3, $4, 'NGN')`, [f.tenantA, c.id, pay, total * 100])
  return { id: c.id, ref, pay, orderNumber: `FH-T${n}` }
}
const apply = (pay: string, status: string, amountMinor: number, txId = `${Math.floor(Math.random() * 1e9)}`) =>
  as(db, service, (tx) => tx.query<{ r: string }>(`select public.apply_verified_payment($1, $2, $3, $4, 'NGN') as r`,
    [pay, txId, status, amountMinor]).then((r) => r.rows[0].r))
const stock = async (id: string) => one<{ stock: number; preorder_limit: number; sales: number }>(db,
  `select stock, preorder_limit, sales from public.products where id = $1`, [id])
const tee = (quantity: number) => ({ id: 'pA1', name: 'Product pA1', price: 10000, quantity, size: 'M', color: null })

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db) // pA1 has stock 10
})
afterAll(() => db.close())

describe('orders after payment', () => {
  it('a checkout is not an order: nothing appears until payment is confirmed', async () => {
    const before = (await one<{ c: number }>(db, `select count(*)::int as c from public.orders`)).c
    const c = await checkout([tee(2)])
    expect((await one<{ c: number }>(db, `select count(*)::int as c from public.orders`)).c).toBe(before)
    expect(await apply(c.pay, 'failed', 2000000)).toBe('failed_recorded')
    expect(await one(db, `select id from public.orders where order_number = $1`, [c.orderNumber])).toBeUndefined()
    expect((await stock('pA1')).stock).toBe(10)
  })

  it('a verified payment places the order, takes the stock and queues the receipt and staff alert', async () => {
    const c = await checkout([tee(2)])
    expect(await apply(c.pay, 'successful', 2000000)).toBe('applied')
    const o = await one<Record<string, any>>(db, `select * from public.orders where order_number = $1`, [c.orderNumber])
    expect(o).toMatchObject({ status: 'confirmed', payment_status: 'paid', tracking_number: `TRK-T${n}`, checkout_id: c.id })
    expect(o.timeline).toEqual([expect.objectContaining({ status: 'confirmed', description: 'Order placed and paid' })])
    expect(o.stock_taken).toEqual([{ id: 'pA1', preorder: false, quantity: 2 }])
    expect(await stock('pA1')).toMatchObject({ stock: 8 })
    expect(await one(db, `select status, order_id from public.checkouts where id = $1`, [c.id])).toEqual({ status: 'completed', order_id: o.id })
    expect(await one(db, `select order_id from public.payments where reference = $1`, [c.pay])).toEqual({ order_id: o.id })
    const emails = await db.query<{ kind: string }>(`select kind from public.email_outbox where order_id = $1 order by kind`, [o.id])
    expect(emails.rows.map((r) => r.kind)).toEqual(['order.paid', 'staff.order_paid'])
    const feed = await db.query<{ title: string }>(`select title from public.activity_feed where kind = 'order.placed' and title like $1`, [`%${c.orderNumber}`])
    expect(feed.rows).toHaveLength(1)
  })

  it('confirming again (webhook after redirect) changes nothing', async () => {
    const c = await checkout([tee(1)])
    await apply(c.pay, 'successful', 1000000, '555')
    expect(await apply(c.pay, 'successful', 1000000, '555')).toBe('already_applied')
    expect((await one<{ c: number }>(db, `select count(*)::int as c from public.orders where checkout_id = $1`, [c.id])).c).toBe(1)
  })

  it('rejects an underpayment without placing anything', async () => {
    const c = await checkout([tee(1)])
    expect(await apply(c.pay, 'successful', 500000)).toBe('rejected_amount')
    expect(await one(db, `select order_id from public.checkouts where id = $1`, [c.id])).toEqual({ order_id: null })
  })

  it('a second successful payment for the same checkout is flagged for refund, not a second order', async () => {
    const c = await checkout([tee(1)])
    await db.query(`insert into public.payments (tenant_id, checkout_id, provider, reference, amount_minor, currency)
                    values ($1, $2, 'flutterwave', 'FHP-SECOND000001', 1000000, 'NGN')`, [f.tenantA, c.id])
    expect(await apply(c.pay, 'successful', 1000000)).toBe('applied')
    expect(await apply('FHP-SECOND000001', 'successful', 1000000)).toBe('duplicate_payment')
    expect((await one<{ c: number }>(db, `select count(*)::int as c from public.orders where checkout_id = $1`, [c.id])).c).toBe(1)
    const flagged = await one<{ detail: string }>(db, `select detail from public.activity_feed where title = $1`, [`Second payment for ${c.orderNumber}`])
    expect(flagged.detail).toMatch(/refund this one/)
  })

  it('when stock ran out before payment, the order is still placed and the shortfall is flagged', async () => {
    const left = (await stock('pA1')).stock
    const c = await checkout([tee(left + 2)], { total: (left + 2) * 10000 })
    expect(await apply(c.pay, 'successful', (left + 2) * 1000000)).toBe('applied')
    const o = await one<Record<string, any>>(db, `select stock_shortfall from public.orders where order_number = $1`, [c.orderNumber])
    expect(o.stock_shortfall).toEqual([expect.objectContaining({ id: 'pA1', ordered: left + 2, missing: 2 })])
    expect((await stock('pA1')).stock).toBe(0)
    const feed = await one<{ detail: string }>(db, `select detail from public.activity_feed where title = $1`, [`New order ${c.orderNumber}`])
    expect(feed.detail).toMatch(/stock short/)
  })

  it('pre-orders use their own allowance and leave stock alone; cancelling a paid order gives it back', async () => {
    await db.query(`update public.products set stock = 3, preorder = true, preorder_ships_on = '2026-12-01', preorder_limit = 4 where id = 'pA1'`)
    const c = await checkout([{ ...tee(3), preorder: true, ships_on: '2026-12-01' }], { total: 30000 })
    await apply(c.pay, 'successful', 3000000)
    expect(await stock('pA1')).toMatchObject({ stock: 3, preorder_limit: 1 })
    const o = await one<{ is_preorder: boolean; timeline: any[] }>(db, `select is_preorder, timeline from public.orders where order_number = $1`, [c.orderNumber])
    expect(o.is_preorder).toBe(true)
    expect(o.timeline[0].description).toBe('Pre-order placed and paid')

    await db.query(`update public.orders set status = 'cancelled' where order_number = $1`, [c.orderNumber])
    expect(await stock('pA1')).toMatchObject({ stock: 3, preorder_limit: 4 })
    await db.query(`update public.products set preorder = false, preorder_ships_on = null, preorder_limit = 0 where id = 'pA1'`)
  })

  it('counts promo code uses on paid orders only', async () => {
    const p = await one<{ id: string }>(db, `insert into public.promo_codes (tenant_id, code, kind, value) values ($1, 'SAVE10', 'percent', 10) returning id`, [f.tenantA])
    const paid = await checkout([tee(1)], { promo: p.id })
    await checkout([tee(1)], { promo: p.id }) // never paid
    await apply(paid.pay, 'successful', 1000000)
    const usage = await as(db, user(f.users.ownerA), (tx) => tx.query<{ promo_code_id: string; uses: number }>(
      `select promo_code_id, uses::int from public.promo_usage($1)`, [f.tenantA]))
    expect(usage.rows).toEqual([{ promo_code_id: p.id, uses: 1 }])
  })
})

describe('catalogue and promo rules in the database', () => {
  it('a sale price must be below the original price', async () => {
    expect(await errorOf(db.query(`update public.products set original_price = 5 where id = 'pA1'`))).toMatch(/products_sale_price_check/)
    await db.query(`update public.products set original_price = 99999 where id = 'pA1'`)
  })

  it('a pre-order needs a ship date', async () => {
    expect(await errorOf(db.query(`update public.products set preorder = true, preorder_ships_on = null where id = 'pA1'`))).toMatch(/products_preorder_date_check/)
  })

  it('promo codes: staff who edit products manage them, read-only staff see them, other businesses see nothing', async () => {
    const insert = (actor: string, code: string, tenant = f.tenantA) => probe(db, user(actor), (tx) =>
      tx.query(`insert into public.promo_codes (tenant_id, code, kind, value) values ($1, $2, 'fixed', 1000)`, [tenant, code]))
    expect(await errorOf(insert(f.users.adminA, 'ADMIN1'))).toBeNull()
    expect(await errorOf(insert(f.users.readonlyA, 'NOPE1'))).toMatch(/row-level security/)
    expect(await errorOf(insert(f.users.ownerB, 'NOPE2'))).toMatch(/row-level security/)
    const seen = (actor: string) => probe(db, user(actor), (tx) => tx.query(`select code from public.promo_codes`).then((r) => r.rows.length))
    expect(await seen(f.users.readonlyA)).toBeGreaterThan(0)
    expect(await seen(f.users.ownerB)).toBe(0)
  })

  it('checkouts are invisible to the public and to staff (service only)', async () => {
    for (const actor of [{ kind: 'anon' as const }, user(f.users.ownerA)]) {
      expect(await errorOf(probe(db, actor, (tx) => tx.query(`select * from public.checkouts`)))).toMatch(/permission denied/)
    }
  })

  it('retention strips personal details from unpaid checkouts after 30 days, and keeps placed ones', async () => {
    const old = await checkout([tee(1)], { createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString() })
    const r = await as(db, service, (tx) => tx.query<{ r: Record<string, number> }>(`select public.run_retention() as r`))
    expect(r.rows[0].r.checkoutsAnonymised).toBe(1)
    expect(await one(db, `select email, shipping_address, shipping_city, status from public.checkouts where id = $1`, [old.id]))
      .toEqual({ email: 'removed@invalid', shipping_address: 'removed', shipping_city: null, status: 'expired' })
  })
})
