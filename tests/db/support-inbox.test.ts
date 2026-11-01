// Support inbox: references, the acknowledgement and reply emails queued by the database, and who may read or write what.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createTestDb, errorOf, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
let messageA: string
let messageB: string
const user = (id: string) => ({ kind: 'user' as const, id })
const service = { kind: 'service' as const }
const reply = (tenant: string, message: string, body = 'Thanks, it ships today.') =>
  as(db, service, (tx) => tx.query<{ id: string }>(`select public.send_support_reply($1, $2, $3, 'support@a.test', $4) as id`, [tenant, message, f.users.supportA, body]).then((r) => r.rows[0].id))

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  const insert = (tenant: string, store: string, email: string, reference: string) =>
    as(db, service, (tx) => tx.query<{ id: string }>(
      `insert into public.contact_messages (tenant_id, store_id, name, email, topic, message, reference)
       values ($1, $2, 'Ada', $3, 'order', 'Where is my parcel please?', $4) returning id`, [tenant, store, email, reference]).then((r) => r.rows[0].id))
  messageA = await insert(f.tenantA, f.storeA, 'a@x.co', 'FH-7K2Q')
  messageB = await insert(f.tenantB, f.storeB, 'b@x.co', 'FH-7K2Q')
})
afterAll(() => db.close())

const outbox = () => db.query<{ kind: string; message_id: string | null; reply_id: string | null }>(
  `select kind, message_id, reply_id from public.email_outbox order by id`).then((r) => r.rows)

describe('contact message references', () => {
  it('are unique per store, but another store may use the same one', async () => {
    expect(await errorOf(as(db, service, (tx) => tx.query(
      `insert into public.contact_messages (tenant_id, store_id, name, email, topic, message, reference)
       values ($1, $2, 'Eve', 'e@x.co', 'other', 'Another message here.', 'FH-7K2Q')`, [f.tenantA, f.storeA])))).toMatch(/duplicate key/)
  })

  it('must look like FH- and four characters', async () => {
    expect(await errorOf(as(db, service, (tx) => tx.query(
      `insert into public.contact_messages (tenant_id, store_id, name, email, topic, message, reference)
       values ($1, $2, 'Eve', 'e@x.co', 'other', 'Another message here.', 'nope')`, [f.tenantA, f.storeA])))).toMatch(/check constraint/)
  })
})

describe('acknowledgement', () => {
  it('queues the staff alert and the customer’s acknowledgement for each message, once', async () => {
    const rows = (await outbox()).filter((r) => r.message_id === messageA).map((r) => r.kind).sort()
    expect(rows).toEqual(['staff.message', 'support.ack'])
  })
})

describe('replies', () => {
  it('are saved, queued for sending and mark the message replied, all together', async () => {
    const id = await reply(f.tenantA, messageA)
    expect((await outbox()).filter((r) => r.reply_id === id).map((r) => r.kind)).toEqual(['support.reply'])
    const m = await db.query<{ status: string; handled_by: string }>(`select status, handled_by from public.contact_messages where id = $1`, [messageA])
    expect(m.rows[0]).toEqual({ status: 'replied', handled_by: f.users.supportA })
  })

  it('cannot be sent to another store’s message', async () => {
    expect(await errorOf(reply(f.tenantA, messageB))).toMatch(/message not found/)
  })

  it('are read by their own store’s staff, and by nobody else', async () => {
    const count = (actor: Parameters<typeof probe>[1]) => probe(db, actor, (tx) => tx.query(`select 1 from public.support_replies`).then((r) => r.rows.length))
    expect(await count(user(f.users.supportA))).toBe(1)
    expect(await count(user(f.users.ownerB))).toBe(0)
    expect(await count(user(f.users.outsider))).toBe(0)
    expect(await count(user(f.users.fulfilA))).toBe(0)
    expect(await errorOf(count({ kind: 'anon' }))).toMatch(/permission denied/)
  })

  it('cannot be written or sent directly by staff or the public', async () => {
    const insert = `insert into public.support_replies (tenant_id, message_id, body) select tenant_id, id, 'hi' from public.contact_messages limit 1`
    expect(await errorOf(probe(db, user(f.users.supportA), (tx) => tx.query(insert)))).toMatch(/permission denied/)
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(insert)))).toMatch(/permission denied/)
    expect(await errorOf(probe(db, user(f.users.supportA), (tx) =>
      tx.query(`select public.send_support_reply($1, $2, null, null, 'x')`, [f.tenantA, messageA])))).toMatch(/permission denied/)
  })
})

describe('saved replies', () => {
  const add = `insert into public.support_saved_replies (tenant_id, title, body) values ($1, 'Thanks', 'Thank you.')`

  it('are added and edited by staff who can update customers, in their own store only', async () => {
    await as(db, user(f.users.supportA), (tx) => tx.query(add, [f.tenantA]))
    expect(await errorOf(probe(db, user(f.users.supportA), (tx) => tx.query(add, [f.tenantB])))).toMatch(/row-level security/)
    expect(await errorOf(probe(db, user(f.users.readonlyA), (tx) => tx.query(add, [f.tenantA])))).toMatch(/row-level security|permission denied/)
    const n = await as(db, user(f.users.supportA), (tx) => tx.query(`update public.support_saved_replies set body = 'Thanks a lot.'`).then((r) => r.affectedRows))
    expect(n).toBe(1)
  })

  it('are read by their store’s staff, and by nobody else', async () => {
    const count = (actor: Parameters<typeof probe>[1]) => probe(db, actor, (tx) => tx.query(`select 1 from public.support_saved_replies`).then((r) => r.rows.length))
    expect(await count(user(f.users.supportA))).toBe(1)
    expect(await count(user(f.users.ownerB))).toBe(0)
    expect(await count(user(f.users.outsider))).toBe(0)
    expect(await errorOf(count({ kind: 'anon' }))).toMatch(/permission denied/)
  })

  it('keep one edit per built-in reply', async () => {
    const edit = `insert into public.support_saved_replies (tenant_id, key, title, body) values ($1, 'sizing', 'Sizing', 'Ours.')`
    await as(db, user(f.users.supportA), (tx) => tx.query(edit, [f.tenantA]))
    expect(await errorOf(as(db, user(f.users.supportA), (tx) => tx.query(edit, [f.tenantA])))).toMatch(/duplicate key/)
  })
})
