// Smart Shipping in the database (20261027120000_shipping_engine.sql): the
// ledger an order posts when it's paid, reversals, versioned rates, inventory
// receipts, reconciliation, and who can do what.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const service = { kind: 'service' as const }
const user = (id: string) => ({ kind: 'user' as const, id })
let n = 0

/** An allocation snapshot as lib/shipping/engine.allocateOrder makes it (amounts in kobo). */
const snapshot = (lines: Record<string, unknown>[]) => ({
  version: 1, computedAt: '2026-10-27T12:00:00Z', status: 'verified', rates: {}, settings: { recoveryTargetPct: 50, reserveSharePct: 20, platformRecognisedOn: 'delivered' },
  lines, totals: {}, warnings: [],
})
const line = (over: Record<string, unknown> = {}) => ({
  productId: 'pA1', size: 'M', quantity: 2, method: 'air', gift: false, chargeableKg: 0.2, classKey: 'standard', campaignId: null, confidence: 'verified',
  freightKobo: 480000, targetKobo: 240000, contributionKobo: 300000, recoveryKobo: 240000, reserveKobo: 60000, platformKobo: 170000,
  subsidyKobo: 0, discountKobo: 0, unfundedKobo: 240000, flags: [], ...over,
})

/** A checkout with its allocation and Flutterwave payment, as the server creates them. */
async function checkout(lines: Record<string, unknown>[] = [line()], total = 20000) {
  n += 1
  const pay = `FHP-SHIP${String(n).padStart(8, '0')}`
  const c = await one<{ id: string }>(db,
    `insert into public.checkouts (tenant_id, store_id, reference, order_number, tracking_number, email, shipping_address,
       currency, items, subtotal, discount, total, shipping_allocation)
     values ($1, $2, $3, $4, $5, 'buyer@x.test', '1 Test St', 'NGN', $6, $7, 0, $7, $8) returning id`,
    [f.tenantA, f.storeA, `CHK-SHIP${String(n).padStart(8, '0')}`, `FH-S${n}`, `TRK-S${n}`,
      JSON.stringify([{ id: 'pA1', name: 'Product pA1', price: total / 2, quantity: 2, size: 'M' }]), total, JSON.stringify(snapshot(lines))])
  await db.query(`insert into public.payments (tenant_id, checkout_id, provider, reference, amount_minor, currency)
                  values ($1, $2, 'flutterwave', $3, $4, 'NGN')`, [f.tenantA, c.id, pay, total * 100])
  return { pay, orderNumber: `FH-S${n}` }
}
const pay = (ref: string, amountMinor: number, tx = String(n)) =>
  as(db, service, (t) => t.query<{ r: string }>(`select public.apply_verified_payment($1, $2, 'successful', $3, 'NGN') as r`, [ref, tx, amountMinor]).then((r) => r.rows[0].r))
const orderId = async (num: string) => (await one<{ id: string }>(db, `select id from public.orders where order_number = $1`, [num])).id
const ledger = (orderNum: string) => db.query<{ kind: string; amount: string; reason: string }>(
  `select kind, amount, reason from public.shipping_ledger where order_id = (select id from public.orders where order_number = $1) order by id`, [orderNum]).then((r) => r.rows)
const totals = async (orderNum: string) => Object.fromEntries((await db.query<{ kind: string; s: string }>(
  `select kind, sum(amount)::text as s from public.shipping_ledger where order_id = (select id from public.orders where order_number = $1) group by kind`, [orderNum])).rows.map((r) => [r.kind, Number(r.s)]))

async function rate(tenantId: string, over: Record<string, unknown> = {}) {
  const r = { method: 'air', provider: 'Test Cargo', billing_unit: 'kg', rate_per_unit: 12000, effective_from: '2026-10-01', ...over }
  return one<{ id: string }>(db, `insert into public.shipping_rates (tenant_id, method, provider, billing_unit, rate_per_unit, effective_from)
    values ($1, $2, $3, $4, $5, $6) returning id`, [tenantId, r.method, r.provider, r.billing_unit, r.rate_per_unit, r.effective_from])
}

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

