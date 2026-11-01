// Early access codes and invite credits (20261101400000_early_access.sql): one
// personal code per subscriber, invites credited once per friend per step, a
// friend's first paid order counted once, and only the service key can do any of it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, errorOf, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const user = (id: string) => ({ kind: 'user' as const, id })

const subscribe = async (email: string, tenant = f.tenantA, store = f.storeA) =>
  (await db.query<{ id: string }>(`insert into public.newsletter_subscribers (tenant_id, store_id, email, source, consent_text, consented_at)
    values ($1, $2, $3, 'launch_waitlist', 'ok', now()) returning id`, [tenant, store, email])).rows[0].id
const ensure = async (id: string) => (await db.query<{ code: string }>(`select public.ensure_early_access($1) as code`, [id])).rows[0].code
const invite = async (friend: string, code: string) => (await db.query<{ ok: boolean }>(`select public.record_invite($1, $2) as ok`, [friend, code])).rows[0].ok
const credits = async (inviter: string) => (await db.query<{ step: string }>(`select step from public.invite_credits where inviter_id = $1 order by step`, [inviter])).rows.map((r) => r.step)

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

describe('early access codes', () => {
  it('makes one personal code per subscriber, 25% off once, with 2 free months', async () => {
    const ada = await subscribe('ada@x.test')
    const code = await ensure(ada)
    expect(code).toMatch(/^FH[0-9A-FXY]{6}$/)
    expect(await ensure(ada)).toBe(code)
    const row = (await db.query<Record<string, unknown>>(`select kind, value::text, max_uses, once_per_customer, subscriber_id from public.promo_codes where code = $1`, [code])).rows[0]
    expect(row).toEqual({ kind: 'percent', value: '25.00', max_uses: 1, once_per_customer: true, subscriber_id: ada })
    expect((await db.query(`select free_membership_months from public.newsletter_subscribers where id = $1`, [ada])).rows[0]).toEqual({ free_membership_months: 2 })
  })

  it('credits the inviter once for a new friend, never for themselves or an unknown code', async () => {
    const ina = await subscribe('ina@x.test')
    const code = await ensure(ina)
    const friend = await subscribe('friend@x.test')
    expect(await invite(friend, code.toLowerCase())).toBe(true)
    expect(await invite(friend, code)).toBe(false) // already invited
    expect(await invite(ina, code)).toBe(false) // their own code
    expect(await invite(await subscribe('lost@x.test'), 'FHNOPE00')).toBe(false)
    expect(await credits(ina)).toEqual(['subscribed'])
  })

  it('a friend in another store cannot use the code', async () => {
    const owner = await subscribe('o@x.test')
    const code = await ensure(owner)
    const other = await subscribe('o2@x.test', f.tenantB, f.storeB)
    expect(await invite(other, code)).toBe(false)
  })

  it('adds a paid credit for the friend’s first paid order, once', async () => {
    const kim = await subscribe('kim@x.test')
    const friend = await subscribe('pal@x.test')
    await invite(friend, await ensure(kim))
    const order = (n: string, status = 'paid') => db.query(`insert into public.orders (tenant_id, store_id, order_number, tracking_number, shipping_address, email, subtotal, total, payment_status, order_items)
      values ($1, $2, $3, 'TRK-' || $3, '1 Test St', 'PAL@x.test', 1000, 1000, $4, '[]')`, [f.tenantA, f.storeA, n, status])
    await order('FH-E1', 'pending')
    expect(await db.query(`select public.credit_paid_invites($1) as n`, [f.tenantA]).then((r) => r.rows[0])).toEqual({ n: 0 })
    await order('FH-E2')
    await order('FH-E3')
    expect(await db.query(`select public.credit_paid_invites($1) as n`, [f.tenantA]).then((r) => r.rows[0])).toEqual({ n: 1 })
    expect(await db.query(`select public.credit_paid_invites($1) as n`, [f.tenantA]).then((r) => r.rows[0])).toEqual({ n: 0 })
    expect(await credits(kim)).toEqual(['paid', 'subscribed'])
  })

  it('only the service key runs the functions; staff read credits, strangers and anon do not', async () => {
    const id = await subscribe('z@x.test')
    for (const actor of [user(f.users.ownerA), { kind: 'anon' as const }]) {
      expect(await errorOf(probe(db, actor, (tx) => tx.query(`select public.ensure_early_access($1)`, [id])))).toMatch(/permission denied/)
      expect(await errorOf(probe(db, actor, (tx) => tx.query(`select public.credit_paid_invites($1)`, [f.tenantA])))).toMatch(/permission denied/)
    }
    const seen = (actor: Parameters<typeof probe>[1]) => probe(db, actor, (tx) => tx.query(`select 1 from public.invite_credits`).then((r) => r.rows.length))
    expect(await seen(user(f.users.ownerA))).toBeGreaterThan(0)
    expect(await seen(user(f.users.outsider))).toBe(0)
    expect(await errorOf(seen({ kind: 'anon' }))).toMatch(/permission denied/)
  })
})
