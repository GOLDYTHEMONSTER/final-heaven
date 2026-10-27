import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Whether Hype is on for the staff member's store, and the most-hyped
 * products. `available: false` when the database isn't set up for Hype yet.
 */
export const GET = handle('admin.hype.get', async () => {
  const { staff, denied } = await requirePermission('settings.manage')
  if (denied) return denied
  if (!staff.tenant.storeId) throw new BadRequest('This business has no active store.')
  const [setting, top] = await Promise.all([
    staff.supabase.from('hype_settings').select('enabled, updated_at').eq('store_id', staff.tenant.storeId).maybeSingle(),
    staff.supabase.from('product_hype').select('product_id, score, rank, early, hypes, hypes_7d, peak_rank, products(name)')
      .eq('tenant_id', staff.tenant.tenantId).order('score', { ascending: false }).limit(10),
  ])
  if (setting.error) return NextResponse.json({ available: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  return NextResponse.json({
    available: true, enabled: setting.data?.enabled === true, updatedAt: setting.data?.updated_at ?? null, top: top.data ?? [],
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const PUT = handle('admin.hype.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('settings.manage')
  if (denied) return denied
  if (!staff.tenant.storeId) throw new BadRequest('This business has no active store.')
  const body = await readJson(req, 200)
  if (typeof body.enabled !== 'boolean') throw new BadRequest('Hype must be on or off.')
  const { error } = await staff.supabase.from('hype_settings').upsert({
    store_id: staff.tenant.storeId, tenant_id: staff.tenant.tenantId, enabled: body.enabled, updated_by: staff.userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'store_id' })
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: body.enabled ? 'store.hype_on' : 'store.hype_off', entityType: 'store', entityId: staff.tenant.storeId,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req) })
  return NextResponse.json({ enabled: body.enabled })
})
