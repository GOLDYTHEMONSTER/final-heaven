import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf, text, url } from '@/lib/api'
import { slugify } from '@/lib/collections'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMNS = 'id, name, slug, description, logo_url, website, status, created_at'
const duplicate = (error: { code?: string } | null) => error?.code === '23505'

function brandFields(body: Record<string, unknown>, partial: boolean) {
  const has = (key: string) => !partial || key in body
  const out: Record<string, unknown> = {}
  if (has('name')) out.name = text(body.name, 'Name', { max: 80, required: true })
  if (has('slug') || (!partial && out.name)) {
    const slug = slugify(String(body.slug || out.name || ''))
    if (!slug) throw new BadRequest('The label needs a name with letters or numbers.')
    out.slug = slug
  }
  if (has('description')) out.description = text(body.description, 'Description', { max: 600 })
  if (has('logo_url')) out.logo_url = url(body.logo_url, 'Logo')
  if (has('website')) out.website = url(body.website, 'Website')
  if (has('status')) {
    if (body.status !== 'draft' && body.status !== 'published') throw new BadRequest('Status must be draft or published.')
    out.status = body.status
  }
  return out
}

/** Independent labels, with how many products each has. Staff-only edits; the public sees published ones. */
export const GET = handle('admin.brands.list', async () => {
  const { staff, denied } = await requirePermission('products.read')
  if (denied) return denied
  const [brands, products] = await Promise.all([
    staff.supabase.from('brands').select(COLUMNS).eq('tenant_id', staff.tenant.tenantId).order('name'),
    staff.supabase.from('products').select('brand_id').eq('tenant_id', staff.tenant.tenantId).not('brand_id', 'is', null),
  ])
  if (brands.error) throw brands.error
  if (products.error) throw products.error
  const counts = new Map<string, number>()
  for (const p of products.data ?? []) counts.set(p.brand_id, (counts.get(p.brand_id) ?? 0) + 1)
  return NextResponse.json({
    brands: (brands.data ?? []).map((b) => ({ ...b, products: counts.get(b.id) ?? 0 })),
    canWrite: staff.can('products.write'),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const POST = handle('admin.brands.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied
  if (!staff.tenant.storeId) throw new BadRequest('This business has no active store.')
  const body = await readJson(req, 8_000)
  const { data, error } = await staff.supabase.from('brands')
    .insert({ ...brandFields(body, false), tenant_id: staff.tenant.tenantId, store_id: staff.tenant.storeId })
    .select(COLUMNS).single()
  if (duplicate(error)) throw new BadRequest('A label with that name already exists.')
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: 'brand.created', entityType: 'brand', entityId: data.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { name: data.name } })
  return NextResponse.json({ brand: { ...data, products: 0 } }, { status: 201 })
})

export const PUT = handle('admin.brands.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied
  const body = await readJson(req, 8_000)
  if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new BadRequest('Label ID is required.')
  const updates = brandFields(body, true)
  if (!Object.keys(updates).length) throw new BadRequest('Nothing to update.')
  const { data, error } = await staff.supabase.from('brands').update(updates)
    .eq('id', body.id).eq('tenant_id', staff.tenant.tenantId).select(COLUMNS).maybeSingle()
  if (duplicate(error)) throw new BadRequest('A label with that name already exists.')
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Label not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'brand.updated', entityType: 'brand', entityId: data.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { fields: Object.keys(updates) } })
  return NextResponse.json({ brand: data })
})

/** Removes a label. Its products stay, without a label. */
export const DELETE = handle('admin.brands.delete', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!UUID.test(id)) throw new BadRequest('Label ID is required.')
  const { data, error } = await staff.supabase.from('brands').delete().eq('id', id).eq('tenant_id', staff.tenant.tenantId).select('id, name')
  if (error) throw error
  if (!data?.length) return NextResponse.json({ error: 'Label not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'brand.deleted', entityType: 'brand', entityId: id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { name: data[0].name } })
  return NextResponse.json({ message: 'Label removed' })
})
