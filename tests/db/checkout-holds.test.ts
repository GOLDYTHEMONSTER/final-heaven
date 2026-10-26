// Checkout holds: an open checkout keeps its lines for 30 minutes so the last
// pieces can't be sold twice (20261026130000_checkout_holds.sql).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const service = { kind: 'service' as const }
let n = 0

const line = (id: string, quantity = 1, extra: Record<string, unknown> = {}) => ({ id, name: id, price: 5000, quantity, size: null, color: null, ...extra })

/** Opens a checkout the way the server does; resolves to its id, or rejects with the database error. */
function open(items: Record<string, unknown>[]) {
  n += 1
  const total = items.reduce((t: number, i: any) => t + i.price * i.quantity, 0) || 5000
  const p = {
    tenant_id: f.tenantA, store_id: f.storeA, reference: `CHK-HOLD${String(n).padStart(6, '0')}`, order_number: `FH-H${n}`,
    tracking_number: `TRK-H${n}`, email: 'shopper@x.test', shipping_address: '1 Test St', shipping_city: 'Lagos',
    shipping_country: 'Nigeria', currency: 'NGN', items, subtotal: total, discount: 0, total,
  }
  return as(db, service, (tx) => tx.query<{ id: string }>(`select public.open_checkout($1::jsonb) as id`, [JSON.stringify(p)]).then((r) => r.rows[0].id))
}
const renew = (id: string) => as(db, service, (tx) => tx.query<{ ok: boolean }>(`select public.renew_checkout_hold($1) as ok`, [id]).then((r) => r.rows[0].ok))

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  const product = (id: string, stock: number, extra = '') =>
    db.query(`insert into public.products (id, name, price, category, stock, status, tenant_id, store_id ${extra ? ', preorder, preorder_ships_on, preorder_limit' : ''})
              values ($1, $1, 5000, 'Thrift', $2, 'active', $3, $4 ${extra})`, [id, stock, f.tenantA, f.storeA])
  await product('last1', 1)
  await product('three', 3)
  await product('plenty', 100)
  await product('pre2', 0, `, true, '2026-12-01', 2`)
})
afterAll(() => db.close())

describe('holding the last pieces', () => {
  it('a checkout holds its lines for 30 minutes', async () => {
    const id = await open([line('three', 2)])
    const row = await one<{ mins: number; status: string }>(db,
      `select round(extract(epoch from hold_until - now()) / 60)::int as mins, status from public.checkouts where id = $1`, [id])
    expect(row).toEqual({ mins: 30, status: 'open' })
    const held = await as(db, service, (tx) => tx.query(`select * from public.checkout_holds($1, array['three'])`, [f.storeA]))
    expect(held.rows).toEqual([{ product_id: 'three', preorder: false, quantity: 2 }])
  })

  it('a second shopper can’t start a checkout for the piece someone else holds', async () => {
    await open([line('last1')])
    const err = await errorOf(open([line('last1')]))
    expect(err).toMatch(/held:last1/)
    // ...but can still have what's left of something else.
    expect(await open([line('three', 1)])).toBeTruthy()
    expect(await errorOf(open([line('three', 1)]))).toMatch(/held:three/)
  })

  it('an expired or completed checkout, or one whose time ran out, lets the piece go', async () => {
    await db.query(`update public.checkouts set status = 'expired' where items @> '[{"id":"last1"}]'`)
    const id = await open([line('last1')])
    await db.query(`update public.checkouts set hold_until = now() - interval '1 minute' where id = $1`, [id])
    expect(await open([line('last1')])).toBeTruthy()
  })

  it('resuming renews the hold only while the stock is still free', async () => {
    await db.query(`update public.checkouts set status = 'expired' where items @> '[{"id":"last1"}]'`)
    const mine = await open([line('last1')])
    expect(await renew(mine)).toBe(true)
    // My hold lapses and someone else starts a checkout for it.
    await db.query(`update public.checkouts set hold_until = now() - interval '1 minute' where id = $1`, [mine])
    await open([line('last1')])
    expect(await errorOf(renew(mine))).toMatch(/held:last1/)
    // A checkout that's no longer open is never renewed.
    await db.query(`update public.checkouts set status = 'expired' where id = $1`, [mine])
    expect(await renew(mine)).toBe(false)
  })

  it('plenty of stock is never held back; pre-orders hold their own allowance', async () => {
    expect(await open([line('plenty', 20)])).toBeTruthy()
    expect(await open([line('plenty', 20)])).toBeTruthy()
    expect(await open([line('pre2', 2, { preorder: true, ships_on: '2026-12-01' })])).toBeTruthy()
    expect(await errorOf(open([line('pre2', 1, { preorder: true })]))).toMatch(/held:pre2/)
  })

  it('a product from another store, or that doesn’t exist, can’t be held', async () => {
    expect(await errorOf(open([line('pB1')]))).toMatch(/held:pB1/)
    expect(await errorOf(open([line('ghost')]))).toMatch(/held:ghost/)
  })

  it('only the server can open or renew checkouts', async () => {
    for (const who of [{ kind: 'anon' as const }, { kind: 'user' as const, id: f.users.ownerA }]) {
      expect(await errorOf(as(db, who, (tx) => tx.query(`select public.open_checkout('{}'::jsonb)`)))).toMatch(/permission denied/)
      expect(await errorOf(as(db, who, (tx) => tx.query(`select public.checkout_holds($1, array['x'])`, [f.storeA])))).toMatch(/permission denied/)
    }
  })
})
