// Sending a campaign, a small batch per call, so no request runs long and the
// Resend free plan's limits (2 requests a second, 100 emails a day) are
// respected. Server only (service key). Each recipient is keyed by
// (campaign, subscriber) in the database and by the same pair in Resend's
// Idempotency-Key, so a repeated or overlapping call never emails anyone twice.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { EmailError, type EmailSender } from './resend'
import { AUDIENCES, campaignProblems, isAudience, renderCampaign, type CampaignProduct } from './campaign'

export const BATCH = 8
const PAUSE_MS = 550

export type CampaignRow = {
  id: string; tenant_id: string; subject: string; preheader: string; heading: string; body: string
  cta_label: string | null; cta_url: string | null; product_ids: string[]; audience: string[]
  status: 'draft' | 'sending' | 'sent'; recipients: number; sent: number; failed: number
}
export type Progress = { status: CampaignRow['status']; recipients: number; sent: number; failed: number; remaining: number; paused: string | null }

const content = (c: CampaignRow) => ({ subject: c.subject, preheader: c.preheader, heading: c.heading, body: c.body, ctaLabel: c.cta_label, ctaUrl: c.cta_url })

/** The products a campaign shows, in the order chosen, active ones only. */
export async function campaignProducts(db: SupabaseClient, tenantId: string, ids: string[]): Promise<CampaignProduct[]> {
  if (!ids.length) return []
  const { data, error } = await db.from('products').select('id, name, price, images').eq('tenant_id', tenantId).eq('status', 'active').in('id', ids)
  if (error) throw error
  const byId = new Map((data ?? []).map((p) => [p.id, p]))
  return ids.flatMap((id) => {
    const p = byId.get(id)
    if (!p) return []
    const images = Array.isArray(p.images) ? (p.images as { url?: string }[]) : []
    return [{ id: p.id, name: p.name, price: Number(p.price), image: images[0]?.url ?? null }]
  })
}

/** Subscribed, consenting people on these lists, now. */
export async function audienceCounts(db: SupabaseClient, tenantId: string) {
  const { data, error } = await db.from('newsletter_subscribers').select('source')
    .eq('tenant_id', tenantId).is('unsubscribed_at', null).not('consented_at', 'is', null)
  if (error) throw error
  const counts = Object.fromEntries(Object.keys(AUDIENCES).map((k) => [k, 0])) as Record<string, number>
  for (const r of data ?? []) if (isAudience(r.source)) counts[r.source] += 1
  return counts
}

async function refresh(db: SupabaseClient, c: CampaignRow): Promise<Progress> {
  const { data, error } = await db.from('email_campaign_recipients').select('status').eq('campaign_id', c.id)
  if (error) throw error
  const n = (s: string) => (data ?? []).filter((r) => r.status === s).length
  const remaining = n('queued')
  const done = c.status === 'sending' && remaining === 0
  const update = { sent: n('sent'), failed: n('failed'), ...(done ? { status: 'sent' as const, sent_at: new Date().toISOString() } : {}) }
  const { error: e } = await db.from('email_campaigns').update(update).eq('id', c.id)
  if (e) throw e
  return { status: done ? 'sent' : c.status, recipients: c.recipients, sent: update.sent, failed: update.failed, remaining, paused: null }
}

/**
 * One step of sending. The first call checks the campaign, takes the
 * recipient list (who's on the chosen lists and still subscribed) and marks it
 * sending; every call sends up to BATCH queued emails. Call again until
 * `remaining` is 0. A quota or key problem pauses (`paused` says why) without
 * losing anyone: call again later and it carries on.
 */
