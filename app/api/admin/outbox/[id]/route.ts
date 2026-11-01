import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf } from '@/lib/api'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { AUDIENCES, LIMITS, campaignProblems, isAudience, renderCampaign } from '@/lib/email/campaign'
import { campaignProducts } from '@/lib/email/campaign-send'
import { BATCH_COLUMNS, approveTemplate, batchContent, copyHash, welcomeTemplate, type BatchRow } from '@/lib/email/batches-store'
import { emailUsage, quotaImpact } from '@/lib/email/budget'
import { TRIGGERS, triggerContent } from '@/lib/email/reachout'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAMPLE = 10

/** The copy fields in a request, checked. Only what's present is returned. */
function copyFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  const text = (key: string, column: string, max: number, nullable = false) => {
    if (!(key in body)) return
    const v = body[key]
    if (v == null || v === '') { out[column] = nullable ? null : ''; return }
    if (typeof v !== 'string') throw new BadRequest(`${key} must be text.`)
    if (v.length > max) throw new BadRequest(`${key} is too long (${max} characters at most).`)
    out[column] = v
  }
  text('subject', 'subject', LIMITS.subject)
  text('preheader', 'preheader', LIMITS.preheader)
  text('heading', 'heading', LIMITS.heading)
  text('body', 'body', LIMITS.body)
  text('ctaLabel', 'cta_label', LIMITS.ctaLabel, true)
  text('ctaUrl', 'cta_url', LIMITS.ctaUrl, true)
  if (typeof out.cta_url === 'string' && !/^(https:\/\/|\/)/.test(out.cta_url)) throw new BadRequest('The button link must start with https:// or /.')
  return out
}

/** One batch: the email as it will arrive, who gets it, why, and what it costs in quota. */
export const GET = handle('admin.outbox.get', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Unknown batch.' }, { status: 404 })
  const tenantId = staff.tenant.tenantId
  const { data, error } = await staff.supabase.from('email_batches').select(BATCH_COLUMNS).eq('id', params.id).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Unknown batch.' }, { status: 404 })
  const b = data as BatchRow

  const { data: rows, error: re } = await staff.supabase.from('email_batch_recipients').select('email, product_id, why, status').eq('batch_id', b.id).order('created_at').limit(20_000)
  if (re) throw re
  const all = rows ?? []
  const queued = all.filter((r) => r.status === 'queued')
  const sample = (queued.length ? queued : all).slice(0, SAMPLE)

  const service = createSupabaseServiceClient()
  const usage = await emailUsage(service, tenantId)
  let ahead = 0
  if (b.status === 'held') {
    const { count, error: ce } = await service.from('email_batch_recipients').select('batch_id, email_batches!inner(status)', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'queued').in('email_batches.status', ['approved', 'sending'])
    if (ce) throw ce
    ahead = count ?? 0
  }

  const site = (process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  const products = await campaignProducts(service, tenantId, sample[0]?.product_id ? [sample[0].product_id] : (b.product_ids ?? []))
  const html = renderCampaign(batchContent(b), {
    products, site, unsubscribeUrl: `${site}/unsubscribe`, reason: isAudience(b.list) ? AUDIENCES[b.list].reason : 'you signed up for Final Heaven emails',
  }).html

  return NextResponse.json({
    batch: { ...b, code: TRIGGERS[b.trigger]?.code ?? '', label: TRIGGERS[b.trigger]?.label ?? b.trigger, listLabel: isAudience(b.list) ? AUDIENCES[b.list].label : null },
    recipients: { total: all.length, queued: queued.length, sent: all.filter((r) => r.status === 'sent').length },
    sample: sample.map((r) => ({ email: r.email, why: r.why })),
    quota: quotaImpact(queued.length, usage, ahead),
    problems: campaignProblems({ ...batchContent(b), audience: [b.list ?? 'footer'] }, site),
    html,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/** Approve or skip a waiting batch. Approving stamps who and when; nothing marketing goes without it. */
export const POST = handle('admin.outbox.decide', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Unknown batch.' }, { status: 404 })
  const body = await readJson(req, 500)
  const tenantId = staff.tenant.tenantId
  if (body.action !== 'approve' && body.action !== 'skip') throw new BadRequest('Choose approve or skip.')

  const { data, error } = await staff.supabase.from('email_batches').select(BATCH_COLUMNS).eq('id', params.id).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Unknown batch.' }, { status: 404 })
  const b = data as BatchRow
  const service = createSupabaseServiceClient()

  if (body.action === 'skip') {
    const { data: skipped, error: ue } = await staff.supabase.from('email_batches').update({ status: 'skipped' })
      .eq('id', b.id).eq('tenant_id', tenantId).in('status', ['held', 'approved']).select('id').maybeSingle()
    if (ue) throw ue
    if (!skipped) return NextResponse.json({ error: 'That batch has already started sending or been decided.' }, { status: 409 })
    const { error: re } = await service.from('email_batch_recipients').update({ status: 'skipped', last_error: 'batch skipped' }).eq('batch_id', b.id).eq('status', 'queued')
    if (re) throw re
    await audit({ tenantId, action: 'outbox.skipped', entityType: 'email_batch', entityId: b.id, actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { trigger: b.trigger } })
    return NextResponse.json({ ok: true })
  }

  if (b.status !== 'held') return NextResponse.json({ error: 'Only a waiting batch can be approved.' }, { status: 409 })
  const problems = campaignProblems({ ...batchContent(b), audience: [b.list ?? 'footer'] })
  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 })
  const { count, error: ce } = await service.from('email_batch_recipients').select('subscriber_id', { count: 'exact', head: true }).eq('batch_id', b.id).eq('status', 'queued')
  if (ce) throw ce
  if (!count) return NextResponse.json({ error: 'Nobody is in this batch.' }, { status: 400 })

  const { data: approved, error: ae } = await staff.supabase.from('email_batches')
    .update({ status: 'approved', approved_by: staff.userId, approved_at: new Date().toISOString() })
    .eq('id', b.id).eq('tenant_id', tenantId).eq('status', 'held').select('id').maybeSingle()
  if (ae) throw ae
  if (!approved) return NextResponse.json({ error: 'That batch was changed. Open it again.' }, { status: 409 })
  // Approving the welcome as written also approves it for new sign-ups, until its words change.
  // Either version counts: the plain welcome, or the early access one sent before checkout opens.
  if ((b.trigger === 'welcome' || b.trigger === 'welcome_backfill')
    && [false, true].some((early) => copyHash(batchContent(b)) === copyHash(triggerContent(b.trigger, b.list, early)))) {
    await approveTemplate(service, tenantId, welcomeTemplate(b.list), batchContent(b), staff.userId)
  }
  await audit({ tenantId, action: 'outbox.approved', entityType: 'email_batch', entityId: b.id, actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { trigger: b.trigger, recipients: count } })
  return NextResponse.json({ ok: true })
})

/** Rewords a waiting or approved batch. Editing an approved batch puts it back on hold (the database does it). */
export const PUT = handle('admin.outbox.edit', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Unknown batch.' }, { status: 404 })
  const updates = copyFields(await readJson(req, 20_000))
  if (!Object.keys(updates).length) throw new BadRequest('Nothing to update.')
  const { data, error } = await staff.supabase.from('email_batches').update(updates)
    .eq('id', params.id).eq('tenant_id', staff.tenant.tenantId).in('status', ['held', 'approved']).select(BATCH_COLUMNS).maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'That batch has already started sending, so it can’t be changed.' }, { status: 409 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'outbox.edited', entityType: 'email_batch', entityId: params.id, actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req) })
  return NextResponse.json({ batch: data })
})