describe('policy and permissions', () => {
  it('seeds a 50% target and five weight classes for the existing business, with no money limits', async () => {
    expect(await one(db, `select recovery_target_pct::float as t, reserve_share_pct::float as r from public.shipping_settings where tenant_id = $1`, [f.tenantA]))
      .toEqual({ t: 50, r: 0 })
    const classes = (await db.query<{ key: string; min: string | null }>(`select key, min_contribution as min from public.shipping_classes where tenant_id = $1 order by sort`, [f.tenantA])).rows
    expect(classes.map((c) => c.key)).toEqual(['ultra_light', 'lightweight', 'standard', 'heavy', 'bulky'])
    expect(classes.every((c) => c.min == null)).toBe(true)
    expect((await one<{ c: number }>(db, `select count(*)::int as c from public.shipping_rates`)).c).toBe(0) // no rate until staff add one
  })

  it('only shipping managers add rates; others are refused (and nobody unsigned sees any)', async () => {
    const insert = (who: string) => probe(db, user(who), (tx) => tx.query(
      `insert into public.shipping_rates (tenant_id, method, provider, billing_unit, rate_per_unit, effective_from) values ($1, 'air', 'X', 'kg', 9000, '2026-10-01')`, [f.tenantA]))
    expect(await errorOf(insert(f.users.adminA))).toBeNull()
    for (const who of [f.users.supportA, f.users.fulfilA, f.users.readonlyA, f.users.financeA, f.users.outsider]) {
      expect(await errorOf(insert(who))).toMatch(/row-level security|permission denied/)
    }
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select * from public.shipping_rates`)))).toMatch(/permission denied/)
  })

  it('records who confirmed a rate, from the session', async () => {
    const id = await as(db, user(f.users.adminA), (tx) => tx.query<{ id: string; confirmed_by: string }>(
      `insert into public.shipping_rates (tenant_id, method, provider, billing_unit, rate_per_unit, effective_from, confirmed_by)
       values ($1, 'air', 'Confirmed Cargo', 'kg', 11000, '2026-10-01', $2) returning id, confirmed_by`, [f.tenantA, f.users.ownerB]).then((r) => r.rows[0]))
    expect(id.confirmed_by).toBe(f.users.adminA)
  })

  it('a saved rate’s terms can’t change: it is replaced, so history still adds up', async () => {
    const r = await rate(f.tenantA)
    expect(await errorOf(as(db, user(f.users.adminA), (tx) => tx.query(`update public.shipping_rates set rate_per_unit = 15000 where id = $1`, [r.id]))))
      .toMatch(/can’t be changed: add a new rate/)
    // Ending it and replacing it is allowed.
    const next = await rate(f.tenantA, { rate_per_unit: 15000, effective_from: '2026-11-01' })
    expect(await errorOf(as(db, user(f.users.adminA), (tx) => tx.query(
      `update public.shipping_rates set status = 'superseded', effective_to = '2026-10-31', superseded_by = $2 where id = $1`, [r.id, next.id])))).toBeNull()
  })

  it('keeps each business’s shipping records to itself', async () => {
    await rate(f.tenantB, { provider: 'Rival Cargo' })
    const seen = await probe(db, user(f.users.ownerA), (tx) => tx.query<{ provider: string }>(`select provider from public.shipping_rates`))
    expect(seen.rows.map((r) => r.provider)).not.toContain('Rival Cargo')
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(
      `insert into public.shipping_rates (tenant_id, method, provider, billing_unit, rate_per_unit, effective_from) values ($1, 'air', 'X', 'kg', 1, '2026-10-01')`, [f.tenantB]))))
      .toMatch(/row-level security/)
    // A profile can't point at another business's product.
    expect(await errorOf(as(db, user(f.users.ownerB), (tx) => tx.query(
      `insert into public.product_shipping_profiles (product_id, tenant_id, weight_kg) values ('pA1', $1, 0.2)`, [f.tenantB]))))
      .toMatch(/foreign key/)
  })

  it('a contribution override needs a reason and is audited with who set it', async () => {
    expect(await errorOf(as(db, user(f.users.adminA), (tx) => tx.query(
      `insert into public.product_shipping_profiles (product_id, tenant_id, weight_kg, override_contribution) values ('pA2', $1, 0.3, 2000)`, [f.tenantA]))))
      .toMatch(/check constraint/)
    await as(db, user(f.users.adminA), (tx) => tx.query(
      `insert into public.product_shipping_profiles (product_id, tenant_id, weight_kg, override_contribution, override_reason, override_by)
       values ('pA2', $1, 0.3, 2000, 'Matches competitor', $2)`, [f.tenantA, f.users.ownerB]))
    expect(await one(db, `select override_by from public.product_shipping_profiles where product_id = 'pA2'`)).toEqual({ override_by: f.users.adminA })
    expect(await one(db, `select actor_user_id, metadata from public.audit_events where action = 'shipping.override_set' order by id desc limit 1`))
      .toMatchObject({ actor_user_id: f.users.adminA, metadata: { reason: 'Matches competitor', to: 2000 } })
  })
})

describe('the ledger', () => {
  it('a paid order posts its recovery, reserve and platform shares, once', async () => {
    const c = await checkout()
    expect(await pay(c.pay, 2000000, 'tx-ledger-1')).toBe('applied')
    expect(await totals(c.orderNumber)).toEqual({ freight_recovery: 2400, logistics_reserve: 600, platform_revenue: 1700 })
    // The order keeps the allocation it was placed with.
    expect(await one(db, `select snapshot -> 'lines' -> 0 ->> 'freightKobo' as f from public.order_shipping_allocations where order_id = $1`,
      [await orderId(c.orderNumber)])).toEqual({ f: '480000' })
    // Duplicate webhooks and redirects change nothing.
    expect(await pay(c.pay, 2000000, 'tx-ledger-1')).toBe('already_applied')
    const id = await orderId(c.orderNumber)
    await as(db, service, (tx) => tx.query(`select private.post_order_shipping($1)`, [id]))
    expect((await ledger(c.orderNumber)).length).toBe(3)
  })

  it('an unpaid checkout posts nothing', async () => {
    const before = (await one<{ c: number }>(db, `select count(*)::int as c from public.shipping_ledger`)).c
    await checkout()
    expect((await one<{ c: number }>(db, `select count(*)::int as c from public.shipping_ledger`)).c).toBe(before)
  })

  it('a cancelled order reverses everything it posted, once', async () => {
    const c = await checkout()
    await pay(c.pay, 2000000, 'tx-cancel')
    await as(db, user(f.users.adminA), (tx) => tx.query(`update public.orders set status = 'cancelled' where order_number = $1`, [c.orderNumber]))
    expect(await totals(c.orderNumber)).toEqual({ freight_recovery: 0, logistics_reserve: 0, platform_revenue: 0 })
    expect((await ledger(c.orderNumber)).filter((e) => e.reason === 'order_cancelled')).toHaveLength(3)
    const id = await orderId(c.orderNumber)
    await as(db, service, (tx) => tx.query(`select private.reverse_order_shipping($1, 'order_cancelled')`, [id]))
    expect((await ledger(c.orderNumber))).toHaveLength(6)
  })

  it('a full refund reverses the order’s allocations', async () => {
    const c = await checkout()
    await pay(c.pay, 2000000, 'tx-refund')
    await as(db, service, (tx) => tx.query(`update public.orders set payment_status = 'refunded' where order_number = $1`, [c.orderNumber]))
    expect(await totals(c.orderNumber)).toEqual({ freight_recovery: 0, logistics_reserve: 0, platform_revenue: 0 })
    expect((await ledger(c.orderNumber)).filter((e) => e.reason === 'order_refunded')).toHaveLength(3)
  })

  it('nobody edits or deletes ledger entries, and staff can’t write them directly', async () => {
    expect(await errorOf(db.query(`update public.shipping_ledger set amount = 1`))).toMatch(/append-only/)
    expect(await errorOf(db.query(`delete from public.shipping_ledger`))).toMatch(/append-only/)
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(
      `insert into public.shipping_ledger (tenant_id, kind, amount, reason, idempotency_key) values ($1, 'platform_revenue', 1000000, 'manual_adjustment', 'x')`, [f.tenantA]))))
      .toMatch(/permission denied/)
  })

  it('manual adjustments need finance.adjust and a reason, and a double submit counts once', async () => {
    const adjust = (who: string, memo: string, key = 'adj-00000001') => as(db, user(who), (tx) => tx.query<{ id: string }>(
      `select public.adjust_shipping_ledger($1, $2) as id`, [f.tenantA, JSON.stringify({ kind: 'logistics_reserve', amount: 5000, memo, key })]))
    expect(await errorOf(adjust(f.users.adminA, 'Opening reserve'))).toMatch(/Not permitted/)
    expect(await errorOf(adjust(f.users.financeA, 'no'))).toMatch(/Give a reason/)
    await adjust(f.users.financeA, 'Opening reserve')
    await adjust(f.users.financeA, 'Opening reserve')
    expect((await db.query(`select 1 from public.shipping_ledger where reason = 'manual_adjustment'`)).rows).toHaveLength(1)
    expect(await one(db, `select actor_user_id from public.shipping_ledger where reason = 'manual_adjustment'`)).toEqual({ actor_user_id: f.users.financeA })
  })

  it('a campaign subsidy never goes past the budget left, whatever the checkout said', async () => {
    const camp = await one<{ id: string }>(db, `insert into public.clearance_campaigns (tenant_id, name, starts_at, ends_at, status, discount_kind,
      discount_value, shipping_treatment, keep_pct, subsidy_budget) values ($1, 'Clear', now() - interval '1 day', now() + interval '1 day', 'active',
      'percent', 20, 'subsidised', 0, 1500) returning id`, [f.tenantA])
    const sub = (kobo: number) => line({ campaignId: camp.id, subsidyKobo: kobo, contributionKobo: 0, recoveryKobo: 0, reserveKobo: 0, platformKobo: 0 })
    const a = await checkout([sub(100000)])
    await pay(a.pay, 2000000, 'tx-sub-a')
    const b = await checkout([sub(100000)])
    await pay(b.pay, 2000000, 'tx-sub-b')
    expect([(await totals(a.orderNumber)).promo_subsidy, (await totals(b.orderNumber)).promo_subsidy]).toEqual([1000, 500])
  })
})

describe('shipments and reconciliation', () => {
  it('only paid orders join a shipment, and an order joins one shipment', async () => {
    const s = await as(db, user(f.users.adminA), (tx) => tx.query<{ id: string }>(
      `insert into public.freight_shipments (tenant_id, reference, kind, method, estimated_cost) values ($1, 'AIR-001', 'orders', 'air', 50000) returning id`, [f.tenantA]).then((r) => r.rows[0]))
    const c1 = await checkout()
    await pay(c1.pay, 2000000, 'tx-ship-1')
    const c2 = await checkout()
    await pay(c2.pay, 2000000, 'tx-ship-2')
    const unpaid = await checkout()
    const add = (num: string) => as(db, user(f.users.adminA), async (tx) => tx.query(
      `insert into public.freight_shipment_orders (order_id, shipment_id, tenant_id) values ((select id from public.orders where order_number = $1), $2, $3)`, [num, s.id, f.tenantA]))
    await add(c1.orderNumber)
    await add(c2.orderNumber)
    expect(await errorOf(add(c1.orderNumber))).toMatch(/duplicate key/)
    expect(await errorOf(add(unpaid.orderNumber))).toMatch(/null value|violates/) // no order exists for an unpaid checkout
    // Sea is for inventory; order shipments are air.
    expect(await errorOf(as(db, user(f.users.adminA), (tx) => tx.query(
      `insert into public.freight_shipments (tenant_id, reference, kind, method) values ($1, 'SEA-X', 'orders', 'sea')`, [f.tenantA])))).toMatch(/check constraint/)
    ;(globalThis as any).airShipment = { id: s.id, orders: [c1.orderNumber, c2.orderNumber] }
  })

  it('finalising checks the figures against the invoices and the ledger, then keeps them', async () => {
    const s = (globalThis as any).airShipment as { id: string; orders: string[] }
    await as(db, user(f.users.adminA), (tx) => tx.query(
      `insert into public.freight_invoices (shipment_id, tenant_id, invoice_ref, currency, fx_rate, freight_amount, clearance_charges)
       values ($1, $2, 'INV-1', 'USD', 1500, 30, 10)`, [s.id, f.tenantA])) // $40 × 1500 = ₦60,000
    const finalize = (who: string, p: Record<string, unknown>) => as(db, user(who), (tx) => tx.query(`select public.finalize_freight_reconciliation($1, $2)`, [s.id, JSON.stringify(p)]))
    const good = { actual_cost: 60000, recovered: 4800, subsidies: 0, reserve_drawn: 0, surplus_to_reserve: 0, allocation: [] }
    expect(await errorOf(finalize(f.users.adminA, good))).toMatch(/Not permitted/) // needs finance.adjust
    expect(await errorOf(finalize(f.users.financeA, { ...good, actual_cost: 50000 }))).toMatch(/invoices changed/)
    expect(await errorOf(finalize(f.users.financeA, { ...good, recovered: 9999 }))).toMatch(/Recovery figures changed/)
    expect(await errorOf(finalize(f.users.financeA, { ...good, reserve_drawn: 999999 }))).toMatch(/reserve can cover at most/)
    await finalize(f.users.financeA, { ...good, reserve_drawn: 1000 })
    expect(await one(db, `select actual_cost::float as a, estimated_cost::float as e, variance::float as v, recovered::float as r, reserve_drawn::float as d, unfunded::float as u
      from public.freight_reconciliations where shipment_id = $1`, [s.id])).toEqual({ a: 60000, e: 50000, v: 10000, r: 4800, d: 1000, u: 54200 })
    expect(await one(db, `select sum(amount)::float as s from public.shipping_ledger where shipment_id = $1 and kind = 'unfunded_freight'`, [s.id])).toEqual({ s: 54200 })
    expect(await one(db, `select status, estimated_cost::float as e from public.freight_shipments where id = $1`, [s.id])).toEqual({ status: 'reconciled', e: 50000 })
    // Final means final.
    expect(await errorOf(finalize(f.users.financeA, good))).toMatch(/already reconciled/)
    expect(await errorOf(as(db, user(f.users.adminA), (tx) => tx.query(`delete from public.freight_invoices where shipment_id = $1`, [s.id])))).toMatch(/reconciled/)
    expect(await errorOf(db.query(`update public.freight_reconciliations set actual_cost = 1`))).toMatch(/kept as it was/)
  })

  it('a booked shipment keeps its original estimate', async () => {
    const s = await as(db, user(f.users.adminA), (tx) => tx.query<{ id: string }>(
      `insert into public.freight_shipments (tenant_id, reference, kind, method, estimated_cost) values ($1, 'AIR-002', 'orders', 'air', 10000) returning id`, [f.tenantA]).then((r) => r.rows[0]))
    await as(db, user(f.users.adminA), (tx) => tx.query(`update public.freight_shipments set status = 'booked' where id = $1`, [s.id]))
    expect(await errorOf(as(db, user(f.users.adminA), (tx) => tx.query(`update public.freight_shipments set estimated_cost = 1 where id = $1`, [s.id]))))
      .toMatch(/estimate is kept/)
    expect(await errorOf(as(db, user(f.users.adminA), (tx) => tx.query(`update public.freight_shipments set status = 'reconciled' where id = $1`, [s.id]))))
      .toMatch(/reconciled by finalising/)
  })
})

describe('inventory batches', () => {
  it('receiving updates the products’ own stock, once per key, never past what was ordered', async () => {
    await db.query(`insert into public.product_sources (product_id, tenant_id, incoming_quantity) values ('pA2', $1, 30)`, [f.tenantA])
    const { shipment, lineId } = await as(db, user(f.users.adminA), async (tx) => {
      const s = (await tx.query<{ id: string }>(`insert into public.freight_shipments (tenant_id, reference, kind, method, allocation_method)
        values ($1, 'SEA-001', 'inventory', 'sea', 'volume') returning id`, [f.tenantA])).rows[0]
      const l = (await tx.query<{ id: string }>(`insert into public.freight_shipment_lines (shipment_id, tenant_id, product_id, quantity_ordered, unit_cost, fx_rate, unit_cbm)
        values ($1, $2, 'pA2', 30, 40, 215, 0.004) returning id`, [s.id, f.tenantA])).rows[0]
      return { shipment: s.id, lineId: l.id }
    })
    const receive = (who: string, q: number, key: string) => as(db, user(who), (tx) => tx.query<{ r: { duplicate: boolean; received: number } }>(
      `select public.receive_inventory($1, $2, $3) as r`, [lineId, q, key]).then((r) => r.rows[0].r))
    const stock = async () => (await one<{ stock: number }>(db, `select stock from public.products where id = 'pA2'`)).stock
    const before = await stock()
    expect(await errorOf(receive(f.users.supportA, 5, 'rcv-00000001'))).toMatch(/Not permitted/)
    expect(await receive(f.users.adminA, 20, 'rcv-00000001')).toEqual({ duplicate: false, received: 20 })
    expect(await receive(f.users.adminA, 20, 'rcv-00000001')).toMatchObject({ duplicate: true }) // a retried click
    expect(await stock()).toBe(before + 20)
    expect(await one(db, `select incoming_quantity from public.product_sources where product_id = 'pA2'`)).toEqual({ incoming_quantity: 10 })
    expect(await errorOf(receive(f.users.adminA, 11, 'rcv-00000002'))).toMatch(/more than was ordered/)
    // A partial receipt reconciles: the allocation must add up to the invoices.
    await as(db, user(f.users.adminA), (tx) => tx.query(`insert into public.freight_invoices (shipment_id, tenant_id, freight_amount, clearance_charges)
      values ($1, $2, 90000, 30000)`, [shipment, f.tenantA]))
    const finalize = (allocated: number) => as(db, user(f.users.financeA), (tx) => tx.query(`select public.finalize_freight_reconciliation($1, $2)`,
      [shipment, JSON.stringify({ actual_cost: 120000, lines: [{ id: lineId, allocated, landed_unit: (258000 + allocated) / 20 }] })]))
    expect(await errorOf(finalize(100000))).toMatch(/doesn’t add up/)
    await finalize(120000)
    expect(await one(db, `select allocated_costs::float as a, reconciled_landed_unit::float as u from public.freight_shipment_lines where id = $1`, [lineId]))
      .toEqual({ a: 120000, u: 18900 })
  })
})

describe('checkout', () => {
  it('open_checkout saves the server’s allocation with the checkout, and still works without one', async () => {
    const p = (ref: string, shipping?: unknown) => ({
      tenant_id: f.tenantA, store_id: f.storeA, reference: ref, order_number: `FH-${ref}`, tracking_number: `TRK-${ref}`, email: 'a@x.test',
      shipping_address: '1 St', currency: 'NGN', items: [{ id: 'pA2', quantity: 1, price: 100 }], subtotal: 100, discount: 0, total: 100,
      ...(shipping === undefined ? {} : { shipping }),
    })
    const open = (body: unknown) => as(db, service, (tx) => tx.query<{ id: string }>(`select public.open_checkout($1) as id`, [JSON.stringify(body)]).then((r) => r.rows[0].id))
    const withAlloc = await open(p('CHK-OPEN0001', snapshot([line()])))
    const without = await open(p('CHK-OPEN0002'))
    expect(await one(db, `select shipping_allocation is not null as has from public.checkouts where id = $1`, [withAlloc])).toEqual({ has: true })
    expect(await one(db, `select shipping_allocation is null as none from public.checkouts where id = $1`, [without])).toEqual({ none: true })
  })
})
