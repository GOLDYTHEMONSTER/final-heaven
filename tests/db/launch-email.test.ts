// The launch campaign is made exactly once per store, and only the server can ask.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

const ensure = (store: string) =>
  db.query<{ id: string }>(`select public.ensure_launch_campaign($1, 'S', 'P', 'We''re open', 'Body', 'Shop now', '/shop') as id`, [store]).then((r) => r.rows[0].id)

describe('launch campaign', () => {
  it('is made once per store and returned on every later call', async () => {
    const [a, b] = [await ensure(f.storeA), await ensure(f.storeA)]
    expect(a).toBe(b)
    const rows = (await db.query<{ tenant_id: string; audience: string[]; status: string }>(`select tenant_id, audience, status from public.email_campaigns where id = $1`, [a])).rows
    expect(rows).toEqual([{ tenant_id: f.tenantA, audience: ['launch_waitlist'], status: 'draft' }])
    expect(await ensure(f.storeB)).not.toBe(a)
  })

  it('is closed to the public and to staff', async () => {
    for (const actor of [{ kind: 'anon' as const }, { kind: 'user' as const, id: f.users.ownerA }]) {
      await expect(probe(db, actor, (tx) => tx.query(`select public.ensure_launch_campaign($1, 's', 'p', 'h', 'b', null, null)`, [f.storeA]))).rejects.toThrow(/permission denied/)
    }
  })
})
