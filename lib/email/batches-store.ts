// Held marketing batches in the database, and sending the approved ones.
// Server only (service key). A batch is created held (email_batches); Studio →
// Outbox approves it; the daily job (and the Outbox page) then sends it, a few
// at a time, within the marketing budget (./budget.ts). Each recipient is keyed
// by (batch, subscriber) in the database and by the same pair in Resend's
// Idempotency-Key, so a repeated or overlapping call never emails anyone twice.
import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { EmailError, type EmailSender } from './resend'
import { suppressedAmong } from './suppression'
import { AUDIENCES, isAudience, renderCampaign, type CampaignContent, type CampaignProduct } from './campaign'
import { campaignProducts } from './campaign-send'
import { emailUsage, marketingAllowance, marketingPause } from './budget'
import { MARKETING_GAP_DAYS, type BatchTrigger } from './reachout'
import { fillEarly, needsEarly } from './lifecycle'
import { earlyFill } from '@/lib/early-access-store'

const PAUSE_MS = 550
const DAY_MS = 86_400_000

export type BatchRow = {
  id: string; tenant_id: string; trigger: BatchTrigger; list: string | null; reason: string
  subject: string; preheader: string; heading: string; body: string; cta_label: string | null; cta_url: string | null; product_ids: string[]
  status: 'held' | 'approved' | 'sending' | 'sent' | 'skipped'
  approved_by: string | null; approved_at: string | null; created_at: string; updated_at: string; sent_at: string | null
}
export const BATCH_COLUMNS = 'id, tenant_id, trigger, list, reason, subject, preheader, heading, body, cta_label, cta_url, product_ids, status, approved_by, approved_at, created_at, updated_at, sent_at'

export const batchContent = (b: Pick<BatchRow, 'subject' | 'preheader' | 'heading' | 'body' | 'cta_label' | 'cta_url'>): CampaignContent =>
  ({ subject: b.subject, preheader: b.preheader, heading: b.heading, body: b.body, ctaLabel: b.cta_label, ctaUrl: b.cta_url })

export type NewRecipient = { subscriberId: string; email: string; productId?: string | null; why?: string | null }

/**
 * Puts people into the trigger's held batch (made on first use, one per
 * trigger and list), so the owner sees one batch to approve rather than one per
 * person. Anyone already in it stays as they were.
 */
export async function addToHeldBatch(db: SupabaseClient, a: {
  tenantId: string; trigger: BatchTrigger; list?: string | null; content: CampaignContent; reason: string; recipients: NewRecipient[]
}): Promise<{ batchId: string; added: number }> {
  if (!a.recipients.length) return { batchId: '', added: 0 }
  const list = a.list ?? null
  const find = async () => {
    let q = db.from('email_batches').select('id').eq('tenant_id', a.tenantId).eq('trigger', a.trigger).eq('status', 'held')
    q = list ? q.eq('list', list) : q.is('list', null)
    const { data, error } = await q.maybeSingle()
    if (error) throw error
    return data?.id as string | undefined
  }
  let id = await find()
  if (!id) {
    const c = a.content
    const { data, error } = await db.from('email_batches').insert({
      tenant_id: a.tenantId, trigger: a.trigger, list, reason: a.reason, subject: c.subject, preheader: c.preheader, heading: c.heading,
      body: c.body, cta_label: c.ctaLabel, cta_url: c.ctaUrl,
    }).select('id').single()
    if (error?.code === '23505') id = await find() // another run made it first
    else if (error) throw error
    else id = data.id
  }
  if (!id) throw new Error('could not find or make the held batch')
  const rows = a.recipients.map((r) => ({
    batch_id: id, subscriber_id: r.subscriberId, tenant_id: a.tenantId, email: r.email, trigger: a.trigger, product_id: r.productId ?? null, why: r.why ?? null,
  }))
  const { data: added, error: ie } = await db.from('email_batch_recipients')
    .upsert(rows, { onConflict: 'batch_id,subscriber_id', ignoreDuplicates: true }).select('subscriber_id')
  if (ie) throw ie
  return { batchId: id, added: (added ?? []).length }
}

// ---------------------------------------------------------------------------
// The welcome template's approval (M2)
// ---------------------------------------------------------------------------

/** A short fingerprint of the words, so an approval holds only for the copy that was approved. */
export const copyHash = (c: CampaignContent) =>
  createHash('sha256').update(JSON.stringify([c.subject, c.preheader, c.heading, c.body, c.ctaLabel, c.ctaUrl])).digest('hex').slice(0, 32)

