import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf } from '@/lib/api'
import { supplierFields } from '@/lib/sourcing'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const duplicate = (error: { code?: string } | null) => error?.code === '23505'

/** Suppliers with how many products each one supplies. Staff-only (lib/sourcing). */
export const GET = handle('admin.suppliers.list', async () => {
  const { staff, denied } = await requirePermission('products.read')
  if (denied) return denied

  const [suppliers, sources] = await Promise.all([
    staff.supabase.from('suppliers').select('id, name, platform, url, contact, notes, created_at')
      .eq('tenant_id', staff.tenant.tenantId).order('name'),
    staff.supabase.from('product_sources').select('supplier_id').eq('tenant_id', staff.tenant.tenantId).not('supplier_id', 'is', null),
  ])
  if (suppliers.error) throw suppliers.error
  if (sources.error) throw sources.error
  const counts = new Map<string, number>()
  for (const s of sources.data ?? []) counts.set(s.supplier_id, (counts.get(s.supplier_id) ?? 0) + 1)
  return NextResponse.json({
    suppliers: (suppliers.data ?? []).map((s) => ({ ...s, products: counts.get(s.id) ?? 0 })),
    canWrite: staff.can('products.write'),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const POST = handle('admin.suppliers.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const body = await readJson(req, 8_000)
  const { data, error } = await staff.supabase.from('suppliers')
    .insert({ ...supplierFields(body, false), tenant_id: staff.tenant.tenantId })
    .select('id, name, platform, url, contact, notes, created_at').single()
  if (duplicate(error)) throw new BadRequest('A supplier with that name already exists.')
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: 'supplier.created', entityType: 'supplier', entityId: data.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { name: data.name } })
  return NextResponse.json({ supplier: { ...data, products: 0 } }, { status: 201 })
})

export const PUT = handle('admin.suppliers.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const body = await readJson(req, 8_000)
  if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new BadRequest('Supplier ID is required.')
  const updates = supplierFields(body, true)
  if (!Object.keys(updates).length) throw new BadRequest('Nothing to update.')
  const { data, error } = await staff.supabase.from('suppliers').update(updates)
    .eq('id', body.id).eq('tenant_id', staff.tenant.tenantId)
    .select('id, name, platform, url, contact, notes, created_at').maybeSingle()
  if (duplicate(error)) throw new BadRequest('A supplier with that name already exists.')
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'supplier.updated', entityType: 'supplier', entityId: data.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { fields: Object.keys(updates) } })
  return NextResponse.json({ supplier: data })
})

/** Removes a supplier. Its products keep their listing links and costs; only the supplier is cleared. */
export const DELETE = handle('admin.suppliers.delete', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!UUID.test(id)) throw new BadRequest('Supplier ID is required.')
  const { data, error } = await staff.supabase.from('suppliers').delete()
    .eq('id', id).eq('tenant_id', staff.tenant.tenantId).select('id, name')
  if (error) throw error
  if (!data?.length) return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'supplier.deleted', entityType: 'supplier', entityId: id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { name: data[0].name } })
  return NextResponse.json({ message: 'Supplier removed' })
})
