// The Smart Shipping engine: every shipping and cost-recovery formula, in one
// place. Pure (no database, no clock unless one is passed in), so it is tested
// directly (tests/unit/shipping.test.ts) and runs on the server only:
//  - checkout snapshots each order's allocation (lib/checkout, allocateOrder),
//  - the admin previews prices, simulates rates and reconciles freight
//    invoices (app/api/admin/shipping).
//
// Money is integer kobo (NGN minor units) throughout; weights in kg, sizes in
// cm, volumes in cubic metres. Nothing here has a default freight rate: with
// no confirmed rate an estimate is 'incomplete', never a guess.
//
// The words, as used everywhere in the code and the admin:
//   freight        the international freight allocated to a unit (estimate)
//   target         freight × the recovery target % (50% unless configured)
//   contribution   the part of the selling price set aside for shipping
//   recovery       the part of the contribution that pays freight
//   reserve        the part of the contribution kept for logistics surprises
//                  (never revenue)
//   platform       the platform's own share of the price (held until the
//                  order is delivered, then earned)
//   subsidy        freight a clearance campaign pays for, out of its budget
//   unfunded       freight that nothing above pays for: margin, the reserve
//                  or the business absorbs it, and it is always shown

export type Method = 'air' | 'sea'
export type Confidence = 'verified' | 'estimated' | 'incomplete'
export type Tier = 'low' | 'standard' | 'premium' | 'luxury'
export const TIERS: Tier[] = ['low', 'standard', 'premium', 'luxury']

const kobo = (naira: number) => Math.round(naira * 100)
const round3 = (n: number) => Math.round(n * 1000) / 1000
/** Rounds kobo to whole naira (half up): contributions are set in whole naira. */
const wholeNaira = (k: number) => Math.round(k / 100) * 100
const pct1 = (n: number) => Math.round(n * 10) / 10

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

export type Rate = {
  id: string
  method: Method
  provider: string
  currency: string
  /** Naira per one unit of `currency`; not needed for NGN. */
  fxRate: number | null
  /** What the forwarder bills by: kg (air, some sea) or cubic metres (sea). */
  billingUnit: 'kg' | 'cbm'
  ratePerUnit: number
  /** cm³ per kg for volumetric weight (often 5000 or 6000 for air); each forwarder sets its own. */
  volumetricDivisor: number | null
  /** Per shipment, in the billing unit. */
  minChargeable: number | null
  /** Per shipment: billed units round up to this step (e.g. 0.5 kg). */
  roundingIncrement: number | null
  minShipmentCharge: number | null
  surchargePerUnit: number | null
  handlingPerShipment: number | null
  clearanceIncluded: boolean
  /** Clearance per billing unit when the rate doesn't include it. */
  clearancePerUnit: number | null
  /** % of the goods value. */
  insurancePct: number | null
  /** % added to estimates for surprises (packaging, re-weighing). */
  contingencyPct: number | null
  /** A usual shipment's size in billing units, to spread per-shipment charges over products. */
  typicalShipmentUnits: number | null
  effectiveFrom: string
  effectiveTo: string | null
  status: 'active' | 'inactive' | 'superseded'
  /** Entered or confirmed by a member of staff. Unconfirmed rates are never used. */
  confirmed: boolean
}

export type RateState = 'in_force' | 'upcoming' | 'expired' | 'inactive' | 'unconfirmed'

export function rateState(rate: Rate, today: string): RateState {
  if (rate.status !== 'active') return 'inactive'
  if (!rate.confirmed) return 'unconfirmed'
  if (rate.effectiveFrom > today) return 'upcoming'
  if (rate.effectiveTo && rate.effectiveTo < today) return 'expired'
  return 'in_force'
}