export async function sendCampaignStep(deps: {
  db: SupabaseClient; sender: EmailSender; from: string; replyTo: string | null; site: string; campaignId: string; tenantId: string
}): Promise<Progress> {
  const { db, sender, site } = deps
  const { data: c, error } = await db.from('email_campaigns').select('*').eq('id', deps.campaignId).eq('tenant_id', deps.tenantId).maybeSingle<CampaignRow>()
  if (error) throw error
  if (!c) throw new Error('not_found')
  if (c.status === 'sent') return { status: 'sent', recipients: c.recipients, sent: c.sent, failed: c.failed, remaining: 0, paused: null }

  if (c.status === 'draft') {
    const problems = campaignProblems({ ...content(c), audience: c.audience }, site)
    if (problems.length) throw new Error(`not_ready:${problems.join(' ')}`)
    const { data: subs, error: se } = await db.from('newsletter_subscribers').select('id, email')
      .eq('tenant_id', c.tenant_id).in('source', c.audience).is('unsubscribed_at', null).not('consented_at', 'is', null)
    if (se) throw se
    // One email per address, even if it's on two lists.
    const seen = new Set<string>()
    const rows = (subs ?? []).filter((s) => !seen.has(s.email.toLowerCase()) && seen.add(s.email.toLowerCase()))
      .map((s) => ({ campaign_id: c.id, subscriber_id: s.id, tenant_id: c.tenant_id, email: s.email }))
    if (rows.length) {
      const { error: ie } = await db.from('email_campaign_recipients').upsert(rows, { onConflict: 'campaign_id,subscriber_id', ignoreDuplicates: true })
      if (ie) throw ie
    }
    // Only one call wins the draft → sending switch.
    const { data: started, error: ue } = await db.from('email_campaigns')
      .update({ status: 'sending', sending_at: new Date().toISOString(), recipients: rows.length })
      .eq('id', c.id).eq('status', 'draft').select('id').maybeSingle()
    if (ue) throw ue
    if (started) { c.status = 'sending'; c.recipients = rows.length }
    else return refresh(db, { ...c, status: 'sending' })
  }

  const products = await campaignProducts(db, c.tenant_id, c.product_ids ?? [])
  const { data: queue, error: qe } = await db.from('email_campaign_recipients').select('subscriber_id, email, attempts')
    .eq('campaign_id', c.id).eq('status', 'queued').limit(BATCH)
  if (qe) throw qe

  let paused: string | null = null
  for (const r of queue ?? []) {
    // Still subscribed right now, and which list they came from (for the footer).
    const { data: sub, error: e1 } = await db.from('newsletter_subscribers').select('source, unsubscribe_token, unsubscribed_at').eq('id', r.subscriber_id).maybeSingle()
    if (e1) throw e1
    if (!sub || sub.unsubscribed_at) {
      await db.from('email_campaign_recipients').update({ status: 'skipped', last_error: 'unsubscribed before sending' }).eq('campaign_id', c.id).eq('subscriber_id', r.subscriber_id)
      continue
    }
    const unsubscribeUrl = `${site}/unsubscribe?token=${sub.unsubscribe_token}`
    const reason = isAudience(sub.source) ? AUDIENCES[sub.source].reason : 'you signed up for Final Heaven emails'
    const email = renderCampaign(content(c), { products, site, unsubscribeUrl, reason })
    try {
      const { id } = await deps.sender.send({
        from: deps.from, to: [r.email], replyTo: deps.replyTo, subject: email.subject, html: email.html, text: email.text,
        tags: [{ name: 'campaign', value: c.id.replace(/-/g, '') }],
        headers: {
          'List-Unsubscribe': `<${site}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }, `campaign:${c.id}:${r.subscriber_id}`)
      await db.from('email_campaign_recipients').update({ status: 'sent', provider_message_id: id, sent_at: new Date().toISOString(), attempts: r.attempts + 1, last_error: null })
        .eq('campaign_id', c.id).eq('subscriber_id', r.subscriber_id)
    } catch (e) {
      const err = e instanceof EmailError ? e : new EmailError(String((e as Error).message), true)
      if (err.retryable) {
        // Quota, rate or key trouble: stop here, keep them queued, try again later.
        await db.from('email_campaign_recipients').update({ attempts: r.attempts + 1, last_error: err.message.slice(0, 500) }).eq('campaign_id', c.id).eq('subscriber_id', r.subscriber_id)
        paused = err.status === 429 ? 'Resend’s sending limit was reached (the free plan sends 100 a day). Carry on later.' : `Resend refused (${err.message}). Check the API key and the domain, then carry on.`
        break
      }
      await db.from('email_campaign_recipients').update({ status: 'failed', attempts: r.attempts + 1, last_error: err.message.slice(0, 500) }).eq('campaign_id', c.id).eq('subscriber_id', r.subscriber_id)
    }
    await new Promise((res) => setTimeout(res, PAUSE_MS))
  }
  const progress = await refresh(db, c)
  return { ...progress, paused }
}
