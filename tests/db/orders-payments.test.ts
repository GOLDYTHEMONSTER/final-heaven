// Order state machine, payment application and offline payments.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const user = (id: string) => ({ kind: 'user' as const, id })
const service = { kind: 'service' as const }
let seq = 0

/** A fresh pending order in tenant A, with one Flutterwave payment attempt of 2,499,990 kobo. */
async function newOrderWithPayment(total = 24999.9) {
  seq += 1
  const num = `FH-T${seq}`
  const order = await one<{ id: string }>(db,
    `insert into public.orders (order_number, email, tracking_number, shipping_address, subtotal, total, order_items, tenant_id, store_id)
     values ($1, 'c@customer.test', $2, 'addr', $3, $3, '[]', $4, $5) returning id`,
    [num, `TRK-T${seq}`, total, f.tenantA, f.storeA])
  const reference = `FHP-TEST${String(seq).padStart(6, '0')}`
  await db.query(`insert into public.payments (tenant_id, order_id, provider, reference, amount_minor, currency)
                  values ($1, $2, 'flutterwave', $3, $4, 'NGN')`, [f.tenantA, order.id, reference, Math.round(total * 100)])
  return { orderId: order.id, orderNumber: num, reference }
}
const apply = (ref: string, txId: string | null, status: string, amount: number | null, currency: string | null) =>
  as(db, service, (tx) => tx.query<{ outcome: string }>(
    `select public.apply_verified_payment($1, $2, $3, $4, $5) as outcome`, [ref, txId, status, amount, currency]))
    .then((r) => r.rows[0].outcome)
const orderState = (id: string) =>
  one<{ status: string; payment_status: string }>(db, `select status, payment_status from public.orders where id = $1`, [id])
const paymentState = (ref: string) =>
  one<{ status: string; failure_reason: string | null; paid_amount_minor: string | null }>(db,
    `select status, failure_reason, paid_amount_minor from public.payments where reference = $1`, [ref])
const countOf = (sql: string, params: unknown[] = []) => one<{ n: number }>(db, sql, params).then((r) => r.n)

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

describe('order status transitions', () => {
  let o: Awaited<ReturnType<typeof newOrderWithPayment>>
  beforeEach(async () => { o = await newOrderWithPayment() })
  const setStatus = (actor: string, status: string) =>
    probe(db, user(actor), (tx) => tx.query(`update public.orders set status = $1 where id = $2`, [status, o.orderId]))

  it('cannot be confirmed before payment is verified', async () => {
    expect(await errorOf(setStatus(f.users.ownerA, 'confirmed'))).toMatch(/before payment is verified/)
  })

  it('cannot skip ahead (pending_payment -> shipped)', async () => {
    expect(await errorOf(setStatus(f.users.fulfilA, 'shipped'))).toMatch(/invalid order status transition: pending_payment -> shipped/)
  })

  it('rejects values outside the status list', async () => {
    expect(await errorOf(setStatus(f.users.ownerA, 'teleported'))).toMatch(/check constraint|invalid order status/)
  })

  it('allows cancelling a pending order and records who did it', async () => {
    await as(db, user(f.users.fulfilA), (tx) => tx.query(`update public.orders set status = 'cancelled' where id = $1`, [o.orderId]))
    const ev = await one<{ from_value: string; to_value: string; actor_user_id: string; actor_type: string }>(db,
      `select from_value, to_value, actor_user_id, actor_type from public.order_events
        where order_id = $1 and event_type = 'status_changed'`, [o.orderId])
    expect(ev).toEqual({ from_value: 'pending_payment', to_value: 'cancelled', actor_user_id: f.users.fulfilA, actor_type: 'user' })
    const timeline = await one<{ last: string }>(db, `select timeline -> -1 ->> 'status' as last from public.orders where id = $1`, [o.orderId])
    expect(timeline.last).toBe('cancelled')
  })

  it('a cancelled order is final', async () => {
    await db.query(`update public.orders set status = 'cancelled' where id = $1`, [o.orderId])
    expect(await errorOf(setStatus(f.users.ownerA, 'pending_payment'))).toMatch(/invalid order status transition/)
  })

  it('walks the full happy path once paid', async () => {
    expect(await apply(o.reference, 'FLW-1-' + seq, 'successful', 2499990, 'NGN')).toBe('applied')
    for (const s of ['processing', 'shipped', 'delivered']) {
      expect(await errorOf(as(db, user(f.users.fulfilA), (tx) =>
        tx.query(`update public.orders set status = $1 where id = $2`, [s, o.orderId]))), s).toBeNull()
    }
    expect(await orderState(o.orderId)).toEqual({ status: 'delivered', payment_status: 'paid' })
  })
})

