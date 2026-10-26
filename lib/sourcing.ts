import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BadRequest, int, money, text, url } from '@/lib/api'

// Where products come from: suppliers, and each product's listing link, cost,
// review before sale, stock on order, lead time and image permission.
// Staff-only (suppliers, product_sources; RLS products.read / products.write).
// Never put sourcing on products: its columns are public.

export const COST_CURRENCIES = ['CNY', 'USD', 'NGN'] as const
export const REVIEW_STATUSES = ['not_required', 'pending', 'approved', 'rejected'] as const
export const IMAGE_PERMISSIONS = ['own', 'supplier_permitted', 'unknown'] as const
// A literal, so the Supabase client can type the rows it returns.
export const SOURCE_SELECT = 'source:product_sources(supplier_id, listing_url, unit_cost, cost_currency, notes, review_status, review_notes, incoming_quantity, incoming_eta, supplier_lead_time_days, image_permission, fx_rate, shipping_cost_ngn, customs_cost_ngn, other_cost_ngn)'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A supplier's columns from a request body; with `partial`, only the keys present. */
export function supplierFields(body: Record<string, unknown>, partial: boolean) {
  const has = (key: string) => !partial || key in body
  const out: Record<string, unknown> = {}
  if (has('name')) out.name = text(body.name, 'Supplier name', { max: 120, required: true })
  if (has('platform')) out.platform = text(body.platform, 'Platform', { max: 40 })
  if (has('url')) out.url = url(body.url, 'Supplier link')
  if (has('contact')) out.contact = text(body.contact, 'Contact', { max: 300 })
  if (has('notes')) out.notes = text(body.notes, 'Notes', { max: 2000 })
  return out
}

const empty = (v: unknown) => v === '' || v == null
const optionalMoney = (v: unknown, field: string) => (empty(v) ? null : money(v, field))
const pick = <T extends string>(v: unknown, options: readonly T[], field: string, fallback: T): T => {
  if (empty(v)) return fallback
  if (!(options as readonly unknown[]).includes(v)) throw new BadRequest(`${field} must be one of: ${options.join(', ')}.`)
  return v as T
}

/** A product's sourcing from a request body. Returns null when nothing is set (no sourcing). */
export function sourceFields(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequest('Sourcing must be an object.')
  const v = value as Record<string, unknown>
  const supplierId = empty(v.supplier_id) ? null : String(v.supplier_id)
  if (supplierId && !UUID.test(supplierId)) throw new BadRequest('Choose a supplier from the list.')
  const currency = text(v.cost_currency, 'Cost currency', { max: 3 })?.toUpperCase() ?? 'CNY'
  if (!(COST_CURRENCIES as readonly string[]).includes(currency)) throw new BadRequest(`Cost currency must be one of ${COST_CURRENCIES.join(', ')}.`)
  const eta = text(v.incoming_eta, 'Expected date', { max: 10 })
  if (eta && !/^\d{4}-\d{2}-\d{2}$/.test(eta)) throw new BadRequest('Expected date must be YYYY-MM-DD.')
  const fx = empty(v.fx_rate) ? null : Number(v.fx_rate)
  if (fx !== null && (!Number.isFinite(fx) || fx <= 0 || fx > 1_000_000)) throw new BadRequest('Exchange rate must be a positive number.')
  const source = {
    supplier_id: supplierId,
    listing_url: url(v.listing_url, 'Supplier listing link'),
    unit_cost: optionalMoney(v.unit_cost, 'Unit cost'),
    cost_currency: currency,
    notes: text(v.notes, 'Sourcing notes', { max: 2000 }),
    review_status: pick(v.review_status, REVIEW_STATUSES, 'Review', 'not_required'),
    review_notes: text(v.review_notes, 'Review notes', { max: 2000 }),
    incoming_quantity: empty(v.incoming_quantity) ? 0 : int(v.incoming_quantity, 'On order', { min: 0, max: 1_000_000 }),
    incoming_eta: eta,
    supplier_lead_time_days: empty(v.supplier_lead_time_days) ? null : int(v.supplier_lead_time_days, 'Supplier lead time', { min: 0, max: 365 }),
    image_permission: pick(v.image_permission, IMAGE_PERMISSIONS, 'Image permission', 'unknown'),
    fx_rate: fx,
    shipping_cost_ngn: optionalMoney(v.shipping_cost_ngn, 'Shipping cost'),
    customs_cost_ngn: optionalMoney(v.customs_cost_ngn, 'Customs cost'),
    other_cost_ngn: optionalMoney(v.other_cost_ngn, 'Other costs'),
  }
  const set = Object.entries(source).some(([k, x]) =>
    k === 'cost_currency' ? false
      : k === 'review_status' ? x !== 'not_required'
        : k === 'image_permission' ? x !== 'unknown'
          : k === 'incoming_quantity' ? x !== 0
            : x != null)
  return set ? source : null
}

/** Whether this sourcing keeps the product off sale until its review is approved. */
export const blocksSale = (source: ReturnType<typeof sourceFields>) => source?.review_status === 'pending' || source?.review_status === 'rejected'

/** Saves (or clears) a product's sourcing, checking the supplier belongs to this business. */
export async function saveSource(db: SupabaseClient, tenantId: string, productId: string, source: ReturnType<typeof sourceFields>) {
  if (!source) {
    const { error } = await db.from('product_sources').delete().eq('product_id', productId).eq('tenant_id', tenantId)
    if (error) throw error
    return
  }
  if (source.supplier_id) {
    const { data, error } = await db.from('suppliers').select('id').eq('id', source.supplier_id).eq('tenant_id', tenantId).maybeSingle()
    if (error) throw error
    if (!data) throw new BadRequest('That supplier no longer exists. Choose another.')
  }
  const { error } = await db.from('product_sources').upsert({ product_id: productId, tenant_id: tenantId, ...source }, { onConflict: 'product_id' })
  if (error?.message?.includes('review_pending')) {
    throw new BadRequest('Take this product off sale (save it as a draft) before marking it for review.')
  }
  if (error) throw error
}
