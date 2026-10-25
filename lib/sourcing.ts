import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BadRequest, money, text, url } from '@/lib/api'

// Where products come from: suppliers, and each product's listing link and
// unit cost. Staff-only (suppliers, product_sources; RLS products.read /
// products.write). Never put sourcing on products: its columns are public.

export const COST_CURRENCIES = ['CNY', 'USD', 'NGN'] as const
export const SOURCE_SELECT = 'source:product_sources(supplier_id, listing_url, unit_cost, cost_currency, notes)'

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

/** A product's sourcing from a request body. Returns null when every field is empty (no sourcing). */
export function sourceFields(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequest('Sourcing must be an object.')
  const v = value as Record<string, unknown>
  const supplierId = v.supplier_id === '' || v.supplier_id == null ? null : String(v.supplier_id)
  if (supplierId && !UUID.test(supplierId)) throw new BadRequest('Choose a supplier from the list.')
  const currency = text(v.cost_currency, 'Cost currency', { max: 3 })?.toUpperCase() ?? 'CNY'
  if (!(COST_CURRENCIES as readonly string[]).includes(currency)) throw new BadRequest(`Cost currency must be one of ${COST_CURRENCIES.join(', ')}.`)
  const source = {
    supplier_id: supplierId,
    listing_url: url(v.listing_url, 'Supplier listing link'),
    unit_cost: v.unit_cost === '' || v.unit_cost == null ? null : money(v.unit_cost, 'Unit cost'),
    cost_currency: currency,
    notes: text(v.notes, 'Sourcing notes', { max: 2000 }),
  }
  return source.supplier_id || source.listing_url || source.unit_cost != null || source.notes ? source : null
}

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
  if (error) throw error
}
