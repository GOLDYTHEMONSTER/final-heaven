import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { storeToday } from '@/lib/catalog'
import {
  DEFAULT_SETTINGS, TIERS,
  type Campaign, type Context, type Costs, type Profile, type Rate, type Settings, type ShippingClass, type Tier,
} from './engine'

// Reading the shipping engine's inputs from Supabase, as the engine's types.
// Staff routes pass their own RLS client; checkout passes the service client.

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
const kobo = (v: unknown) => (v == null || v === '' ? null : Math.round(Number(v) * 100))

export function toRate(r: Record<string, any>): Rate {
  return {
    id: r.id, method: r.method, provider: r.provider, currency: r.currency, fxRate: num(r.fx_rate), billingUnit: r.billing_unit,
    ratePerUnit: Number(r.rate_per_unit), volumetricDivisor: num(r.volumetric_divisor), minChargeable: num(r.min_chargeable),
    roundingIncrement: num(r.rounding_increment), minShipmentCharge: num(r.min_shipment_charge), surchargePerUnit: num(r.surcharge_per_unit),
    handlingPerShipment: num(r.handling_per_shipment), clearanceIncluded: r.clearance_included === true, clearancePerUnit: num(r.clearance_per_unit),
    insurancePct: num(r.insurance_pct), contingencyPct: num(r.contingency_pct), typicalShipmentUnits: num(r.typical_shipment_units),
    effectiveFrom: String(r.effective_from), effectiveTo: r.effective_to ? String(r.effective_to) : null, status: r.status, confirmed: Boolean(r.confirmed_at),
  }
}

export function toSettings(r: Record<string, any> | null): Settings {
  if (!r) return DEFAULT_SETTINGS
  const factors = (r.value_tier_factors ?? {}) as Record<string, unknown>
  return {
    recoveryTargetPct: Number(r.recovery_target_pct), reserveSharePct: Number(r.reserve_share_pct), platformContributionPct: Number(r.platform_contribution_pct),
    maxContributionPctOfPrice: num(r.max_contribution_pct_of_price),
    valueTierFactors: Object.fromEntries(TIERS.map((t) => [t, Number(factors[t]) > 0 ? Number(factors[t]) : 1])) as Record<Tier, number>,
    minMarginPct: num(r.min_margin_pct), targetMarginPct: num(r.target_margin_pct), paymentFeePct: num(r.payment_fee_pct),
    paymentFeeFixed: num(r.payment_fee_fixed), platformRecognisedOn: r.platform_recognised_on === 'shipped' ? 'shipped' : 'delivered',
  }
}

export function toClass(r: Record<string, any>): ShippingClass {
  return {
    key: r.key, name: r.name, sort: Number(r.sort), maxChargeableKg: num(r.max_chargeable_kg), minContributionKobo: kobo(r.min_contribution),
    maxContributionKobo: kobo(r.max_contribution), maxContributionPctOfPrice: num(r.max_contribution_pct_of_price), adjustmentFactor: Number(r.adjustment_factor) || 1,
  }
}

export function toProfile(r: Record<string, any>): Profile {
  return {
    productId: r.product_id, variant: r.variant ?? '', method: r.method, weightKg: num(r.weight_kg), lengthCm: num(r.length_cm), widthCm: num(r.width_cm),
    heightCm: num(r.height_cm), packagingKg: num(r.packaging_kg), dataStatus: r.data_status, classKey: r.class_key ?? null, valueTier: r.value_tier,
    targetPct: num(r.target_pct), minContributionKobo: kobo(r.min_contribution), maxContributionKobo: kobo(r.max_contribution),
    adjustmentFactor: Number(r.adjustment_factor) || 1, clearanceEligible: r.clearance_eligible !== false, subsidyEligible: r.subsidy_eligible !== false,
    platformContributionKobo: kobo(r.platform_contribution), competitorPriceKobo: kobo(r.competitor_price),
    override: r.override_contribution != null ? { kobo: kobo(r.override_contribution)!, reason: r.override_reason ?? '' } : null,
  }
}

export function toCosts(r: Record<string, any> | null | undefined): Costs | null {
  if (!r) return null
  return { unitCost: num(r.unit_cost), currency: r.cost_currency ?? 'CNY', fxRate: num(r.fx_rate), chinaLogistics: num(r.shipping_cost_ngn), customs: num(r.customs_cost_ngn), other: num(r.other_cost_ngn) }
}

