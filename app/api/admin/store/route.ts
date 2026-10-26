import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, money, readJson, requestIdOf, text } from '@/lib/api'
import { paymentsState, storeToday } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

/** A real calendar day as YYYY-MM-DD (rejects 2026-02-31). */
function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v)
}
const COLUMNS = 'payments_open_on, purchases_paused, gift_category, gift_min_subtotal'

// The store's selling switches: its launch day, a pause on all purchases and
// the free gift with orders (a category of pieces, and the spend that earns one).
// Checkout reads them on every request (lib/checkout/supabase-store), so a
// change applies at once. Per-product pauses are on the products API.

function selling(row: { payments_open_on: string | null; purchases_paused: boolean; gift_category: string | null; gift_min_subtotal: number | string }) {
  const switches = { paymentsOpenOn: row.payments_open_on, purchasesPaused: row.purchases_paused }
  return {
    ...switches, today: storeToday(), payments: paymentsState(switches, storeToday()),
    giftCategory: row.gift_category, giftMinSubtotal: Number(row.gift_min_subtotal),
  }
}

export const GET = handle('admin.store.get', async () => {
  const { staff, denied } = await requirePermission('settings.manage')
  if (denied) return denied
  if (!staff.tenant.storeId) throw new BadRequest('This business has no active store.')

  const { data, error } = await staff.supabase.from('stores').select(COLUMNS)
    .eq('id', staff.tenant.storeId).eq('tenant_id', staff.tenant.tenantId).single()
  if (error) throw error
  return NextResponse.json(selling(data), { headers: { 'Cache-Control': 'private, no-store' } })
})

export const PUT = handle('admin.store.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('settings.manage')
  if (denied) return denied
  if (!staff.tenant.storeId) throw new BadRequest('This business has no active store.')

  const body = await readJson(req, 2_000)
  const updates: Record<string, unknown> = {}
  if ('payments_open_on' in body) {
    const day = body.payments_open_on
    if (day !== null && !isDay(day)) throw new BadRequest('Launch day must be a date (YYYY-MM-DD), or empty.')
    updates.payments_open_on = day
  }
  if ('purchases_paused' in body) {
    if (typeof body.purchases_paused !== 'boolean') throw new BadRequest('Pause must be on or off.')
    updates.purchases_paused = body.purchases_paused
  }
  if ('gift_category' in body) updates.gift_category = text(body.gift_category, 'Gift category', { max: 60 }) || null
  if ('gift_min_subtotal' in body) updates.gift_min_subtotal = money(body.gift_min_subtotal ?? 0, 'Minimum order for a gift')
  if (!Object.keys(updates).length) throw new BadRequest('Nothing to update.')

  const { data, error } = await staff.supabase.from('stores')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', staff.tenant.storeId).eq('tenant_id', staff.tenant.tenantId)
    .select(COLUMNS).maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'You can’t change this store.' }, { status: 403 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'store.selling_updated', entityType: 'store', entityId: staff.tenant.storeId,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: updates })
  return NextResponse.json(selling(data))
})