export const welcomeTemplate = (source: string | null) => `welcome:${source ?? 'footer'}`

export async function templateApproved(db: SupabaseClient, tenantId: string, template: string, content: CampaignContent): Promise<boolean> {
  const { data, error } = await db.from('email_template_approvals').select('template')
    .eq('tenant_id', tenantId).eq('template', template).eq('copy_hash', copyHash(content)).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function approveTemplate(db: SupabaseClient, tenantId: string, template: string, content: CampaignContent, userId: string | null) {
  const { error } = await db.from('email_template_approvals')
    .upsert({ tenant_id: tenantId, template, copy_hash: copyHash(content), approved_by: userId, approved_at: new Date().toISOString() }, { onConflict: 'tenant_id,template,copy_hash', ignoreDuplicates: true })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// The 3-day rule
// ---------------------------------------------------------------------------

/** When each subscriber was last sent (or is queued for) a marketing email within the gap window. */
export async function lastContacts(db: SupabaseClient, tenantId: string, now = new Date()): Promise<Map<string, Date>> {
  const since = new Date(now.getTime() - MARKETING_GAP_DAYS * DAY_MS).toISOString()
  const ok = <T>(r: { data: T[] | null; error: unknown }): T[] => { if (r.error) throw r.error; return r.data ?? [] }
  const [batches, campaigns, welcomes] = await Promise.all([
    db.from('email_batch_recipients').select('subscriber_id, sent_at, created_at').eq('tenant_id', tenantId).in('status', ['queued', 'sent']).or(`created_at.gte.${since},sent_at.gte.${since}`),
    db.from('email_campaign_recipients').select('subscriber_id, sent_at').eq('tenant_id', tenantId).eq('status', 'sent').gte('sent_at', since),
    db.from('email_outbox').select('subscriber_id, sent_at').eq('tenant_id', tenantId).eq('kind', 'subscriber.welcome').eq('status', 'sent').gte('sent_at', since),
  ])
  const out = new Map<string, Date>()
  const note = (id: string | null, at: string | null) => {
    if (!id || !at) return
    const d = new Date(at)
    if (!out.has(id) || d > out.get(id)!) out.set(id, d)
  }
  for (const r of ok<{ subscriber_id: string; sent_at: string | null; created_at: string }>(batches)) note(r.subscriber_id, r.sent_at ?? r.created_at)
  for (const r of ok<{ subscriber_id: string; sent_at: string | null }>(campaigns)) note(r.subscriber_id, r.sent_at)
  for (const r of ok<{ subscriber_id: string | null; sent_at: string | null }>(welcomes)) note(r.subscriber_id, r.sent_at)
  return out
}

// ---------------------------------------------------------------------------
// Sending approved batches
// ---------------------------------------------------------------------------

export type DrainResult = { sent: number; failed: number; skipped: number; remaining: number; paused: string | null }

/**
 * Sends up to `limit` queued recipients of approved batches, oldest approval
 * first, never past the marketing budget. Call again until `remaining` is 0
 * (the Outbox page does while it is open; the daily job does it once a day).
 * A quota or key problem pauses (`paused` says why) without losing anyone.
 */
export async function drainApprovedBatches(
  deps: { db: SupabaseClient; sender: EmailSender; from: string; replyTo: string | null; site: string; tenantId: string },
  opts: { limit: number; deadline?: number },
): Promise<DrainResult> {
  const { db, sender, tenantId } = deps
  const site = deps.site.replace(/\/$/, '')
  const result: DrainResult = { sent: 0, failed: 0, skipped: 0, remaining: 0, paused: null }
  const usage = await emailUsage(db, tenantId)
  let room = Math.min(opts.limit, marketingAllowance(usage))
  const stop = marketingPause(usage)

  const { data: batches, error } = await db.from('email_batches').select(BATCH_COLUMNS)
    .eq('tenant_id', tenantId).in('status', ['approved', 'sending']).order('approved_at').limit(10)
  if (error) throw error
  const productCache = new Map<string, CampaignProduct[]>()
  const productsOf = async (ids: string[]) => {
    const key = ids.join(',')
    if (!productCache.has(key)) productCache.set(key, await campaignProducts(db, tenantId, ids))
    return productCache.get(key)!
  }

  for (const b of (batches ?? []) as BatchRow[]) {
    if (room <= 0 || result.paused || (opts.deadline != null && Date.now() + 1500 > opts.deadline)) break
    if (b.status === 'approved') {
      await db.from('email_batches').update({ status: 'sending' }).eq('id', b.id).eq('status', 'approved')
    }
    const { data: queue, error: qe } = await db.from('email_batch_recipients').select('subscriber_id, email, product_id, attempts')
      .eq('batch_id', b.id).eq('status', 'queued').order('created_at').limit(room + 20)
    if (qe) throw qe
    const blocked = await suppressedAmong(db, tenantId, (queue ?? []).map((r) => r.email))
    const mark = (subscriberId: string, patch: Record<string, unknown>) =>
      db.from('email_batch_recipients').update(patch).eq('batch_id', b.id).eq('subscriber_id', subscriberId)

    for (const r of queue ?? []) {
      if (room <= 0 || (opts.deadline != null && Date.now() + 1500 > opts.deadline)) break
      if (blocked.has(r.email.toLowerCase())) {
        await mark(r.subscriber_id, { status: 'skipped', last_error: 'address is suppressed (bounced or complained)' })
        result.skipped += 1
        continue
      }
      const { data: sub, error: se } = await db.from('newsletter_subscribers').select('source, unsubscribe_token, unsubscribed_at, consented_at').eq('id', r.subscriber_id).maybeSingle()
      if (se) throw se
      if (!sub || sub.unsubscribed_at || !sub.consented_at) {
        await mark(r.subscriber_id, { status: 'skipped', last_error: 'unsubscribed before sending' })
        result.skipped += 1
        continue
      }
      const unsubscribeUrl = `${site}/unsubscribe?token=${sub.unsubscribe_token}`
      const reason = isAudience(sub.source) ? AUDIENCES[sub.source].reason : 'you signed up for Final Heaven emails'
      const products = await productsOf(r.product_id ? [r.product_id] : (b.product_ids ?? []))
      // Copy with {code}, {percent} or {invite_link} (the early access welcome) gets this person's own details.
      let content = batchContent(b)
      if (needsEarly([content.subject, content.preheader, content.body].join(' '))) {
        const fill = await earlyFill(db, r.subscriber_id, site)
        if (!fill) {
          await mark(r.subscriber_id, { status: 'skipped', last_error: 'no early access code for this subscriber' })
          result.skipped += 1
          continue
        }
        content = { ...content, subject: fillEarly(content.subject, fill), preheader: fillEarly(content.preheader, fill), body: fillEarly(content.body, fill) }
      }
      const email = renderCampaign(content, { products, site, unsubscribeUrl, reason })
      try {
        const { id } = await sender.send({
          from: deps.from, to: [r.email], replyTo: deps.replyTo, subject: email.subject, html: email.html, text: email.text,
          tags: [{ name: 'batch', value: b.id.replace(/-/g, '') }],
          headers: {
            'List-Unsubscribe': `<${site}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }, `batch:${b.id}:${r.subscriber_id}`)
        await mark(r.subscriber_id, { status: 'sent', provider_message_id: id, sent_at: new Date().toISOString(), attempts: r.attempts + 1, last_error: null })
        result.sent += 1
        room -= 1
      } catch (e) {
        const err = e instanceof EmailError ? e : new EmailError(String((e as Error).message), true)
        if (err.retryable) {
          await mark(r.subscriber_id, { attempts: r.attempts + 1, last_error: err.message.slice(0, 500) })
          result.paused = err.status === 429 ? 'Resend’s sending limit was reached. It carries on later.' : `Resend refused (${err.message}). Check the API key and the domain.`
          break
        }
        await mark(r.subscriber_id, { status: 'failed', attempts: r.attempts + 1, last_error: err.message.slice(0, 500) })
        result.failed += 1
      }
      await new Promise((res) => setTimeout(res, PAUSE_MS))
    }

    const { count, error: ce } = await db.from('email_batch_recipients').select('subscriber_id', { count: 'exact', head: true }).eq('batch_id', b.id).eq('status', 'queued')
    if (ce) throw ce
    if (count === 0) {
      await db.from('email_batches').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'sending')
      // The launch email going out is what the store records as "launch email sent".
      if (b.trigger === 'launch') await db.from('stores').update({ launch_email_sent_at: new Date().toISOString() }).eq('tenant_id', tenantId).is('launch_email_sent_at', null)
    }
  }

  const { count: left, error: le } = await db.from('email_batch_recipients').select('batch_id, email_batches!inner(status)', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('status', 'queued').in('email_batches.status', ['approved', 'sending'])
  if (le) throw le
  result.remaining = left ?? 0
  result.paused ??= stop && result.sent === 0 && result.remaining > 0 ? stop : null
  return result
}