/** The rate in force for a method today (the latest to take effect), or why there is none. */
export function activeRate(rates: Rate[], method: Method, today: string): { rate: Rate | null; warning: string | null } {
  const mine = rates.filter((r) => r.method === method)
  const live = mine.filter((r) => rateState(r, today) === 'in_force').sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
  if (live[0]) {
    const ends = live[0].effectiveTo
    return { rate: live[0], warning: ends && ends <= addDays(today, 14) ? `The ${method} rate from ${live[0].provider} ends on ${ends}. Add the next one.` : null }
  }
  const expired = mine.filter((r) => rateState(r, today) === 'expired').sort((a, b) => (b.effectiveTo ?? '').localeCompare(a.effectiveTo ?? ''))[0]
  if (expired) return { rate: null, warning: `The ${method} rate from ${expired.provider} expired on ${expired.effectiveTo}. ${cap(method)} estimates are incomplete until a new rate is added.` }
  return { rate: null, warning: `No ${method} freight rate is set. ${cap(method)} estimates are incomplete until you add your forwarder’s rate.` }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const fx = (rate: Pick<Rate, 'currency' | 'fxRate'>) => (rate.currency === 'NGN' ? 1 : rate.fxRate ?? NaN)

/** A rate's all-in cost per billing unit in kobo (freight, surcharges, clearance, spread handling, contingency). */
export function perUnitCost(rate: Rate): { kobo: number; parts: { label: string; kobo: number }[]; warnings: string[] } {
  const f = fx(rate)
  const warnings: string[] = []
  const unit = rate.billingUnit
  const parts = [{ label: `Freight (${rate.currency} ${rate.ratePerUnit}/${unit})`, kobo: kobo(rate.ratePerUnit * f) }]
  if (rate.surchargePerUnit) parts.push({ label: 'Surcharges', kobo: kobo(rate.surchargePerUnit * f) })
  if (!rate.clearanceIncluded) {
    if (rate.clearancePerUnit != null) parts.push({ label: 'Clearance', kobo: kobo(rate.clearancePerUnit * f) })
    else warnings.push('Clearance isn’t included in this rate and has no price, so estimates leave it out.')
  }
  if (rate.handlingPerShipment) {
    if (rate.typicalShipmentUnits) parts.push({ label: 'Handling, spread over a usual shipment', kobo: kobo((rate.handlingPerShipment / rate.typicalShipmentUnits) * f) })
    else warnings.push('Per-shipment handling isn’t spread over products: set a usual shipment size on the rate.')
  }
  const subtotal = parts.reduce((t, p) => t + p.kobo, 0)
  if (rate.contingencyPct) parts.push({ label: `Contingency ${rate.contingencyPct}%`, kobo: Math.round((subtotal * rate.contingencyPct) / 100) })
  return { kobo: parts.reduce((t, p) => t + p.kobo, 0), parts, warnings }
}

// ---------------------------------------------------------------------------
// Weight and volume
// ---------------------------------------------------------------------------

export type Physical = {
  /** Packed weight of one unit. */
  weightKg: number | null
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  /** Extra packing added per unit (polybag, box, padding). */
  packagingKg: number | null
}

export type Chargeable =
  | { ok: true; units: number; actualKg: number | null; volumetricKg: number | null; cbm: number | null; basis: 'actual' | 'volumetric' | 'volume'; dimsMissing: boolean }
  | { ok: false; missing: string }

const dims = (p: Physical) => (p.lengthCm && p.widthCm && p.heightCm ? p.lengthCm * p.widthCm * p.heightCm : null)

/**
 * One unit's billable quantity under a rate: for kg rates, the greater of the
 * packed weight and the volumetric weight (when the forwarder has a divisor and
 * the dimensions are known); for cbm rates, the packed volume.
 */
export function chargeable(p: Physical, rate: Pick<Rate, 'billingUnit' | 'volumetricDivisor'>): Chargeable {
  const volume = dims(p)
  if (rate.billingUnit === 'cbm') {
    if (!volume) return { ok: false, missing: 'the packed dimensions' }
    const cbm = Math.round((volume / 1_000_000) * 1e6) / 1e6
    return { ok: true, units: cbm, actualKg: p.weightKg, volumetricKg: null, cbm, basis: 'volume', dimsMissing: false }
  }
  if (!p.weightKg || p.weightKg <= 0) return { ok: false, missing: 'the packed weight' }
  const actualKg = round3(p.weightKg + (p.packagingKg ?? 0))
  const volumetricKg = volume && rate.volumetricDivisor ? round3(volume / rate.volumetricDivisor) : null
  const useVolume = volumetricKg != null && volumetricKg > actualKg
  return {
    ok: true, units: useVolume ? volumetricKg! : actualKg, actualKg, volumetricKg,
    cbm: volume ? Math.round((volume / 1_000_000) * 1e6) / 1e6 : null,
    basis: useVolume ? 'volumetric' : 'actual', dimsMissing: !volume,
  }
}

/**
 * What a whole shipment costs under a rate: the minimum chargeable quantity,
 * the forwarder's rounding step and minimum charge apply here, to the
 * shipment, never to each product (that would count them many times over).
 */
export function shipmentCharge(rate: Rate, units: number, goodsKobo = 0) {
  const f = fx(rate)
  let billed = Math.max(units, rate.minChargeable ?? 0)
  if (rate.roundingIncrement) billed = Math.ceil(round3(billed / rate.roundingIncrement) - 1e-9) * rate.roundingIncrement
  billed = round3(billed)
  const perUnit = rate.ratePerUnit + (rate.surchargePerUnit ?? 0) + (!rate.clearanceIncluded ? rate.clearancePerUnit ?? 0 : 0)
  let freight = kobo(billed * perUnit * f)
  const minApplied = rate.minShipmentCharge != null && freight < kobo(rate.minShipmentCharge * f)
  if (minApplied) freight = kobo(rate.minShipmentCharge! * f)
  const handling = kobo((rate.handlingPerShipment ?? 0) * f)
  const insurance = rate.insurancePct ? Math.round((goodsKobo * rate.insurancePct) / 100) : 0
  const charge = freight + handling + insurance
  const contingency = rate.contingencyPct ? Math.round((charge * rate.contingencyPct) / 100) : 0
  return { units: round3(units), billedUnits: billed, minApplied, freightKobo: freight, handlingKobo: handling, insuranceKobo: insurance, chargeKobo: charge, contingencyKobo: contingency, estimateKobo: charge + contingency }
}

/** One unit's freight allocation: its billable quantity × the all-in unit cost, plus insurance on its goods value. */
export function freightPerUnit(p: Physical, rate: Rate, goodsKobo: number | null) {
  const c = chargeable(p, rate)
  if (!c.ok) return c
  const unit = perUnitCost(rate)
  const insurance = rate.insurancePct && goodsKobo ? Math.round((goodsKobo * rate.insurancePct) / 100) : 0
  const warnings = [...unit.warnings]
  if (rate.insurancePct && !goodsKobo) warnings.push('Insurance is left out: the product has no supplier cost.')
  if (c.dimsMissing && rate.volumetricDivisor) warnings.push('No packed dimensions: volumetric weight wasn’t checked.')
  return { ok: true as const, chargeable: c, kobo: Math.round(c.units * unit.kobo) + insurance, unitKobo: unit.kobo, insuranceKobo: insurance, warnings }
}

// ---------------------------------------------------------------------------
// Policy: settings, shipping classes, product profiles
// ---------------------------------------------------------------------------

export type Settings = {
  /** % of freight that ordinary products' contributions aim to recover. */
  recoveryTargetPct: number
  /** % of each contribution kept in the logistics reserve (the recommendation grows to make up for it). */
  reserveSharePct: number
  /** % of the price kept as platform contribution, unless a product sets its own amount. */
  platformContributionPct: number
  /** Contribution never above this % of the price (null: no cap), unless the class sets its own. */
  maxContributionPctOfPrice: number | null
  /** Multipliers on the target by perceived value (1 = no change). */
  valueTierFactors: Record<Tier, number>
  /** Margin after freight below this % needs financial review (negative always does). */
  minMarginPct: number | null
  /** When set, previews propose a price that reaches this margin. */
  targetMarginPct: number | null
  /** Payment processing (Flutterwave): % of the price and a fixed amount in naira; null = not configured. */
  paymentFeePct: number | null
  paymentFeeFixed: number | null
  /** When platform contribution counts as earned. */
  platformRecognisedOn: 'delivered' | 'shipped'
}

/** The starting policy: the 50% target from the brief; every other lever neutral until staff set it. */
export const DEFAULT_SETTINGS: Settings = {
  recoveryTargetPct: 50, reserveSharePct: 0, platformContributionPct: 0, maxContributionPctOfPrice: null,
  valueTierFactors: { low: 1, standard: 1, premium: 1, luxury: 1 }, minMarginPct: 0, targetMarginPct: null,
  paymentFeePct: null, paymentFeeFixed: null, platformRecognisedOn: 'delivered',
}

export type ShippingClass = {
  key: string
  name: string
  sort: number
  /** Units up to this chargeable weight fall in this class (null: anything heavier, e.g. bulky). */
  maxChargeableKg: number | null
  minContributionKobo: number | null
  maxContributionKobo: number | null
  maxContributionPctOfPrice: number | null
  adjustmentFactor: number
}

/** The class a unit falls in: the staff's choice, else the first by chargeable weight, else the open-ended one. */
export function classFor(kg: number | null, classes: ShippingClass[], chosen: string | null): ShippingClass | null {
  if (chosen) return classes.find((c) => c.key === chosen) ?? null
  if (kg == null) return null
  const sorted = [...classes].sort((a, b) => a.sort - b.sort)
  return sorted.find((c) => c.maxChargeableKg != null && kg <= c.maxChargeableKg) ?? sorted.find((c) => c.maxChargeableKg == null) ?? null
}

export type Profile = Physical & {
  productId: string
  /** '' for the whole product, or the size this profile applies to. */
  variant: string
  method: Method
  dataStatus: 'estimated' | 'verified'
  classKey: string | null
  valueTier: Tier
  targetPct: number | null
  minContributionKobo: number | null
  maxContributionKobo: number | null
  adjustmentFactor: number
  clearanceEligible: boolean
  subsidyEligible: boolean
  platformContributionKobo: number | null
  competitorPriceKobo: number | null
  /** A contribution set by staff, with their reason (audited in the database). */
  override: { kobo: number; reason: string } | null
}

/** The profile for a size, falling back to the product's general one. */
export function profileFor(profiles: Profile[], productId: string, size: string | null): Profile | null {
  return profiles.find((p) => p.productId === productId && size != null && p.variant === size)
    ?? profiles.find((p) => p.productId === productId && p.variant === '') ?? null
}

// ---------------------------------------------------------------------------
// Clearance campaigns
// ---------------------------------------------------------------------------

export type Treatment = 'normal' | 'reduced' | 'subsidised' | 'below_target'

export type Campaign = {
  id: string
  name: string
  startsAt: string
  endsAt: string
  status: 'draft' | 'active' | 'ended'
  productIds: string[]
  categories: string[]
  discount: { kind: 'percent' | 'fixed'; value: number }
  treatment: Treatment
  /** For reduced, below-target and subsidised: the % of the normal contribution kept. */
  keepPct: number | null
  budgetKobo: number | null
  spentKobo: number
  maxSubsidyPerItemKobo: number | null
  minMarginPct: number | null
  /** Below-target campaigns need a finance approval before they apply. */
  approved: boolean
}

/** Whether a campaign covers a product right now. */
export function campaignApplies(c: Campaign, productId: string, category: string | null, now: Date) {
  const t = now.toISOString()
  if (c.status !== 'active' || c.startsAt > t || c.endsAt <= t) return false
  if (c.treatment === 'below_target' && !c.approved) return false
  return c.productIds.includes(productId) || (category != null && c.categories.includes(category))
}

/** A campaign's price for a product: rounded down to whole naira, never below ₦100 (the smallest online charge). */
export function clearancePriceKobo(priceKobo: number, discount: Campaign['discount']) {
  const off = discount.kind === 'percent' ? Math.round((priceKobo * discount.value) / 100) : kobo(discount.value)
  return Math.max(10_000, Math.floor((priceKobo - off) / 100) * 100)
}

// ---------------------------------------------------------------------------
// Contribution: the central rule
// ---------------------------------------------------------------------------

export type Flag =
  | 'no_freight_estimate' | 'raised_to_minimum' | 'capped_at_maximum' | 'capped_by_price' | 'override'
  | 'below_target' | 'campaign_reduced' | 'approved_below_target' | 'campaign_subsidy' | 'subsidy_budget_exhausted'
  | 'not_subsidy_eligible' | 'capped_at_price' | 'gift' | 'discount_reduced_contribution'

export type Contribution = {
  freightKobo: number | null
  targetKobo: number | null
  recommendedKobo: number
  contributionKobo: number
  recoveryKobo: number
  reserveKobo: number
  platformKobo: number
  subsidyKobo: number
  recoveryPct: number | null
  gapToTargetKobo: number
  unfundedKobo: number
  flags: Flag[]
}

type ContributionProfile = Pick<Profile, 'targetPct' | 'minContributionKobo' | 'maxContributionKobo' | 'adjustmentFactor' | 'valueTier'
  | 'clearanceEligible' | 'subsidyEligible' | 'platformContributionKobo' | 'override'>

/**
 * How much of one unit's price carries shipping, and where it goes.
 *
 *   target        = freight × target %
 *   recommended   = target ÷ (1 − reserve share) × class, value-tier and product factors,
 *                   raised to the minimum, lowered to the maximum, then to the
 *                   % of price cap (the cap wins over the minimum), in whole naira
 *   contribution  = the staff override if any, else the recommendation; a
 *                   clearance campaign may then keep only part of it
 *   reserve       = contribution × reserve share;  recovery = the rest
 *   subsidy       = (subsidised campaigns) what's missing to the target, within
 *                   the campaign's per-item and remaining budget
 *   unfunded      = freight − recovery − subsidy (≥ 0): always reported
 */
export function contribution({ priceKobo, freightKobo, profile, cls, settings, campaign = null, subsidyLeftKobo = null }: {
  priceKobo: number
  freightKobo: number | null
  profile: ContributionProfile
  cls: ShippingClass | null
  settings: Settings
  campaign?: Campaign | null
  /** What the campaign's budget still holds for this unit (null: check later). */
  subsidyLeftKobo?: number | null
}): Contribution {
  const flags: Flag[] = []
  const share = Math.min(Math.max(settings.reserveSharePct, 0), 95) / 100
  const targetPct = profile.targetPct ?? settings.recoveryTargetPct
  const target = freightKobo != null ? Math.round((freightKobo * targetPct) / 100) : null
  if (freightKobo == null) flags.push('no_freight_estimate')

  let c = target != null
    ? (target / (1 - share)) * (cls?.adjustmentFactor ?? 1) * (settings.valueTierFactors[profile.valueTier] ?? 1) * (profile.adjustmentFactor || 1)
    : 0
  const min = profile.minContributionKobo ?? cls?.minContributionKobo ?? null
  const max = profile.maxContributionKobo ?? cls?.maxContributionKobo ?? null
  const pctCap = cls?.maxContributionPctOfPrice ?? settings.maxContributionPctOfPrice
  if (min != null && c < min) { c = min; flags.push('raised_to_minimum') }
  if (max != null && c > max) { c = max; flags.push('capped_at_maximum') }
  if (pctCap != null && c > (priceKobo * pctCap) / 100) { c = Math.floor((priceKobo * pctCap) / 100 / 100) * 100; flags.push('capped_by_price') }
  c = wholeNaira(c)
  const recommended = c
  if (profile.override) { c = profile.override.kobo; flags.push('override') }

  let platform = profile.platformContributionKobo ?? wholeNaira((priceKobo * settings.platformContributionPct) / 100)
  let subsidy = 0
  if (campaign && profile.clearanceEligible) {
    if (campaign.treatment !== 'normal') {
      c = wholeNaira((c * (campaign.keepPct ?? (campaign.treatment === 'subsidised' ? 0 : 100))) / 100)
      flags.push(campaign.treatment === 'below_target' ? 'approved_below_target' : 'campaign_reduced')
    }
    if (campaign.treatment === 'subsidised' && target != null) {
      const wanted = Math.max(0, target - Math.round(c * (1 - share)))
      if (!profile.subsidyEligible) flags.push('not_subsidy_eligible')
      else if (wanted > 0) {
        const left = subsidyLeftKobo ?? Math.max(0, (campaign.budgetKobo ?? 0) - campaign.spentKobo)
        subsidy = Math.min(wanted, campaign.maxSubsidyPerItemKobo ?? wanted, left)
        flags.push(subsidy > 0 ? 'campaign_subsidy' : 'subsidy_budget_exhausted')
      }
    }
  }
  // Shipping and platform shares can't be more than the price itself: the platform gives way first.
  if (c + platform > priceKobo) {
    platform = Math.max(0, priceKobo - c)
    c = Math.min(c, priceKobo)
    flags.push('capped_at_price')
  }
  const reserve = Math.round(c * share)
  const recovery = c - reserve
  const funded = recovery + subsidy
  const gap = target != null ? Math.max(0, target - funded) : 0
  if (gap > 0) flags.push('below_target')
  return {
    freightKobo, targetKobo: target, recommendedKobo: recommended, contributionKobo: c, recoveryKobo: recovery, reserveKobo: reserve,
    platformKobo: platform, subsidyKobo: subsidy, recoveryPct: freightKobo ? pct1((funded / freightKobo) * 100) : null,
    gapToTargetKobo: gap, unfundedKobo: freightKobo != null ? Math.max(0, freightKobo - funded) : 0, flags,
  }
}

// ---------------------------------------------------------------------------
// Product price breakdown (the product editor's preview)
// ---------------------------------------------------------------------------

/** Staff-entered costs per unit (product_sources). chinaLogistics is shipping inside China, before the forwarder. */
export type Costs = { unitCost: number | null; currency: string; fxRate: number | null; chinaLogistics: number | null; customs: number | null; other: number | null }

export type PriceStatus = 'ready' | 'ready_with_warnings' | 'missing_data' | 'needs_review'
export const PRICE_STATUS_LABEL: Record<PriceStatus, string> = {
  ready: 'Ready to publish', ready_with_warnings: 'Ready, with warnings', missing_data: 'Missing shipping data', needs_review: 'Needs financial review',
}

export type ProductInput = {
  productId: string
  name?: string
  category?: string | null
  priceKobo: number
  size?: string | null
  costs: Costs | null
  profile: Profile | null
}

export type Context = {
  today: string
  now: Date
  settings: Settings
  classes: ShippingClass[]
  rates: Rate[]
  campaigns: Campaign[]
  /** Freight per unit actually paid for products bought in by sea (reconciled batches). */
  seaFreightKobo: Record<string, number>
}

/** Supplier cost in kobo, or what's missing. */
export function supplierKobo(c: Costs | null): { kobo: number } | { missing: string } {
  if (!c || c.unitCost == null) return { missing: 'the supplier cost' }
  const r = c.currency === 'NGN' ? 1 : c.fxRate
  if (!r) return { missing: `the ${c.currency} to naira rate` }
  return { kobo: kobo(c.unitCost * r) }
}

/** One unit's freight estimate for a product, with its billable weight and how sure it is. */
export function unitFreight(input: Pick<ProductInput, 'productId' | 'profile' | 'costs'>, ctx: Context) {
  const p = input.profile
  const warnings: string[] = []
  if (!p) return { kobo: null, chargeableKg: null, method: 'air' as Method, rate: null, confidence: 'incomplete' as Confidence, warnings: ['No packed weight or size recorded yet.'] }
  const sea = p.method === 'sea' ? ctx.seaFreightKobo[input.productId] : undefined
  if (sea != null) return { kobo: sea, chargeableKg: p.weightKg, method: p.method, rate: null, confidence: 'verified' as Confidence, warnings }
  const { rate, warning } = activeRate(ctx.rates, p.method, ctx.today)
  if (warning) warnings.push(warning)
  if (!rate) {
    const kg = p.weightKg ? round3(p.weightKg + (p.packagingKg ?? 0)) : null
    return { kobo: null, chargeableKg: kg, method: p.method, rate: null, confidence: 'incomplete' as Confidence, warnings }
  }
  const goods = supplierKobo(input.costs)
  const f = freightPerUnit(p, rate, 'kobo' in goods ? goods.kobo : null)
  if (!f.ok) return { kobo: null, chargeableKg: null, method: p.method, rate, confidence: 'incomplete' as Confidence, warnings: [...warnings, `Missing ${f.missing}.`] }
  warnings.push(...f.warnings)
  const confidence: Confidence = p.dataStatus === 'verified' && !f.chargeable.dimsMissing ? 'verified' : 'estimated'
  if (p.dataStatus !== 'verified') warnings.push('Weight and size are estimates, not measured.')
  const kg = f.chargeable.cbm != null && rate.billingUnit === 'cbm' ? p.weightKg : f.chargeable.units
  return { kobo: f.kobo, chargeableKg: kg, cbm: f.chargeable.cbm, basis: f.chargeable.basis, method: p.method, rate, confidence, warnings }
}

/**
 * The full price picture for one unit at a price:
 *   price = supplier cost + China-side logistics + customs and other costs
 *         + payment fees + shipping contribution + platform contribution + product margin
 * and, beside it, how much of the freight the contribution recovers and the
 * margin left once unfunded freight is paid for.
 */
export function priceBreakdown(input: ProductInput, ctx: Context, opts: { campaign?: Campaign | null } = {}) {
  const warnings: string[] = []
  const freight = unitFreight(input, ctx)
  warnings.push(...freight.warnings)
  const p = input.profile
  const cls = classFor(freight.chargeableKg ?? null, ctx.classes, p?.classKey ?? null)
  const c = contribution({
    priceKobo: input.priceKobo, freightKobo: freight.kobo, cls, settings: ctx.settings, campaign: opts.campaign ?? null,
    profile: p ?? { targetPct: null, minContributionKobo: null, maxContributionKobo: null, adjustmentFactor: 1, valueTier: 'standard',
      clearanceEligible: true, subsidyEligible: true, platformContributionKobo: null, override: null },
  })
  const supplier = supplierKobo(input.costs)
  if ('missing' in supplier) warnings.push(`Add ${supplier.missing} to see the margin.`)
  const china = kobo(input.costs?.chinaLogistics ?? 0)
  const customsOther = kobo((input.costs?.customs ?? 0) + (input.costs?.other ?? 0))
  const s = ctx.settings
  const fees = s.paymentFeePct == null && s.paymentFeeFixed == null ? null
    : Math.round((input.priceKobo * (s.paymentFeePct ?? 0)) / 100) + kobo(s.paymentFeeFixed ?? 0)
  if (fees == null) warnings.push('Payment fees aren’t configured, so the margin leaves them out.')
  const productMargin = 'kobo' in supplier
    ? input.priceKobo - supplier.kobo - china - customsOther - (fees ?? 0) - c.contributionKobo - c.platformKobo
    : null
  const marginAfterFreight = productMargin != null ? productMargin - c.unfundedKobo : null
  const marginPct = marginAfterFreight != null && input.priceKobo > 0 ? pct1((marginAfterFreight / input.priceKobo) * 100) : null

  if (c.flags.includes('below_target')) warnings.push(`Recovers ${c.recoveryPct ?? 0}% of freight, below the ${p?.targetPct ?? s.recoveryTargetPct}% target: the gap is recorded.`)
  if (c.flags.includes('capped_by_price')) warnings.push('The contribution is capped by the % of price limit.')
  if (p?.competitorPriceKobo && input.priceKobo > p.competitorPriceKobo) warnings.push('Priced above the competitor price recorded.')

  // A price that would reach the target margin, with freight paid in full.
  let proposedKobo: number | null = null
  if (s.targetMarginPct != null && 'kobo' in supplier && freight.kobo != null) {
    const variablePct = (s.targetMarginPct + (s.paymentFeePct ?? 0) + (p?.platformContributionKobo == null ? s.platformContributionPct : 0)) / 100
    const fixed = supplier.kobo + china + customsOther + freight.kobo + kobo(s.paymentFeeFixed ?? 0) + (p?.platformContributionKobo ?? 0)
    if (variablePct < 1) proposedKobo = Math.ceil(fixed / (1 - variablePct) / 10_000) * 10_000 // up to the next ₦100
  }

  let status: PriceStatus = 'ready'
  if (!p || !p.weightKg) status = 'missing_data'
  else if (marginAfterFreight != null && (marginAfterFreight < 0 || (s.minMarginPct != null && marginPct! < s.minMarginPct))) status = 'needs_review'
  else if (warnings.length) status = 'ready_with_warnings'
  if (status === 'needs_review') warnings.unshift(marginAfterFreight! < 0 ? 'Loses money once freight is paid.' : `Margin after freight is under the ${s.minMarginPct}% minimum.`)

  return {
    productId: input.productId, name: input.name ?? null, category: input.category ?? null, priceKobo: input.priceKobo,
    method: freight.method, chargeableKg: freight.chargeableKg ?? null, classKey: cls?.key ?? null, className: cls?.name ?? null,
    rateId: freight.rate?.id ?? null, confidence: freight.confidence,
    supplierKobo: 'kobo' in supplier ? supplier.kobo : null, chinaKobo: china, customsOtherKobo: customsOther, paymentFeesKobo: fees,
    ...c, productMarginKobo: productMargin, marginAfterFreightKobo: marginAfterFreight, marginPct, proposedPriceKobo: proposedKobo,
    status, warnings: [...new Set(warnings)],
  }
}

export type Breakdown = ReturnType<typeof priceBreakdown>

/** A product under a clearance campaign: its campaign price and what that does to recovery and margin. */
export function clearanceBreakdown(input: ProductInput, ctx: Context, campaign: Campaign) {
  const priceKobo = clearancePriceKobo(input.priceKobo, campaign.discount)
  const b = priceBreakdown({ ...input, priceKobo }, ctx, { campaign: input.profile?.clearanceEligible === false ? null : campaign })
  const minPct = campaign.minMarginPct ?? ctx.settings.minMarginPct
  const negative = b.marginAfterFreightKobo != null && b.marginAfterFreightKobo < 0
  const belowMin = !negative && b.marginPct != null && minPct != null && b.marginPct < minPct
  return { ...b, clearancePriceKobo: priceKobo, excluded: input.profile?.clearanceEligible === false, negative, belowMin, needsApproval: negative || belowMin || b.marginAfterFreightKobo == null }
}

// ---------------------------------------------------------------------------
// Orders: the allocation snapshot saved with a checkout
// ---------------------------------------------------------------------------

export type OrderLine = { productId: string; size: string | null; quantity: number; unitKobo: number; category: string | null; gift?: boolean }

export type SnapshotLine = {
  productId: string
  size: string | null
  quantity: number
  /** The unit price paid before any promo discount. */
  unitKobo: number
  method: Method
  gift: boolean
  chargeableKg: number | null
  classKey: string | null
  campaignId: string | null
  confidence: Confidence
  /** Line totals (unit × quantity), in kobo. */
  freightKobo: number
  targetKobo: number
  contributionKobo: number
  recoveryKobo: number
  reserveKobo: number
  platformKobo: number
  subsidyKobo: number
  discountKobo: number
  unfundedKobo: number
  flags: Flag[]
}

export type Snapshot = {
  version: 1
  computedAt: string
  status: Confidence
  rates: Partial<Record<Method, { id: string; provider: string; currency: string; fxRate: number | null; billingUnit: string; perUnitKobo: number; effectiveFrom: string }>>
  settings: { recoveryTargetPct: number; reserveSharePct: number; platformRecognisedOn: Settings['platformRecognisedOn'] }
  lines: SnapshotLine[]
  totals: { freightKobo: number; contributionKobo: number; recoveryKobo: number; reserveKobo: number; platformKobo: number; subsidyKobo: number; unfundedKobo: number; chargeableKg: number }
  warnings: string[]
}

/** Splits a whole amount in proportion to weights, in whole kobo that add up exactly (largest remainder). */
export function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((t, w) => t + w, 0)
  if (!weights.length) return []
  if (sum <= 0) return split(total, weights.map(() => 1))
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map(Math.floor)
  let left = total - out.reduce((t, n) => t + n, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]] += 1
  return out
}

