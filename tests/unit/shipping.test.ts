// The Smart Shipping engine (lib/shipping/engine): every formula, through its
// functions. The ₦12,000/kg rate here is the brief's illustration, used only as
// test data; production has no default rate.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS, activeRate, allocateBatch, allocateOrder, chargeable, classFor, clearanceBreakdown, contribution,
  priceBreakdown, reconcileAir, shipmentCharge, simulate, split,
  type Campaign, type Context, type Profile, type Rate, type ShippingClass,
} from '@/lib/shipping/engine'

const TODAY = '2026-10-27'
const NOW = new Date(`${TODAY}T12:00:00Z`)

const air = (over: Partial<Rate> = {}): Rate => ({
  id: 'air-1', method: 'air', provider: 'Test Cargo', currency: 'NGN', fxRate: null, billingUnit: 'kg', ratePerUnit: 12000,
  volumetricDivisor: 6000, minChargeable: null, roundingIncrement: null, minShipmentCharge: null, surchargePerUnit: null,
  handlingPerShipment: null, clearanceIncluded: true, clearancePerUnit: null, insurancePct: null, contingencyPct: null,
  typicalShipmentUnits: null, effectiveFrom: '2026-10-01', effectiveTo: null, status: 'active', confirmed: true, ...over,
})

const profile = (productId: string, over: Partial<Profile> = {}): Profile => ({
  productId, variant: '', method: 'air', weightKg: 0.2, lengthCm: null, widthCm: null, heightCm: null, packagingKg: null,
  dataStatus: 'verified', classKey: null, valueTier: 'standard', targetPct: null, minContributionKobo: null, maxContributionKobo: null,
  adjustmentFactor: 1, clearanceEligible: true, subsidyEligible: true, platformContributionKobo: null, competitorPriceKobo: null,
  override: null, ...over,
})

const classes: ShippingClass[] = [
  { key: 'ultra_light', name: 'Ultra-light', sort: 1, maxChargeableKg: 0.05, minContributionKobo: 30000, maxContributionKobo: null, maxContributionPctOfPrice: 5, adjustmentFactor: 1 },
  { key: 'lightweight', name: 'Lightweight', sort: 2, maxChargeableKg: 0.15, minContributionKobo: 50000, maxContributionKobo: null, maxContributionPctOfPrice: null, adjustmentFactor: 1 },
  { key: 'standard', name: 'Standard', sort: 3, maxChargeableKg: 1, minContributionKobo: null, maxContributionKobo: null, maxContributionPctOfPrice: null, adjustmentFactor: 1 },
  { key: 'heavy', name: 'Heavy', sort: 4, maxChargeableKg: 5, minContributionKobo: null, maxContributionKobo: 1_000_000, maxContributionPctOfPrice: null, adjustmentFactor: 1 },
  { key: 'bulky', name: 'Bulky', sort: 5, maxChargeableKg: null, minContributionKobo: null, maxContributionKobo: null, maxContributionPctOfPrice: null, adjustmentFactor: 1 },
]

const ctx = (over: Partial<Context> = {}): Context => ({
  today: TODAY, now: NOW, settings: DEFAULT_SETTINGS, classes, rates: [air()], campaigns: [], seaFreightKobo: {}, ...over,
})
const costs = { unitCost: 30, currency: 'CNY', fxRate: 215, chinaLogistics: 300, customs: null, other: null }
const N = (naira: number) => naira * 100

