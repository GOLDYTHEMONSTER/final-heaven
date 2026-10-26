import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, int, readJson, requestIdOf, text, url } from '@/lib/api'
import { parseRule, slugify } from '@/lib/collections'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/
const COLUMNS = 'id, title, slug, description, cover_image, rule, status, featured, sort_order, starts_at, ends_at, created_at, links:collection_products(product_id, position)'
const duplicate = (error: { code?: string } | null) => error?.code === '23505'

const when = (value: unknown, field: string) => {
  if (value === null || value === '' || value === undefined) return null
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new BadRequest(`${field} must be a date and time.`)
  return new Date(value).toISOString()
}

function collectionFields(body: Record<string, unknown>, partial: boolean) {
  const has = (key: string) => !partial || key in body
  const out: Record<string, unknown> = {}
  if (has('title')) out.title = text(body.title, 'Title', { max: 80, required: true })
  if (has('slug') || (!partial && out.title)) {
    const slug = slugify(String(body.slug || out.title || ''))
    if (!slug) throw new BadRequest('The collection needs a title with letters or numbers.')
    out.slug = slug
  }
  if (has('description')) out.description = text(body.description, 'Description', { max: 600 })
  if (has('cover_image')) out.cover_image = url(body.cover_image, 'Cover image')
  if (has('rule')) {
    out.rule = parseRule(body.rule)
    // The table caps a rule at 2,000 characters; say so rather than fail on the constraint.
    if (JSON.stringify(out.rule ?? null).length > 2000) throw new BadRequest('That rule is too long: use fewer categories or tags.')
  }
  if (has('status')) {
    if (body.status !== 'draft' && body.status !== 'published') throw new BadRequest('Status must be draft or published.')
    out.status = body.status
  }
  if (has('featured')) out.featured = body.featured === true
  if (has('sort_order')) out.sort_order = int(body.sort_order ?? 0, 'Order', { min: -1000, max: 1000 })
  if (has('starts_at')) out.starts_at = when(body.starts_at, 'Start')
  if (has('ends_at')) out.ends_at = when(body.ends_at, 'End')
  if (out.starts_at && out.ends_at && String(out.ends_at) <= String(out.starts_at)) throw new BadRequest('The end must be after the start.')
  return out
}

/** Hand-picked products, in the order given; null when the body doesn't set them. */
function productIds(body: Record<string, unknown>): string[] | null {
  if (!('product_ids' in body)) return null
  const v = body.product_ids
  if (!Array.isArray(v) || v.length > 300 || !v.every((id) => typeof id === 'string' && PRODUCT_ID.test(id))) {
    throw new BadRequest('Products must be a list of up to 300 product ids.')
  }
  return [...new Set(v as string[])]
}

/** Replaces a collection's hand-picked products. The database refuses another business's products. */
async function saveLinks(db: SupabaseClient, tenantId: string, collectionId: string, ids: string[]) {
  const del = await db.from('collection_products').delete().eq('collection_id', collectionId).eq('tenant_id', tenantId)
  if (del.error) throw del.error
  if (!ids.length) return
  const { error } = await db.from('collection_products')
    .insert(ids.map((product_id, position) => ({ collection_id: collectionId, product_id, tenant_id: tenantId, position })))
  if (error?.message?.includes('own business')) throw new BadRequest('A collection can only hold your own products.')
  if (error?.code === '23503') throw new BadRequest('One of those products no longer exists.')
  if (error) throw error
}

export const GET = handle('admin.collections.list', async () => {
  const { staff, denied } = await requirePermission('products.read')
  if (denied) return denied
  const { data, error } = await staff.supabase.from('collections').select(COLUMNS)
    .eq('tenant_id', staff.tenant.tenantId).order('sort_order').order('created_at')
  if (error) throw error
  return NextResponse.json({ collections: data ?? [], canWrite: staff.can('products.write') }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const POST = handle('admin.collections.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied
  if (!staff.tenant.storeId) throw new BadRequest('This business has no active store.')
  const body = await readJson(req, 32_000)
  const ids = productIds(body)
  const { data, error } = await staff.supabase.from('collections')
    .insert({ ...collectionFields(body, false), tenant_id: staff.tenant.tenantId, store_id: staff.tenant.storeId })
    .select('id').single()
  if (duplicate(error)) throw new BadRequest('A collection with that name already exists.')
  if (error) throw error
  if (ids) await saveLinks(staff.supabase, staff.tenant.tenantId, data.id, ids)
  const saved = await staff.supabase.from('collections').select(COLUMNS).eq('id', data.id).single()
  if (saved.error) throw saved.error
  await audit({ tenantId: staff.tenant.tenantId, action: 'collection.created', entityType: 'collection', entityId: data.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { title: saved.data.title, products: ids?.length ?? 0 } })
  return NextResponse.json({ collection: saved.data }, { status: 201 })
})

export const PUT = handle('admin.collections.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied
  const body = await readJson(req, 32_000)
  if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new BadRequest('Collection ID is required.')
  const updates = collectionFields(body, true)
  const ids = productIds(body)
  if (!Object.keys(updates).length && !ids) throw new BadRequest('Nothing to update.')
  if (Object.keys(updates).length) {
    const { data, error } = await staff.supabase.from('collections').update(updates)
      .eq('id', body.id).eq('tenant_id', staff.tenant.tenantId).select('id').maybeSingle()
    if (duplicate(error)) throw new BadRequest('A collection with that name already exists.')
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Collection not found.' }, { status: 404 })
  }
  if (ids) await saveLinks(staff.supabase, staff.tenant.tenantId, body.id, ids)
  const saved = await staff.supabase.from('collections').select(COLUMNS).eq('id', body.id).eq('tenant_id', staff.tenant.tenantId).maybeSingle()
  if (saved.error) throw saved.error
  if (!saved.data) return NextResponse.json({ error: 'Collection not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'collection.updated', entityType: 'collection', entityId: body.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { fields: [...Object.keys(updates), ...(ids ? ['products'] : [])] } })
  return NextResponse.json({ collection: saved.data })
})

/** Removes a collection. Its products are untouched. */
export const DELETE = handle('admin.collections.delete', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!UUID.test(id)) throw new BadRequest('Collection ID is required.')
  const { data, error } = await staff.supabase.from('collections').delete().eq('id', id).eq('tenant_id', staff.tenant.tenantId).select('id, title')
  if (error) throw error
  if (!data?.length) return NextResponse.json({ error: 'Collection not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'collection.deleted', entityType: 'collection', entityId: id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { title: data[0].title } })
  return NextResponse.json({ message: 'Collection removed' })
})