/**
 * The shipping allocation of an order, line by line, from the server's own
 * prices. Saved with the checkout and posted to the shipping ledger when the
 * order is paid; it never changes what the customer pays.
 *
 * A promo discount comes out of the platform share first, then the margin;
 * it reduces a line's shipping contribution only when the line's discounted
 * price can't carry it. A free gift ships too: its freight is allocated and,
 * with no price to carry a contribution, left unfunded (and visible).
 */
export function allocateOrder(lines: OrderLine[], discountKobo: number, ctx: Context, profiles: Profile[], costs: Record<string, Costs | null>): Snapshot {
  const warnings = new Set<string>()
  const paid = lines.map((l) => (l.gift ? 0 : l.unitKobo * l.quantity))
  const discounts = split(Math.max(0, discountKobo), paid)
  const spent = new Map<string, number>()
  const out = lines.map((line, i): SnapshotLine => {
    const profile = profileFor(profiles, line.productId, line.size)
    const freight = unitFreight({ productId: line.productId, profile, costs: costs[line.productId] ?? null }, ctx)
    freight.warnings.forEach((w) => warnings.add(w))
    const cls = classFor(freight.chargeableKg ?? null, ctx.classes, profile?.classKey ?? null)
    const campaign = line.gift ? null : ctx.campaigns.find((c) => campaignApplies(c, line.productId, line.category, ctx.now)) ?? null
    const fallbackProfile = { targetPct: null, minContributionKobo: null, maxContributionKobo: null, adjustmentFactor: 1, valueTier: 'standard' as Tier,
      clearanceEligible: true, subsidyEligible: true, platformContributionKobo: null, override: null }
    const unit = contribution({
      priceKobo: line.unitKobo, freightKobo: freight.kobo, cls, settings: ctx.settings, campaign,
      profile: line.gift ? { ...(profile ?? fallbackProfile), override: null, minContributionKobo: null, platformContributionKobo: 0 } : profile ?? fallbackProfile,
      subsidyLeftKobo: campaign ? Math.max(0, (campaign.budgetKobo ?? 0) - campaign.spentKobo - (spent.get(campaign.id) ?? 0)) : null,
    })
    const q = line.quantity
    let contributionLine = unit.contributionKobo * q
    let platformLine = unit.platformKobo * q
    let subsidyLine = unit.subsidyKobo * q
    const flags = [...unit.flags]
    if (campaign && subsidyLine) {
      const left = Math.max(0, (campaign.budgetKobo ?? 0) - campaign.spentKobo - (spent.get(campaign.id) ?? 0))
      if (subsidyLine > left) { subsidyLine = left; flags.push('subsidy_budget_exhausted') }
      spent.set(campaign.id, (spent.get(campaign.id) ?? 0) + subsidyLine)
    }
    // The discount: platform share first, then margin; the contribution only if the line can't carry it.
    const d = discounts[i]
    platformLine = Math.max(0, platformLine - d)
    const net = paid[i] - d
    if (!line.gift && contributionLine + platformLine > net) {
      contributionLine = Math.max(0, net - platformLine)
      flags.push('discount_reduced_contribution')
    }
    if (line.gift) { contributionLine = 0; platformLine = 0; flags.push('gift') }
    const share = Math.min(Math.max(ctx.settings.reserveSharePct, 0), 95) / 100
    const reserveLine = Math.round(contributionLine * share)
    const recoveryLine = contributionLine - reserveLine
    const freightLine = (freight.kobo ?? 0) * q
    const targetLine = (unit.targetKobo ?? 0) * q
    const funded = recoveryLine + subsidyLine
    if (targetLine > funded && !flags.includes('below_target')) flags.push('below_target')
    return {
      productId: line.productId, size: line.size, quantity: q, unitKobo: line.unitKobo, method: freight.method, gift: Boolean(line.gift),
      chargeableKg: freight.chargeableKg ?? null, classKey: cls?.key ?? null, campaignId: campaign?.id ?? null, confidence: freight.confidence,
      freightKobo: freightLine, targetKobo: targetLine, contributionKobo: contributionLine, recoveryKobo: recoveryLine, reserveKobo: reserveLine,
      platformKobo: platformLine, subsidyKobo: subsidyLine, discountKobo: d,
      unfundedKobo: freight.kobo != null ? Math.max(0, freightLine - funded) : 0, flags: [...new Set(flags)],
    }
  })
  const sum = (k: keyof SnapshotLine) => out.reduce((t, l) => t + (l[k] as number), 0)
  const rates: Snapshot['rates'] = {}
  for (const m of ['air', 'sea'] as Method[]) {
    if (!out.some((l) => l.method === m)) continue
    const r = activeRate(ctx.rates, m, ctx.today).rate
    if (r) rates[m] = { id: r.id, provider: r.provider, currency: r.currency, fxRate: r.fxRate, billingUnit: r.billingUnit, perUnitKobo: perUnitCost(r).kobo, effectiveFrom: r.effectiveFrom }
  }
  const status: Confidence = out.some((l) => l.confidence === 'incomplete') ? 'incomplete' : out.some((l) => l.confidence === 'estimated') ? 'estimated' : 'verified'
  return {
    version: 1, computedAt: ctx.now.toISOString(), status, rates,
    settings: { recoveryTargetPct: ctx.settings.recoveryTargetPct, reserveSharePct: ctx.settings.reserveSharePct, platformRecognisedOn: ctx.settings.platformRecognisedOn },
    lines: out,
    totals: {
      freightKobo: sum('freightKobo'), contributionKobo: sum('contributionKobo'), recoveryKobo: sum('recoveryKobo'), reserveKobo: sum('reserveKobo'),
      platformKobo: sum('platformKobo'), subsidyKobo: sum('subsidyKobo'), unfundedKobo: sum('unfundedKobo'),
      chargeableKg: round3(out.reduce((t, l) => t + (l.chargeableKg ?? 0) * l.quantity, 0)),
    },
    warnings: [...warnings],
  }
}

