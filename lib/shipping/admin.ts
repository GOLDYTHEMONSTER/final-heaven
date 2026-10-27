import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BadRequest, int, money, text, url } from '@/lib/api'
import { ALLOCATION_METHODS, TIERS, priceBreakdown, profileFor, type ProductInput } from './engine'
import { loadContext, loadProducts } from './store'

// Reading staff input for the shipping admin, and the catalogue as the engine
// sees it. Every amount staff type is in naira; the engine works in kobo.

const empty = (v: unknown) => v === '' || v === null || v === undefined
const DATE = /^\d{4}-\d{2}-\d{2}$/
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const optMoney = (v: unknown, field: string) => (empty(v) ? null : money(v, field))
export function optNumber(v: unknown, field: string, min: number, max: number) {
  if (empty(v)) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new BadRequest(`${field} must be between ${min} and ${max}.`)
  return n
}
export const pct = (v: unknown, field: string) => optNumber(v, field, 0, 100)
export function oneOf<T extends string>(v: unknown, options: readonly T[], field: string, fallback?: T): T {
  if (empty(v) && fallback !== undefined) return fallback
  if (!(options as readonly unknown[]).includes(v)) throw new BadRequest(`${field} must be one of: ${options.join(', ')}.`)
  return v as T
}
export function date(v: unknown, field: string, required = false) {
  const s = text(v, field, { max: 10, required })
  if (s && !DATE.test(s)) throw new BadRequest(`${field} must be YYYY-MM-DD.`)
  return s
}
export function uuid(v: unknown, field: string) {
  if (typeof v !== 'string' || !UUID.test(v)) throw new BadRequest(`${field} is required.`)
  return v
}
const currency = (v: unknown, field = 'Currency') => {
  const c = (text(v, field, { max: 3 }) ?? 'NGN').toUpperCase()
  if (!/^[A-Z]{3}$/.test(c)) throw new BadRequest(`${field} must be a 3-letter code like NGN, USD or CNY.`)
  return c
}

/** A new rate from staff. Terms are fixed once saved (the database refuses edits), so all are read here. */
export function rateFields(b: Record<string, unknown>) {
  const method = oneOf(b.method, ['air', 'sea'] as const, 'Method')
  const cur = currency(b.currency)
  const out = {
    method,
    provider: text(b.provider, 'Forwarder', { max: 120, required: true })!,
    origin: text(b.origin, 'Origin', { max: 120 }),
    destination: text(b.destination, 'Destination', { max: 120 }),
    currency: cur,
    fx_rate: cur === 'NGN' ? null : optNumber(b.fx_rate, 'Exchange rate', 0.000001, 1_000_000),
    billing_unit: method === 'air' ? 'kg' : oneOf(b.billing_unit, ['kg', 'cbm'] as const, 'Billing unit', 'cbm'),
    rate_per_unit: money(b.rate_per_unit, 'Rate'),
    volumetric_divisor: empty(b.volumetric_divisor) ? null : int(b.volumetric_divisor, 'Volumetric divisor', { min: 500, max: 20000 }),
    min_chargeable: optNumber(b.min_chargeable, 'Minimum chargeable', 0.001, 100000),
    rounding_increment: optNumber(b.rounding_increment, 'Rounding step', 0.001, 1000),
    min_shipment_charge: optMoney(b.min_shipment_charge, 'Minimum charge'),
    surcharge_per_unit: optMoney(b.surcharge_per_unit, 'Surcharges'),
    handling_per_shipment: optMoney(b.handling_per_shipment, 'Handling'),
    clearance_included: b.clearance_included === true,
    clearance_per_unit: optMoney(b.clearance_per_unit, 'Clearance'),
    insurance_pct: pct(b.insurance_pct, 'Insurance'),
    contingency_pct: pct(b.contingency_pct, 'Contingency'),
    typical_shipment_units: optNumber(b.typical_shipment_units, 'Usual shipment size', 0.001, 1_000_000),
    included_services: text(b.included_services, 'Included services', { max: 1000 }),
    excluded_services: text(b.excluded_services, 'Excluded services', { max: 1000 }),
    notes: text(b.notes, 'Notes', { max: 2000 }),
    document_url: url(b.document_url, 'Document link'),
    effective_from: date(b.effective_from, 'Effective from', true)!,
    effective_to: date(b.effective_to, 'Effective to'),
  }
  if (!out.rate_per_unit) throw new BadRequest('Enter the rate.')
  if (cur !== 'NGN' && !out.fx_rate) throw new BadRequest(`Enter the naira rate for ${cur}.`)
  if (out.effective_to && out.effective_to < out.effective_from) throw new BadRequest('The end date is before the start date.')
  if (b.confirmed !== true) throw new BadRequest('Confirm the rate is your forwarder’s real, current rate.')
  return out
}