describe('shipping weight', () => {
  it('a standard 200 g T-shirt: freight ₦2,400, target ₦1,200 at 50%', () => {
    const b = priceBreakdown({ productId: 'tee', priceKobo: N(17000), costs, profile: profile('tee') }, ctx())
    expect(b).toMatchObject({ chargeableKg: 0.2, freightKobo: N(2400), targetKobo: N(1200), contributionKobo: N(1200), recoveryPct: 50, classKey: 'standard' })
    expect(b.flags).not.toContain('below_target')
  })

  it('a ring falls in ultra-light by its weight, not its category', () => {
    expect(classFor(0.02, classes, null)?.key).toBe('ultra_light')
    expect(classFor(0.12, classes, null)?.key).toBe('lightweight')
    expect(classFor(1.2, classes, null)?.key).toBe('heavy')
    expect(classFor(9, classes, null)?.key).toBe('bulky')
    expect(classFor(0.02, classes, 'standard')?.key).toBe('standard') // staff's choice wins
  })

  it('a heavy hoodie is charged on its packed weight plus packaging', () => {
    const c = chargeable({ weightKg: 0.9, packagingKg: 0.1, lengthCm: 30, widthCm: 25, heightCm: 8 }, air())
    expect(c).toMatchObject({ ok: true, units: 1, basis: 'actual', volumetricKg: 1 }) // 6000 cm³ / 6000 = 1 kg, not more than 1 kg actual
  })

  it('a bulky product is charged on volumetric weight when that is greater', () => {
    const c = chargeable({ weightKg: 0.5, packagingKg: null, lengthCm: 40, widthCm: 30, heightCm: 20 }, air())
    expect(c).toMatchObject({ ok: true, units: 4, basis: 'volumetric', actualKg: 0.5 }) // 24000 / 6000
    // Each forwarder's divisor is its own.
    expect(chargeable({ weightKg: 0.5, packagingKg: null, lengthCm: 40, widthCm: 30, heightCm: 20 }, air({ volumetricDivisor: 5000 }))).toMatchObject({ units: 4.8 })
  })

  it('missing dimensions: charged on weight, but the estimate says volume wasn’t checked', () => {
    const b = priceBreakdown({ productId: 'tee', priceKobo: N(17000), costs, profile: profile('tee', { dataStatus: 'verified' }) }, ctx())
    expect(b.confidence).toBe('estimated')
    expect(b.warnings).toContain('No packed dimensions: volumetric weight wasn’t checked.')
    // Missing weight altogether: no estimate and the product needs data.
    const none = priceBreakdown({ productId: 'x', priceKobo: N(17000), costs, profile: profile('x', { weightKg: null }) }, ctx())
    expect(none).toMatchObject({ status: 'missing_data', freightKobo: null })
  })

  it('an expired or missing rate makes the estimate incomplete, never a guess', () => {
    const expired = ctx({ rates: [air({ effectiveTo: '2026-10-20' })] })
    expect(activeRate(expired.rates, 'air', TODAY)).toMatchObject({ rate: null, warning: expect.stringContaining('expired on 2026-10-20') })
    const b = priceBreakdown({ productId: 'tee', priceKobo: N(17000), costs, profile: profile('tee') }, expired)
    expect(b).toMatchObject({ freightKobo: null, confidence: 'incomplete', contributionKobo: 0 })
    expect(b.flags).toContain('no_freight_estimate')
    expect(activeRate([], 'sea', TODAY).warning).toMatch(/No sea freight rate is set/)
    // Unconfirmed or inactive rates are never used.
    expect(activeRate([air({ confirmed: false }), air({ id: 'b', status: 'inactive' })], 'air', TODAY).rate).toBeNull()
  })

  it('a shipment under the minimum chargeable weight is billed at the minimum', () => {
    const s = shipmentCharge(air({ minChargeable: 5 }), 3.2)
    expect(s).toMatchObject({ billedUnits: 5, freightKobo: N(60000) })
  })

  it('a shipment rounds up to the forwarder’s step, and a minimum charge applies to the shipment', () => {
    expect(shipmentCharge(air({ roundingIncrement: 0.5 }), 10.21)).toMatchObject({ billedUnits: 10.5, freightKobo: N(126000) })
    expect(shipmentCharge(air({ roundingIncrement: 0.5 }), 10.5)).toMatchObject({ billedUnits: 10.5 })
    expect(shipmentCharge(air({ minShipmentCharge: 50000 }), 1)).toMatchObject({ minApplied: true, freightKobo: N(50000) })
  })

  it('converts foreign-currency rates at the recorded rate and adds what clearance costs when it isn’t included', () => {
    const usd = air({ currency: 'USD', fxRate: 1500, ratePerUnit: 8, clearanceIncluded: false, clearancePerUnit: 1 })
    const b = priceBreakdown({ productId: 'tee', priceKobo: N(17000), costs, profile: profile('tee') }, ctx({ rates: [usd] }))
    expect(b.freightKobo).toBe(N(2700)) // 0.2 kg × $9 × 1500
    const noClearance = priceBreakdown({ productId: 'tee', priceKobo: N(17000), costs, profile: profile('tee') }, ctx({ rates: [air({ clearanceIncluded: false })] }))
    expect(noClearance.warnings).toContain('Clearance isn’t included in this rate and has no price, so estimates leave it out.')
  })
})

