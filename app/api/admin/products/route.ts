import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { BadRequest, handle, int, money, readJson, text, url } from '@/lib/api'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

const STATUSES = ['active', 'draft', 'archived'] as const
const CARD_SIZES = ['large', 'medium', 'small'] as const
const ID = /^[A-Za-z0-9_-]{1,64}$/

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
  for (const flag of ['is_new', 'is_limited', 'is_trending', 'members_only'] as const) {
    if (has(flag)) out[flag] = bool(body[flag])
  }
  if (has('release_date')) {
    const date = text(body.release_date, 'Release date', { max: 10 })
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest('Release date must be YYYY-MM-DD.')
    out.release_date = date
  }
  if (has('product_url')) out.product_url = url(body.product_url, 'Product link')
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

// Admin queries run as the signed-in admin under RLS (the admin policies in
// supabase/migrations), not with the service key.

export const GET = handle('admin.products.list', async () => {
  const { admin, denied } = await requireAdmin()
  if (denied) return denied

  const { data, error } = await admin.supabase.from('products').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return NextResponse.json({ products: data || [] })
})

export const POST = handle('admin.products.create', async (req: NextRequest) => {
  const { admin, denied } = await requireAdmin()
  if (denied) return denied

  const body = await readJson(req, 64_000)
  const id = typeof body.id === 'string' && ID.test(body.id) ? body.id : `p${Date.now()}`
  const { data, error } = await admin.supabase
    .from('products')
    .insert({ id, ...productColumns(body, false) })
    .select()
    .single()
  if (error) throw error
  return NextResponse.json({ product: data }, { status: 201 })
})

export const PUT = handle('admin.products.update', async (req: NextRequest) => {
  const { admin, denied } = await requireAdmin()
  if (denied) return denied

  const body = await readJson(req, 64_000)
  if (typeof body.id !== 'string' || !ID.test(body.id)) throw new BadRequest('Product ID is required.')
  const updates = productColumns(body, true)
  if (!Object.keys(updates).length) throw new BadRequest('Nothing to update.')

  const { data, error } = await admin.supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .select()
    .single()
  if (error) throw error
  return NextResponse.json({ product: data })
})

export const DELETE = handle('admin.products.delete', async (req: NextRequest) => {
  const { admin, denied } = await requireAdmin()
  if (denied) return denied

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!ID.test(id)) throw new BadRequest('Product ID is required.')

  const { error } = await admin.supabase.from('products').delete().eq('id', id)
  if (error) throw error
  return NextResponse.json({ message: 'Product deleted' })
})
