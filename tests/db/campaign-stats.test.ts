// campaign_email_stats: Resend events joined to a campaign's recipients, counted as people, per tenant.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'
import { statsByCampaign } from '@/lib/email/campaign-stats'

let db: PGlite
let f: Fixture
let campaignA: string
let campaignB: string

async function recipient(campaign: string, tenant: string, store: string, email: string, messageId: string | null) {
  const { rows } = await db.query<{ id: string }>(`insert into public.newsletter_subscribers (tenant_id, store_id, email, source, consent_text, consented_at)
    values ($1, $2, $3, 'launch_waitlist', 'ok', now()) returning id`, [tenant, store, email])
  await db.query(`insert into public.email_campaign_recipients (campaign_id, subscriber_id, tenant_id, email, status, provider_message_id) values ($1, $2, $3, $4, 'sent', $5)`,
    [campaign, rows[0].id, tenant, email, messageId])
}
let svix = 0
const event = (messageId: string, type: string) =>
  db.query(`insert into public.email_events (svix_id, provider_message_id, type) values ($1, $2, $3)`, [`msg_${++svix}`, messageId, type])
const stats = (tenant: string) =>
  db.query<Parameters<typeof statsByCampaign>[0] extends (infer R)[] | null | undefined ? R : never>(`select * from public.campaign_email_stats($1)`, [tenant]).then((r) => statsByCampaign(r.rows))

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
  campaignA = (await db.query<{ id: string }>(`insert into public.email_campaigns (tenant_id, audience) values ($1, '{launch_waitlist}') returning id`, [f.tenantA])).rows[0].id
  campaignB = (await db.query<{ id: string }>(`insert into public.email_campaigns (tenant_id, audience) values ($1, '{launch_waitlist}') returning id`, [f.tenantB])).rows[0].id
  await recipient(campaignA, f.tenantA, f.storeA, 'a1@x.test', 'em_a1')
  await recipient(campaignA, f.tenantA, f.storeA, 'a2@x.test', 'em_a2')
  await recipient(campaignA, f.tenantA, f.storeA, 'a3@x.test', 'em_a3')
  await recipient(campaignA, f.tenantA, f.storeA, 'a4@x.test', null) // not sent yet
  await recipient(campaignB, f.tenantB, f.storeB, 'b1@x.test', 'em_b1')
})
afterAll(() => db.close())

describe('campaign email stats', () => {
  it('counts people per outcome, not events', async () => {
    for (const [m, t] of [['em_a1', 'email.delivered'], ['em_a2', 'email.delivered'], ['em_a1', 'email.opened'], ['em_a1', 'email.opened'],
      ['em_a1', 'email.opened'], ['em_a2', 'email.clicked'], ['em_a3', 'email.bounced'], ['em_a3', 'email.complained']]) await event(m, t)
    expect((await stats(f.tenantA))[campaignA]).toEqual({ delivered: 2, opened: 1, clicked: 1, bounced: 1, complained: 1 })
  })

  it('knows nothing of campaigns without events, and other tenants’ events stay theirs', async () => {
    await event('em_b1', 'email.delivered')
    expect(Object.keys(await stats(f.tenantA))).toEqual([campaignA])
    expect(await stats(f.tenantB)).toEqual({ [campaignB]: { delivered: 1, opened: 0, clicked: 0, bounced: 0, complained: 0 } })
  })

  it('is server-only', async () => {
    for (const actor of [{ kind: 'anon' as const }, { kind: 'user' as const, id: f.users.ownerA }]) {
      await expect(probe(db, actor, (tx) => tx.query(`select * from public.campaign_email_stats($1)`, [f.tenantA]))).rejects.toThrow(/permission denied/)
    }
  })
})
