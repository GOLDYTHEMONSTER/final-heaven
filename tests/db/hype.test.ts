// Hype in the database (20261028100000_product_hype.sql): one hype per
// visitor per product, only while Hype is on, only for products on sale, and
// nothing readable or writable with the public key.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, one, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const service = { kind: 'service' as const }
const visitor = (n: number) => n.toString(16).padStart(64, '0')
const hype = (product: string, v: string, store = f.storeA) =>
  as(db, service, (tx) => tx.query<{ r: Record<string, any> }>(`select public.record_hype($1, $2, $3) as r`, [store, product, v]).then((r) => r.rows[0].r))

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

describe('hype', () => {
  it('counts nothing while Hype is off (the default)', async () => {
    expect(await hype('pA1', visitor(1))).toEqual({ status: 'off' })
    expect((await one<{ c: number }>(db, `select count(*)::int as c from public.hype_events`)).c).toBe(0)
  })

  it('accepts one hype per visitor per product', async () => {
    await db.query(`insert into public.hype_settings (store_id, tenant_id, enabled) values ($1, $2, true)`, [f.storeA, f.tenantA])
    expect(await hype('pA1', visitor(1))).toMatchObject({ status: 'accepted', total: 1, last7: 1, rank: 'unseen' })
    expect(await hype('pA1', visitor(1))).toMatchObject({ status: 'duplicate', total: 1 })
    expect(await hype('pA1', visitor(2))).toMatchObject({ status: 'accepted', total: 2 })
  })

  it('refuses drafts, other stores’ products and malformed visitor ids', async () => {
    expect(await hype('pA2', visitor(3))).toEqual({ status: 'unknown_product' }) // a draft
    expect(await hype('pB1', visitor(3))).toEqual({ status: 'unknown_product' }) // another business, through store A
    expect(await errorOf(hype('pA1', 'not-a-hash'))).toMatch(/check constraint/)
  })

  it('keeps the peak, and the time a rank was taken', async () => {
    const save = (score: number, rank: string) => as(db, service, (tx) => tx.query(`select public.save_hype('pA1', $1, $2)`,
      [f.tenantA, JSON.stringify({ score, rank, early: false, total: 2, last7: 2 })]))
    await save(30, 'buzzing')
    const first = await one<{ rank_since: string }>(db, `select rank_since from public.product_hype where product_id = 'pA1'`)
    await save(32, 'buzzing')
    expect((await one<{ rank_since: string }>(db, `select rank_since from public.product_hype where product_id = 'pA1'`)).rank_since).toEqual(first.rank_since)
    await save(20, 'emerging')
    expect(await one(db, `select score::float as s, rank, peak_score::float as p, peak_rank from public.product_hype where product_id = 'pA1'`))
      .toEqual({ s: 20, rank: 'emerging', p: 32, peak_rank: 'buzzing' })
  })

  it('gives the public key nothing, and staff only what their role allows', async () => {
    for (const t of ['hype_events', 'product_hype', 'hype_settings']) {
      expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select * from public.${t}`)))).toMatch(/permission denied/)
    }
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select public.record_hype($1, 'pA1', $2)`, [f.storeA, visitor(9)])))).toMatch(/permission denied/)
    const scores = (who: string) => probe(db, { kind: 'user', id: who }, (tx) => tx.query(`select product_id from public.product_hype`).then((r) => r.rows.length))
    expect(await scores(f.users.ownerA)).toBe(1)
    expect(await scores(f.users.ownerB)).toBe(0)
    // Only settings managers switch it; others' updates change nothing.
    const off = (who: string) => probe(db, { kind: 'user', id: who }, (tx) => tx.query(`update public.hype_settings set enabled = false where store_id = $1`, [f.storeA]).then((r) => r.affectedRows))
    expect(await off(f.users.ownerA)).toBe(1)
    expect(await off(f.users.supportA)).toBe(0)
  })

  it('counts every hyped product for the daily refresh', async () => {
    const rows = (await as(db, service, (tx) => tx.query<{ product_id: string; total: string }>(`select product_id, total from public.hype_counts()`))).rows
    expect(rows).toEqual([expect.objectContaining({ product_id: 'pA1', total: 2 })])
  })
})
