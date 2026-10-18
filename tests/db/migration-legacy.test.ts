// The Phase 1 migration against data shaped like the live database on
// 18 Oct 2026: existing rows must survive and be scoped to Final Heaven.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, migrationFiles, readMigration, one } from './harness'

const PHASE1 = migrationFiles().find((f) => f.includes('phase1'))!
let db: PGlite

beforeAll(async () => {
  db = await createTestDb({ stopBefore: PHASE1 })
  // Legacy rows exactly as the old code wrote them (client item fields, old statuses).
  await db.exec(`
    insert into public.products (id, name, price, original_price, category, stock, status)
      values ('p1779120231145', 'NIKE AIR FORCE', 24999.9, 50000, 'Shoes', 13, 'active'),
             ('p2', 'Tee', 18500, null, 'T-Shirts', 52, 'active');
    insert into public.orders (order_number, email, status, tracking_number, shipping_address, subtotal, total, order_items)
      values ('FH958241367', 'a@x.co', 'ordered',    'TRK1', 'addr', 24999.9, 24999.9, '[{"id":"p1779120231145","size":"M","price":24999.9,"quantity":1,"isMembersOnly":false}]'),
             ('FH331221905', 'b@x.co', 'processing', 'TRK2', 'addr', 24999.9, 24999.9, '[]'),
             ('FH812094551', 'c@x.co', 'shipped',    'TRK3', 'addr', 25005.9, 25005.9, '[]'),
             ('TEST01',      'd@x.co', 'shipped',    'TRK4', 'addr', 25005.9, 25005.9, '[]');
    insert into public.newsletter_subscribers (email) values ('n@x.co');
  `)
  await db.exec(readMigration(PHASE1))
})
afterAll(() => db.close())

describe('Phase 1 migration on legacy data', () => {
  it('keeps every row', async () => {
    expect((await one<{ n: number }>(db, `select count(*)::int n from public.orders`)).n).toBe(4)
    expect((await one<{ n: number }>(db, `select count(*)::int n from public.products`)).n).toBe(2)
    expect((await one<{ n: number }>(db, `select count(*)::int n from public.newsletter_subscribers`)).n).toBe(1)
  })

  it('assigns every row to the Final Heaven tenant and store', async () => {
    for (const t of ['products', 'orders', 'drops', 'newsletter_subscribers']) {
      const r = await one<{ bad: number }>(db,
        `select count(*)::int bad from public.${t} x
          where x.tenant_id is distinct from (select id from public.tenants where slug = 'final-heaven')
             or x.store_id is distinct from (select id from public.stores where slug = 'final-heaven')`)
      expect(r.bad, t).toBe(0)
    }
  })

  it('maps legacy statuses without claiming unverified payments as paid', async () => {
    const { rows } = await db.query<{ order_number: string; status: string; payment_status: string; currency: string }>(
      `select order_number, status, payment_status, currency from public.orders order by order_number`)
    expect(rows).toEqual([
      { order_number: 'FH331221905', status: 'processing', payment_status: 'unverified', currency: 'NGN' },
      { order_number: 'FH812094551', status: 'shipped', payment_status: 'unverified', currency: 'NGN' },
      { order_number: 'FH958241367', status: 'pending_payment', payment_status: 'unpaid', currency: 'NGN' },
      { order_number: 'TEST01', status: 'shipped', payment_status: 'unverified', currency: 'NGN' },
    ])
  })

  it('preserves prices and order item payloads exactly', async () => {
    const p = await one<{ price: string; original_price: string }>(db, `select price, original_price from public.products where id = 'p1779120231145'`)
    expect(p).toEqual({ price: '24999.90', original_price: '50000.00' })
    const o = await one<{ qty: string }>(db, `select order_items -> 0 ->> 'quantity' as qty from public.orders where order_number = 'FH958241367'`)
    expect(o.qty).toBe('1')
  })

  it('legacy orders can still move forward under the new rules', async () => {
    await db.query(`update public.orders set status = 'shipped' where order_number = 'FH331221905'`)
    await db.query(`update public.orders set status = 'delivered' where order_number = 'FH812094551'`)
    const { rows } = await db.query<{ status: string }>(
      `select status from public.orders where order_number in ('FH331221905', 'FH812094551') order by order_number`)
    expect(rows.map((r) => r.status)).toEqual(['shipped', 'delivered'])
  })

  it('subscriber emails are unique per tenant, not globally', async () => {
    const b = await one<{ t: string; s: string }>(db,
      `with t as (insert into public.tenants (slug, name) values ('other', 'Other') returning id)
       insert into public.stores (tenant_id, slug, name) select id, 'other', 'Other' from t returning tenant_id as t, id as s`)
    await db.query(`insert into public.newsletter_subscribers (email, tenant_id, store_id) values ('n@x.co', $1, $2)`, [b.t, b.s])
    await expect(db.query(`insert into public.newsletter_subscribers (email, tenant_id, store_id)
      select 'n@x.co', tenant_id, store_id from public.newsletter_subscribers where tenant_id <> $1 limit 1`, [b.t])).rejects.toThrow(/duplicate key|unique/)
  })
})
