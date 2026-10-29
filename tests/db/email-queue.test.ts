// queue_email_capped: dedupe, daily caps, skip-over-cap, and the outbox's "exactly one reference" rule.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const subs: string[] = []

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  for (let i = 0; i < 4; i++) {
    const { rows } = await db.query<{ id: string }>(`insert into public.newsletter_subscribers (tenant_id, store_id, email, source, consent_text, consented_at)
      values ($1, $2, $3, 'footer', 'ok', now()) returning id`, [f.tenantA, f.storeA, `s${i}@x.test`])
    subs.push(rows[0].id)
  }
})
afterAll(() => db.close())

const queue = (sub: string, cap: number, skip = true, suffix = '') =>
  db.query<{ r: string }>(`select public.queue_email_capped($1, 'subscriber.welcome', 'subscriber_id', $2, $3, $4, $5) as r`, [f.tenantA, sub, cap, skip, suffix]).then((x) => x.rows[0].r)
const rows = () => db.query<{ status: string; subscriber_id: string; last_error: string | null }>(`select status, subscriber_id, last_error from public.email_outbox order by id`).then((r) => r.rows)

describe('queue_email_capped', () => {
  it('queues once per subscriber however often it is asked', async () => {
    expect(await queue(subs[0], 2)).toBe('queued')
    expect(await queue(subs[0], 2)).toBe('duplicate')
    expect(await rows()).toHaveLength(1)
  })

  it('over the daily cap a welcome is recorded as skipped, never left queued', async () => {
    expect(await queue(subs[1], 2)).toBe('queued')
    expect(await queue(subs[2], 2)).toBe('capped')
    const r = await rows()
    expect(r.filter((x) => x.status === 'queued')).toHaveLength(2)
    expect(r.find((x) => x.subscriber_id === subs[2])).toMatchObject({ status: 'skipped', last_error: 'over the daily cap' })
    expect(await queue(subs[2], 2)).toBe('duplicate') // and is not retried later
  })

  it('without skip-over-cap nothing is recorded, so the caller can try again tomorrow', async () => {
    expect(await queue(subs[3], 2, false)).toBe('capped')
    expect((await rows()).some((x) => x.subscriber_id === subs[3])).toBe(false)
  })

  it('yesterday’s rows do not count against today’s cap', async () => {
    await db.query(`update public.email_outbox set created_at = now() - interval '2 days'`)
    expect(await queue(subs[3], 2, false)).toBe('queued')
  })

  it('a key suffix makes a fresh occasion for the same subscriber', async () => {
    expect(await queue(subs[0], 10, true, '2026-09-01')).toBe('queued')
  })

  it('an outbox row needs exactly one reference, and only the server can queue', async () => {
    await expect(db.query(`insert into public.email_outbox (tenant_id, kind, dedupe_key) values ($1, 'order.paid', 'x1')`, [f.tenantA])).rejects.toThrow(/one_reference/)
    await expect(db.query(`insert into public.email_outbox (tenant_id, kind, order_id, subscriber_id, dedupe_key) values ($1, 'order.paid', $2, $3, 'x2')`, [f.tenantA, f.orders.a1, subs[0]])).rejects.toThrow(/one_reference/)
    await expect(probe(db, { kind: 'user', id: f.users.ownerA }, (tx) => tx.query(`select public.queue_email_capped($1, 'subscriber.welcome', 'subscriber_id', $2, 5)`, [f.tenantA, subs[0]]))).rejects.toThrow(/permission denied/)
    await expect(db.query(`select public.queue_email_capped($1, 'subscriber.welcome', 'tenant_id', $2, 5)`, [f.tenantA, subs[0]])).rejects.toThrow(/unsupported reference column/)
  })
})