describe('applying verified payments', () => {
  it('a verified, exact payment marks the order paid and confirmed', async () => {
    const o = await newOrderWithPayment()
    expect(await apply(o.reference, 'FLW-100', 'successful', 2499990, 'NGN')).toBe('applied')
    expect(await orderState(o.orderId)).toEqual({ status: 'confirmed', payment_status: 'paid' })
    expect((await paymentState(o.reference)).status).toBe('successful')
    expect(await countOf(`select count(*)::int n from public.audit_events where action = 'payment.succeeded' and entity_id = $1`, [o.reference])).toBe(1)
  })

  it('duplicate deliveries change nothing the second time', async () => {
    const o = await newOrderWithPayment()
    await apply(o.reference, 'FLW-200', 'successful', 2499990, 'NGN')
    const events = await countOf(`select count(*)::int n from public.order_events where order_id = $1`, [o.orderId])
    const audits = await countOf(`select count(*)::int n from public.audit_events where entity_id = $1`, [o.reference])
    expect(await apply(o.reference, 'FLW-200', 'successful', 2499990, 'NGN')).toBe('already_applied')
    expect(await apply(o.reference, 'FLW-200', 'successful', 2499990, 'NGN')).toBe('already_applied')
    expect(await countOf(`select count(*)::int n from public.order_events where order_id = $1`, [o.orderId])).toBe(events)
    expect(await countOf(`select count(*)::int n from public.audit_events where entity_id = $1`, [o.reference])).toBe(audits)
  })

  it('an underpayment is rejected and the order stays unpaid', async () => {
    const o = await newOrderWithPayment()
    expect(await apply(o.reference, 'FLW-300', 'successful', 2499989, 'NGN')).toBe('rejected_amount')
    expect((await orderState(o.orderId)).payment_status).not.toBe('paid')
    expect((await paymentState(o.reference)).failure_reason).toMatch(/underpaid/)
  })

  it('the wrong currency is rejected even if the number matches', async () => {
    const o = await newOrderWithPayment()
    expect(await apply(o.reference, 'FLW-400', 'successful', 2499990, 'USD')).toBe('rejected_currency')
    expect((await orderState(o.orderId)).payment_status).not.toBe('paid')
  })

  it('a missing amount is rejected', async () => {
    const o = await newOrderWithPayment()
    expect(await apply(o.reference, 'FLW-450', 'successful', null, 'NGN')).toBe('rejected_amount')
  })

  it('an overpayment is accepted and flagged for a partial refund', async () => {
    const o = await newOrderWithPayment()
    expect(await apply(o.reference, 'FLW-500', 'successful', 2500000, 'NGN')).toBe('applied')
    const meta = await one<{ over: string }>(db,
      `select metadata ->> 'overpaid_minor' as over from public.audit_events where action = 'payment.succeeded' and entity_id = $1`, [o.reference])
    expect(meta.over).toBe('10')
  })

  it('out of order: a late "failed" cannot undo a success', async () => {
    const o = await newOrderWithPayment()
    await apply(o.reference, 'FLW-600', 'successful', 2499990, 'NGN')
    expect(await apply(o.reference, 'FLW-600', 'failed', null, null)).toBe('already_applied')
    expect(await orderState(o.orderId)).toEqual({ status: 'confirmed', payment_status: 'paid' })
  })

  it('a failed attempt followed by a successful retry ends paid', async () => {
    const o = await newOrderWithPayment()
    expect(await apply(o.reference, 'FLW-700', 'failed', null, null)).toBe('failed_recorded')
    expect((await orderState(o.orderId)).payment_status).toBe('failed')
    expect(await apply(o.reference, 'FLW-701', 'successful', 2499990, 'NGN')).toBe('applied')
    expect((await orderState(o.orderId)).payment_status).toBe('paid')
  })

  it('money arriving for a cancelled order is recorded but does not revive the order', async () => {
    const o = await newOrderWithPayment()
    await db.query(`update public.orders set status = 'cancelled' where id = $1`, [o.orderId])
    expect(await apply(o.reference, 'FLW-800', 'successful', 2499990, 'NGN')).toBe('applied_to_cancelled_order')
    expect(await orderState(o.orderId)).toEqual({ status: 'cancelled', payment_status: 'paid' })
  })

  it('unknown references are reported, not invented', async () => {
    expect(await apply('FHP-DOESNOTEXIST', 'FLW-900', 'successful', 1, 'NGN')).toBe('unknown_reference')
  })

  it('a successful payment can never be rewritten or deleted', async () => {
    const o = await newOrderWithPayment()
    await apply(o.reference, 'FLW-1000', 'successful', 2499990, 'NGN')
    expect(await errorOf(probe(db, service, (tx) =>
      tx.query(`update public.payments set status = 'failed' where reference = $1`, [o.reference])))).toMatch(/immutable/)
    expect(await errorOf(probe(db, service, (tx) =>
      tx.query(`update public.payments set paid_amount_minor = 1 where reference = $1`, [o.reference])))).toMatch(/immutable/)
    expect(await errorOf(probe(db, service, (tx) =>
      tx.query(`delete from public.payments where reference = $1`, [o.reference])))).toMatch(/append-only/)
  })

  it('only the server can apply payments; signed-in staff and the public cannot', async () => {
    const o = await newOrderWithPayment()
    for (const actor of [user(f.users.ownerA), { kind: 'anon' as const }]) {
      expect(await errorOf(probe(db, actor, (tx) =>
        tx.query(`select public.apply_verified_payment($1, 'x', 'successful', 2499990, 'NGN')`, [o.reference])))).toMatch(/permission denied/)
    }
  })

  it('the same provider transaction cannot be attached to two payments', async () => {
    const a = await newOrderWithPayment()
    const b = await newOrderWithPayment()
    await apply(a.reference, 'FLW-DUP', 'successful', 2499990, 'NGN')
    expect(await errorOf(apply(b.reference, 'FLW-DUP', 'successful', 2499990, 'NGN'))).toMatch(/duplicate key|unique/)
  })
})