// ---------------------------------------------------------------------------
// Reconciliation: air shipments of orders
// ---------------------------------------------------------------------------

export type ShipmentOrder = { orderId: string; chargeableKg: number; freightKobo: number; recoveryKobo: number; subsidyKobo: number }

/**
 * An air shipment's freight invoice against what was estimated and funded.
 * The actual cost is shared out to orders by chargeable weight. A shortfall
 * is drawn from the logistics reserve only when staff choose to (and only as
 * far as the reserve goes); what's left is unfunded freight. A surplus can go
 * to the reserve. The estimate itself is never changed.
 */
export function reconcileAir({ orders, actualKobo, reserveBalanceKobo, drawFromReserve, surplusToReserve }: {
  orders: ShipmentOrder[]; actualKobo: number; reserveBalanceKobo: number; drawFromReserve: boolean; surplusToReserve: boolean
}) {
  const estimated = orders.reduce((t, o) => t + o.freightKobo, 0)
  const recovered = orders.reduce((t, o) => t + o.recoveryKobo, 0)
  const subsidy = orders.reduce((t, o) => t + o.subsidyKobo, 0)
  const funded = recovered + subsidy
  const gap = Math.max(0, actualKobo - funded)
  const draw = drawFromReserve ? Math.min(gap, Math.max(0, reserveBalanceKobo)) : 0
  const surplus = Math.max(0, funded - actualKobo)
  const weights = orders.map((o) => o.chargeableKg)
  const shares = split(actualKobo, weights.some((w) => w > 0) ? weights : orders.map((o) => o.freightKobo))
  return {
    estimatedKobo: estimated, actualKobo, varianceKobo: actualKobo - estimated,
    variancePct: estimated ? pct1(((actualKobo - estimated) / estimated) * 100) : null,
    recoveredKobo: recovered, subsidyKobo: subsidy, fundedKobo: funded, recoveryPct: actualKobo ? pct1((funded / actualKobo) * 100) : null,
    reserveDrawKobo: draw, surplusToReserveKobo: surplusToReserve ? surplus : 0, unfundedKobo: gap - draw,
    perOrder: orders.map((o, i) => ({ orderId: o.orderId, estimateKobo: o.freightKobo, actualKobo: shares[i], fundedKobo: o.recoveryKobo + o.subsidyKobo })),
  }
}

