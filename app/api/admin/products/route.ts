import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, int, money, readJson, requestIdOf, text, url } from '@/lib/api'
import { SOURCE_SELECT, blocksSale, saveSource, sourceFields } from '@/lib/sourcing'
import { FULFILMENTS, SOURCE_TYPES } from '@/lib/collections'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

const STATUSES = ['active', 'draft', 'archived'] as const
const CARD_SIZES = ['large', 'medium', 'small'] as const
const ID = /^[A-Za-z0-9_-]{1,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Database rules a product breaks, in words staff can act on; null for anything else. */
function productRuleError(error: { code?: string; message?: string } | null) {
  if (!error) return null
  if (error.message?.includes('products_made_to_order_lead_time_check')) return new BadRequest('Made-to-order products need a lead time (days to make).')
  if (error.message?.includes('review_pending')) return new BadRequest('This product is waiting for review (or was refused): approve the review before putting it on sale, or save it as a draft.')
  if (error.code === '23505' && error.message?.includes('products_store_sku_idx')) return new BadRequest('Another product already has that SKU.')
  if (error.message?.includes('another business')) return new BadRequest('Choose one of your own labels.')
  return null
}

const list = (value: unknown, field: string, max = 30) => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > max) throw new BadRequest(`${field} must be a list of up to ${max} items.`)
  return value.map((v) => text(v, field, { max: 60, required: true })!)
}

const oneOf = <T extends string>(value: unknown, options: readonly T[], field: string, fallback: T): T => {
  if (value === undefined || value === null || value === '') return fallback
  if (options.indexOf(value as T) === -1) throw new BadRequest(`${field} must be one of: ${options.join(', ')}.`)
  return value as T
}

const bool = (value: unknown) => value === true || value === 'true'

/**
 * Validates and whitelists product columns. Unknown keys (ids, timestamps,
 * anything else a client sends) are dropped. With `partial`, only keys present
 * in the body are returned, for updates.
 */
function productColumns(body: Record<string, unknown>, partial: boolean) {
  const has = (key: string) => !partial || key in body
  const out: Record<string, unknown> = {}

  if (has('name')) out.name = text(body.name, 'Name', { max: 200, required: true })
  if (has('category')) out.category = text(body.category, 'Category', { max: 60, required: true })
  if (has('description')) out.description = text(body.description, 'Description', { max: 5000 })
  if (has('price')) out.price = money(body.price ?? 0, 'Price')
  if (has('original_price')) {
    out.original_price = body.original_price === null || body.original_price === '' || body.original_price === undefined
      ? null
      : money(body.original_price, 'Original price')
  }
  if (has('stock')) out.stock = int(body.stock ?? 0, 'Stock', { min: 0, max: 1_000_000 })
  if (has('status')) out.status = oneOf(body.status, STATUSES, 'Status', 'active')
  if (has('card_size')) out.card_size = oneOf(body.card_size, CARD_SIZES, 'Card size', 'medium')
  for (const flag of ['is_new', 'is_limited', 'is_trending', 'members_only', 'purchases_paused'] as const) {
    if (has(flag)) out[flag] = bool(body[flag])
  }
  if (has('release_date')) {
    const date = text(body.release_date, 'Release date', { max: 10 })
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest('Release date must be YYYY-MM-DD.')
    out.release_date = date
  }
  // A sale shows the original price crossed out, so it must be higher than the price.
  if (out.original_price != null && out.price != null && Number(out.original_price) <= Number(out.price)) {
    throw new BadRequest('Original price must be higher than the price (it shows crossed out as a sale). Leave it empty for no sale.')
  }
  // Pre-orders: paid now through Flutterwave, shipped from the date given, limited to the allowance.
  if (has('preorder')) out.preorder = bool(body.preorder)
  if (has('preorder_ships_on')) {
    const date = text(body.preorder_ships_on, 'Pre-order ship date', { max: 10 })
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest('Pre-order ship date must be YYYY-MM-DD.')
    out.preorder_ships_on = date
  }
  if (has('preorder_limit')) out.preorder_limit = int(body.preorder_limit ?? 0, 'Pre-order quantity', { min: 0, max: 100_000 })
  if (out.preorder === true && !out.preorder_ships_on) throw new BadRequest('Set the date pre-orders ship from.')
  // Where it comes from, and whether it ships from stock or is made after the order (lib/collections).
  if (has('source_type')) out.source_type = oneOf(body.source_type, SOURCE_TYPES, 'Source', 'original')
  if (has('fulfilment')) out.fulfilment = oneOf(body.fulfilment, FULFILMENTS, 'Supply', 'stock')
  if (has('ships_by_air')) out.ships_by_air = body.ships_by_air !== false && body.ships_by_air !== 'false'
  if (has('lead_time_days')) {
    out.lead_time_days = body.lead_time_days === null || body.lead_time_days === '' || body.lead_time_days === undefined
      ? null : int(body.lead_time_days, 'Lead time (days)', { min: 1, max: 180 })
  }
  if (out.fulfilment === 'made_to_order' && has('lead_time_days') && !out.lead_time_days) throw new BadRequest('Made-to-order products need a lead time (days to make).')
  if (has('brand_id')) {
    if (body.brand_id && (typeof body.brand_id !== 'string' || !UUID.test(body.brand_id))) throw new BadRequest('Choose a label from the list.')
    out.brand_id = body.brand_id || null
  }
  if (has('sku')) out.sku = text(body.sku, 'SKU', { max: 60 })?.toUpperCase() || null
  if (has('colors')) out.colors = list(body.colors, 'Colors')
  if (has('sizes')) out.sizes = list(body.sizes, 'Sizes')
  if (has('tags')) out.tags = list(body.tags, 'Tags')
  if (has('images')) {
    const images = body.images ?? []
    if (!Array.isArray(images) || images.length > 12) throw new BadRequest('Images must be a list of up to 12.')
    out.images = images.map((img) => {
      const item = (typeof img === 'string' ? { url: img } : img ?? {}) as Record<string, unknown>
      return { url: url(item.url, 'Image URL'), color: text(item.color, 'Image colour', { max: 40 }) }
    }).filter((img) => img.url)
  }
  return out
}

