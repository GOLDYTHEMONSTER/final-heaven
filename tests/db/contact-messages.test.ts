import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const user = (id: string) => ({ kind: 'user' as const, id })

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  for (const [tenant, store, email] of [[f.tenantA, f.storeA, 'a@x.co'], [f.tenantB, f.storeB, 'b@x.co']]) {
    await as(db, { kind: 'service' }, (tx) => tx.query(
      `insert into public.contact_messages (tenant_id, store_id, name, email, topic, message)
       values ($1, $2, 'Ada', $3, 'return', 'I would like to return my order please.')`, [tenant, store, email]))
  }
})
afterAll(() => db.close())

describe('contact messages', () => {
  it('the public cannot read or write messages directly', async () => {
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select 1 from public.contact_messages`)))).toMatch(/permission denied/)
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(
      `insert into public.contact_messages (tenant_id, store_id, name, email, topic, message) values ($1, $2, 'x', 'x@x.co', 'other', 'hello there friend')`,
      [f.tenantA, f.storeA])))).toMatch(/permission denied/)
  })

  it('staff with customers.read see only their own tenant’s messages', async () => {
    const emails = await probe(db, user(f.users.supportA), (tx) =>
      tx.query<{ email: string }>(`select email from public.contact_messages`).then((r) => r.rows.map((x) => x.email)))
    expect(emails).toEqual(['a@x.co'])
    const fulfil = await probe(db, user(f.users.fulfilA), (tx) => tx.query(`select 1 from public.contact_messages`).then((r) => r.rows.length))
    expect(fulfil).toBe(0)
  })

  it('status changes are stamped with who handled it; the message text cannot be edited', async () => {
    await as(db, user(f.users.supportA), (tx) => tx.query(`update public.contact_messages set status = 'replied' where email = 'a@x.co'`))
    const row = await probe(db, user(f.users.supportA), (tx) =>
      tx.query<{ handled_by: string; status: string }>(`select handled_by, status from public.contact_messages where email = 'a@x.co'`).then((r) => r.rows[0]))
    expect(row).toEqual({ handled_by: f.users.supportA, status: 'replied' })
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`update public.contact_messages set message = 'tampered' where email = 'a@x.co'`)))).toMatch(/permission denied/)
  })

  it('read-only staff cannot change status', async () => {
    const n = await probe(db, user(f.users.readonlyA), (tx) =>
      tx.query(`update public.contact_messages set status = 'closed'`).then((r) => r.affectedRows))
    expect(n).toBe(0)
  })
})
