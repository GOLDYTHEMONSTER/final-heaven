// Event tickets (20261102100000_event_tickets.sql): seats held while a buyer
// pays, tickets issued only by a verified payment, a ticket checked in once,
// door links scoped to one live event, and only the right people see any of it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const service = { kind: 'service' as const }
const user = (id: string) => ({ kind: 'user' as const, id })
let n = 0

async function event({ status = 'published', capacity = 3, price = 5000, opensIn = null as string | null, startsIn = '7 days', tenant = '', store = '' } = {}) {
  n += 1
  const e = await one<{ id: string }>(db,
    `insert into public.events (tenant_id, store_id, slug, title, starts_at, sales_open_at, status)
     values ($1, $2, $3, $4, now() + $5::interval, case when $6::text is null then null else now() + $6::interval end, $7) returning id`,
    [tenant || f.tenantA, store || f.storeA, `launch-${n}`, `Launch ${n}`, startsIn, opensIn, status])
  const t = await one<{ id: string }>(db,
    `insert into public.ticket_types (tenant_id, event_id, name, price, capacity) values ($1, $2, 'Regular', $3, $4) returning id`,
    [tenant || f.tenantA, e.id, price, capacity])
  return { id: e.id, type: t.id }
}

/** A ticket checkout as the server opens it, plus its Flutterwave payment. */
async function open(ev: { id: string; type: string }, quantity: number, { email = 'buyer@x.test', price = 5000, subtotal = price * quantity, tenant = '' }: { email?: string; price?: number; subtotal?: number; tenant?: string } = {}) {
  n += 1
  const ref = `TCK-TEST${String(n).padStart(6, '0')}`
  const id = await as(db, service, (tx) => tx.query<{ id: string }>(`select public.open_ticket_checkout($1) as id`, [JSON.stringify({
    tenant_id: tenant || f.tenantA, event_id: ev.id, reference: ref, order_number: `FHT-T${String(n).padStart(5, '0')}`,
    email, name: 'Ada Buyer', items: [{ ticket_type_id: ev.type, name: 'Regular', quantity, unit_price: price }],
    subtotal, discount: 0, total: subtotal, terms_accepted_at: new Date().toISOString(),
  })]).then((r) => r.rows[0].id))
  const pay = `FHP-TEST${String(n).padStart(8, '0')}`
  await db.query(`insert into public.payments (tenant_id, ticket_checkout_id, provider, reference, amount_minor, currency)
                  values ($1, $2, 'flutterwave', $3, $4, 'NGN')`, [tenant || f.tenantA, id, pay, subtotal * 100])
  return { id, pay, minor: subtotal * 100 }
}
const apply = (pay: string, status: string, amountMinor: number) =>
  as(db, service, (tx) => tx.query<{ r: string }>(`select public.apply_verified_payment($1, $2, $3, $4, 'NGN') as r`,
    [pay, `${Math.floor(Math.random() * 1e9)}`, status, amountMinor]).then((r) => r.rows[0].r))
const tickets = (checkout: string) => db.query<{ token: string; code: string; status: string }>(
  `select t.token, t.code, t.status from public.tickets t join public.ticket_orders o on o.id = t.ticket_order_id where o.checkout_id = $1 order by t.code`, [checkout]).then((r) => r.rows)
const door = (actor: Parameters<typeof as>[1], ref: string, { event = null as string | null, link = null as string | null, checkIn = false } = {}) =>
  as(db, actor, (tx) => tx.query<{ r: { outcome: string; ticket?: Record<string, unknown> } }>(
    `select public.door_ticket($1, $2, $3, $4) as r`, [ref, event, link, checkIn]).then((r) => r.rows[0].r))
const doorLink = async (eventId: string, { expiresIn = '1 day', revoked = false } = {}) =>
  (await one<{ id: string }>(db, `insert into public.event_door_links (tenant_id, event_id, label, token_hash, expires_at, revoked_at)
    values ($1, $2, 'Door A', encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + $3::interval, case when $4 then now() end) returning id`,
    [f.tenantA, eventId, expiresIn, revoked])).id

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