// Queries run as the signed-in staff member under RLS (per-tenant permission
// policies), scoped to the tenant resolved from their membership. The tenant
// and store are never taken from the request body.

export const GET = handle('admin.products.list', async () => {
  const { staff, denied } = await requirePermission('products.read')
  if (denied) return denied

  // Sourcing comes from the staff-only product_sources table (lib/sourcing).
  const { data, error } = await staff.supabase.from('products').select(`*, ${SOURCE_SELECT}`)
    .eq('tenant_id', staff.tenant.tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return NextResponse.json({ products: data || [] })
})

export const POST = handle('admin.products.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied
  if (!staff.tenant.storeId) throw new BadRequest('This business has no active store.')

  const body = await readJson(req, 64_000)
  const id = typeof body.id === 'string' && ID.test(body.id) ? body.id : `p${Date.now()}`
  const source = 'source' in body ? sourceFields(body.source) : null
  const columns = productColumns(body, false)
  // Imported or unchecked listings start as drafts until their review is approved.
  if (blocksSale(source) && columns.status === 'active') {
    throw new BadRequest('A product waiting for review (or refused) can’t go on sale yet: save it as a draft, then publish once the review is approved.')
  }
  const { data, error } = await staff.supabase
    .from('products')
    .insert({ id, ...columns, tenant_id: staff.tenant.tenantId, store_id: staff.tenant.storeId })
    .select()
    .single()
  const ruleError = productRuleError(error)
  if (ruleError) throw ruleError
  if (error) throw error
  if (source) await saveSource(staff.supabase, staff.tenant.tenantId, id, source)
  await audit({ tenantId: staff.tenant.tenantId, action: 'product.created', entityType: 'product', entityId: id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { name: data.name, price: data.price } })
  return NextResponse.json({ product: { ...data, source } }, { status: 201 })
})

export const PUT = handle('admin.products.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const body = await readJson(req, 64_000)
  if (typeof body.id !== 'string' || !ID.test(body.id)) throw new BadRequest('Product ID is required.')
  const updates = productColumns(body, true)
  const hasSource = 'source' in body
  const source = hasSource ? sourceFields(body.source) : null
  if (!Object.keys(updates).length && !hasSource) throw new BadRequest('Nothing to update.')

  // The database checks the review at each step, so save in the order that makes the change valid:
  // approving a review before publishing; taking off sale before reopening a review.
  const sourceFirst = hasSource && !blocksSale(source)
  if (sourceFirst) await saveSource(staff.supabase, staff.tenant.tenantId, body.id, source)
  const { data, error } = await staff.supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .eq('tenant_id', staff.tenant.tenantId)
    .select(`*, ${SOURCE_SELECT}`)
    .maybeSingle()
  const ruleError = productRuleError(error)
  if (ruleError) throw ruleError
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  if (hasSource && !sourceFirst) await saveSource(staff.supabase, staff.tenant.tenantId, body.id, source)
  await audit({ tenantId: staff.tenant.tenantId, action: 'product.updated', entityType: 'product', entityId: body.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req),
    metadata: { fields: [...Object.keys(updates), ...(hasSource ? ['source'] : [])] } })
  return NextResponse.json({ product: { ...data, source: hasSource ? source : data.source } })
})

export const DELETE = handle('admin.products.delete', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('products.write')
  if (denied) return denied

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!ID.test(id)) throw new BadRequest('Product ID is required.')

  // A product that's on an order or a checkout is archived, not deleted, so its history stays whole.
  const service = createSupabaseServiceClient()
  const line = JSON.stringify([{ id }])
  const [onOrder, inCheckout] = await Promise.all([
    service.from('orders').select('id', { head: true, count: 'exact' }).eq('tenant_id', staff.tenant.tenantId).contains('order_items', line),
    service.from('checkouts').select('id', { head: true, count: 'exact' }).eq('tenant_id', staff.tenant.tenantId).contains('items', line),
  ])
  if (onOrder.error) throw onOrder.error
  if (inCheckout.error) throw inCheckout.error
  if ((onOrder.count ?? 0) + (inCheckout.count ?? 0) > 0) {
    const { data, error } = await staff.supabase.from('products').update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', staff.tenant.tenantId).select('id, name')
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    await audit({ tenantId: staff.tenant.tenantId, action: 'product.archived', entityType: 'product', entityId: id,
      actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { name: data[0].name, reason: 'on orders' } })
    return NextResponse.json({ message: 'Archived: this product is on past orders, so it was hidden rather than deleted.', archived: true })
  }

  const { data, error } = await staff.supabase.from('products').delete()
    .eq('id', id).eq('tenant_id', staff.tenant.tenantId).select('id, name')
  if (error) throw error
  if (!data?.length) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'product.deleted', entityType: 'product', entityId: id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { name: data[0].name } })
  return NextResponse.json({ message: 'Product deleted' })
})
