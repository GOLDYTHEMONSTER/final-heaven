// What the Shipping Intelligence figures mean (lib/shipping/report).
import { describe, expect, it } from 'vitest'
import { report, type LedgerRow } from '@/lib/shipping/report'
import type { Snapshot, SnapshotLine } from '@/lib/shipping/engine'

const line = (over: Partial<SnapshotLine> = {}): SnapshotLine => ({
  productId: 'tee', size: 'M', quantity: 1, unitKobo: 1_700_000, method: 'air', gift: false, chargeableKg: 0.2, classKey: 'standard', campaignId: null,
  confidence: 'verified', freightKobo: 240_000, targetKobo: 120_000, contributionKobo: 150_000, recoveryKobo: 120_000, reserveKobo: 30_000,
  platformKobo: 170_000, subsidyKobo: 0, discountKobo: 0, unfundedKobo: 120_000, flags: [], ...over,
})
const snap = (lines: SnapshotLine[]): Snapshot => ({
  version: 1, computedAt: '2026-11-13T10:00:00Z', status: 'verified', rates: {}, settings: { recoveryTargetPct: 50, reserveSharePct: 20, platformRecognisedOn: 'delivered' },
  lines, totals: { freightKobo: 0, contributionKobo: 0, recoveryKobo: 0, reserveKobo: 0, platformKobo: 0, subsidyKobo: 0, unfundedKobo: 0, chargeableKg: 0 }, warnings: [],
})
const posted = (order: string, over: Partial<LedgerRow> = {}): LedgerRow[] => [
  { kind: 'freight_recovery', amount: 1200, order_id: order, product_id: 'tee', shipment_id: null, campaign_id: null, reason: 'order_paid', occurred_at: '2026-11-13T10:00:00Z', ...over },
  { kind: 'logistics_reserve', amount: 300, order_id: order, product_id: 'tee', shipment_id: null, campaign_id: null, reason: 'order_paid', occurred_at: '2026-11-13T10:00:00Z', ...over },
  { kind: 'platform_revenue', amount: 1700, order_id: order, product_id: 'tee', shipment_id: null, campaign_id: null, reason: 'order_paid', occurred_at: '2026-11-13T10:00:00Z', ...over },
]
const reversed = (order: string) => posted(order).map((e) => ({ ...e, amount: -Number(e.amount), reason: 'order_cancelled' }))

const orders = [
  { id: 'o1', order_number: 'FH-1', status: 'delivered', payment_status: 'paid', created_at: '2026-11-13T10:00:00Z' },
  { id: 'o2', order_number: 'FH-2', status: 'confirmed', payment_status: 'paid', created_at: '2026-11-13T10:00:00Z' },
  { id: 'o3', order_number: 'FH-3', status: 'cancelled', payment_status: 'paid', created_at: '2026-11-13T10:00:00Z' },
]
const base = {
  orders, allocations: { o1: snap([line()]), o2: snap([line()]), o3: snap([line()]) }, shipmentOf: {} as Record<string, string>,
  shipments: [], campaigns: [], categories: { tee: 'T-Shirts' }, breakdowns: [], recogniseOn: 'delivered' as const, filters: {},
  ledger: [...posted('o1'), ...posted('o2'), ...posted('o3'), ...reversed('o3')],
}

describe('shipping report', () => {
  it('platform contribution is held until delivery, earned after, and gone when reversed', () => {
    const r = report(base).overview
    expect(r).toMatchObject({ platformEarnedKobo: 170_000, platformHeldKobo: 170_000 })
    expect(report({ ...base, recogniseOn: 'shipped', orders: orders.map((o) => (o.id === 'o2' ? { ...o, status: 'shipped' } : o)) }).overview.platformEarnedKobo).toBe(340_000)
  })

  it('the reserve is a balance of its own, never counted as platform revenue or recovery', () => {
    const r = report(base).overview
    expect(r).toMatchObject({ reserveBalanceKobo: 60_000, freightRecoveredKobo: 240_000 })
    expect(r.platformEarnedKobo + r.platformHeldKobo).toBe(340_000)
  })

  it('cancelled orders drop out of the estimates as well as the balances', () => {
    const r = report(base).overview
    expect(r).toMatchObject({ paidOrders: 2, estimatedFreightKobo: 480_000, estimatedRecoveryPct: 50, estimatedUnfundedKobo: 240_000 })
  })

  it('an order’s estimate stops being a liability once its shipment is reconciled; unassigned air orders are listed', () => {
    const shipment = { id: 's1', reference: 'AIR-1', kind: 'orders' as const, method: 'air' as const, status: 'reconciled', estimated_cost: 2400, estimated_units: 0.2,
      dispatched_on: null, arrived_on: null, invoices_total: 3000, invoiced_units: 0.25,
      reconciliation: { actual_cost: 3000, recovered: 1200, subsidies: 0, unfunded: 1800, reserve_drawn: 0 } }
    const r = report({ ...base, shipments: [shipment], shipmentOf: { o1: 's1' } })
    expect(r.overview.estimatedLiabilityKobo).toBe(240_000)
    expect(r.awaitingShipment.map((o) => o.orderNumber)).toEqual(['FH-2'])
    expect(r.shipments[0]).toMatchObject({ actualKobo: 300_000, recoveryPct: 40, unfundedKobo: 180_000, orders: 1 })
  })

  it('filters by order status, category and recovery', () => {
    expect(report({ ...base, filters: { orderStatus: 'delivered' } }).overview).toMatchObject({ paidOrders: 1, platformHeldKobo: 0 })
    expect(report({ ...base, filters: { category: 'Hoodies' } }).overview).toMatchObject({ paidOrders: 0, freightRecoveredKobo: 0 })
    expect(report({ ...base, filters: { recovery: 'below_target' } }).overview.paidOrders).toBe(0)
  })

  it('flags partly refunded orders, which need a manual ledger adjustment', () => {
    const r = report({ ...base, orders: [...orders, { id: 'o4', order_number: 'FH-4', status: 'delivered', payment_status: 'partially_refunded', created_at: '2026-11-13T10:00:00Z' }],
      allocations: { ...base.allocations, o4: snap([line()]) } })
    expect(r.partialRefunds).toEqual(['FH-4'])
  })
})