describe('ticket checkouts hold seats', () => {
  it('refuses more seats than are free after other live holds, with the seats left', async () => {
    const ev = await event({ capacity: 3 })
    await open(ev, 2)
    const err = await errorOf(open(ev, 2, { email: 'second@x.test' }))
    expect(err).toBe(`held:${ev.type}`)
    await open(ev, 1, { email: 'third@x.test' })
  })

  it('the same buyer starting again releases their own unpaid hold', async () => {
    const ev = await event({ capacity: 2 })
    await open(ev, 2, { email: 'Retry@x.test' })
    await open(ev, 2, { email: 'retry@x.test' })
    expect(await errorOf(open(ev, 1, { email: 'other@x.test' }))).toBe(`held:${ev.type}`)
  })

  it('an expired hold frees its seats', async () => {
    const ev = await event({ capacity: 1 })
    const c = await open(ev, 1)
    await db.query(`update public.ticket_checkouts set hold_until = now() - interval '1 minute' where id = $1`, [c.id])
    await open(ev, 1, { email: 'next@x.test' })
  })

  it('is closed for drafts, cancelled or paused events, before sales open and after the event starts', async () => {
    expect(await errorOf(open(await event({ status: 'draft' }), 1))).toBe('event_closed')
    expect(await errorOf(open(await event({ status: 'cancelled' }), 1))).toBe('event_closed')
    expect(await errorOf(open(await event({ opensIn: '1 hour' }), 1))).toBe('event_closed')
    expect(await errorOf(open(await event({ startsIn: '-1 hour' }), 1))).toBe('event_closed')
    const paused = await event()
    await db.query(`update public.events set sales_paused = true where id = $1`, [paused.id])
    expect(await errorOf(open(paused, 1))).toBe('event_closed')
  })

  it('re-checks prices and the per-order limit', async () => {
    const ev = await event({ capacity: 50, price: 5000 })
    expect(await errorOf(open(ev, 1, { price: 4000 }))).toBe('price_changed')
    expect(await errorOf(open(ev, 2, { subtotal: 9000 }))).toBe('price_changed')
    expect(await errorOf(open(ev, 7))).toBe('too_many') // default max 6 per order
  })

  it('an event of another tenant cannot be opened under this one', async () => {
    const ev = await event({ tenant: f.tenantB, store: f.storeB })
    expect(await errorOf(open(ev, 1))).toBe('event_closed')
  })
})