// ---------------------------------------------------------------------------
// Landed cost of a planned inventory batch (sea freight, or stock bought by air)
// ---------------------------------------------------------------------------

export const ALLOCATION_METHODS = ['value', 'weight', 'volume', 'chargeable_weight', 'quantity', 'hybrid'] as const
export type AllocationMethod = typeof ALLOCATION_METHODS[number]
export const ALLOCATION_LABEL: Record<AllocationMethod, string> = {
  value: 'By goods value', weight: 'By weight', volume: 'By volume', chargeable_weight: 'By chargeable weight', quantity: 'By quantity',
  hybrid: 'Hybrid: freight and handling by volume, customs and insurance by value, other by quantity',
}

export type BatchLine = { id: string; productId: string; quantityOrdered: number; quantityReceived: number; goodsKobo: number | null; unitWeightKg: number | null; unitCbm: number | null }
export type BatchCosts = { freightKobo: number; customsKobo: number; insuranceKobo: number; handlingKobo: number; otherKobo: number }

/**
 * Shares a batch's landed costs over its lines by the chosen method. Landed
 * cost per unit is per unit received when some didn't arrive (the missing
 * units' costs fall on the ones that did), and per unit ordered otherwise.
 * chargeable_weight needs the forwarder's volumetric divisor (cm³ per kg).
 */
