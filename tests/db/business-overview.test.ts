// Studio's business overview and launch signals: permission-gated, tenant-scoped,
// and computed from the real tables.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const user = (id: string) => ({ kind: 'user' as const, id })
const overview = (actor: string, tenant = f.tenantA) =>
  as(db, user(actor), (tx) => tx.query<{ o: any }>(`select public.business_overview($1, current_date - 30, current_date) as o`, [tenant])).then((r) => r.rows[0].o)
const signals = (actor: string, tenant = f.tenantA) =>
  as(db, user(actor), (tx) => tx.query<{ s: any }>(`select public.launch_signals($1) as s`, [tenant])).then((r) => r.rows[0].s)

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  const sup = (await one<{ id: string }>(db, `insert into public.suppliers (tenant_id, name) values ($1, 'Acme') returning id`, [f.tenantA])).id
  // pA1: active, stock 10, costed (CNY 50 x 200 = 10000 + 2000 shipping) at price 24999.9
  await db.query(`insert into public.product_sources (product_id, tenant_id, supplier_id, unit_cost, cost_currency, fx_rate, shipping_cost_ngn)
                  values ('pA1', $1, $2, 50, 'CNY', 200, 2000)`, [f.tenantA, sup])
  await db.query(`update public.products set images = '[{"url":"a","color":"Black"}]', colors = '["Black","Red"]', stock = 1 where id = 'pA1'`)
  await db.query(`insert into public.newsletter_subscribers (email, source, tenant_id, store_id, subscribed_at)
                  values ('a@x.test', 'footer', $1, $2, now()), ('b@x.test', 'launch_waitlist', $1, $2, now() - interval '90 days'),
                         ('c@x.test', 'footer', $3, $4, now())`, [f.tenantA, f.storeA, f.tenantB, f.storeB])
  await db.query(`update public.newsletter_subscribers set unsubscribed_at = now() where email = 'b@x.test'`)
})
afterAll(() => db.close())

describe('business overview', () => {
  it('counts the catalogue, margins and gaps', async () => {
    const o = await overview(f.users.ownerA)
    expect(o.catalogue).toMatchObject({ active: 1, draft: 1, archived: 0, lowStockCount: 1 })
    expect(o.catalogue.lowStock[0]).toMatchObject({ id: 'pA1', stock: 1 })
    // landed 12000 on 24999.9 -> 52.0%
    expect(o.margins).toMatchObject({ products: 1, average: 52 })
    expect(o.catalogue.missingData[0]).toMatchObject({ id: 'pA1' })
    expect(o.catalogue.missingData[0].issues).toEqual(['a colour has no photo'])
    expect(o.suppliers).toMatchObject({ count: 1, top: [{ name: 'Acme', products: 1 }] })
    expect(o.hype).toBeNull()
  })

  it('splits the audience per list and counts unsubscribes in range, for this tenant only', async () => {
    const o = await overview(f.users.ownerA)
    const by = Object.fromEntries(o.audience.map((a: any) => [a.source, a]))
    expect(by.footer).toMatchObject({ subscribed: 1, newInRange: 1, unsubscribedInRange: 0 })
    expect(by.launch_waitlist).toMatchObject({ subscribed: 0, unsubscribedInRange: 1 })
  })

  it('shows hype only when it is switched on', async () => {
    await db.query(`insert into public.hype_settings (store_id, tenant_id, enabled) values ($1, $2, true)`, [f.storeA, f.tenantA])
    await db.query(`insert into public.hype_events (tenant_id, product_id, visitor_hash) values ($1, 'pA1', $2)`, [f.tenantA, 'a'.repeat(64)])
    const o = await overview(f.users.ownerA)
    expect(o.hype).toMatchObject({ total: 1, top: [{ id: 'pA1', hypes: 1 }] })
  })

  it('refuses other tenants and roles without analytics.read', async () => {
    expect(await errorOf(overview(f.users.ownerB, f.tenantA))).toMatch(/not permitted/)
    expect(await errorOf(overview(f.users.fulfilA))).toMatch(/not permitted/)
    expect(await errorOf(as(db, { kind: 'anon' }, (tx) => tx.query(`select public.business_overview($1, current_date, current_date)`, [f.tenantA])))).toMatch(/permission denied/)
  })
})

describe('launch signals', () => {
  it('reads settings and counts, for settings.manage only', async () => {
    const s = await signals(f.users.ownerA)
    expect(s).toMatchObject({ purchasesPaused: false, activeOwners: 1, mfaLockApplied: true, activeProducts: 1, activeWithoutPhoto: 0 })
    expect(await errorOf(signals(f.users.financeA))).toMatch(/not permitted/)
    expect(await errorOf(signals(f.users.ownerB, f.tenantA))).toMatch(/not permitted/)
  })
})