export function settingsFields(b: Record<string, unknown>) {
  const factors = (b.value_tier_factors ?? {}) as Record<string, unknown>
  return {
    recovery_target_pct: optNumber(b.recovery_target_pct, 'Recovery target', 0, 100) ?? 50,
    reserve_share_pct: optNumber(b.reserve_share_pct, 'Reserve share', 0, 94) ?? 0,
    platform_contribution_pct: pct(b.platform_contribution_pct, 'Platform contribution') ?? 0,
    max_contribution_pct_of_price: pct(b.max_contribution_pct_of_price, 'Contribution cap'),
    value_tier_factors: Object.fromEntries(TIERS.map((t) => [t, optNumber(factors[t], `${t} factor`, 0.1, 10) ?? 1])),
    min_margin_pct: optNumber(b.min_margin_pct, 'Minimum margin', -100, 100),
    target_margin_pct: optNumber(b.target_margin_pct, 'Target margin', 0, 95),
    payment_fee_pct: optNumber(b.payment_fee_pct, 'Payment fee %', 0, 20),
    payment_fee_fixed: optMoney(b.payment_fee_fixed, 'Payment fee'),
    platform_recognised_on: oneOf(b.platform_recognised_on, ['delivered', 'shipped'] as const, 'Platform revenue counts when', 'delivered'),
  }
}

export function classFields(b: Record<string, unknown>) {
  const key = text(b.key, 'Class key', { max: 40, required: true })!
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) throw new BadRequest('Class keys are lower-case letters, numbers and _.')
  const out = {
    key, name: text(b.name, 'Class name', { max: 60, required: true })!,
    sort: empty(b.sort) ? 0 : int(b.sort, 'Order', { min: 0, max: 100 }),
    max_chargeable_kg: optNumber(b.max_chargeable_kg, 'Up to (kg)', 0.001, 100000),
    min_contribution: optMoney(b.min_contribution, 'Minimum contribution'),
    max_contribution: optMoney(b.max_contribution, 'Maximum contribution'),
    max_contribution_pct_of_price: pct(b.max_contribution_pct_of_price, '% of price cap'),
    adjustment_factor: optNumber(b.adjustment_factor, 'Factor', 0.01, 10) ?? 1,
  }
  if (out.min_contribution != null && out.max_contribution != null && out.min_contribution > out.max_contribution) throw new BadRequest(`${out.name}: the minimum is above the maximum.`)
  return out
}

/** A product's shipping profile from the editor. Weights may come in grams; sizes in inches. */
export function profileFields(b: Record<string, unknown>) {
  const weightUnit = oneOf(b.weight_unit, ['g', 'kg'] as const, 'Weight unit', 'g')
  const dimUnit = oneOf(b.dimension_unit, ['cm', 'in'] as const, 'Size unit', 'cm')
  const w = (v: unknown, field: string) => { const n = optNumber(v, field, 0, 1_000_000); return n == null ? null : Math.round((weightUnit === 'g' ? n / 1000 : n) * 1000) / 1000 || null }
  const d = (v: unknown, field: string) => { const n = optNumber(v, field, 0, 100_000); return n == null ? null : Math.round((dimUnit === 'in' ? n * 2.54 : n) * 10) / 10 || null }
  const variant = text(b.variant, 'Size', { max: 20 }) ?? ''
  const override = optMoney(b.override_contribution, 'Contribution override')
  const reason = text(b.override_reason, 'Override reason', { max: 500 })
  if (override != null && (!reason || reason.length < 3)) throw new BadRequest('Give a reason for overriding the contribution.')
  const out = {
    variant, method: oneOf(b.method, ['air', 'sea'] as const, 'Shipping method', 'air'),
    weight_kg: w(b.weight, 'Packed weight'), packaging_kg: w(b.packaging, 'Packaging'),
    length_cm: d(b.length, 'Length'), width_cm: d(b.width, 'Width'), height_cm: d(b.height, 'Height'),
    weight_unit: weightUnit, dimension_unit: dimUnit,
    data_status: oneOf(b.data_status, ['estimated', 'verified'] as const, 'Data', 'estimated'),
    class_key: text(b.class_key, 'Class', { max: 40 }),
    value_tier: oneOf(b.value_tier, TIERS, 'Value tier', 'standard'),
    target_pct: pct(b.target_pct, 'Recovery target'),
    min_contribution: optMoney(b.min_contribution, 'Minimum contribution'),
    max_contribution: optMoney(b.max_contribution, 'Maximum contribution'),
    adjustment_factor: optNumber(b.adjustment_factor, 'Factor', 0.01, 10) ?? 1,
    clearance_eligible: b.clearance_eligible !== false,
    subsidy_eligible: b.subsidy_eligible !== false,
    platform_contribution: optMoney(b.platform_contribution, 'Platform contribution'),
    competitor_price: optMoney(b.competitor_price, 'Competitor price') || null,
    override_contribution: override,
    override_reason: override != null ? reason : null,
  }
  if (out.min_contribution != null && out.max_contribution != null && out.min_contribution > out.max_contribution) throw new BadRequest('The minimum contribution is above the maximum.')
  return out
}

