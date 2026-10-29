// Resend events: stored once however often Resend retries, and a hard bounce or
// complaint suppresses the address and unsubscribes it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  for (const [tenant, store, email] of [[f.tenantA, f.storeA, 'Bounce@x.test'], [f.tenantA, f.storeA, 'fine@x.test'], [f.tenantB, f.storeB, 'bounce@x.test']]) {
    await db.query(`insert into public.newsletter_subscribers (tenant_id, store_id, email, source, consent_text, consented_at)
                    values ($1, $2, $3, 'footer', 'ok', now())`, [tenant, store, email])
  }
})
afterAll(() => db.close())

const record = (svix: string, type: string, emails: string[], reason: string | null, message = 'em_1') =>
  db.query<{ r: boolean }>(`select public.record_email_event($1, $2, $3, now(), '{"to":[]}', $4, $5) as r`, [svix, message, type, emails, reason]).then((x) => x.rows[0].r)
const suppressions = () => db.query<{ tenant_id: string; email: string; reason: string }>(`select tenant_id, email, reason from public.email_suppressions order by tenant_id, email`).then((r) => r.rows)
const unsubscribed = () => db.query<{ email: string; u: boolean }>(`select email, unsubscribed_at is not null as u from public.newsletter_subscribers order by tenant_id, email`).then((r) => r.rows)

describe('email events and suppression', () => {
  it('stores an event once: a replayed svix id is a no-op', async () => {
    expect(await record('msg_1', 'email.delivered', [], null)).toBe(true)
    expect(await record('msg_1', 'email.delivered', [], null)).toBe(false)
    expect((await db.query(`select 1 from public.email_events`)).rows).toHaveLength(1)
  })

  it('a hard bounce suppresses the address in every tenant that knows it, and unsubscribes it', async () => {
    expect(await record('msg_2', 'email.bounced', ['BOUNCE@x.test'], 'bounced')).toBe(true)
    expect((await suppressions()).map((s) => `${s.tenant_id}|${s.email}|${s.reason}`).sort()).toEqual(
      [`${f.tenantA}|bounce@x.test|bounced`, `${f.tenantB}|bounce@x.test|bounced`].sort())
    expect((await unsubscribed()).filter((s) => s.email.toLowerCase() === 'bounce@x.test').every((s) => s.u)).toBe(true)
    expect((await unsubscribed()).find((s) => s.email === 'fine@x.test')?.u).toBe(false)
  })

  it('a replay changes nothing, and a complaint upgrades the reason', async () => {
    await db.query(`delete from public.email_suppressions`)
    expect(await record('msg_2', 'email.bounced', ['bounce@x.test'], 'bounced')).toBe(false)
    expect(await suppressions()).toEqual([]) // the replay did not re-suppress
    await record('msg_3', 'email.bounced', ['fine@x.test'], 'bounced')
    await record('msg_4', 'email.complained', ['fine@x.test'], 'complained')
    expect(await suppressions()).toEqual([{ tenant_id: f.tenantA, email: 'fine@x.test', reason: 'complained' }])
  })

  it('an unknown address is recorded as an event but suppresses nobody', async () => {
    await record('msg_5', 'email.complained', ['stranger@x.test'], 'complained', 'em_none')
    expect((await suppressions()).some((s) => s.email === 'stranger@x.test')).toBe(false)
  })

  it('is closed to the public and to staff', async () => {
    for (const actor of [{ kind: 'anon' as const }, { kind: 'user' as const, id: f.users.ownerA }]) {
      await expect(probe(db, actor, (tx) => tx.query(`select * from public.email_events`))).rejects.toThrow(/permission denied/)
      await expect(probe(db, actor, (tx) => tx.query(`select * from public.email_suppressions`))).rejects.toThrow(/permission denied/)
      await expect(probe(db, actor, (tx) => tx.query(`select public.record_email_event('x', null, 'email.bounced', now(), '{}', '{}', null)`))).rejects.toThrow(/permission denied/)
    }
  })
})