describe('a verified payment issues the tickets', () => {
  it('issues one ticket per seat, completes the checkout, queues the email and posts activity', async () => {
    const ev = await event({ capacity: 10 })
    const c = await open(ev, 3)
    expect(await tickets(c.id)).toEqual([])
    expect(await apply(c.pay, 'successful', c.minor)).toBe('applied')
    const issued = await tickets(c.id)
    expect(issued).toHaveLength(3)
    for (const t of issued) {
      expect(t.token).toMatch(/^[0-9a-f]{32}$/)
      expect(t.code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/)
      expect(t.status).toBe('valid')
    }
    expect(new Set(issued.map((t) => t.code)).size).toBe(3)
    const order = await one<{ id: string; total: string; capacity_shortfall: unknown; access_token: string }>(db,
      `select o.id, o.total::text, o.capacity_shortfall, o.access_token from public.ticket_orders o where o.checkout_id = $1`, [c.id])
    expect(order).toMatchObject({ total: '15000.00', capacity_shortfall: null })
    expect(order.access_token).toMatch(/^[0-9a-f]{32}$/)
    expect(await one(db, `select status, hold_until from public.ticket_checkouts where id = $1`, [c.id])).toEqual({ status: 'completed', hold_until: null })
    expect(await one(db, `select ticket_order_id from public.payments where reference = $1`, [c.pay])).toEqual({ ticket_order_id: order.id })
    expect(await one(db, `select kind, status from public.email_outbox where ticket_order_id = $1`, [order.id])).toEqual({ kind: 'tickets.issued', status: 'queued' })
    expect(await one(db, `select kind, title, link from public.activity_feed where kind = 'tickets.sold' order by id desc limit 1`))
      .toEqual({ kind: 'tickets.sold', title: `3 tickets sold for Launch ${n - 1}`, link: `/admin/events/${ev.id}` })
  })

  it('a replayed or second payment issues nothing more', async () => {
    const ev = await event({ capacity: 10 })
    const c = await open(ev, 2)
    await apply(c.pay, 'successful', c.minor)
    expect(await apply(c.pay, 'successful', c.minor)).toBe('already_applied')
    const second = `FHP-DUP${String(n).padStart(9, '0')}`
    await db.query(`insert into public.payments (tenant_id, ticket_checkout_id, provider, reference, amount_minor, currency)
                    values ($1, $2, 'flutterwave', $3, $4, 'NGN')`, [f.tenantA, c.id, second, c.minor])
    expect(await apply(second, 'successful', c.minor)).toBe('duplicate_payment')
    expect(await tickets(c.id)).toHaveLength(2)
  })

  it('underpaid, failed or pending payments issue no tickets', async () => {
    const ev = await event({ capacity: 10 })
    const c = await open(ev, 1)
    expect(await apply(c.pay, 'successful', c.minor - 1)).toBe('rejected_amount')
    expect(await apply(c.pay, 'pending', c.minor)).toBe('pending')
    expect(await apply(c.pay, 'failed', c.minor)).toBe('failed_recorded')
    expect(await tickets(c.id)).toEqual([])
  })

  it('paid after the tier filled up: tickets issued, order flagged for staff', async () => {
    const ev = await event({ capacity: 2 })
    const late = await open(ev, 2, { email: 'late@x.test' })
    await db.query(`update public.ticket_checkouts set hold_until = now() - interval '1 minute' where id = $1`, [late.id])
    const quick = await open(ev, 2, { email: 'quick@x.test' })
    await apply(quick.pay, 'successful', quick.minor)
    await apply(late.pay, 'successful', late.minor)
    expect(await tickets(late.id)).toHaveLength(2)
    expect(await one(db, `select capacity_shortfall from public.ticket_orders where checkout_id = $1`, [late.id]))
      .toEqual({ capacity_shortfall: { [ev.type]: 2 } })
  })
})

