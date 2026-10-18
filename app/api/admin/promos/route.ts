import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, int, money, readJson, requestIdOf, text } from '@/lib/api'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/
// Dates are the store's days (Lagos, UTC+1, no daylight saving): a code runs
// from the start of its first day to the end of its last.
const dayStart = (d: string) => `${d}T00:00:00+01:00`
const dayEnd = (d: string) => `${d}T23:59:59+01:00`

/** Promo codes with how often each was used on paid orders. */
export const GET = handle('admin.promos.list', async () => {
  const { staff, denied } = await requirePermission('products.read')
  if (denied) return denied

  const [codes, usage] = await Promise.all([
    staff.supabase.from('promo_codes').select('*').eq('tenant_id', staff.tenant.tenantId).order('created_at', { ascending: false }),
    staff.supabase.rpc('promo_usage', { p_tenant: staff.tenant.tenantId }),
  ])
  if (codes.error) throw codes.error
  if (usage.error) throw usage.error
  type Usage = { promo_code_id: string; uses: number; discount_total: number }
  const byId = new Map<string, Usage>(((usage.data ?? []) as Usage[]).map((u) => [u.promo_code_id, u]))
  return NextResponse.json({
    promos: (codes.data ?? []).map((p) => ({ ...p, uses: Number(byId.get(p.id)?.uses ?? 0), discount_total: Number(byId.get(p.id)?.discount_total ?? 0) })),
    canWrite: staff.can('products.write'),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/** Creates a code. The server applies it at checkout; nothing about it is trusted from the browser. */
export const POST = handle('admin.promos.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const body = await readJson(req, 4_000)
  const code = text(body.code, 'Code', { max: 30, required: true })!.toUpperCase()
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new BadRequest('Codes are 3–30 letters, numbers, - or _.')
  const kind = body.kind === 'fixed' ? 'fixed' : body.kind === 'percent' ? 'percent' : null
  if (!kind) throw new BadRequest('Choose percent or fixed amount.')
  const value = money(body.value, kind === 'percent' ? 'Percent off' : 'Amount off')
  if (value <= 0) throw new BadRequest('The discount must be more than zero.')
  if (kind === 'percent' && value > 100) throw new BadRequest('Percent off can’t be more than 100.')
  const minSubtotal = body.min_subtotal === '' || body.min_subtotal == null ? 0 : money(body.min_subtotal, 'Minimum order')
  const starts = text(body.starts_on, 'Start date', { max: 10 })
  const ends = text(body.ends_on, 'End date', { max: 10 })
  if ((starts && !DATE.test(starts)) || (ends && !DATE.test(ends))) throw new BadRequest('Dates must be YYYY-MM-DD.')
  if (starts && ends && ends < starts) throw new BadRequest('The end date is before the start date.')
  const maxUses = body.max_uses === '' || body.max_uses == null ? null : int(body.max_uses, 'Usage limit', { min: 1, max: 1_000_000 })

  const { data, error } = await staff.supabase.from('promo_codes').insert({
    tenant_id: staff.tenant.tenantId,
    code,
    description: text(body.description, 'Description', { max: 200 }),
    kind,
    value,
    min_subtotal: minSubtotal,
    starts_at: starts ? dayStart(starts) : null,
    ends_at: ends ? dayEnd(ends) : null,
    max_uses: maxUses,
    once_per_customer: body.once_per_customer !== false,
    created_by: staff.userId,
  }).select().single()
  if (error?.code === '23505') return NextResponse.json({ error: 'That code already exists.' }, { status: 409 })
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: 'promo.created', entityType: 'promo_code', entityId: code,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { kind, value, maxUses, starts, ends } })
  return NextResponse.json({ promo: data }, { status: 201 })
})

/** Switches a code on or off. Codes are never deleted, so past orders keep their record. */
export const PUT = handle('admin.promos.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const body = await readJson(req, 2_000)
  const id = text(body.id, 'Promo code', { max: 40, required: true })!
  if (typeof body.active !== 'boolean') throw new BadRequest('Say whether the code is active.')
  const { data, error } = await staff.supabase.from('promo_codes').update({ active: body.active })
    .eq('id', id).eq('tenant_id', staff.tenant.tenantId).select('code').maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Promo code not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: body.active ? 'promo.activated' : 'promo.deactivated', entityType: 'promo_code',
    entityId: data.code, actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req) })
  return NextResponse.json({ ok: true })
})