export function allocateBatch(lines: BatchLine[], costs: BatchCosts, method: AllocationMethod, divisor: number | null = null):
  { ok: true; totalKobo: number; lines: { id: string; productId: string; allocatedKobo: number; goodsTotalKobo: number; landedTotalKobo: number; landedPerUnitKobo: number; perUnitBasis: 'received' | 'ordered'; shortfall: number }[] }
  | { ok: false; error: string } {
  if (!lines.length) return { ok: false, error: 'Add the products in this batch first.' }
  const need = (what: string, test: (l: BatchLine) => boolean) => {
    const bad = lines.find((l) => !test(l))
    return bad ? `Add ${what} for ${bad.productId} (or choose another allocation method).` : null
  }
  const basis = {
    value: (l: BatchLine) => (l.goodsKobo ?? 0) * l.quantityOrdered,
    weight: (l: BatchLine) => (l.unitWeightKg ?? 0) * l.quantityOrdered,
    volume: (l: BatchLine) => (l.unitCbm ?? 0) * l.quantityOrdered,
    chargeable_weight: (l: BatchLine) => Math.max(l.unitWeightKg ?? 0, ((l.unitCbm ?? 0) * 1_000_000) / (divisor || 1)) * l.quantityOrdered,
    quantity: (l: BatchLine) => l.quantityOrdered,
  }
  const missing =
    method === 'value' || method === 'hybrid' ? need('the unit cost', (l) => l.goodsKobo != null)
      : method === 'weight' ? need('the unit weight', (l) => !!l.unitWeightKg)
        : method === 'volume' ? need('the unit volume', (l) => !!l.unitCbm)
          : method === 'chargeable_weight' ? (!divisor ? 'Set the forwarder’s volumetric divisor on the rate to allocate by chargeable weight.' : need('the unit weight or volume', (l) => !!(l.unitWeightKg || l.unitCbm)))
            : null
  if (missing) return { ok: false, error: missing }
  if (method === 'hybrid') {
    const volumeOk = lines.every((l) => l.unitCbm)
    const bulk = volumeOk ? basis.volume : lines.every((l) => l.unitWeightKg) ? basis.weight : null
    if (!bulk) return { ok: false, error: 'Hybrid allocation needs every line’s volume (or weight) for the freight.' }
    const a = split(costs.freightKobo + costs.handlingKobo, lines.map(bulk))
    const b = split(costs.customsKobo + costs.insuranceKobo, lines.map(basis.value))
    const c = split(costs.otherKobo, lines.map(basis.quantity))
    return finishBatch(lines, lines.map((_, i) => a[i] + b[i] + c[i]))
  }
  const total = costs.freightKobo + costs.customsKobo + costs.insuranceKobo + costs.handlingKobo + costs.otherKobo
  return finishBatch(lines, split(total, lines.map(basis[method])))
}