describe('the door', () => {
  it('checks a ticket in once, by QR token or typed code', async () => {
    const ev = await event({ capacity: 10 })
    const c = await open(ev, 2)
    await apply(c.pay, 'successful', c.minor)
    const [a, b] = await tickets(c.id)
    const support = user(f.users.supportA) // customer support can check in
    expect((await door(support, a.token)).outcome).toBe('valid')
    const first = await door(support, a.token, { checkIn: true })
    expect(first.outcome).toBe('checked_in')
    expect(first.ticket).toMatchObject({ code: a.code, type: 'Regular', name: 'Ada Buyer', status: 'checked_in' })
    expect((await door(support, a.token, { checkIn: true })).outcome).toBe('already')
    // A code needs the event; formatting is ignored.
    expect((await door(support, b.code, { checkIn: true })).outcome).toBe('not_found')
    expect((await door(support, `${b.code.slice(0, 3).toUpperCase()} ${b.code.slice(3)}`, { event: ev.id, checkIn: true })).outcome).toBe('checked_in')
  })

  it('staff without check-in, another tenant and anon learn nothing', async () => {
    const ev = await event({ capacity: 10 })
    const c = await open(ev, 1)
    await apply(c.pay, 'successful', c.minor)
    const [t] = await tickets(c.id)
    expect((await door(user(f.users.readonlyA), t.token, { checkIn: true })).outcome).toBe('not_found')
    expect((await door(user(f.users.ownerB), t.token, { checkIn: true })).outcome).toBe('not_found')
    expect((await door({ kind: 'user', id: f.users.supportA, aal: 'aal1' }, t.token, { checkIn: true })).outcome).toBe('not_found')
    expect(await errorOf(door({ kind: 'anon' }, t.token))).toMatch(/permission denied/)
    expect((await tickets(c.id))[0].status).toBe('valid')
  })

  it('a door link works only for its own event, while live', async () => {
    const ev = await event({ capacity: 10 })
    const other = await event({ capacity: 10 })
    const c = await open(ev, 1)
    const o = await open(other, 1)
    await apply(c.pay, 'successful', c.minor)
    await apply(o.pay, 'successful', o.minor)
    const [t] = await tickets(c.id)
    const [elsewhere] = await tickets(o.id)
    const link = await doorLink(ev.id)
    expect((await door(service, elsewhere.token, { link, checkIn: true })).outcome).toBe('not_found')
    expect((await door(service, elsewhere.code, { link, checkIn: true })).outcome).toBe('not_found')
    expect((await door(service, t.code, { link, checkIn: true })).outcome).toBe('checked_in')
    expect(await one(db, `select checkins from public.event_door_links where id = $1`, [link])).toEqual({ checkins: 1 })
    expect((await door(service, t.token, { link: await doorLink(ev.id, { revoked: true }) })).outcome).toBe('door_closed')
    expect((await door(service, t.token, { link: await doorLink(ev.id, { expiresIn: '-1 minute' }) })).outcome).toBe('door_closed')
    // The server can't check in without a door link, and staff can't pose as one.
    expect(await errorOf(door(service, t.token))).toMatch(/door link is needed/)
    expect(await errorOf(door(user(f.users.ownerA), t.token, { link }))).toMatch(/Not permitted/)
  })

  it('a cancelled order’s tickets are void; recording a refund needs refunds.approve', async () => {
    const ev = await event({ capacity: 10 })
    const c = await open(ev, 1)
    await apply(c.pay, 'successful', c.minor)
    const order = await one<{ id: string }>(db, `select id from public.ticket_orders where checkout_id = $1`, [c.id])
    const cancel = (actor: Parameters<typeof as>[1], refunded: boolean) =>
      as(db, actor, (tx) => tx.query(`select public.cancel_ticket_order($1, 'changed plans', $2)`, [order.id, refunded]))
    expect(await errorOf(cancel(user(f.users.adminA), true))).toMatch(/Not permitted/)
    expect(await errorOf(cancel(user(f.users.supportA), false))).toMatch(/Not permitted/)
    await cancel(user(f.users.adminA), false)
    const [t] = await tickets(c.id)
    expect(t.status).toBe('void')
    expect((await door(user(f.users.supportA), t.token, { checkIn: true })).outcome).toBe('void')
    await cancel(user(f.users.ownerA), true)
    expect(await one(db, `select status, payment_status from public.ticket_orders where id = $1`, [order.id])).toEqual({ status: 'cancelled', payment_status: 'refunded' })
  })

  it('a manager can undo a check-in made by mistake', async () => {
    const ev = await event({ capacity: 10 })
    const c = await open(ev, 1)
    await apply(c.pay, 'successful', c.minor)
    const [t] = await tickets(c.id)
    const r = await door(user(f.users.supportA), t.token, { checkIn: true })
    const id = r.ticket!.id as string
    expect(await errorOf(as(db, user(f.users.supportA), (tx) => tx.query(`select public.undo_check_in($1)`, [id])))).toMatch(/Not permitted/)
    await as(db, user(f.users.ownerA), (tx) => tx.query(`select public.undo_check_in($1)`, [id]))
    expect((await door(user(f.users.supportA), t.token)).outcome).toBe('valid')
  })
})

