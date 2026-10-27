import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf, text, url } from '@/lib/api'
import { perUnitCost, rateState } from '@/lib/shipping/engine'
import { toRate } from '@/lib/shipping/store'
import { classFields, date, oneOf, rateFields, settingsFields, uuid } from '@/lib/shipping/admin'
import { storeToday } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

/** Rates (with whether each is in force), the recovery policy and the shipping classes. */
export const GET = handle('admin.shipping.rates', async () => {
  const { staff, denied } = await requirePermission('shipping.read')
  if (denied) return denied
  const t = staff.tenant.tenantId
  const [rates, settings, classes] = await Promise.all([
    staff.supabase.from('shipping_rates').select('*').eq('tenant_id', t).order('effective_from', { ascending: false }),
    staff.supabase.from('shipping_settings').select('*').eq('tenant_id', t).maybeSingle(),
    staff.supabase.from('shipping_classes').select('*').eq('tenant_id', t).order('sort'),
  ])
  for (const r of [rates, settings, classes]) if (r.error) throw r.error
  const today = storeToday()
  return NextResponse.json({
    today,
    rates: (rates.data ?? []).map((r) => {
      const rate = toRate(r)
      const unit = perUnitCost(rate)
      return { ...r, state: rateState(rate, today), perUnitKobo: unit.kobo, perUnitParts: unit.parts, warnings: unit.warnings }
    }),
    settings: settings.data, classes: classes.data ?? [],
    can: { manage: staff.can('shipping.manage') },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/** Adds a rate. With `replaces`, the old rate ends the day before and is marked superseded. */
export const POST = handle('admin.shipping.rates.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('shipping.manage')
  if (denied) return denied
  const body = await readJson(req, 16_000)
  const t = staff.tenant.tenantId
  // A quick update: the rate it replaces, with only the price, exchange rate or start date changed.
  if (body.update && typeof body.update === 'object') {
    const { data: old, error: e } = await staff.supabase.from('shipping_rates').select('*').eq('id', uuid(body.replaces, 'Rate to update')).eq('tenant_id', t).maybeSingle()
    if (e) throw e
    if (!old) return NextResponse.json({ error: 'Rate not found.' }, { status: 404 })
    const u = body.update as Record<string, unknown>
    Object.assign(body, old, { effective_to: null, status: 'active' },
      'rate_per_unit' in u ? { rate_per_unit: u.rate_per_unit } : {}, 'fx_rate' in u ? { fx_rate: u.fx_rate } : {},
      { effective_from: u.effective_from ?? storeToday(), replaces: old.id, confirmed: body.confirmed })
  }
  const fields = rateFields(body)
  const { data, error } = await staff.supabase.from('shipping_rates').insert({ ...fields, tenant_id: t }).select().single()
  if (error) throw error
  if (body.replaces) {
    const old = uuid(body.replaces, 'Rate to replace')
    const dayBefore = new Date(Date.parse(`${fields.effective_from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    const { data: prev, error: e } = await staff.supabase.from('shipping_rates').select('effective_from, effective_to').eq('id', old).eq('tenant_id', t).maybeSingle()
    if (e) throw e
    if (prev) {
      const end = prev.effective_to && prev.effective_to < dayBefore ? prev.effective_to : dayBefore < prev.effective_from ? prev.effective_from : dayBefore
      const { error: u } = await staff.supabase.from('shipping_rates').update({ status: 'superseded', superseded_by: data.id, effective_to: end }).eq('id', old).eq('tenant_id', t)
      if (u) throw u
    }
  }
  await audit({ tenantId: t, action: 'shipping.rate_added', entityType: 'shipping_rate', entityId: data.id, actor: { type: 'user', userId: staff.userId },
    requestId: requestIdOf(req), metadata: { method: data.method, provider: data.provider, rate: data.rate_per_unit, currency: data.currency, from: data.effective_from, replaces: body.replaces ?? null } })
  return NextResponse.json({ rate: data }, { status: 201 })
})

/**
 * Changes a rate's status, end date, notes or link, or saves the policy and
 * classes. A rate's terms are never edited (the database refuses): add a new one.
 */
export const PUT = handle('admin.shipping.rates.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('shipping.manage')
  if (denied) return denied
  const body = await readJson(req, 32_000)
  const t = staff.tenant.tenantId
  const actor = { type: 'user' as const, userId: staff.userId }

  if (body.settings) {
    const s = settingsFields(body.settings as Record<string, unknown>)
    const { error } = await staff.supabase.from('shipping_settings').upsert({ ...s, tenant_id: t, updated_by: staff.userId, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
    if (error) throw error
    await audit({ tenantId: t, action: 'shipping.settings_changed', entityType: 'shipping_settings', entityId: t, actor, requestId: requestIdOf(req), metadata: s })
  }
  if (Array.isArray(body.classes)) {
    if (body.classes.length > 12) throw new BadRequest('Up to 12 shipping classes.')
    const classes = body.classes.map((c) => classFields(c as Record<string, unknown>))
    if (new Set(classes.map((c) => c.key)).size !== classes.length) throw new BadRequest('Each class needs its own key.')
    const { data: existing, error: e } = await staff.supabase.from('shipping_classes').select('key').eq('tenant_id', t)
    if (e) throw e
    const gone = (existing ?? []).map((c) => c.key).filter((k) => !classes.some((c) => c.key === k))
    if (gone.length) {
      const { error } = await staff.supabase.from('shipping_classes').delete().eq('tenant_id', t).in('key', gone)
      if (error) throw error
    }
    if (classes.length) {
      const { error } = await staff.supabase.from('shipping_classes').upsert(classes.map((c) => ({ ...c, tenant_id: t, updated_at: new Date().toISOString() })), { onConflict: 'tenant_id,key' })
      if (error) throw error
    }
    await audit({ tenantId: t, action: 'shipping.classes_changed', entityType: 'shipping_classes', entityId: t, actor, requestId: requestIdOf(req), metadata: { classes } })
  }
  if (body.id) {
    const id = uuid(body.id, 'Rate')
    const updates: Record<string, unknown> = {}
    if ('status' in body) updates.status = oneOf(body.status, ['active', 'inactive'] as const, 'Status')
    if ('effective_to' in body) updates.effective_to = date(body.effective_to, 'Effective to')
    if ('notes' in body) updates.notes = text(body.notes, 'Notes', { max: 2000 })
    if ('document_url' in body) updates.document_url = url(body.document_url, 'Document link')
    if (!Object.keys(updates).length) throw new BadRequest('Nothing to update.')
    const { data, error } = await staff.supabase.from('shipping_rates').update(updates).eq('id', id).eq('tenant_id', t).select().maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Rate not found.' }, { status: 404 })
    await audit({ tenantId: t, action: 'shipping.rate_changed', entityType: 'shipping_rate', entityId: id, actor, requestId: requestIdOf(req), metadata: updates })
  }
  return NextResponse.json({ ok: true })
})
