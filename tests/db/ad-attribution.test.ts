// Ad attribution: tags on visits, the Checkout and the order; the Ads report;
// the audience lists behind the Meta exports. Labels only: totals never move.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const service = { kind: 'service' as const }
const user = (id: string) => ({ kind: 'user' as const, id })
let n = 0

const today = () => new Date().toISOString().slice(0, 10)
const report = (actor: string, touch = 'last', tenant = f.tenantA) =>
  as(db, user(actor), (tx) => tx.query<{ r: any }>(`select public.ads_report($1, $2::date - 1, $2::date + 1, $3) as r`, [tenant, today(), touch])).then((r) => r.rows[0].r)
const audience = (actor: string, kind: string, days = 180, tenant = f.tenantA) =>
  as(db, user(actor), (tx) => tx.query<{ e: string }>(`select public.audience_emails($1, $2, $3) as e`, [tenant, kind, days])).then((r) => r.rows.map((x) => x.e))

/** Opens a Checkout through open_checkout, as the server does, and pays it. */
async function placeOrder(email: string, attribution: unknown, { total = 10000 } = {}) {
  n += 1
  const items = [{ id: 'pA1', name: 'Product pA1', price: total, quantity: 1, size: 'M', color: null }]
  const id = (await as(db, service, (tx) => tx.query<{ id: string }>(`select public.open_checkout($1::jsonb) as id`, [JSON.stringify({
    tenant_id: f.tenantA, store_id: f.storeA, reference: `CHK-AD${String(n).padStart(8, '0')}`, order_number: `FH-AD${n}`, tracking_number: `TRK-AD${n}`,
    email, shipping_address: '1 Test St', shipping_city: 'Lagos', currency: 'NGN', items, subtotal: total, discount: 0, total, attribution,
  })]))).rows[0].id
  const pay = `FHP-AD${String(n).padStart(8, '0')}`
  await db.query(`insert into public.payments (tenant_id, checkout_id, provider, reference, amount_minor, currency) values ($1, $2, 'flutterwave', $3, $4, 'NGN')`,
    [f.tenantA, id, pay, total * 100])
  await as(db, service, (tx) => tx.query(`select public.apply_verified_payment($1, $2, 'successful', $3, 'NGN')`, [pay, `${n}${Math.floor(Math.random() * 1e9)}`, total * 100]))
  return { id, orderNumber: `FH-AD${n}` }
}

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  await db.query(`update public.products set stock = 500 where id = 'pA1'`)
})
afterAll(() => db.close())

describe('visit tags', () => {
  it('keeps the new tags on a visit and still accepts the older call shape', async () => {
    await as(db, service, async (tx) => {
      await tx.query(`select public.track_event($1, 'page_view', 'v1', '/shop', null, null, 'facebook', 'paid', 'rose-line', 'mobile', null, 'broad-women', 'video-a', 'AbC_123-x')`, [f.storeA])
      await tx.query(`select public.track_event($1, 'page_view', 'v2', '/shop', null, null, 'facebook', 'paid', 'rose-line', 'mobile', null)`, [f.storeA])
    })
    const rows = await db.query<Record<string, string | null>>(`select utm_campaign, utm_content, utm_term, fbclid from public.analytics_events order by id`)
    expect(rows.rows).toEqual([
      { utm_campaign: 'rose-line', utm_content: 'broad-women', utm_term: 'video-a', fbclid: 'AbC_123-x' },
      { utm_campaign: 'rose-line', utm_content: null, utm_term: null, fbclid: null },
    ])
  })

  it('cuts every tag to 200 characters', async () => {
    await as(db, service, (tx) => tx.query(`select public.track_event($1, 'page_view', 'v3', '/x', null, null, $2, null, $2, 'mobile', null, $2, $2, $2)`, [f.storeA, 'x'.repeat(500)]))
    const row = await one<{ a: number; b: number; c: number }>(db, `select length(utm_source) a, length(utm_content) b, length(fbclid) c from public.analytics_events where visitor_day <> '' order by id desc limit 1`)
    expect(row).toEqual({ a: 200, b: 200, c: 200 })
  })
})

describe('Checkout and order attribution', () => {
  it('goes from the Checkout to the order, cleaned: only the six tags, each at most 200 characters', async () => {
    const o = await placeOrder('first@x.test', {
      first: { utm_source: 'facebook', utm_campaign: 'rose-line', evil: 'drop table', utm_term: 'y'.repeat(400) },
      last: { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'rose-line', utm_content: 'broad', fbclid: 'abc' },
      other: 'ignored',
    })
    const chk = await one<{ attribution: any }>(db, `select attribution from public.checkouts where id = $1`, [o.id])
    const ord = await one<{ attribution: any }>(db, `select attribution from public.orders where order_number = $1`, [o.orderNumber])
    expect(ord.attribution).toEqual(chk.attribution)
    expect(Object.keys(ord.attribution).sort()).toEqual(['first', 'last'])
    expect(Object.keys(ord.attribution.first).sort()).toEqual(['utm_campaign', 'utm_source', 'utm_term'])
    expect(ord.attribution.first.utm_term).toHaveLength(200)
    expect(ord.attribution.last).toEqual({ utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'rose-line', utm_content: 'broad', fbclid: 'abc' })
  })

  it('is optional, and rubbish leaves none: older callers and plain visitors still check out', async () => {
    for (const attribution of [undefined, null, 'x', [], {}, { first: 'x', last: [] }]) {
      const o = await placeOrder(`plain${n}@x.test`, attribution)
      expect((await one<{ attribution: any }>(db, `select attribution from public.orders where order_number = $1`, [o.orderNumber])).attribution).toBeNull()
    }
  })

  it('never changes what is charged', async () => {
    const o = await placeOrder('total@x.test', { last: { utm_campaign: 'c' } }, { total: 12345 })
    expect(await one(db, `select total::int as total from public.orders where order_number = $1`, [o.orderNumber])).toEqual({ total: 12345 })
  })
})