function finishBatch(lines: BatchLine[], allocated: number[]) {
  const out = lines.map((l, i) => {
    const goods = (l.goodsKobo ?? 0) * l.quantityOrdered
    const landed = goods + allocated[i]
    const partial = l.quantityReceived > 0 && l.quantityReceived < l.quantityOrdered
    const units = partial ? l.quantityReceived : l.quantityOrdered
    return {
      id: l.id, productId: l.productId, allocatedKobo: allocated[i], goodsTotalKobo: goods, landedTotalKobo: landed,
      landedPerUnitKobo: Math.round(landed / units), perUnitBasis: (partial ? 'received' : 'ordered') as 'received' | 'ordered',
      shortfall: Math.max(0, l.quantityOrdered - l.quantityReceived),
    }
  })
  return { ok: true as const, totalKobo: allocated.reduce((t, n) => t + n, 0), lines: out }
}

// ---------------------------------------------------------------------------
// Simulation: try rates and policies on the catalogue before they go live
// ---------------------------------------------------------------------------

export type Scenario = {
  /** A hypothetical air rate per kg in naira (all-in); replaces the rate in force. */
  airPerKgNaira?: number | null
  recoveryTargetPct?: number | null
  reserveSharePct?: number | null
  maxContributionPctOfPrice?: number | null
  /** A clearance discount on every product, in %. */
  discountPct?: number | null
}