export function campaignFields(b: Record<string, unknown>) {
  const treatment = oneOf(b.shipping_treatment, ['normal', 'reduced', 'subsidised', 'below_target'] as const, 'Shipping treatment', 'normal')
  const kind = oneOf(b.discount_kind, ['percent', 'fixed'] as const, 'Discount type', 'percent')
  const starts = text(b.starts_at, 'Start', { max: 40, required: true })!
  const ends = text(b.ends_at, 'End', { max: 40, required: true })!
  if (Number.isNaN(Date.parse(starts)) || Number.isNaN(Date.parse(ends))) throw new BadRequest('Start and end must be dates.')
  if (Date.parse(ends) <= Date.parse(starts)) throw new BadRequest('The campaign must end after it starts.')
  const categories = Array.isArray(b.categories) ? b.categories.slice(0, 30).map((c) => text(c, 'Category', { max: 60, required: true })!) : []
  const out = {
    name: text(b.name, 'Name', { max: 80, required: true })!,
    starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString(),
    status: oneOf(b.status, ['draft', 'active', 'ended'] as const, 'Status', 'draft'),
    categories, discount_kind: kind,
    discount_value: kind === 'percent' ? optNumber(b.discount_value, 'Discount', 0.01, 99.99)! : money(b.discount_value, 'Discount'),
    shipping_treatment: treatment,
    keep_pct: treatment === 'normal' ? null : pct(b.keep_pct, 'Contribution kept'),
    subsidy_budget: optMoney(b.subsidy_budget, 'Subsidy budget'),
    max_subsidy_per_item: optMoney(b.max_subsidy_per_item, 'Subsidy per item'),
    min_margin_pct: optNumber(b.min_margin_pct, 'Minimum margin', -100, 100),
    funding_source: text(b.funding_source, 'Funded by', { max: 200 }),
    notes: text(b.notes, 'Notes', { max: 2000 }),
  }
  if (!out.discount_value) throw new BadRequest('Enter the discount.')
  if (treatment === 'subsidised' && out.subsidy_budget == null) throw new BadRequest('A subsidised campaign needs a budget.')
  return out
}

export const ALLOCATION = ALLOCATION_METHODS

/** The tenant's catalogue as the engine sees it (general profile per product), with the policy context. */
export async function catalogue(db: SupabaseClient, tenantId: string, now = new Date()) {
  const [ctx, products, rows] = await Promise.all([
    loadContext(db, tenantId, now),
    loadProducts(db, tenantId, null),
    db.from('products').select('id, name, category, price, status').eq('tenant_id', tenantId).neq('status', 'archived').order('name'),
  ])
  if (rows.error) throw rows.error
  const inputs: (ProductInput & { status: string })[] = (rows.data ?? []).map((p) => ({
    productId: p.id, name: p.name.trim(), category: p.category, status: p.status, priceKobo: Math.round(Number(p.price) * 100),
    costs: products.costs[p.id] ?? null, profile: profileFor(products.profiles, p.id, null),
  }))
  return { ctx, inputs, profiles: products.profiles, breakdowns: () => inputs.map((i) => priceBreakdown(i, ctx)) }
}
