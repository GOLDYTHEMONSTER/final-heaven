import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, int, readJson, requestIdOf, text, url } from '@/lib/api'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

const STATUSES = ['draft', 'scheduled', 'published', 'archived']
const ID = /^[A-Za-z0-9_-]{1,64}$/

const textList = (value: unknown, field: string) => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 100) throw new BadRequest(`${field} must be a list of up to 100 items.`)
  return value.map((v) => text(v, field, { max: 100, required: true })!)
}

/** Validates and whitelists drop columns; `partial` keeps only keys present in the body. */
function dropColumns(body: Record<string, unknown>, partial: boolean) {
  const has = (key: string) => !partial || key in body
  const out: Record<string, unknown> = {}

  if (has('name')) out.name = text(body.name, 'Name', { max: 200, required: true })
  if (has('description')) out.description = text(body.description, 'Description', { max: 5000 })
  if (has('release_date')) {
    const date = text(body.release_date, 'Release date', { max: 10, required: true })!
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest('Release date must be YYYY-MM-DD.')
    out.release_date = date
  }
  if (has('release_time')) {
    const time = text(body.release_time, 'Release time', { max: 8, required: true })!
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) throw new BadRequest('Release time must be HH:MM.')
    out.release_time = time
  }
  if (has('status')) {
    const status = body.status ?? 'draft'
    if (typeof status !== 'string' || STATUSES.indexOf(status) === -1) {
      throw new BadRequest(`Status must be one of: ${STATUSES.join(', ')}.`)
    }
    out.status = status
  }
  if (has('preview_image')) out.preview_image = url(body.preview_image, 'Preview image')
  if (has('members_only')) out.members_only = body.members_only === true
  if (has('early_access_hours')) out.early_access_hours = int(body.early_access_hours ?? 24, 'Early access hours', { min: 0, max: 720 })
  if (has('products')) out.products = textList(body.products, 'Products')
  if (has('tags')) out.tags = textList(body.tags, 'Tags')
  return out
}

export const GET = handle('admin.drops.list', async () => {
  const { staff, denied } = await requirePermission('products.read')
  if (denied) return denied

  const { data, error } = await staff.supabase.from('drops').select('*')
    .eq('tenant_id', staff.tenant.tenantId).order('release_date', { ascending: false })
  if (error) throw error
  return NextResponse.json({ drops: data || [] })
})

export const POST = handle('admin.drops.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied
  if (!staff.tenant.storeId) throw new BadRequest('This business has no active store.')

  const body = await readJson(req)
  if (typeof body.id !== 'string' || !ID.test(body.id)) throw new BadRequest('Drop ID is required.')
  const { data, error } = await staff.supabase
    .from('drops')
    .insert({ id: body.id, ...dropColumns(body, false), tenant_id: staff.tenant.tenantId, store_id: staff.tenant.storeId })
    .select()
    .single()
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: 'drop.created', entityType: 'drop', entityId: body.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req) })
  return NextResponse.json({ drop: data }, { status: 201 })
})

export const PUT = handle('admin.drops.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const body = await readJson(req)
  if (typeof body.id !== 'string' || !ID.test(body.id)) throw new BadRequest('Drop ID is required.')
  const updates = dropColumns(body, true)
  if (!Object.keys(updates).length) throw new BadRequest('Nothing to update.')

  const { data, error } = await staff.supabase
    .from('drops')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .eq('tenant_id', staff.tenant.tenantId)
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Drop not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'drop.updated', entityType: 'drop', entityId: body.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { fields: Object.keys(updates) } })
  return NextResponse.json({ drop: data })
})

export const DELETE = handle('admin.drops.delete', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!ID.test(id)) throw new BadRequest('Drop ID is required.')

  const { data, error } = await staff.supabase.from('drops').delete()
    .eq('id', id).eq('tenant_id', staff.tenant.tenantId).select('id')
  if (error) throw error
  if (!data?.length) return NextResponse.json({ error: 'Drop not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'drop.deleted', entityType: 'drop', entityId: id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req) })
  return NextResponse.json({ message: 'Drop deleted' })
})
