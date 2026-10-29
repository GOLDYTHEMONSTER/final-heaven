// Email campaigns: who can write them, and that only the server can send them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, errorOf, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const user = (id: string) => ({ kind: 'user' as const, id })

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

const draft = (tenant: string, extra = '') =>
  `insert into public.email_campaigns (tenant_id, subject, heading, body, audience${extra ? ', status' : ''})
   values ('${tenant}', 'Doors open', 'We are open', 'Come through.', '{launch_waitlist}'${extra ? `, '${extra}'` : ''}) returning id`

describe('email campaigns', () => {
  it('owners and administrators write drafts; other staff and outsiders cannot', async () => {
    for (const id of [f.users.ownerA, f.users.adminA]) {
      const rows = await probe(db, user(id), (tx) => tx.query(draft(f.tenantA)).then((r) => r.rows))
      expect(rows).toHaveLength(1)
    }
    for (const id of [f.users.supportA, f.users.readonlyA, f.users.outsider]) {
      expect(await errorOf(probe(db, user(id), (tx) => tx.query(draft(f.tenantA))))).toMatch(/row-level security|permission denied/)
    }
  })

  it('a draft cannot be created as sent, nor marked sent from the browser', async () => {
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(draft(f.tenantA, 'sent'))))).toMatch(/row-level security/)
    expect(await errorOf(probe(db, user(f.users.ownerA), async (tx) => {
      const { rows } = await tx.query<{ id: string }>(draft(f.tenantA))
      await tx.query(`update public.email_campaigns set status = 'sent' where id = $1`, [rows[0].id])
    }))).toMatch(/row-level security/)
  })

  it('another tenant’s owner sees nothing, and only the server writes recipients', async () => {
    const seen = await probe(db, user(f.users.ownerB), async (tx) => {
      return (await tx.query(`select 1 from public.email_campaigns where tenant_id = $1`, [f.tenantA])).rows.length
    })
    expect(seen).toBe(0)
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`insert into public.email_campaign_recipients (campaign_id, subscriber_id, tenant_id, email) values (gen_random_uuid(), gen_random_uuid(), $1, 'x@y.z')`, [f.tenantA]))))
      .toMatch(/permission denied/)
  })
})
