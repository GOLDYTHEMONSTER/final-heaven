// Product alerts: one per product and address, re-armed on a new request, removed by the unsubscribe link, server-only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const CONSENT = 'I agree to Final Heaven emailing me once, when this piece is available.'

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

const subscribe = (email: string, product = 'pA1') =>
  db.query(`select public.subscribe_product_alert($1, $2, $3, $4)`, [f.tenantA, product, email, CONSENT])
const alerts = () => db.query<{ id: string; email: string; notified_at: string | null; unsubscribe_token: string }>(
  `select id, email, notified_at, unsubscribe_token from public.product_alerts order by created_at, email`).then((r) => r.rows)

describe('product alerts', () => {
  it('keeps one alert per product and address, whatever the letter case', async () => {
    await subscribe('Ada@X.test')
    await subscribe('ada@x.TEST')
    await subscribe('ada@x.test', 'pA2')
    const rows = await alerts()
    expect(rows).toHaveLength(2)
    expect(rows[0].email).toBe('ada@x.test')
  })

  it('asking again after being told re-arms the alert', async () => {
    await db.query(`update public.product_alerts set notified_at = now()`)
    await subscribe('ada@x.test')
    const rows = await db.query<{ product_id: string; notified_at: string | null }>(`select product_id, notified_at from public.product_alerts order by product_id`)
    expect(rows.rows.find((r) => r.product_id === 'pA1')?.notified_at).toBeNull()
    expect(rows.rows.find((r) => r.product_id === 'pA2')?.notified_at).not.toBeNull()
  })

  it('goes with its product', async () => {
    await db.query(`insert into public.products (id, name, price, category, stock, status, tenant_id, store_id) values ('pGone', 'Gone', 1, 'Shoes', 0, 'active', $1, $2)`, [f.tenantA, f.storeA])
    await subscribe('gone@x.test', 'pGone')
    await db.query(`delete from public.products where id = 'pGone'`)
    expect((await alerts()).some((a) => a.email === 'gone@x.test')).toBe(false)
  })

  it('queues one email per alert in the outbox, and the unsubscribe token cancels the alert', async () => {
    const [a] = await alerts()
    for (let i = 0; i < 2; i++) {
      const { rows } = await db.query<{ r: string }>(`select public.queue_email_capped($1, 'product.available', 'alert_id', $2, 30) as r`, [f.tenantA, a.id])
      expect(rows[0].r).toBe(i === 0 ? 'queued' : 'duplicate')
    }
    expect((await db.query(`select 1 from public.email_outbox where alert_id = $1`, [a.id])).rows).toHaveLength(1)

    const { rows } = await db.query<{ r: boolean }>(`select public.newsletter_unsubscribe($1) as r`, [a.unsubscribe_token])
    expect(rows[0].r).toBe(true)
    expect((await alerts()).some((x) => x.id === a.id)).toBe(false)
    expect((await db.query(`select 1 from public.email_outbox where alert_id = $1`, [a.id])).rows).toHaveLength(0) // cancelled with it
    const unknown = await db.query<{ r: boolean }>(`select public.newsletter_unsubscribe(gen_random_uuid()) as r`)
    expect(unknown.rows[0].r).toBe(false)
  })

  it('still unsubscribes newsletter subscribers by token', async () => {
    const { rows } = await db.query<{ unsubscribe_token: string }>(`insert into public.newsletter_subscribers (tenant_id, store_id, email, source, consent_text, consented_at)
      values ($1, $2, 'n@x.test', 'footer', 'ok', now()) returning unsubscribe_token`, [f.tenantA, f.storeA])
    expect((await db.query<{ r: boolean }>(`select public.newsletter_unsubscribe($1) as r`, [rows[0].unsubscribe_token])).rows[0].r).toBe(true)
    expect((await db.query(`select 1 from public.newsletter_subscribers where email = 'n@x.test' and unsubscribed_at is not null`)).rows).toHaveLength(1)
  })

  it('is closed to the public and to staff', async () => {
    for (const actor of [{ kind: 'anon' as const }, { kind: 'user' as const, id: f.users.ownerA }]) {
      await expect(probe(db, actor, (tx) => tx.query(`select * from public.product_alerts`))).rejects.toThrow(/permission denied/)
      await expect(probe(db, actor, (tx) => tx.query(`select public.subscribe_product_alert($1, 'pA1', 'x@y.test', 'consent text here')`, [f.tenantA]))).rejects.toThrow(/permission denied/)
    }
  })
})