describe('contribution rules', () => {
  const base = { priceKobo: N(17000), freightKobo: N(2400), cls: null, settings: DEFAULT_SETTINGS,
    profile: { targetPct: null, minContributionKobo: null, maxContributionKobo: null, adjustmentFactor: 1, valueTier: 'standard' as const,
      clearanceEligible: true, subsidyEligible: true, platformContributionKobo: null, override: null } }

  it('recovers 50% of freight by default', () => {
    expect(contribution(base)).toMatchObject({ targetKobo: N(1200), contributionKobo: N(1200), recoveryKobo: N(1200), recoveryPct: 50, gapToTargetKobo: 0, unfundedKobo: N(1200) })
  })

  it('an ultra-light ring: the % of price cap wins over the minimum, and the shortfall is recorded', () => {
    const ring = { ...base, priceKobo: N(3000), freightKobo: N(240), cls: classes[0] }
    // min ₦300 > 50% of ₦240; but 5% of ₦3,000 = ₦150 caps it.
    expect(contribution(ring)).toMatchObject({ contributionKobo: N(150), targetKobo: N(120), recoveryPct: 62.5 })
    const cheap = { ...ring, priceKobo: N(1500) } // 5% = ₦75, below the ₦120 target
    const c = contribution(cheap)
    expect(c).toMatchObject({ contributionKobo: N(75), gapToTargetKobo: N(45) })
    expect(c.flags).toEqual(expect.arrayContaining(['raised_to_minimum', 'capped_by_price', 'below_target']))
  })

  it('a low-value item is raised to its class minimum', () => {
    const c = contribution({ ...base, priceKobo: N(5000), freightKobo: N(600), cls: classes[1] })
    expect(c).toMatchObject({ contributionKobo: N(500), recoveryPct: 83.3 })
    expect(c.flags).toContain('raised_to_minimum')
  })

  it('a high-value item contributes more through its value tier, within the maximum', () => {
    const settings = { ...DEFAULT_SETTINGS, valueTierFactors: { ...DEFAULT_SETTINGS.valueTierFactors, luxury: 1.5 } }
    const lux = { ...base, settings, profile: { ...base.profile, valueTier: 'luxury' as const } }
    expect(contribution(lux).contributionKobo).toBe(N(1800))
    const capped = contribution({ ...lux, profile: { ...lux.profile, maxContributionKobo: N(1500) } })
    expect(capped.contributionKobo).toBe(N(1500))
    expect(capped.flags).toContain('capped_at_maximum')
  })

  it('a contribution capped below the target records the gap', () => {
    const c = contribution({ ...base, freightKobo: N(30000), cls: classes[3] }) // target ₦15,000, heavy max ₦10,000
    expect(c).toMatchObject({ contributionKobo: N(10000), gapToTargetKobo: N(5000), unfundedKobo: N(20000) })
    expect(c.flags).toEqual(expect.arrayContaining(['capped_at_maximum', 'below_target']))
  })

  it('a staff override replaces the recommendation, which is still reported', () => {
    const c = contribution({ ...base, profile: { ...base.profile, override: { kobo: N(2000), reason: 'Matches competitor' } } })
    expect(c).toMatchObject({ recommendedKobo: N(1200), contributionKobo: N(2000) })
    expect(c.flags).toContain('override')
  })

  it('a reserve share grows the contribution so recovery still meets the target, and is kept apart', () => {
    const c = contribution({ ...base, settings: { ...DEFAULT_SETTINGS, reserveSharePct: 20 } })
    expect(c).toMatchObject({ contributionKobo: N(1500), reserveKobo: N(300), recoveryKobo: N(1200), recoveryPct: 50 })
  })

  it('platform contribution is its own share, and shipping plus platform never exceed the price', () => {
    const c = contribution({ ...base, settings: { ...DEFAULT_SETTINGS, platformContributionPct: 10 } })
    expect(c.platformKobo).toBe(N(1700))
    const tiny = contribution({ ...base, priceKobo: N(1000), profile: { ...base.profile, platformContributionKobo: N(500), override: { kobo: N(800), reason: 'test' } } })
    expect(tiny.contributionKobo + tiny.platformKobo).toBe(N(1000))
    expect(tiny.flags).toContain('capped_at_price')
  })
})

