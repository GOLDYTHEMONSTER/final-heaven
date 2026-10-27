// The Shipping Intelligence figures, from the ledger, the orders' allocation
// snapshots, shipments and product breakdowns. Pure, like the engine, so the
// rules about what each figure means are tested (tests/unit/shipping-report.test.ts):
//  - balances come from the ledger, which already nets reversals;
//  - platform contribution is "held" until its order is delivered (or shipped,
//    by setting), and only then "earned"; cancelled or refunded orders' shares
//    are reversed in the ledger, so they count as neither;
//  - the logistics reserve is a balance, never revenue;
//  - estimates come from the snapshots, and stop counting as a liability once
//    the order's shipment is reconciled (its actual cost has replaced them).
import type { Breakdown, Snapshot, SnapshotLine } from './engine'

export type LedgerRow = { kind: string; amount: number | string; order_id: string | null; product_id: string | null; shipment_id: string | null; campaign_id: string | null; reason: string; occurred_at: string }
export type OrderRow = { id: string; order_number: string; status: string; payment_status: string; created_at: string }
export type ShipmentRow = {
  id: string; reference: string; kind: 'orders' | 'inventory'; method: 'air' | 'sea'; status: string
  estimated_cost: number | string | null; estimated_units: number | string | null; dispatched_on: string | null; arrived_on: string | null
  invoices_total: number; invoiced_units: number | null
  reconciliation: { actual_cost: number | string; recovered: number | string; subsidies: number | string; unfunded: number | string; reserve_drawn: number | string } | null
}
export type CampaignRow = { id: string; name: string; status: string; starts_at: string; ends_at: string; subsidy_budget: number | string | null; shipping_treatment: string }

export type Filters = {
  from?: string | null; to?: string | null; method?: string | null; category?: string | null; productId?: string | null
  shipmentId?: string | null; orderStatus?: string | null; campaignId?: string | null; classKey?: string | null
  recovery?: 'below_target' | 'on_target' | null
}

const k = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100)
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
const PAID = ['paid', 'partially_refunded', 'refunded']