export function toCampaign(r: Record<string, any>, productIds: string[], spentKobo: number): Campaign {
  return {
    id: r.id, name: r.name, startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString(), status: r.status,
    productIds, categories: r.categories ?? [], discount: { kind: r.discount_kind, value: Number(r.discount_value) },
    treatment: r.shipping_treatment, keepPct: num(r.keep_pct), budgetKobo: kobo(r.subsidy_budget), spentKobo,
    maxSubsidyPerItemKobo: kobo(r.max_subsidy_per_item), minMarginPct: num(r.min_margin_pct), approved: Boolean(r.approved_at),
  }
}

export const PROFILE_COLUMNS = 'product_id, variant, method, weight_kg, length_cm, width_cm, height_cm, packaging_kg, weight_unit, dimension_unit, data_status, class_key, value_tier, target_pct, min_contribution, max_contribution, adjustment_factor, clearance_eligible, subsidy_eligible, platform_contribution, competitor_price, override_contribution, override_reason, override_by, override_at, last_calculated_at, updated_at'
const SOURCE_COLUMNS = 'product_id, unit_cost, cost_currency, fx_rate, shipping_cost_ngn, customs_cost_ngn, other_cost_ngn'

/** A tenant's policy, rates, campaigns and the freight its reconciled sea batches really cost per unit. */
export async function loadContext(db: SupabaseClient, tenantId: string, now = new Date(), today?: string): Promise<Context> {
  const [settings, classes, rates, campaigns, links, spent, seaLines] = await Promise.all([
    db.from('shipping_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    db.from('shipping_classes').select('*').eq('tenant_id', tenantId).order('sort'),
    db.from('shipping_rates').select('*').eq('tenant_id', tenantId),
    db.from('clearance_campaigns').select('*').eq('tenant_id', tenantId).neq('status', 'draft'),
    db.from('clearance_campaign_products').select('campaign_id, product_id, restored_at').eq('tenant_id', tenantId),
    db.from('shipping_ledger').select('campaign_id, amount').eq('tenant_id', tenantId).eq('kind', 'promo_subsidy'),
    db.from('freight_shipment_lines').select('product_id, quantity_ordered, quantity_received, allocated_costs, created_at, shipment:freight_shipments!inner(method, status, reconciled_at)')
      .eq('tenant_id', tenantId).not('allocated_costs', 'is', null),
  ])
  for (const r of [settings, classes, rates, campaigns, links, spent, seaLines]) if (r.error) throw r.error
  const spentBy = new Map<string, number>()
  for (const s of spent.data ?? []) spentBy.set(s.campaign_id, (spentBy.get(s.campaign_id) ?? 0) + Math.round(Number(s.amount) * 100))
  // The latest reconciled sea batch per product: its freight and duties per unit.
  const seaFreightKobo: Record<string, number> = {}
  const latest = new Map<string, string>()
  for (const l of (seaLines.data ?? []) as any[]) {
    if (l.shipment?.method !== 'sea' || l.shipment?.status !== 'reconciled') continue
    const units = l.quantity_received > 0 && l.quantity_received < l.quantity_ordered ? l.quantity_received : l.quantity_ordered
    const when = l.shipment.reconciled_at ?? l.created_at
    if ((latest.get(l.product_id) ?? '') > when) continue
    latest.set(l.product_id, when)
    seaFreightKobo[l.product_id] = Math.round((Number(l.allocated_costs) * 100) / units)
  }
  return {
    today: today ?? storeToday('Africa/Lagos', now),
    now,
    settings: toSettings(settings.data),
    classes: (classes.data ?? []).map(toClass),
    rates: (rates.data ?? []).map(toRate),
    campaigns: (campaigns.data ?? []).map((c) => toCampaign(c,
      (links.data ?? []).filter((l) => l.campaign_id === c.id && !l.restored_at).map((l) => l.product_id), spentBy.get(c.id) ?? 0)),
    seaFreightKobo,
  }
}

/** Shipping profiles and staff costs for some products (or all of a tenant's, when ids is null). */
export async function loadProducts(db: SupabaseClient, tenantId: string, ids: string[] | null) {
  let profiles = db.from('product_shipping_profiles').select(PROFILE_COLUMNS).eq('tenant_id', tenantId)
  let sources = db.from('product_sources').select(SOURCE_COLUMNS).eq('tenant_id', tenantId)
  if (ids) {
    profiles = profiles.in('product_id', ids)
    sources = sources.in('product_id', ids)
  }
  const [p, s] = await Promise.all([profiles, sources])
  if (p.error) throw p.error
  if (s.error) throw s.error
  return {
    profiles: (p.data ?? []).map(toProfile),
    costs: Object.fromEntries((s.data ?? []).map((r) => [r.product_id, toCosts(r)])) as Record<string, Costs | null>,
  }
}
