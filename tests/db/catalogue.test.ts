// The marketplace catalogue: product source and condition, brands, collections.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, errorOf, one, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const user = (id: string) => ({ kind: 'user' as const, id })
const anon = { kind: 'anon' as const }
type Tx = { query: PGlite['query'] }
const ids = (tx: Tx, sql: string, params: unknown[] = []) =>
  tx.query<{ id: string }>(sql, params).then((r) => r.rows.map((x) => String(x.id)).sort())

let brandLive: string, brandDraft: string, live: string, draft: string, ended: string, brandB: string

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  const brand = (store: string, tenant: string, slug: string, status: string) =>
    one<{ id: string }>(db, `insert into public.brands (tenant_id, store_id, name, slug, status) values ($1, $2, $3, $3, $4) returning id`, [tenant, store, slug, status]).then((r) => r.id)
  brandLive = await brand(f.storeA, f.tenantA, 'live-label', 'published')
  brandDraft = await brand(f.storeA, f.tenantA, 'draft-label', 'draft')
  brandB = await brand(f.storeB, f.tenantB, 'b-label', 'published')
  const collection = (slug: string, status: string, endsAt: string | null = null) =>
    one<{ id: string }>(db, `insert into public.collections (tenant_id, store_id, title, slug, status, ends_at) values ($1, $2, $3, $3, $4, $5) returning id`,
      [f.tenantA, f.storeA, slug, status, endsAt]).then((r) => r.id)
  live = await collection('after-hours', 'published')
  draft = await collection('secret', 'draft')
  ended = await collection('last-season', 'published', '2020-01-01T00:00:00Z')
  for (const c of [live, draft, ended]) await db.query(`insert into public.collection_products (collection_id, product_id, tenant_id) values ($1, 'pA1', $2)`, [c, f.tenantA])
})
afterAll(() => db.close())

describe('product source and condition', () => {
  it('existing products are original merchandise by default', async () => {
    const row = await one<{ source_type: string; condition: string | null }>(db, `select source_type, condition from public.products where id = 'pA1'`)
    expect(row).toEqual({ source_type: 'original', condition: null })
  })

  it('a thrift piece must state its condition, from the allowed list', async () => {
    expect(await errorOf(db.query(`update public.products set source_type = 'thrift' where id = 'pA1'`))).toMatch(/products_thrift_condition_check/)
    expect(await errorOf(db.query(`update public.products set condition = 'mint' where id = 'pA1'`))).toMatch(/check constraint/)
    await db.query(`update public.products set source_type = 'thrift', condition = 'good', condition_notes = 'Small mark on the left cuff.' where id = 'pA1'`)
    await db.query(`update public.products set source_type = 'original', condition = null, condition_notes = null where id = 'pA1'`)
  })

  it('a product can only carry its own business\'s brand', async () => {
    expect(await errorOf(db.query(`update public.products set brand_id = $1 where id = 'pA1'`, [brandB]))).toMatch(/another business/)
    await db.query(`update public.products set brand_id = $1 where id = 'pA1'`, [brandLive])
    await db.query(`update public.products set brand_id = null where id = 'pA1'`)
  })

  it('SKUs are unique within a store', async () => {
    await db.query(`update public.products set sku = 'FH-001' where id = 'pA1'`)
    expect(await errorOf(db.query(`update public.products set sku = 'FH-001' where id = 'pA2'`))).toMatch(/duplicate key/)
    await db.query(`update public.products set sku = null where id = 'pA1'`)
  })
})

describe('what the public sees', () => {
  it('only published brands', async () => {
    expect(await probe(db, anon, (tx) => ids(tx, `select id from public.brands where store_id = $1`, [f.storeA]))).toEqual([brandLive])
  })

  it('only published collections inside their dates, and only their links', async () => {
    expect(await probe(db, anon, (tx) => ids(tx, `select id from public.collections where store_id = $1`, [f.storeA]))).toEqual([live])
    const links = await probe(db, anon, (tx) => ids(tx, `select collection_id as id from public.collection_products`))
    expect(links).toEqual([live])
  })

  it('can change none of it', async () => {
    for (const sql of [`update public.brands set name = 'x'`, `delete from public.collections`, `delete from public.collection_products`]) {
      expect(await errorOf(probe(db, anon, (tx) => tx.query(sql))), sql).toMatch(/permission denied/)
    }
  })
})

describe('staff', () => {
  it('product readers see drafts and ended collections for their own business only', async () => {
    const a = await probe(db, user(f.users.readonlyA), (tx) => ids(tx, `select id from public.collections`))
    expect(a).toEqual([live, draft, ended].sort())
    // Another business sees only what the public sees.
    const b = await probe(db, user(f.users.ownerB), (tx) => ids(tx, `select id from public.collections where tenant_id = $1`, [f.tenantA]))
    expect(b).toEqual([live])
    expect(await probe(db, user(f.users.readonlyA), (tx) => ids(tx, `select id from public.brands where tenant_id = $1`, [f.tenantA])))
      .toEqual([brandLive, brandDraft].sort())
  })

  it('product writers build collections; staff without products.write and other businesses can\'t', async () => {
    const add = (tx: Tx, tenant: string) => tx.query(`insert into public.collections (tenant_id, store_id, title, slug) values ($1, $2, 'New', 'new-one')`, [tenant, f.storeA])
    expect(await probe(db, user(f.users.ownerA), (tx) => add(tx, f.tenantA).then((r) => r.affectedRows))).toBe(1)
    expect(await errorOf(probe(db, user(f.users.supportA), (tx) => add(tx, f.tenantA)))).toMatch(/row-level security/)
    expect(await errorOf(probe(db, user(f.users.ownerB), (tx) => add(tx, f.tenantA)))).toMatch(/row-level security/)
  })

  it('a collection can\'t hold another business\'s products', async () => {
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`insert into public.collection_products (collection_id, product_id, tenant_id) values ($1, 'pB1', $2)`, [live, f.tenantA])))).toMatch(/own business/)
  })
})