describe('access', () => {
  it('only the server opens checkouts; buyers’ data is for event managers of the same tenant', async () => {
    const ev = await event({ capacity: 10 })
    const c = await open(ev, 1)
    await apply(c.pay, 'successful', c.minor)
    expect(await errorOf(as(db, user(f.users.ownerA), (tx) => tx.query(`select public.open_ticket_checkout('{}')`)))).toMatch(/permission denied/)
    const seen = (actor: Parameters<typeof probe>[1]) =>
      probe(db, actor, (tx) => tx.query(`select 1 from public.tickets t join public.ticket_orders o on o.id = t.ticket_order_id where o.checkout_id = $1`, [c.id]).then((r) => r.rows.length))
    expect(await seen(user(f.users.ownerA))).toBe(1)
    expect(await seen(user(f.users.supportA))).toBe(0) // check-in only: through the door function
    expect(await seen(user(f.users.ownerB))).toBe(0)
    expect(await errorOf(seen({ kind: 'anon' }))).toMatch(/permission denied/)
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(`update public.tickets set status = 'valid'`)))).toMatch(/permission denied/)
  })

  it('managers write events and tiers in their own tenant only; check-in staff only read them', async () => {
    const insert = (actor: Parameters<typeof probe>[1], tenant: string, store: string) => probe(db, actor, (tx) =>
      tx.query(`insert into public.events (tenant_id, store_id, slug, title, starts_at) values ($1, $2, 'x-' || gen_random_uuid(), 'X', now() + interval '1 day')`, [tenant, store]))
    await insert(user(f.users.adminA), f.tenantA, f.storeA)
    expect(await errorOf(insert(user(f.users.supportA), f.tenantA, f.storeA))).toMatch(/row-level security/)
    expect(await errorOf(insert(user(f.users.ownerA), f.tenantB, f.storeB))).toMatch(/row-level security/)
    const ev = await event()
    expect(await probe(db, user(f.users.supportA), (tx) => tx.query(`select 1 from public.ticket_types where event_id = $1`, [ev.id]).then((r) => r.rows.length))).toBe(1)
    // A tier must belong to its event's tenant.
    expect(await errorOf(probe(db, user(f.users.ownerB), (tx) =>
      tx.query(`insert into public.ticket_types (tenant_id, event_id, name, price, capacity) values ($1, $2, 'Sneaky', 100, 1)`, [f.tenantB, ev.id])))).toMatch(/foreign key/)
  })

  it('managers edit a tier’s name, price and capacity; it can’t move to another event', async () => {
    const ev = await event({ capacity: 5, price: 5000 })
    const other = await event()
    const edit = (sql: string, params: unknown[]) => as(db, user(f.users.adminA), (tx) => tx.query(sql, params))
    await edit(`update public.ticket_types set name = 'Entry', price = 2000, capacity = 50, active = true where id = $1`, [ev.type])
    expect(await one(db, `select name, price::text, capacity from public.ticket_types where id = $1`, [ev.type])).toEqual({ name: 'Entry', price: '2000.00', capacity: 50 })
    expect(await errorOf(edit(`update public.ticket_types set event_id = $2 where id = $1`, [ev.type, other.id]))).toMatch(/can.t move to another event/)
  })

  it('unpaid ticket checkouts lose personal details after 30 days', async () => {
    const ev = await event({ capacity: 10 })
    const c = await open(ev, 1)
    await db.query(`update public.ticket_checkouts set created_at = now() - interval '31 days' where id = $1`, [c.id])
    expect(await as(db, service, (tx) => tx.query<{ n: number }>(`select public.run_ticket_retention() as n`).then((r) => r.rows[0].n))).toBe(1)
    expect(await one(db, `select email, name, status from public.ticket_checkouts where id = $1`, [c.id])).toEqual({ email: 'removed@invalid', name: 'removed', status: 'expired' })
  })
})