export function report(input: {
  ledger: LedgerRow[]; orders: OrderRow[]; allocations: Record<string, Snapshot>; shipmentOf: Record<string, string>
  shipments: ShipmentRow[]; campaigns: CampaignRow[]; categories: Record<string, string>; breakdowns: Breakdown[]
  recogniseOn: 'delivered' | 'shipped'; filters: Filters
}) {
  const f = input.filters
  const orders = new Map(input.orders.map((o) => [o.id, o]))
  const reconciled = new Set(input.shipments.filter((s) => s.status === 'reconciled').map((s) => s.id))
  const inRange = (iso: string) => (!f.from || iso.slice(0, 10) >= f.from) && (!f.to || iso.slice(0, 10) <= f.to)

  // An order line passes the filters when its product, method, class, campaign, shipment and order all match.
  const lineOk = (orderId: string | null, l: Pick<SnapshotLine, 'productId' | 'method' | 'classKey' | 'campaignId' | 'targetKobo' | 'recoveryKobo' | 'subsidyKobo'> | null, productId: string | null) => {
    const order = orderId ? orders.get(orderId) : null
    if (f.orderStatus && order?.status !== f.orderStatus) return false
    if (f.shipmentId && (!orderId || input.shipmentOf[orderId] !== f.shipmentId)) return false
    const pid = l?.productId ?? productId
    if (f.productId && pid !== f.productId) return false
    if (f.category && (!pid || input.categories[pid] !== f.category)) return false
    if (f.method && l?.method !== f.method) return false
    if (f.classKey && l?.classKey !== f.classKey) return false
    if (f.campaignId && l?.campaignId !== f.campaignId) return false
    if (f.recovery && l) {
      const below = l.targetKobo > l.recoveryKobo + l.subsidyKobo
      if ((f.recovery === 'below_target') !== below) return false
    }
    return true
  }
  const lineOf = (orderId: string | null, productId: string | null) =>
    (orderId && input.allocations[orderId]?.lines.find((l) => l.productId === productId)) || null

  // Ledger balances.
  const sum = { freight_recovery: 0, logistics_reserve: 0, platform_revenue: 0, promo_subsidy: 0, unfunded_freight: 0 } as Record<string, number>
  let platformEarned = 0
  let platformHeld = 0
  const earnedStatuses = input.recogniseOn === 'shipped' ? ['shipped', 'delivered'] : ['delivered']
  for (const e of input.ledger) {
    if (!inRange(e.occurred_at)) continue
    if (e.order_id != null) {
      if (!lineOk(e.order_id, lineOf(e.order_id, e.product_id), e.product_id)) continue
    } else {
      // Shipment-level and manual entries belong to no product line: line filters leave them out.
      if (f.productId || f.category || f.method || f.classKey || f.orderStatus || f.recovery) continue
      if (f.shipmentId && e.shipment_id !== f.shipmentId) continue
      if (f.campaignId && e.campaign_id !== f.campaignId) continue
    }
    sum[e.kind] = (sum[e.kind] ?? 0) + k(e.amount)
    if (e.kind === 'platform_revenue') {
      const status = e.order_id ? orders.get(e.order_id)?.status : null
      if (status && earnedStatuses.includes(status)) platformEarned += k(e.amount)
      else platformHeld += k(e.amount)
    }
  }

  // Estimates from paid orders' snapshots.
  let estFreight = 0, estFunded = 0, estUnfunded = 0, liability = 0, chargeableKg = 0, paidOrders = 0, contributions = 0
  const awaiting: { id: string; orderNumber: string; chargeableKg: number; freightKobo: number; createdAt: string }[] = []
  const partialRefunds: string[] = []
  for (const o of input.orders) {
    const snap = input.allocations[o.id]
    if (!snap || !PAID.includes(o.payment_status) || !inRange(o.created_at)) continue
    if (o.payment_status === 'partially_refunded') partialRefunds.push(o.order_number)
    if (o.status === 'cancelled' || o.payment_status === 'refunded') continue
    const lines = snap.lines.filter((l) => lineOk(o.id, l, l.productId))
    if (!lines.length) continue
    paidOrders += 1
    const fr = lines.reduce((t, l) => t + l.freightKobo, 0)
    estFreight += fr
    estFunded += lines.reduce((t, l) => t + l.recoveryKobo + l.subsidyKobo, 0)
    estUnfunded += lines.reduce((t, l) => t + l.unfundedKobo, 0)
    contributions += lines.reduce((t, l) => t + l.contributionKobo, 0)
    const kg = lines.reduce((t, l) => t + (l.chargeableKg ?? 0) * l.quantity, 0)
    chargeableKg += kg
    const shipment = input.shipmentOf[o.id]
    if (!shipment || !reconciled.has(shipment)) liability += fr
    if (!shipment && lines.some((l) => l.method === 'air')) awaiting.push({ id: o.id, orderNumber: o.order_number, chargeableKg: Math.round(kg * 1000) / 1000, freightKobo: fr, createdAt: o.created_at })
  }

  const shipments = input.shipments
    .filter((s) => !f.shipmentId || s.id === f.shipmentId)
    .filter((s) => !f.method || s.method === f.method)
    .map((s) => {
      const r = s.reconciliation
      const actual = r ? k(r.actual_cost) : s.invoices_total ? Math.round(s.invoices_total * 100) : null
      const funded = r ? k(r.recovered) + k(r.subsidies) : null
      return {
        id: s.id, reference: s.reference, kind: s.kind, method: s.method, status: s.status, dispatchedOn: s.dispatched_on, arrivedOn: s.arrived_on,
        estimatedKobo: s.estimated_cost != null ? k(s.estimated_cost) : null, estimatedUnits: s.estimated_units != null ? Number(s.estimated_units) : null,
        actualKobo: actual, actualUnits: s.invoiced_units,
        orders: Object.values(input.shipmentOf).filter((id) => id === s.id).length,
        recoveryPct: r && actual ? pct(funded!, actual) : null, unfundedKobo: r ? k(r.unfunded) : null,
      }
    })

  const campaigns = input.campaigns.filter((c) => !f.campaignId || c.id === f.campaignId).map((c) => {
    let revenue = 0, recovered = 0, items = 0
    const orderIds = new Set<string>()
    for (const o of input.orders) {
      const snap = input.allocations[o.id]
      if (!snap || !PAID.includes(o.payment_status) || o.status === 'cancelled' || o.payment_status === 'refunded') continue
      for (const l of snap.lines) {
        if (l.campaignId !== c.id) continue
        revenue += (l.unitKobo ?? 0) * l.quantity - (l.discountKobo ?? 0)
        recovered += l.recoveryKobo
        items += l.quantity
        orderIds.add(o.id)
      }
    }
    const used = input.ledger.filter((e) => e.campaign_id === c.id && e.kind === 'promo_subsidy').reduce((t, e) => t + k(e.amount), 0)
    const budget = c.subsidy_budget != null ? k(c.subsidy_budget) : null
    return {
      id: c.id, name: c.name, status: c.status, treatment: c.shipping_treatment, startsAt: c.starts_at, endsAt: c.ends_at,
      revenueKobo: revenue, items, orders: orderIds.size, subsidyUsedKobo: used, budgetKobo: budget,
      budgetLeftKobo: budget != null ? Math.max(0, budget - used) : null, freightRecoveredKobo: recovered,
      avgContributionPerOrderKobo: orderIds.size ? Math.round(recovered / orderIds.size) : null,
      expiredButLive: c.status === 'active' && c.ends_at < new Date().toISOString(),
    }
  })

  const b = input.breakdowns.filter((x) => (!f.productId || x.productId === f.productId) && (!f.category || x.category === f.category)
    && (!f.method || x.method === f.method) && (!f.classKey || x.classKey === f.classKey))
  const pick = (test: (x: Breakdown) => boolean) => b.filter(test).map((x) => ({
    productId: x.productId, name: x.name, category: x.category, priceKobo: x.priceKobo, freightKobo: x.freightKobo, contributionKobo: x.contributionKobo,
    recoveryPct: x.recoveryPct, marginPct: x.marginPct, status: x.status, confidence: x.confidence, warnings: x.warnings.slice(0, 3),
  }))
  const health = {
    belowTarget: pick((x) => x.flags.includes('below_target')),
    missingData: pick((x) => x.status === 'missing_data'),
    estimatedOnly: pick((x) => x.status !== 'missing_data' && x.confidence !== 'verified'),
    cappedByPrice: pick((x) => x.flags.includes('capped_by_price')),
    negativeMargin: pick((x) => x.marginAfterFreightKobo != null && x.marginAfterFreightKobo < 0),
    needsReview: pick((x) => x.status === 'needs_review' || x.flags.includes('override')),
  }

  return {
    overview: {
      paidOrders,
      estimatedFreightKobo: estFreight,
      contributionsKobo: contributions,
      estimatedRecoveryPct: pct(estFunded, estFreight),
      estimatedUnfundedKobo: estUnfunded,
      estimatedLiabilityKobo: liability,
      unreconciledActualKobo: shipments.filter((s) => s.status !== 'reconciled' && s.actualKobo != null).reduce((t, s) => t + s.actualKobo!, 0),
      chargeableKg: Math.round(chargeableKg * 1000) / 1000,
      freightRecoveredKobo: sum.freight_recovery,
      reserveBalanceKobo: sum.logistics_reserve,
      platformHeldKobo: platformHeld,
      platformEarnedKobo: platformEarned,
      subsidiesKobo: sum.promo_subsidy,
      unfundedRecordedKobo: sum.unfunded_freight,
    },
    awaitingShipment: awaiting,
    partialRefunds,
    shipments,
    campaigns,
    health,
  }
}
