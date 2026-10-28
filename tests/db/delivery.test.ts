// Delivery in the database (20261028120000_delivery_options.sql): the
// checkout total includes delivery, the order carries it over, and a paid
// Express fee is freight recovery that a cancellation reverses.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const service = { kind: 'service' as const }
let n = 0

const open = (over: Record<string, unknown> = {}) => {
  n += 1
  const ref = `CHK-DLV${String(n).padStart(8, '0')}`
  const p = {
    tenant_id: f.tenantA, store_id: f.storeA, reference: ref, order_number: `FH-D${n}`, tracking_number: `TRK-D${n}`, email: 'a@x.test',
    shipping_address: '1 St', currency: 'NGN', items: [{ id: 'pA1', quantity: 1, price: 18000 }], subtotal: 18000, discount: 0, total: 20500,
    delivery_option: 'express', delivery_fee: 2500, delivery_estimate: { minDays: 10, maxDays: 17, from: '2026-11-23', to: '2026-11-30' }, ...over,
  }
  return as(db, service, (tx) => tx.query<{ id: string }>(`select public.open_checkout($1) as id`, [JSON.stringify(p)]).then((r) => ({ id: r.rows[0].id, num: `FH-D${n}` })))
}

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

describe('delivery', () => {
  it('a checkout’s total must include its delivery fee', async () => {
    const c = await open()
    expect(await one(db, `select delivery_option, delivery_fee::float as fee, total::float as total from public.checkouts where id = $1`, [c.id]))
      .toEqual({ delivery_option: 'express', fee: 2500, total: 20500 })
    expect(await errorOf(open({ total: 18000 }))).toMatch(/checkouts_total_with_delivery_check/)
    // Standard: no fee, and the old arithmetic still holds.
    await open({ delivery_option: 'standard', delivery_fee: 0, total: 18000, delivery_estimate: null })
    expect(await errorOf(open({ delivery_option: 'overnight' }))).toMatch(/check constraint/)
  })

  it('the order carries the delivery over, and its Express fee is freight recovery, reversed if cancelled', async () => {
    const c = await open()
    const pay = `FHP-DLV${String(n).padStart(8, '0')}`
    await db.query(`insert into public.payments (tenant_id, checkout_id, provider, reference, amount_minor, currency) values ($1, $2, 'flutterwave', $3, 2050000, 'NGN')`,
      [f.tenantA, c.id, pay])
    await as(db, service, (tx) => tx.query(`select public.apply_verified_payment($1, 'tx-dlv', 'successful', 2050000, 'NGN')`, [pay]))
    expect(await one(db, `select delivery_option, delivery_fee::float as fee, total::float as total, delivery_estimate ->> 'to' as arrives from public.orders where order_number = $1`, [c.num]))
      .toEqual({ delivery_option: 'express', fee: 2500, total: 20500, arrives: '2026-11-30' })
    const ledger = () => one<{ s: number }>(db, `select coalesce(sum(amount), 0)::float as s from public.shipping_ledger
      where order_id = (select id from public.orders where order_number = $1) and idempotency_key like '%delivery%' or reversal_of in
        (select id from public.shipping_ledger where idempotency_key like 'order:' || (select id from public.orders where order_number = $1) || ':delivery')`, [c.num])
    expect((await ledger()).s).toBe(2500)
    await db.query(`update public.orders set status = 'cancelled' where order_number = $1`, [c.num])
    expect((await ledger()).s).toBe(0)
  })
})
