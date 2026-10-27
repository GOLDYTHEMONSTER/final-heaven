import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { BadRequest, handle } from '@/lib/api'
import { activeRate, perUnitCost, rateState, type Snapshot } from '@/lib/shipping/engine'
import { catalogue, UUID } from '@/lib/shipping/admin'
import { report, type Filters } from '@/lib/shipping/report'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Shipping Intelligence: rates in force, recovery, reserve, platform share, shipments, campaigns and product health. */
export const GET = handle('admin.shipping.report', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('shipping.read')
  if (denied) return denied
  const db = staff.supabase
  const tenant = staff.tenant.tenantId
  const q = new URL(req.url).searchParams
  const opt = (k: string, test: (v: string) => boolean = (v) => v.length <= 60) => {
    const v = q.get(k)?.trim()
    if (!v) return null
    if (!test(v)) throw new BadRequest(`Unknown ${k} filter.`)
    return v
  }
  const filters: Filters = {
    from: opt('from', (v) => DATE.test(v)), to: opt('to', (v) => DATE.test(v)), method: opt('method', (v) => v === 'air' || v === 'sea'),
    category: opt('category'), productId: opt('product', (v) => /^[A-Za-z0-9_-]{1,64}$/.test(v)), shipmentId: opt('shipment', (v) => UUID.test(v)),
    orderStatus: opt('status', (v) => /^[a-z_]{3,20}$/.test(v)), campaignId: opt('campaign', (v) => UUID.test(v)), classKey: opt('class', (v) => /^[a-z0-9_]{2,40}$/.test(v)),
    recovery: opt('recovery', (v) => v === 'below_target' || v === 'on_target') as Filters['recovery'],
  }

  const [cat, ledger, allocations, links, shipments, invoices, recs, campaigns] = await Promise.all([
    catalogue(db, tenant),
    db.from('shipping_ledger').select('kind, amount, order_id, product_id, shipment_id, campaign_id, reason, occurred_at').eq('tenant_id', tenant).limit(20000),
    db.from('order_shipping_allocations').select('order_id, snapshot, orders!inner(id, order_number, status, payment_status, created_at)').eq('tenant_id', tenant).limit(5000),
    db.from('freight_shipment_orders').select('order_id, shipment_id').eq('tenant_id', tenant),
    db.from('freight_shipments').select('id, reference, kind, method, status, estimated_cost, estimated_units, dispatched_on, arrived_on').eq('tenant_id', tenant).order('created_at', { ascending: false }),
    db.from('freight_invoices').select('shipment_id, total_ngn, chargeable_actual').eq('tenant_id', tenant),
    db.from('freight_reconciliations').select('shipment_id, actual_cost, recovered, subsidies, unfunded, reserve_drawn').eq('tenant_id', tenant),
    db.from('clearance_campaigns').select('id, name, status, starts_at, ends_at, subsidy_budget, shipping_treatment').eq('tenant_id', tenant).order('starts_at', { ascending: false }),
  ])
  for (const r of [ledger, allocations, links, shipments, invoices, recs, campaigns]) if (r.error) throw r.error

  const orders = (allocations.data ?? []).map((a: any) => a.orders)
  const breakdowns = cat.breakdowns()
  const r = report({
    ledger: ledger.data ?? [], orders,
    allocations: Object.fromEntries((allocations.data ?? []).map((a: any) => [a.order_id, a.snapshot as Snapshot])),
    shipmentOf: Object.fromEntries((links.data ?? []).map((l) => [l.order_id, l.shipment_id])),
    shipments: (shipments.data ?? []).map((s) => {
      const inv = (invoices.data ?? []).filter((i) => i.shipment_id === s.id)
      return {
        ...s, invoices_total: inv.reduce((t, i) => t + Number(i.total_ngn), 0),
        invoiced_units: inv.some((i) => i.chargeable_actual != null) ? inv.reduce((t, i) => t + Number(i.chargeable_actual ?? 0), 0) : null,
        reconciliation: (recs.data ?? []).find((x) => x.shipment_id === s.id) ?? null,
      }
    }),
    campaigns: campaigns.data ?? [], categories: Object.fromEntries(cat.inputs.map((p) => [p.productId, p.category ?? ''])),
    breakdowns, recogniseOn: cat.ctx.settings.platformRecognisedOn, filters,
  })

  const rates = (m: 'air' | 'sea') => {
    const { rate, warning } = activeRate(cat.ctx.rates, m, cat.ctx.today)
    return { rate: rate ? { id: rate.id, provider: rate.provider, perUnitKobo: perUnitCost(rate).kobo, billingUnit: rate.billingUnit, effectiveTo: rate.effectiveTo,
      currency: rate.currency, ratePerUnit: rate.ratePerUnit, fxRate: rate.fxRate } : null, warning }
  }
  return NextResponse.json({
    today: cat.ctx.today,
    rates: {
      air: rates('air'), sea: rates('sea'),
      upcoming: cat.ctx.rates.filter((x) => rateState(x, cat.ctx.today) === 'upcoming').map((x) => ({ id: x.id, method: x.method, provider: x.provider, effectiveFrom: x.effectiveFrom })),
    },
    settings: cat.ctx.settings,
    classes: cat.ctx.classes,
    categories: [...new Set(cat.inputs.map((p) => p.category).filter(Boolean))].sort(),
    products: cat.inputs.map((p) => ({ id: p.productId, name: p.name })),
    ...r,
    can: { manage: staff.can('shipping.manage'), adjust: staff.can('finance.adjust') },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
