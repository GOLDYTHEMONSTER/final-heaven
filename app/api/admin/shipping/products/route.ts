import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, money, readJson, requestIdOf } from '@/lib/api'
import { sourceFields } from '@/lib/sourcing'
import { PRICE_STATUS_LABEL, priceBreakdown, profileFor } from '@/lib/shipping/engine'
import { PROFILE_COLUMNS, loadContext, loadProducts, toCosts, toProfile } from '@/lib/shipping/store'
import { profileFields } from '@/lib/shipping/admin'

export const dynamic = 'force-dynamic'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const productId = (v: unknown) => {
  if (typeof v !== 'string' || !ID.test(v)) throw new BadRequest('Product ID is required.')
  return v
}

/** A product's shipping profiles (one general, optionally one per size) and its price breakdown. */
export const GET = handle('admin.shipping.products.get', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('shipping.read')
  if (denied) return denied
  const id = productId(new URL(req.url).searchParams.get('id'))
  const t = staff.tenant.tenantId
  const [product, profiles, ctx, loaded] = await Promise.all([
    staff.supabase.from('products').select('id, name, category, price').eq('id', id).eq('tenant_id', t).maybeSingle(),
    staff.supabase.from('product_shipping_profiles').select(PROFILE_COLUMNS).eq('product_id', id).eq('tenant_id', t).order('variant'),
    loadContext(staff.supabase, t),
    loadProducts(staff.supabase, t, [id]),
  ])
  if (product.error) throw product.error
  if (profiles.error) throw profiles.error
  if (!product.data) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  const breakdown = priceBreakdown({ productId: id, name: product.data.name, category: product.data.category, priceKobo: Math.round(Number(product.data.price) * 100),
    costs: loaded.costs[id] ?? null, profile: profileFor(loaded.profiles, id, null) }, ctx)
  return NextResponse.json({
    profiles: profiles.data ?? [], breakdown: { ...breakdown, statusLabel: PRICE_STATUS_LABEL[breakdown.status] }, classes: ctx.classes,
    can: { manage: staff.can('shipping.manage') },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/** The price breakdown for values in the editor that aren't saved yet. Nothing is written. */
export const POST = handle('admin.shipping.products.preview', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('shipping.read')
  if (denied) return denied
  const body = await readJson(req, 32_000)
  const t = staff.tenant.tenantId
  const price = money(body.price ?? 0, 'Price')
  const profile = body.profile ? profileFields(body.profile as Record<string, unknown>) : null
  const source = 'source' in body ? sourceFields(body.source) : null
  const ctx = await loadContext(staff.supabase, t)
  const id = typeof body.id === 'string' && ID.test(body.id) ? body.id : 'new'
  const breakdown = priceBreakdown({
    productId: id, category: typeof body.category === 'string' ? body.category : null, priceKobo: Math.round(price * 100), costs: toCosts(source),
    profile: profile ? toProfile({ ...profile, product_id: id }) : null,
  }, ctx)
  return NextResponse.json({ breakdown: { ...breakdown, statusLabel: PRICE_STATUS_LABEL[breakdown.status] } }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/**
 * Saves a product's profiles: the general one and any per-size ones; sizes
 * left out are removed. Overrides need a reason; the database records who set
 * them and audits every change.
 */
export const PUT = handle('admin.shipping.products.save', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('shipping.manage')
  if (denied) return denied
  const body = await readJson(req, 32_000)
  const id = productId(body.productId)
  const t = staff.tenant.tenantId
  if (!Array.isArray(body.profiles) || body.profiles.length > 12) throw new BadRequest('Profiles must be a list of up to 12.')
  const profiles = body.profiles.map((p) => profileFields(p as Record<string, unknown>))
  if (new Set(profiles.map((p) => p.variant)).size !== profiles.length) throw new BadRequest('Each size can have only one profile.')

  const { data: product, error: e } = await staff.supabase.from('products').select('id').eq('id', id).eq('tenant_id', t).maybeSingle()
  if (e) throw e
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  const { data: existing, error: e2 } = await staff.supabase.from('product_shipping_profiles').select('variant').eq('product_id', id).eq('tenant_id', t)
  if (e2) throw e2
  const gone = (existing ?? []).map((p) => p.variant).filter((v) => !profiles.some((p) => p.variant === v))
  if (gone.length) {
    const { error } = await staff.supabase.from('product_shipping_profiles').delete().eq('product_id', id).eq('tenant_id', t).in('variant', gone)
    if (error) throw error
  }
  if (profiles.length) {
    const now = new Date().toISOString()
    const { error } = await staff.supabase.from('product_shipping_profiles')
      .upsert(profiles.map((p) => ({ ...p, product_id: id, tenant_id: t, last_calculated_at: now })), { onConflict: 'product_id,variant' })
    if (error) throw error
  }
  await audit({ tenantId: t, action: 'shipping.profile_saved', entityType: 'product', entityId: id, actor: { type: 'user', userId: staff.userId },
    requestId: requestIdOf(req), metadata: { variants: profiles.map((p) => p.variant || 'all'), removed: gone } })
  return NextResponse.json({ ok: true })
})