describe('orders', () => {
  const profiles = [profile('tee'), profile('ring', { weightKg: 0.02 }), profile('hoodie', { weightKg: 1.1 })]
  const lines = [
    { productId: 'tee', size: 'M', quantity: 2, unitKobo: N(17000), category: 'T-Shirts' },
    { productId: 'ring', size: null, quantity: 1, unitKobo: N(3000), category: 'Accessories' },
    { productId: 'hoodie', size: 'L', quantity: 1, unitKobo: N(35000), category: 'Hoodies' },
  ]

  it('shares one order across its items by weight, never a kilogram each', () => {
    const s = allocateOrder(lines, 0, ctx(), profiles, {})
    expect(s.totals.chargeableKg).toBe(1.52) // 0.4 + 0.02 + 1.1
    expect(s.totals.freightKobo).toBe(N(18240)) // 1.52 × 12,000
    expect(s.lines.map((l) => l.freightKobo)).toEqual([N(4800), N(240), N(13200)])
    // Freight recovery is counted once per line, and the parts add up.
    const t = s.totals
    expect(t.recoveryKobo + t.reserveKobo).toBe(t.contributionKobo)
    expect(t.unfundedKobo).toBe(t.freightKobo - t.recoveryKobo - t.subsidyKobo)
  })

  it('a size can have its own profile', () => {
    const s = allocateOrder([lines[0]], 0, ctx(), [...profiles, profile('tee', { variant: 'M', weightKg: 0.25 })], {})
    expect(s.lines[0].chargeableKg).toBe(0.25)
  })

  it('a promo discount comes out of the platform share before the shipping contribution', () => {
    const settings = { ...DEFAULT_SETTINGS, platformContributionPct: 10 }
    const s = allocateOrder([lines[0]], N(2000), ctx({ settings }), profiles, {})
    expect(s.lines[0]).toMatchObject({ contributionKobo: N(2400), platformKobo: N(1400), discountKobo: N(2000) }) // ₦3,400 − ₦2,000
  })

  it('a free gift ships: its freight is allocated and left unfunded, in the open', () => {
    const s = allocateOrder([{ productId: 'ring', size: null, quantity: 1, unitKobo: 0, category: 'Gifts', gift: true }], 0, ctx(), profiles, {})
    expect(s.lines[0]).toMatchObject({ gift: true, freightKobo: N(240), contributionKobo: 0, unfundedKobo: N(240) })
  })

  it('without a rate the snapshot is incomplete and allocates nothing it can’t know', () => {
    const s = allocateOrder(lines, 0, ctx({ rates: [] }), profiles, {})
    expect(s).toMatchObject({ status: 'incomplete', rates: {} })
    expect(s.totals.freightKobo).toBe(0)
    expect(s.warnings[0]).toMatch(/No air freight rate/)
  })

  it('keeps the rate it used, so a later rate change can’t alter it', () => {
    const s = allocateOrder(lines, 0, ctx(), profiles, {})
    expect(s.rates.air).toMatchObject({ id: 'air-1', perUnitKobo: N(12000) })
    const later = allocateOrder(lines, 0, ctx({ rates: [air({ effectiveTo: '2026-10-26' }), air({ id: 'air-2', ratePerUnit: 15000, effectiveFrom: '2026-10-27' })] }), profiles, {})
    expect(later.rates.air?.id).toBe('air-2')
    expect(s.totals.freightKobo).toBe(N(18240)) // the first snapshot is a value, not a reference
  })

  it('splits amounts in whole kobo that add up exactly', () => {
    expect(split(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(split(1000, [0, 0])).toEqual([500, 500])
    expect(split(7, [3, 0, 1]).reduce((a, b) => a + b)).toBe(7)
  })
})

describe('clearance', () => {
  const camp = (over: Partial<Campaign> = {}): Campaign => ({
    id: 'c1', name: 'Clear-out', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-30T00:00:00Z', status: 'active', productIds: ['tee'], categories: [],
    discount: { kind: 'percent', value: 30 }, treatment: 'normal', keepPct: null, budgetKobo: null, spentKobo: 0, maxSubsidyPerItemKobo: null,
    minMarginPct: 10, approved: false, ...over,
  })
  const tee = { productId: 'tee', priceKobo: N(17000), costs, profile: profile('tee') }

  it('normal clearance keeps the shipping contribution; the discount comes out of margin', () => {
    const b = clearanceBreakdown(tee, ctx(), camp())
    expect(b).toMatchObject({ clearancePriceKobo: N(11900), contributionKobo: N(1200) })
  })

  it('a reduced contribution keeps only part, and the gap shows', () => {
    const b = clearanceBreakdown(tee, ctx(), camp({ treatment: 'reduced', keepPct: 50 }))
    expect(b).toMatchObject({ contributionKobo: N(600), gapToTargetKobo: N(600) })
  })

  it('a campaign-funded subsidy pays the shortfall from its budget, per item', () => {
    const c = camp({ treatment: 'subsidised', keepPct: 0, budgetKobo: N(10000), maxSubsidyPerItemKobo: N(1000) })
    const b = clearanceBreakdown(tee, ctx(), c)
    expect(b).toMatchObject({ contributionKobo: 0, subsidyKobo: N(1000), gapToTargetKobo: N(200) })
  })

  it('an exhausted budget pays nothing more, and says so', () => {
    const c = camp({ treatment: 'subsidised', keepPct: 0, budgetKobo: N(10000), spentKobo: N(10000) })
    const b = clearanceBreakdown(tee, ctx(), c)
    expect(b.subsidyKobo).toBe(0)
    expect(b.flags).toContain('subsidy_budget_exhausted')
    // Within one order the budget is shared out, never overspent.
    const order = allocateOrder([{ productId: 'tee', size: 'M', quantity: 5, unitKobo: N(17000), category: 'T-Shirts' }], 0,
      ctx({ campaigns: [{ ...c, spentKobo: N(9000) }] }), [profile('tee')], {})
    expect(order.lines[0].subsidyKobo).toBe(N(1000))
    expect(order.lines[0].flags).toContain('subsidy_budget_exhausted')
  })

  it('flags a clearance price that loses money once freight is paid', () => {
    const b = clearanceBreakdown({ ...tee, costs: { ...costs, unitCost: 60 } }, ctx(), camp({ discount: { kind: 'percent', value: 60 } }))
    expect(b).toMatchObject({ negative: true, needsApproval: true, status: 'needs_review' })
  })

  it('an expired campaign no longer applies to orders', () => {
    const s = allocateOrder([{ productId: 'tee', size: 'M', quantity: 1, unitKobo: N(17000), category: 'T-Shirts' }], 0,
      ctx({ campaigns: [camp({ treatment: 'reduced', keepPct: 0, endsAt: '2026-10-20T00:00:00Z' })] }), [profile('tee')], {})
    expect(s.lines[0]).toMatchObject({ campaignId: null, contributionKobo: N(1200) })
  })

  it('below-target recovery applies only once finance has approved it', () => {
    const order = (approved: boolean) => allocateOrder([{ productId: 'tee', size: 'M', quantity: 1, unitKobo: N(17000), category: 'T-Shirts' }], 0,
      ctx({ campaigns: [camp({ treatment: 'below_target', keepPct: 25, approved })] }), [profile('tee')], {}).lines[0]
    expect(order(false)).toMatchObject({ campaignId: null, contributionKobo: N(1200) })
    expect(order(true)).toMatchObject({ campaignId: 'c1', contributionKobo: N(300) })
    expect(order(true).flags).toContain('approved_below_target')
  })

  it('a product excluded from clearance keeps its normal contribution', () => {
    const b = clearanceBreakdown({ ...tee, profile: profile('tee', { clearanceEligible: false }) }, ctx(), camp({ treatment: 'reduced', keepPct: 0 }))
    expect(b).toMatchObject({ excluded: true, contributionKobo: N(1200) })
  })
})

describe('reconciliation', () => {
  const orders = [
    { orderId: 'o1', chargeableKg: 1, freightKobo: N(12000), recoveryKobo: N(6000), subsidyKobo: 0 },
    { orderId: 'o2', chargeableKg: 3, freightKobo: N(36000), recoveryKobo: N(18000), subsidyKobo: N(1000) },
  ]

  it('compares the invoice with the estimate and shares it out by chargeable weight', () => {
    const r = reconcileAir({ orders, actualKobo: N(52000), reserveBalanceKobo: N(10000), drawFromReserve: false, surplusToReserve: false })
    expect(r).toMatchObject({ estimatedKobo: N(48000), varianceKobo: N(4000), variancePct: 8.3, fundedKobo: N(25000), unfundedKobo: N(27000), reserveDrawKobo: 0 })
    expect(r.perOrder.map((o) => o.actualKobo)).toEqual([N(13000), N(39000)])
  })

  it('draws on the reserve only when chosen, and only as far as it goes', () => {
    const r = reconcileAir({ orders, actualKobo: N(52000), reserveBalanceKobo: N(10000), drawFromReserve: true, surplusToReserve: false })
    expect(r).toMatchObject({ reserveDrawKobo: N(10000), unfundedKobo: N(17000) })
  })

  it('records a surplus to the reserve when chosen', () => {
    const r = reconcileAir({ orders, actualKobo: N(20000), reserveBalanceKobo: 0, drawFromReserve: true, surplusToReserve: true })
    expect(r).toMatchObject({ unfundedKobo: 0, surplusToReserveKobo: N(5000), varianceKobo: N(-28000) })
  })
})

describe('sea freight batches', () => {
  const lines = [
    { id: 'l1', productId: 'hoodie', quantityOrdered: 100, quantityReceived: 100, goodsKobo: N(6000), unitWeightKg: 0.9, unitCbm: 0.004 },
    { id: 'l2', productId: 'bag', quantityOrdered: 50, quantityReceived: 50, goodsKobo: N(12000), unitWeightKg: 1.5, unitCbm: 0.012 },
  ]
  const costs = { freightKobo: N(300000), customsKobo: N(120000), insuranceKobo: N(12000), handlingKobo: N(18000), otherKobo: N(0) }

  it('allocates a batch’s landed costs by the chosen method', () => {
    const byVolume = allocateBatch(lines, costs, 'volume')
    expect(byVolume.ok && byVolume.lines.map((l) => l.allocatedKobo)).toEqual([N(180000), N(270000)]) // 0.4 : 0.6 cbm
    const byValue = allocateBatch(lines, costs, 'value')
    expect(byValue.ok && byValue.lines.map((l) => l.allocatedKobo)).toEqual([N(225000), N(225000)]) // ₦600k : ₦600k goods
    const byQty = allocateBatch(lines, costs, 'quantity')
    expect(byQty.ok && byQty.lines.map((l) => l.allocatedKobo)).toEqual([N(300000), N(150000)])
    if (byVolume.ok) expect(byVolume.lines[0].landedPerUnitKobo).toBe(N(7800)) // (600,000 + 180,000) / 100
  })

  it('the hybrid method splits freight by volume and duties by value, and adds up', () => {
    const r = allocateBatch(lines, costs, 'hybrid')
    expect(r.ok && r.totalKobo).toBe(N(450000))
    expect(r.ok && r.lines.map((l) => l.allocatedKobo)).toEqual([N(127200 + 66000), N(190800 + 66000)])
  })

  it('a partial receipt puts the batch’s cost on the units that arrived', () => {
    const r = allocateBatch([{ ...lines[0], quantityReceived: 80 }, lines[1]], costs, 'volume')
    expect(r.ok && r.lines[0]).toMatchObject({ perUnitBasis: 'received', shortfall: 20, landedPerUnitKobo: N(9750) })
  })

  it('says what’s missing instead of guessing', () => {
    expect(allocateBatch([{ ...lines[0], unitCbm: null }], costs, 'volume')).toEqual({ ok: false, error: expect.stringContaining('unit volume for hoodie') })
    expect(allocateBatch(lines, costs, 'chargeable_weight')).toEqual({ ok: false, error: expect.stringContaining('volumetric divisor') })
  })

  it('a sea product uses the freight its batch really cost, not the air formula', () => {
    const b = priceBreakdown({ productId: 'hoodie', priceKobo: N(35000), costs: null, profile: profile('hoodie', { method: 'sea', weightKg: 0.9 }) },
      ctx({ seaFreightKobo: { hoodie: N(1800) } }))
    expect(b).toMatchObject({ method: 'sea', freightKobo: N(1800), confidence: 'verified' })
  })
})

describe('simulation', () => {
  it('tries a rate across the catalogue and sorts products by what happens to them', () => {
    const products = [
      { productId: 'tee', priceKobo: N(17000), costs, profile: profile('tee') },
      { productId: 'ring', priceKobo: N(1500), costs: { ...costs, unitCost: 2 }, profile: profile('ring', { weightKg: 0.02 }) },
      { productId: 'jacket', priceKobo: N(20000), costs: { ...costs, unitCost: 80 }, profile: profile('jacket', { weightKg: 1.2 }) },
      { productId: 'new', priceKobo: N(9000), costs: null, profile: null },
    ]
    const r = simulate(products, ctx(), { airPerKgNaira: 15000 })
    expect(r.rateUsed).toBe('scenario')
    expect(Object.fromEntries(r.rows.map((x) => [x.productId, x.verdict]))).toEqual({
      tee: 'healthy', ring: 'under_recovering', jacket: 'negative_margin', new: 'missing_data',
    })
    expect(r.summary).toMatchObject({ products: 4, healthy: 1, missingData: 1 })
  })
})
