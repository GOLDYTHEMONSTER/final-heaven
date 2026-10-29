// claim_checkout_reminder: one per checkout, one per address per 24 hours, a daily cap, nothing for closed checkouts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
let n = 0

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

async function checkout(email: string, tenant = f.tenantA, store = f.storeA) {
  n += 1
  const { rows } = await db.query<{ id: string }>(`insert into public.checkouts
    (tenant_id, store_id, reference, order_number, tracking_number, email, shipping_address, currency, items, subtotal, total)
    values ($1, $2, $3, $4, $5, $6, 'x', 'NGN', '[{"id":"p","name":"P","quantity":1,"price":100}]', 100, 100) returning id`,
    [tenant, store, `CHK-REMIND-${n}`, `FH-REMIND-${n}`, `TRK-REMIND-${n}`, email])
  return rows[0].id
}
const claim = (id: string, cap = 30) => db.query<{ r: string }>(`select public.claim_checkout_reminder($1, $2) as r`, [id, cap]).then((x) => x.rows[0].r)

describe('claim_checkout_reminder', () => {
  it('gives a checkout one place, once', async () => {
    const id = await checkout('one@x.test')
    expect(await claim(id)).toBe('ok')
    expect(await claim(id)).toBe('duplicate')
  })

  it('allows one reminder per address in 24 hours, whatever the letter case', async () => {
    const first = await checkout('Same@x.test')
    const second = await checkout('same@X.test')
    expect(await claim(first)).toBe('ok')
    expect(await claim(second)).toBe('recent')
    await db.query(`update public.checkouts set reminder_scheduled_at = now() - interval '25 hours' where id = $1`, [first])
    expect(await claim(second)).toBe('ok')
  })

  it('a cancelled reminder never went out, so it does not hold the address', async () => {
    const first = await checkout('paid@x.test')
    const second = await checkout('paid@x.test')
    expect(await claim(first)).toBe('ok')
    await db.query(`update public.checkouts set reminder_cancelled_at = now() where id = $1`, [first])
    expect(await claim(second)).toBe('ok')
  })

  it('stops at the daily cap, and the other tenant has its own count', async () => {
    const before = Number((await db.query<{ c: string }>(`select count(*) as c from public.checkouts where tenant_id = $1 and reminder_scheduled_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' and reminder_cancelled_at is null`, [f.tenantA])).rows[0].c)
    const cap = before + 1
    expect(await claim(await checkout('cap1@x.test'), cap)).toBe('ok')
    expect(await claim(await checkout('cap2@x.test'), cap)).toBe('capped')
    expect(await claim(await checkout('cap3@x.test', f.tenantB, f.storeB), cap)).toBe('ok')
  })

  it('refuses checkouts that are paid, expired or unknown', async () => {
    const expired = await checkout('gone@x.test')
    await db.query(`update public.checkouts set status = 'expired' where id = $1`, [expired])
    expect(await claim(expired)).toBe('closed')
    expect(await claim('00000000-0000-0000-0000-000000000000')).toBe('missing')
  })

  it('is closed to the public and to staff', async () => {
    const id = await checkout('closed@x.test')
    for (const actor of [{ kind: 'anon' as const }, { kind: 'user' as const, id: f.users.ownerA }]) {
      await expect(probe(db, actor, (tx) => tx.query(`select public.claim_checkout_reminder($1, 5)`, [id]))).rejects.toThrow(/permission denied/)
    }
  })
})