describe('payment event inbox', () => {
  it('the same provider event can only be stored once', async () => {
    const insert = () => as(db, service, (tx) => tx.query(
      `insert into public.payment_events (provider, dedupe_key, event_type, payload) values ('flutterwave', 'charge.completed:42:successful', 'charge.completed', '{}')`))
    expect(await errorOf(insert())).toBeNull()
    expect(await errorOf(insert())).toMatch(/duplicate key|unique/)
  })
})

describe('offline (manual) payments', () => {
  const record = (actor: string, orderNumber: string, amount: number, note = 'Bank transfer, GTBank ref 123') =>
    as(db, user(actor), (tx) => tx.query(`select public.record_manual_payment($1, $2, 'NGN', 'bank_transfer', $3)`, [orderNumber, amount, note]))

  it('require payments.record: customer support cannot record one', async () => {
    const o = await newOrderWithPayment()
    expect(await errorOf(record(f.users.supportA, o.orderNumber, 2499990))).toMatch(/not permitted/)
    expect((await orderState(o.orderId)).payment_status).toBe('unpaid')
  })

  it('a finance manager can record the exact amount, with an audit entry', async () => {
    const o = await newOrderWithPayment()
    expect(await errorOf(record(f.users.financeA, o.orderNumber, 2499990))).toBeNull()
    expect(await orderState(o.orderId)).toEqual({ status: 'confirmed', payment_status: 'paid' })
    const audit = await one<{ actor_user_id: string }>(db,
      `select actor_user_id from public.audit_events where action = 'payment.recorded_manually' and metadata ->> 'order' = $1`, [o.orderNumber])
    expect(audit.actor_user_id).toBe(f.users.financeA)
  })

  it('must match the order total exactly and include a note', async () => {
    const o = await newOrderWithPayment()
    expect(await errorOf(record(f.users.financeA, o.orderNumber, 100))).toMatch(/must equal the order total/)
    expect(await errorOf(record(f.users.financeA, o.orderNumber, 2499990, ''))).toMatch(/note/)
  })

  it('cannot pay an order twice', async () => {
    const o = await newOrderWithPayment()
    await record(f.users.financeA, o.orderNumber, 2499990)
    expect(await errorOf(record(f.users.financeA, o.orderNumber, 2499990))).toMatch(/already paid/)
  })

  it('cannot touch another tenant’s order', async () => {
    expect(await errorOf(record(f.users.ownerB, 'FH-A1', 2499990))).toMatch(/not permitted/)
  })
})

describe('rate limiting', () => {
  it('counts hits per key and window and blocks over the limit', async () => {
    const hit = () => as(db, service, (tx) =>
      tx.query<{ ok: boolean }>(`select public.rate_limit_hit('test:key', 2, 60) as ok`)).then((r) => r.rows[0].ok)
    expect([await hit(), await hit(), await hit()]).toEqual([true, true, false])
  })

  it('cannot be called (or reset) by the public', async () => {
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select public.rate_limit_hit('x', 1, 60)`)))).toMatch(/permission denied/)
  })
})
