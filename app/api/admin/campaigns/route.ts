import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf } from '@/lib/api'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { emailConfigFromEnv } from '@/lib/email'
import { LIMITS, isAudience } from '@/lib/email/campaign'
import { audienceCounts } from '@/lib/email/campaign-send'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID = /^[A-Za-z0-9_-]{1,64}$/
const COLUMNS = 'id, subject, preheader, heading, body, cta_label, cta_url, product_ids, audience, status, recipients, sent, failed, created_at, updated_at, sending_at, sent_at'

/** A draft's fields from the request, checked. Only what's present is returned. */
function campaignFields(body: Record<string, unknown>) {
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
  if ('productIds' in body) {
    const ids = body.productIds
    if (!Array.isArray(ids) || ids.length > LIMITS.products || !ids.every((x) => typeof x === 'string' && ID.test(x))) throw new BadRequest(`Choose up to ${LIMITS.products} products.`)
    out.product_ids = [...new Set(ids)]
  }
  if ('audience' in body) {
    const a = body.audience
    if (!Array.isArray(a) || !a.every(isAudience)) throw new BadRequest('Unknown list.')
    out.audience = [...new Set(a)]
  }
  return out
}

/** Campaigns, who's on each list, and whether sending is set up. */
export const GET = handle('admin.campaigns.list', async () => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  const { data, error } = await staff.supabase.from('email_campaigns').select(COLUMNS)
    .eq('tenant_id', staff.tenant.tenantId).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  const config = emailConfigFromEnv()
  return NextResponse.json({
    campaigns: data ?? [],
    audiences: await audienceCounts(createSupabaseServiceClient(), staff.tenant.tenantId),
    email: { ready: Boolean(config), from: config?.from ?? null, testTo: staff.email },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const POST = handle('admin.campaigns.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  const body = await readJson(req, 20_000)
  const { data, error } = await staff.supabase.from('email_campaigns')
    .insert({ ...campaignFields(body), tenant_id: staff.tenant.tenantId, created_by: staff.userId })
    .select(COLUMNS).single()
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: 'campaign.created', entityType: 'email_campaign', entityId: data.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { subject: data.subject } })
  return NextResponse.json({ campaign: data }, { status: 201 })
})

/** Saves a draft. Campaigns that have started sending can't change (RLS refuses too). */
export const PUT = handle('admin.campaigns.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('marketing.send')
  if (denied) return denied
  const body = await readJson(req, 20_000)
  if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new BadRequest('Campaign ID is required.')
  const updates = campaignFields(body)
  if (!Object.keys(updates).length) throw new BadRequest('Nothing to update.')
  const { data, error } = await staff.supabase.from('email_campaigns').update(updates)
    .eq('id', body.id).eq('tenant_id', staff.tenant.tenantId).eq('status', 'draft').select(COLUMNS).maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'That campaign has already been sent, so it can’t be changed.' }, { status: 409 })
  return NextResponse.json({ campaign: data })
})