/** Runs every product through the engine under a scenario. Nothing is saved; nothing a customer pays changes. */
export function simulate(products: ProductInput[], ctx: Context, scenario: Scenario) {
  const settings: Settings = {
    ...ctx.settings,
    ...(scenario.recoveryTargetPct != null ? { recoveryTargetPct: scenario.recoveryTargetPct } : {}),
    ...(scenario.reserveSharePct != null ? { reserveSharePct: scenario.reserveSharePct } : {}),
    ...(scenario.maxContributionPctOfPrice != null ? { maxContributionPctOfPrice: scenario.maxContributionPctOfPrice } : {}),
  }
  const current = activeRate(ctx.rates, 'air', ctx.today).rate
  const rates = scenario.airPerKgNaira != null
    ? [...ctx.rates.filter((r) => r.method !== 'air'), {
        ...(current ?? { volumetricDivisor: null, effectiveTo: null }),
        id: 'scenario', method: 'air', provider: 'Scenario', currency: 'NGN', fxRate: null, billingUnit: 'kg', ratePerUnit: scenario.airPerKgNaira,
        minChargeable: null, roundingIncrement: null, minShipmentCharge: null, surchargePerUnit: null, handlingPerShipment: null,
        clearanceIncluded: true, clearancePerUnit: null, insurancePct: null, contingencyPct: null, typicalShipmentUnits: null,
        effectiveFrom: ctx.today, effectiveTo: null, status: 'active', confirmed: true,
      } as Rate]
    : ctx.rates
  const sim: Context = { ...ctx, settings, rates }
  const rows = products.map((p) => {
    const priceKobo = scenario.discountPct ? clearancePriceKobo(p.priceKobo, { kind: 'percent', value: scenario.discountPct }) : p.priceKobo
    const b = priceBreakdown({ ...p, priceKobo }, sim)
    const uncompetitive = b.flags.includes('capped_by_price') || (p.profile?.competitorPriceKobo != null && priceKobo > p.profile.competitorPriceKobo)
    const verdict = b.status === 'missing_data' ? 'missing_data'
      : b.marginAfterFreightKobo != null && b.marginAfterFreightKobo < 0 ? 'negative_margin'
        : b.flags.includes('below_target') ? 'under_recovering'
          : uncompetitive ? 'uncompetitive' : 'healthy'
    return { ...b, originalPriceKobo: p.priceKobo, verdict, uncompetitive }
  })
  const count = (v: string) => rows.filter((r) => r.verdict === v).length
  return {
    scenario, rateUsed: scenario.airPerKgNaira != null ? 'scenario' : current?.id ?? null, rows,
    summary: {
      products: rows.length, healthy: count('healthy'), underRecovering: count('under_recovering'), uncompetitive: count('uncompetitive'),
      negativeMargin: count('negative_margin'), missingData: count('missing_data'),
      freightKobo: rows.reduce((t, r) => t + (r.freightKobo ?? 0), 0),
      fundedKobo: rows.reduce((t, r) => t + r.recoveryKobo + r.subsidyKobo, 0),
    },
  }
}
