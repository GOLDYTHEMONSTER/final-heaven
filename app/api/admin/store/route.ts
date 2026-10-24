import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf } from '@/lib/api'
import { paymentsState, storeToday } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const COLUMNS = 'payments_open_on, purchases_paused'

// The store's selling switches: its launch day and a pause on all purchases.
// Checkout reads them on every request (lib/checkout/supabase-store), so a
// change applies at once. Per-product pauses are on the products API.

function selling(row: { payments_open_on: string | null; purchases_paused: boolean }) {
  const switches = { paymentsOpenOn: row.payments_open_on, purchasesPaused: row.purchases_paused }
  return { ...switches, today: storeToday(), payments: paymentsState(switches, storeToday()) }
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
    if (day !== null && (typeof day !== 'string' || !DATE.test(day))) throw new BadRequest('Launch day must be a date (YYYY-MM-DD), or empty.')
    updates.payments_open_on = day
  }
  if ('purchases_paused' in body) {
    if (typeof body.purchases_paused !== 'boolean') throw new BadRequest('Pause must be on or off.')
    updates.purchases_paused = body.purchases_paused
  }
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