describe('ads report', () => {
  beforeAll(async () => {
    await placeOrder('r1@x.test', { first: { utm_campaign: 'prospecting', utm_content: 'broad', utm_term: 'ad-1' }, last: { utm_campaign: 'retargeting', utm_content: 'viewers', utm_term: 'ad-9' } }, { total: 20000 })
    await placeOrder('r2@x.test', { first: { utm_campaign: 'prospecting', utm_content: 'broad', utm_term: 'ad-2' }, last: { utm_campaign: 'prospecting', utm_content: 'broad', utm_term: 'ad-2' } }, { total: 30000 })
    await placeOrder('r3@x.test', { last: { fbclid: 'clickonly' } }, { total: 5000 })
    await as(db, service, async (tx) => {
      for (const v of ['a', 'b', 'c']) await tx.query(`select public.track_event($1, 'page_view', $2, '/', null, null, 'facebook', 'paid', 'prospecting', 'mobile', null, 'broad', 'ad-2')`, [f.storeA, v])
    })
  })

  it('groups paid orders by campaign, ad set and ad, with the visitors who landed on the same tags', async () => {
    const r = await report(f.users.ownerA)
    const campaign = Object.fromEntries(r.campaigns.map((c: any) => [c.campaign, c]))
    expect(campaign.prospecting).toMatchObject({ orders: 1, revenue: 30000, visitors: 3 })
    expect(campaign.retargeting).toMatchObject({ orders: 1, revenue: 20000 })
    expect(campaign['(no campaign)']).toMatchObject({ orders: 1, revenue: 5000 })
    expect(r.adSets.find((a: any) => a.campaign === 'prospecting' && a.adSet === 'broad')).toMatchObject({ orders: 1, revenue: 30000, visitors: 3 })
    expect(r.ads.find((a: any) => a.ad === 'ad-2')).toMatchObject({ campaign: 'prospecting', adSet: 'broad', orders: 1, visitors: 3 })
    // Plus the two tagged orders and three tagged visits from the tests above.
    expect(r.totals).toMatchObject({ adOrders: 5, adRevenue: 77345, adVisitors: 6 })
    // Earlier orders in this file have no tags: counted as paid, not as ads.
    expect(r.totals.paidOrders).toBeGreaterThan(r.totals.adOrders)
  })

  it('can credit the first touch instead of the last', async () => {
    const r = await report(f.users.ownerA, 'first')
    expect(r.campaigns.map((c: any) => [c.campaign, c.orders])).toEqual(expect.arrayContaining([['prospecting', 2]]))
    expect(r.campaigns.find((c: any) => c.campaign === 'retargeting')).toBeUndefined()
  })

  it('refuses other tenants, roles without analytics.read, and a bad touch', async () => {
    expect(await errorOf(report(f.users.ownerB, 'last', f.tenantA))).toMatch(/not permitted/)
    expect(await errorOf(report(f.users.fulfilA))).toMatch(/not permitted/)
    expect(await errorOf(report(f.users.ownerA, 'middle'))).toMatch(/invalid range/)
    const anon = await errorOf(as(db, { kind: 'anon' }, (tx) => tx.query(`select public.ads_report($1, current_date, current_date, 'last')`, [f.tenantA])))
    expect(anon).toMatch(/permission denied/)
  })
})

describe('audience lists', () => {
  beforeAll(async () => {
    const sub = (email: string, extra = '') => db.query(
      `insert into public.newsletter_subscribers (email, source, tenant_id, store_id, consented_at ${extra ? ', unsubscribed_at' : ''})
       values ($1, 'footer', $2, $3, now() ${extra ? ', now()' : ''})`, [email, f.tenantA, f.storeA])
    await sub('warm@x.test')
    await sub('Buyer@X.test') // has bought: not a "warm" subscriber
    await sub('gone@x.test', 'unsub')
    await sub('bounced@x.test')
    await db.query(`insert into public.newsletter_subscribers (email, source, tenant_id, store_id) values ('noconsent@x.test', 'footer', $1, $2)`, [f.tenantA, f.storeA])
    await db.query(`insert into public.email_suppressions (tenant_id, email, reason) values ($1, 'bounced@x.test', 'bounced')`, [f.tenantA])
    await placeOrder('buyer@x.test', null)
    await placeOrder('old@x.test', null)
    await db.query(`update public.orders set created_at = now() - interval '200 days' where email = 'old@x.test'`)
  })

  it('lists purchasers in the window, lower-cased, once each', async () => {
    const list = await audience(f.users.ownerA, 'purchasers')
    expect(list).toContain('buyer@x.test')
    expect(list).not.toContain('old@x.test')
    expect(new Set(list).size).toBe(list.length)
    expect(await audience(f.users.ownerA, 'purchasers', 365)).toContain('old@x.test')
  })

  it('lists only consented, subscribed, unsuppressed subscribers who have not bought', async () => {
    expect(await audience(f.users.ownerA, 'subscribers')).toEqual(['warm@x.test'])
  })

  it('needs customers.read in that tenant, and a known kind', async () => {
    expect(await errorOf(audience(f.users.ownerB, 'purchasers'))).toMatch(/not permitted/)
    expect(await errorOf(audience(f.users.fulfilA, 'purchasers'))).toMatch(/not permitted/)
    expect(await errorOf(audience(f.users.ownerA, 'everyone'))).toMatch(/invalid audience/)
    expect(await errorOf(audience(f.users.ownerA, 'purchasers', 0))).toMatch(/invalid audience/)
  })
})
