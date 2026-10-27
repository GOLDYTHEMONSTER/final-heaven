import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, type StaffContext } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, HttpError, handle, readJson, requestIdOf, text } from '@/lib/api'
import { clearanceBreakdown } from '@/lib/shipping/engine'
import { toCampaign } from '@/lib/shipping/store'
import { campaignFields, catalogue, uuid } from '@/lib/shipping/admin'

export const dynamic = 'force-dynamic'

const ID = /^[A-Za-z0-9_-]{1,64}$/

/** Campaigns, each with every product it covers priced at its clearance price: margin, recovery and what needs approval. */
export const GET = handle('admin.shipping.campaigns.list', async () => {
  const { staff, denied } = await requirePermission('shipping.read')
  if (denied) return denied
  const t = staff.tenant.tenantId
  const [cat, campaigns, links, spent] = await Promise.all([
    catalogue(staff.supabase, t),
    staff.supabase.from('clearance_campaigns').select('*').eq('tenant_id', t).order('starts_at', { ascending: false }),
    staff.supabase.from('clearance_campaign_products').select('*').eq('tenant_id', t),
    staff.supabase.from('shipping_ledger').select('campaign_id, amount').eq('tenant_id', t).eq('kind', 'promo_subsidy'),
  ])
  for (const r of [campaigns, links, spent]) if (r.error) throw r.error
  return NextResponse.json({
    campaigns: (campaigns.data ?? []).map((c) => {
      const mine = (links.data ?? []).filter((l) => l.campaign_id === c.id)
      const used = (spent.data ?? []).filter((s) => s.campaign_id === c.id).reduce((t, s) => t + Math.round(Number(s.amount) * 100), 0)
      const campaign = toCampaign(c, mine.map((l) => l.product_id), used)
      const covered = cat.inputs.filter((p) => campaign.productIds.includes(p.productId) || (p.category && campaign.categories.includes(p.category)))
      return {
        ...c, spentKobo: used,
        products: covered.map((p) => {
          const link = mine.find((l) => l.product_id === p.productId)
          // An applied product's catalogue price is already the clearance price: evaluate from the price before.
          const base = link?.applied_at && !link.restored_at && link.previous_price != null ? { ...p, priceKobo: Math.round(Number(link.previous_price) * 100) } : p
          const b = clearanceBreakdown(base, cat.ctx, { ...campaign, status: 'active' })
          return {
            productId: p.productId, name: p.name, category: p.category, priceKobo: base.priceKobo, clearancePriceKobo: b.clearancePriceKobo,
            contributionKobo: b.contributionKobo, subsidyKobo: b.subsidyKobo, recoveryPct: b.recoveryPct, marginAfterFreightKobo: b.marginAfterFreightKobo,
            marginPct: b.marginPct, negative: b.negative, belowMin: b.belowMin, excluded: b.excluded, needsApproval: b.needsApproval,
            approved: Boolean(link?.exception_approved_at), exceptionReason: link?.exception_reason ?? null,
            applied: Boolean(link?.applied_at && !link.restored_at), restoredAt: link?.restored_at ?? null, warnings: b.warnings.slice(0, 3),
          }
        }),
      }
    }),
    categories: [...new Set(cat.inputs.map((p) => p.category).filter(Boolean))].sort(),
    products: cat.inputs.map((p) => ({ id: p.productId, name: p.name, category: p.category })),
    can: { manage: staff.can('shipping.manage') && staff.can('products.write'), approve: staff.can('finance.adjust') },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const POST = handle('admin.shipping.campaigns.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('shipping.manage')
  if (denied) return denied
  const b = await readJson(req, 16_000)
  const fields = { ...campaignFields(b), status: 'draft' as const }
  const { data, error } = await staff.supabase.from('clearance_campaigns').insert({ ...fields, tenant_id: staff.tenant.tenantId }).select().single()
  if (error) throw error
  await setProducts(staff, data.id, b.productIds)
  await audit({ tenantId: staff.tenant.tenantId, action: 'shipping.campaign_created', entityType: 'clearance_campaign', entityId: data.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { name: data.name, treatment: data.shipping_treatment } })
  return NextResponse.json({ campaign: data }, { status: 201 })
})

/** Replaces a campaign's hand-picked products, keeping the ones already on sale at its price. */
async function setProducts(staff: StaffContext, campaignId: string, value: unknown) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length > 500) throw new BadRequest('Products must be a list of up to 500.')
  const ids = [...new Set(value.map((v) => { if (typeof v !== 'string' || !ID.test(v)) throw new BadRequest('Unknown product.'); return v }))]
  const t = staff.tenant.tenantId
  const { data: existing, error } = await staff.supabase.from('clearance_campaign_products').select('product_id, applied_at, restored_at').eq('campaign_id', campaignId)
  if (error) throw error
  const gone = (existing ?? []).filter((l) => !ids.includes(l.product_id) && !(l.applied_at && !l.restored_at)).map((l) => l.product_id)
  if (gone.length) {
    const { error: e } = await staff.supabase.from('clearance_campaign_products').delete().eq('campaign_id', campaignId).in('product_id', gone)
    if (e) throw e
  }
  const add = ids.filter((id) => !(existing ?? []).some((l) => l.product_id === id))
  if (add.length) {
    const { error: e } = await staff.supabase.from('clearance_campaign_products').insert(add.map((product_id) => ({ campaign_id: campaignId, product_id, tenant_id: t })))
    if (e) throw e
  }
}

export const PUT = handle('admin.shipping.campaigns.update', async (req: NextRequest) => {
  const b = await readJson(req, 16_000)
  const approving = b.action === 'approve' || b.action === 'approve_product'
  const { staff, denied } = await requirePermission(approving ? 'finance.adjust' : 'shipping.manage')
  if (denied) return denied
  const id = uuid(b.id, 'Campaign')
  const t = staff.tenant.tenantId
  const actor = { type: 'user' as const, userId: staff.userId }
  const log = (action: string, metadata: Record<string, unknown>) => audit({ tenantId: t, action: `shipping.${action}`, entityType: 'clearance_campaign', entityId: id, actor, requestId: requestIdOf(req), metadata })

  switch (b.action) {
    case 'update': {
      const fields = campaignFields(b)
      const { error } = await staff.supabase.from('clearance_campaigns').update(fields).eq('id', id).eq('tenant_id', t)
      if (error) throw error
      await setProducts(staff, id, b.productIds)
      await log('campaign_updated', { fields: Object.keys(fields) })
      return NextResponse.json({ ok: true })
    }
    case 'approve':
    case 'approve_product': {
      const reason = text(b.reason, 'Reason', { max: 500, required: true })
      const product = b.action === 'approve_product' ? text(b.productId, 'Product', { max: 64, required: true }) : null
      const { error } = await staff.supabase.rpc('approve_clearance', { p_campaign: id, p_product: product, p_reason: reason })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }
    case 'apply':
    case 'restore':
      if (!staff.can('products.write')) throw new HttpError(403, 'Changing prices needs permission to edit products.')
      return NextResponse.json(b.action === 'apply' ? await apply(staff, id, log) : await restore(staff, id, log))
    default:
      throw new BadRequest('Unknown action.')
  }
})

/**
 * Puts the campaign's products on sale at its price, through the store's own
 * sale price (the old price shows crossed out), and starts the campaign.
 * Products that lose money or fall under the margin floor are held back until
 * finance approves each one; products excluded from clearance are skipped.
 */
async function apply(staff: StaffContext, id: string, log: (a: string, m: Record<string, unknown>) => Promise<void>) {
  const t = staff.tenant.tenantId
  const db = staff.supabase
  const [cat, c, links] = await Promise.all([
    catalogue(db, t),
    db.from('clearance_campaigns').select('*').eq('id', id).eq('tenant_id', t).maybeSingle(),
    db.from('clearance_campaign_products').select('*').eq('campaign_id', id),
  ])
  if (c.error) throw c.error
  if (links.error) throw links.error
  if (!c.data) throw new HttpError(404, 'Campaign not found.')
  if (c.data.status === 'ended') throw new BadRequest('This campaign has ended.')
  if (c.data.shipping_treatment === 'below_target' && !c.data.approved_at) throw new BadRequest('Finance needs to approve below-target recovery before this campaign starts.')
  const campaign = { ...toCampaign(c.data, (links.data ?? []).map((l) => l.product_id), 0), status: 'active' as const }
  const covered = cat.inputs.filter((p) => campaign.productIds.includes(p.productId) || (p.category && campaign.categories.includes(p.category)))
  const { data: rows, error } = await db.from('products').select('id, price, original_price').eq('tenant_id', t).in('id', covered.map((p) => p.productId))
  if (error) throw error
  const applied: string[] = []
  const held: string[] = []
  const skipped: string[] = []
  for (const p of covered) {
    const link = (links.data ?? []).find((l) => l.product_id === p.productId)
    if (link?.applied_at && !link.restored_at) continue
    const b = clearanceBreakdown(p, cat.ctx, campaign)
    if (b.excluded) { skipped.push(p.name ?? p.productId); continue }
    if (b.needsApproval && !link?.exception_approved_at) { held.push(p.name ?? p.productId); continue }
    const row = rows?.find((r) => r.id === p.productId)
    if (!row) continue
    const price = b.clearancePriceKobo / 100
    // Already at or under the ₦100 floor: there's nothing to take off.
    if (price >= Number(row.price)) { skipped.push(p.name ?? p.productId); continue }
    const crossedOut = row.original_price != null && Number(row.original_price) > price ? Number(row.original_price) : Number(row.price)
    const { error: pe } = await db.from('products').update({ price, original_price: crossedOut, updated_at: new Date().toISOString() }).eq('id', p.productId).eq('tenant_id', t)
    if (pe) throw pe
    const { error: le } = await db.from('clearance_campaign_products').upsert({
      campaign_id: id, product_id: p.productId, tenant_id: t, applied_price: price, previous_price: Number(row.price),
      previous_original_price: row.original_price, applied_at: new Date().toISOString(), restored_at: null,
    }, { onConflict: 'campaign_id,product_id' })
    if (le) throw le
    applied.push(p.name ?? p.productId)
  }
  if (applied.length && c.data.status === 'draft') {
    const { error: se } = await db.from('clearance_campaigns').update({ status: 'active' }).eq('id', id)
    if (se) throw se
  }
  await log('campaign_applied', { applied, held, skipped })
  return { ok: true, applied, held, skipped }
}

/** Puts every product back at its price from before the campaign, unless staff have changed it since; ends the campaign. */
async function restore(staff: StaffContext, id: string, log: (a: string, m: Record<string, unknown>) => Promise<void>) {
  const t = staff.tenant.tenantId
  const db = staff.supabase
  const { data: links, error } = await db.from('clearance_campaign_products').select('*, products(price)').eq('campaign_id', id).not('applied_at', 'is', null).is('restored_at', null)
  if (error) throw error
  const restored: string[] = []
  const changed: string[] = []
  for (const l of links ?? []) {
    if (Number((l as any).products?.price) !== Number(l.applied_price)) { changed.push(l.product_id); continue }
    const { error: pe } = await db.from('products').update({ price: l.previous_price, original_price: l.previous_original_price, updated_at: new Date().toISOString() })
      .eq('id', l.product_id).eq('tenant_id', t)
    if (pe) throw pe
    const { error: le } = await db.from('clearance_campaign_products').update({ restored_at: new Date().toISOString() }).eq('campaign_id', id).eq('product_id', l.product_id)
    if (le) throw le
    restored.push(l.product_id)
  }
  const { error: se } = await db.from('clearance_campaigns').update({ status: 'ended' }).eq('id', id).eq('tenant_id', t)
  if (se) throw se
  await log('campaign_ended', { restored, changedSince: changed })
  return { ok: true, restored, changed }
}
