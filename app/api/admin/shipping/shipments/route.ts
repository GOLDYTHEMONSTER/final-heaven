import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, type StaffContext } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, HttpError, handle, int, readJson, requestIdOf, text, url } from '@/lib/api'
import { allocateBatch, reconcileAir, shipmentCharge, split, type AllocationMethod, type Snapshot } from '@/lib/shipping/engine'
import { toRate } from '@/lib/shipping/store'
import { ALLOCATION, date, optMoney, optNumber, oneOf, uuid } from '@/lib/shipping/admin'

export const dynamic = 'force-dynamic'

const STATUSES = ['planning', 'booked', 'in_transit', 'arrived', 'cancelled'] as const
const k = (v: unknown) => Math.round(Number(v ?? 0) * 100)
const naira = (kobo: number) => Math.round(kobo) / 100

/** Shipments with their orders, lines, invoices and reconciliation, plus paid orders not yet on one. */
export const GET = handle('admin.shipping.shipments.list', async () => {
  const { staff, denied } = await requirePermission('shipping.read')
  if (denied) return denied
  const db = staff.supabase
  const t = staff.tenant.tenantId
  const [shipments, links, lines, invoices, recs, allocations, rates] = await Promise.all([
    db.from('freight_shipments').select('*').eq('tenant_id', t).order('created_at', { ascending: false }).limit(100),
    db.from('freight_shipment_orders').select('order_id, shipment_id, orders(order_number, status, payment_status, created_at)').eq('tenant_id', t),
    db.from('freight_shipment_lines').select('*, products(name)').eq('tenant_id', t).order('created_at'),
    db.from('freight_invoices').select('*').eq('tenant_id', t).order('created_at'),
    db.from('freight_reconciliations').select('*').eq('tenant_id', t),
    db.from('order_shipping_allocations').select('order_id, snapshot, orders!inner(order_number, status, payment_status, created_at)').eq('tenant_id', t)
      .in('orders.payment_status', ['paid', 'partially_refunded']).neq('orders.status', 'cancelled').order('created_at', { ascending: false }).limit(500),
    db.from('shipping_rates').select('id, method, provider, billing_unit, effective_from, status').eq('tenant_id', t).order('effective_from', { ascending: false }),
  ])
  for (const r of [shipments, links, lines, invoices, recs, allocations, rates]) if (r.error) throw r.error
  const assigned = new Set((links.data ?? []).map((l) => l.order_id))
  const snapOf = new Map((allocations.data ?? []).map((a: any) => [a.order_id, a.snapshot as Snapshot]))
  return NextResponse.json({
    shipments: (shipments.data ?? []).map((s) => ({
      ...s,
      orders: (links.data ?? []).filter((l) => l.shipment_id === s.id).map((l: any) => {
        const snap = snapOf.get(l.order_id)
        return { id: l.order_id, ...l.orders, chargeableKg: snap?.totals.chargeableKg ?? null, freightKobo: snap?.totals.freightKobo ?? null }
      }),
      lines: (lines.data ?? []).filter((l) => l.shipment_id === s.id),
      invoices: (invoices.data ?? []).filter((i) => i.shipment_id === s.id),
      reconciliation: (recs.data ?? []).find((r) => r.shipment_id === s.id) ?? null,
    })),
    unassigned: (allocations.data ?? []).filter((a: any) => !assigned.has(a.order_id) && (a.snapshot as Snapshot).lines.some((l) => l.method === 'air'))
      .map((a: any) => ({ id: a.order_id, ...a.orders, chargeableKg: a.snapshot.totals.chargeableKg, freightKobo: a.snapshot.totals.freightKobo, status: a.orders.status })),
    rates: rates.data ?? [],
    can: { manage: staff.can('shipping.manage'), finalize: staff.can('finance.adjust') },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const POST = handle('admin.shipping.shipments.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('shipping.manage')
  if (denied) return denied
  const b = await readJson(req, 8_000)
  const kind = oneOf(b.kind, ['orders', 'inventory'] as const, 'Shipment type')
  const method = kind === 'orders' ? 'air' : oneOf(b.method, ['air', 'sea'] as const, 'Method', 'sea')
  const { data, error } = await staff.supabase.from('freight_shipments').insert({
    tenant_id: staff.tenant.tenantId, kind, method,
    reference: text(b.reference, 'Reference', { max: 60, required: true }),
    rate_id: b.rate_id ? uuid(b.rate_id, 'Rate') : null,
    allocation_method: oneOf(b.allocation_method, ALLOCATION, 'Allocation', kind === 'orders' ? 'chargeable_weight' : 'volume'),
    notes: text(b.notes, 'Notes', { max: 2000 }),
  }).select().single()
  if (error?.code === '23505') throw new BadRequest('A shipment with that reference already exists.')
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: 'shipping.shipment_created', entityType: 'freight_shipment', entityId: data.reference,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { kind, method } })
  return NextResponse.json({ shipment: data }, { status: 201 })
})

type Loaded = Awaited<ReturnType<typeof load>>

async function load(db: SupabaseClient, tenantId: string, id: string) {
  const { data: s, error } = await db.from('freight_shipments').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw error
  if (!s) throw new HttpError(404, 'Shipment not found.')
  const [links, lines, invoices, rate] = await Promise.all([
    db.from('freight_shipment_orders').select('order_id').eq('shipment_id', id),
    db.from('freight_shipment_lines').select('*').eq('shipment_id', id).order('created_at'),
    db.from('freight_invoices').select('*').eq('shipment_id', id),
    s.rate_id ? db.from('shipping_rates').select('*').eq('id', s.rate_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  for (const r of [links, lines, invoices, rate]) if (r.error) throw r.error
  const orderIds = (links.data ?? []).map((l) => l.order_id)
  const [allocs, ledger] = await Promise.all([
    orderIds.length ? db.from('order_shipping_allocations').select('order_id, snapshot').in('order_id', orderIds) : Promise.resolve({ data: [], error: null }),
    orderIds.length ? db.from('shipping_ledger').select('order_id, kind, amount').in('order_id', orderIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (allocs.error) throw allocs.error
  if (ledger.error) throw ledger.error
  return { s, orderIds, lines: lines.data ?? [], invoices: invoices.data ?? [], rate: rate.data ? toRate(rate.data) : null,
    snaps: new Map((allocs.data ?? []).map((a: any) => [a.order_id, a.snapshot as Snapshot])), ledger: ledger.data ?? [] }
}

/** An inventory line's unit goods cost in kobo, or null. */
const goods = (l: Record<string, any>) => (l.unit_cost == null ? null : k(Number(l.unit_cost) * (l.cost_currency === 'NGN' ? 1 : Number(l.fx_rate ?? NaN))) || null)

/** The shipment's estimate, from the order snapshots (orders) or its rate (inventory). */
function estimate(x: Loaded) {
  if (x.s.kind === 'orders') {
    const kg = x.orderIds.reduce((t, id) => t + (x.snaps.get(id)?.totals.chargeableKg ?? 0), 0)
    const fromOrders = x.orderIds.reduce((t, id) => t + (x.snaps.get(id)?.totals.freightKobo ?? 0), 0)
    const charge = x.rate ? shipmentCharge(x.rate, kg) : null
    return { units: Math.round(kg * 1000) / 1000, costKobo: charge?.estimateKobo ?? fromOrders, detail: { fromOrdersKobo: fromOrders, shipment: charge } }
  }
  if (!x.rate) throw new BadRequest('Choose the rate this batch ships on to estimate it.')
  const unitsOf = (l: Record<string, any>) => x.rate!.billingUnit === 'cbm' ? Number(l.unit_cbm ?? 0)
    : Math.max(Number(l.unit_weight_kg ?? 0), l.unit_cbm && x.rate!.volumetricDivisor ? (Number(l.unit_cbm) * 1e6) / x.rate!.volumetricDivisor : 0)
  const units = x.lines.reduce((t, l) => t + unitsOf(l) * l.quantity_ordered, 0)
  if (!units) throw new BadRequest(`Add each line’s ${x.rate.billingUnit === 'cbm' ? 'volume' : 'weight'} to estimate the batch.`)
  const goodsTotal = x.lines.reduce((t, l) => t + (goods(l) ?? 0) * l.quantity_ordered, 0)
  const charge = shipmentCharge(x.rate, units, goodsTotal)
  const alloc = allocateBatch(batchLines(x), { freightKobo: charge.freightKobo + charge.contingencyKobo, customsKobo: 0, insuranceKobo: charge.insuranceKobo, handlingKobo: charge.handlingKobo, otherKobo: 0 },
    x.s.allocation_method as AllocationMethod, x.rate.volumetricDivisor)
  return { units: Math.round(units * 1000) / 1000, costKobo: charge.estimateKobo, detail: { shipment: charge, lines: alloc.ok ? alloc.lines : null, allocationError: alloc.ok ? null : alloc.error } }
}

const batchLines = (x: Loaded) => x.lines.map((l) => ({
  id: l.id, productId: l.product_id, quantityOrdered: l.quantity_ordered, quantityReceived: l.quantity_received,
  goodsKobo: goods(l), unitWeightKg: l.unit_weight_kg != null ? Number(l.unit_weight_kg) : null, unitCbm: l.unit_cbm != null ? Number(l.unit_cbm) : null,
}))

/** The invoices' cost parts in kobo, adding up exactly to their total as the database stores it. */
function invoiceCosts(x: Loaded) {
  const parts = { freightKobo: 0, customsKobo: 0, insuranceKobo: 0, handlingKobo: 0, otherKobo: 0 }
  let total = 0
  for (const i of x.invoices) {
    const fx = i.currency === 'NGN' ? 1 : Number(i.fx_rate)
    const raw = [Number(i.freight_amount) + Number(i.additional_fees), Number(i.clearance_charges), Number(i.insurance), Number(i.handling), Number(i.other_costs)]
    const t = k(i.total_ngn)
    const shares = split(t, raw.map((v) => v * fx))
    parts.freightKobo += shares[0]; parts.customsKobo += shares[1]; parts.insuranceKobo += shares[2]; parts.handlingKobo += shares[3]; parts.otherKobo += shares[4]
    total += t
  }
  return { parts, totalKobo: total }
}

/** What finalising would record, worked out by the engine from the database's own figures. */
async function preview(db: SupabaseClient, tenantId: string, x: Loaded, opts: { drawFromReserve: boolean; surplusToReserve: boolean }) {
  if (!x.invoices.length) throw new BadRequest('Enter the freight invoice first.')
  const { parts, totalKobo } = invoiceCosts(x)
  if (x.s.kind === 'orders') {
    const { data: reserve, error } = await db.from('shipping_ledger').select('amount').eq('tenant_id', tenantId).eq('kind', 'logistics_reserve')
    if (error) throw error
    const sumFor = (id: string, kind: string) => x.ledger.filter((e) => e.order_id === id && e.kind === kind).reduce((t, e) => t + k(e.amount), 0)
    const r = reconcileAir({
      orders: x.orderIds.map((id) => ({ orderId: id, chargeableKg: x.snaps.get(id)?.totals.chargeableKg ?? 0, freightKobo: x.snaps.get(id)?.totals.freightKobo ?? 0,
        recoveryKobo: sumFor(id, 'freight_recovery'), subsidyKobo: sumFor(id, 'promo_subsidy') })),
      actualKobo: totalKobo, reserveBalanceKobo: (reserve ?? []).reduce((t, e) => t + k(e.amount), 0), ...opts,
    })
    return { kind: 'orders' as const, ...r, estimatedKobo: x.s.estimated_cost != null ? k(x.s.estimated_cost) : r.estimatedKobo }
  }
  const alloc = allocateBatch(batchLines(x), parts, x.s.allocation_method as AllocationMethod, x.rate?.volumetricDivisor ?? null)
  if (!alloc.ok) throw new BadRequest(alloc.error)
  return {
    kind: 'inventory' as const, actualKobo: totalKobo, parts, estimatedKobo: x.s.estimated_cost != null ? k(x.s.estimated_cost) : null,
    varianceKobo: x.s.estimated_cost != null ? totalKobo - k(x.s.estimated_cost) : null, lines: alloc.lines,
  }
}

async function act(staff: StaffContext, b: Record<string, unknown>, requestId: string) {
  const db = staff.supabase
  const t = staff.tenant.tenantId
  const id = uuid(b.id, 'Shipment')
  const action = text(b.action, 'Action', { max: 30, required: true })
  const log = (name: string, metadata: Record<string, unknown>) => audit({ tenantId: t, action: `shipping.${name}`, entityType: 'freight_shipment', entityId: id,
    actor: { type: 'user', userId: staff.userId }, requestId, metadata })
  const x = await load(db, t, id)

  switch (action) {
    case 'update': {
      const updates: Record<string, unknown> = {}
      if ('status' in b) updates.status = oneOf(b.status, STATUSES, 'Status')
      if ('dispatched_on' in b) updates.dispatched_on = date(b.dispatched_on, 'Dispatched')
      if ('arrived_on' in b) updates.arrived_on = date(b.arrived_on, 'Arrived')
      if ('notes' in b) updates.notes = text(b.notes, 'Notes', { max: 2000 })
      if ('rate_id' in b) updates.rate_id = b.rate_id ? uuid(b.rate_id, 'Rate') : null
      if ('allocation_method' in b) updates.allocation_method = oneOf(b.allocation_method, ALLOCATION, 'Allocation')
      if ('documents' in b) {
        if (!Array.isArray(b.documents) || b.documents.length > 20) throw new BadRequest('Up to 20 documents.')
        updates.documents = b.documents.map((d: any) => ({ label: text(d?.label, 'Document name', { max: 80, required: true }), url: url(d?.url, 'Document link') }))
      }
      // Leaving planning fixes the estimate: work it out now if it never was.
      if (updates.status && updates.status !== 'planning' && x.s.status === 'planning' && updates.status !== 'cancelled' && x.s.estimated_cost == null) {
        const e = estimate(x)
        Object.assign(updates, { estimated_units: e.units, estimated_cost: naira(e.costKobo), estimate: e.detail, estimated_at: new Date().toISOString() })
      }
      const { error } = await db.from('freight_shipments').update(updates).eq('id', id).eq('tenant_id', t)
      if (error) throw error
      await log('shipment_updated', { fields: Object.keys(updates), status: updates.status })
      return {}
    }
    case 'estimate': {
      if (x.s.status !== 'planning') throw new BadRequest('The estimate is kept as it was when the shipment was booked.')
      const e = estimate(x)
      const { error } = await db.from('freight_shipments').update({ estimated_units: e.units, estimated_cost: naira(e.costKobo), estimate: e.detail, estimated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      if (x.s.kind === 'inventory' && Array.isArray((e.detail as any).lines)) {
        for (const l of (e.detail as any).lines) {
          const { error: le } = await db.from('freight_shipment_lines').update({ estimated_landed_unit: naira(l.landedPerUnitKobo) }).eq('id', l.id)
          if (le) throw le
        }
      }
      return { estimate: e }
    }
    case 'add_orders': {
      const ids = Array.isArray(b.orderIds) ? b.orderIds.slice(0, 200).map((o) => uuid(o, 'Order')) : []
      if (!ids.length) throw new BadRequest('Choose orders to add.')
      const { error } = await db.from('freight_shipment_orders').insert(ids.map((order_id) => ({ order_id, shipment_id: id, tenant_id: t })))
      if (error?.code === '23505') throw new BadRequest('One of those orders is already on a shipment.')
      if (error) throw error
      await log('orders_added', { count: ids.length })
      return {}
    }
    case 'remove_order': {
      const { error } = await db.from('freight_shipment_orders').delete().eq('order_id', uuid(b.orderId, 'Order')).eq('shipment_id', id)
      if (error) throw error
      return {}
    }
    case 'add_line': {
      const pid = text(b.product_id, 'Product', { max: 64, required: true })
      const currency = (text(b.cost_currency, 'Currency', { max: 3 }) ?? 'CNY').toUpperCase()
      const row = {
        shipment_id: id, tenant_id: t, product_id: pid, quantity_ordered: int(b.quantity_ordered, 'Quantity', { min: 1, max: 1_000_000 }),
        unit_cost: optMoney(b.unit_cost, 'Unit cost'), cost_currency: currency,
        fx_rate: currency === 'NGN' ? null : optNumber(b.fx_rate, 'Exchange rate', 0.000001, 1_000_000),
        unit_weight_kg: optNumber(b.unit_weight_kg, 'Unit weight', 0.001, 10_000), unit_cbm: optNumber(b.unit_cbm, 'Unit volume', 0.000001, 100),
      }
      if (row.unit_cost != null && currency !== 'NGN' && !row.fx_rate) throw new BadRequest(`Enter the naira rate for ${currency}.`)
      const { error } = await db.from('freight_shipment_lines').insert(row)
      if (error) throw error
      await log('line_added', { product: pid, quantity: row.quantity_ordered })
      return {}
    }
    case 'remove_line': {
      const lineId = uuid(b.lineId, 'Line')
      if (x.lines.find((l) => l.id === lineId)?.quantity_received) throw new BadRequest('Units of this line were received, so it stays.')
      const { error } = await db.from('freight_shipment_lines').delete().eq('id', lineId).eq('shipment_id', id)
      if (error) throw error
      return {}
    }
    case 'add_invoice': {
      const currency = (text(b.currency, 'Currency', { max: 3 }) ?? 'NGN').toUpperCase()
      const row = {
        shipment_id: id, tenant_id: t, invoice_ref: text(b.invoice_ref, 'Invoice number', { max: 80 }), invoice_date: date(b.invoice_date, 'Invoice date'),
        currency, fx_rate: currency === 'NGN' ? null : optNumber(b.fx_rate, 'Exchange rate', 0.000001, 1_000_000),
        chargeable_actual: optNumber(b.chargeable_actual, 'Chargeable weight or volume', 0, 1_000_000),
        freight_amount: optMoney(b.freight_amount, 'Freight') ?? 0, additional_fees: optMoney(b.additional_fees, 'Additional fees') ?? 0,
        clearance_charges: optMoney(b.clearance_charges, 'Clearance') ?? 0, insurance: optMoney(b.insurance, 'Insurance') ?? 0,
        handling: optMoney(b.handling, 'Handling') ?? 0, other_costs: optMoney(b.other_costs, 'Other costs') ?? 0,
        document_url: url(b.document_url, 'Invoice link'), notes: text(b.notes, 'Notes', { max: 1000 }), created_by: staff.userId,
      }
      if (currency !== 'NGN' && !row.fx_rate) throw new BadRequest(`Enter the naira rate for ${currency}.`)
      if (!row.freight_amount && !row.additional_fees && !row.clearance_charges && !row.insurance && !row.handling && !row.other_costs) throw new BadRequest('Enter the invoice amounts.')
      const { error } = await db.from('freight_invoices').insert(row)
      if (error) throw error
      await log('invoice_added', { ref: row.invoice_ref, currency })
      return {}
    }
    case 'remove_invoice': {
      const { error } = await db.from('freight_invoices').delete().eq('id', uuid(b.invoiceId, 'Invoice')).eq('shipment_id', id)
      if (error) throw error
      return {}
    }
    case 'receive': {
      const key = text(b.key, 'Request key', { max: 80, required: true })!
      const { data, error } = await db.rpc('receive_inventory', { p_line: uuid(b.lineId, 'Line'), p_quantity: int(b.quantity, 'Quantity', { min: 1, max: 1_000_000 }), p_key: key })
      if (error) throw error
      return { receipt: data }
    }
    case 'preview':
      return { preview: await preview(db, t, x, { drawFromReserve: b.drawFromReserve === true, surplusToReserve: b.surplusToReserve === true }) }
    case 'finalize': {
      if (!staff.can('finance.adjust')) throw new HttpError(403, 'You don’t have permission to do that.')
      if (b.confirm !== true) throw new BadRequest('Confirm the reconciliation: it can’t be changed afterwards.')
      const p = await preview(db, t, x, { drawFromReserve: b.drawFromReserve === true, surplusToReserve: b.surplusToReserve === true })
      const payload = p.kind === 'orders'
        ? { actual_cost: naira(p.actualKobo), recovered: naira(p.recoveredKobo), subsidies: naira(p.subsidyKobo), reserve_drawn: naira(p.reserveDrawKobo),
            surplus_to_reserve: naira(p.surplusToReserveKobo), allocation: p.perOrder }
        : { actual_cost: naira(p.actualKobo), lines: p.lines.map((l) => ({ id: l.id, allocated: naira(l.allocatedKobo), landed_unit: naira(l.landedPerUnitKobo), basis: l.perUnitBasis })) }
      const { error } = await db.rpc('finalize_freight_reconciliation', { p_shipment: id, p: payload })
      if (error) throw error
      return { finalized: true, preview: p }
    }
    default:
      throw new BadRequest('Unknown action.')
  }
}

export const PUT = handle('admin.shipping.shipments.update', async (req: NextRequest) => {
  const b = await readJson(req, 32_000)
  // Reading a preview needs only shipping.read; every other action changes something.
  const { staff, denied } = await requirePermission(b.action === 'preview' ? 'shipping.read' : b.action === 'finalize' ? 'finance.adjust' : 'shipping.manage')
  if (denied) return denied
  return NextResponse.json({ ok: true, ...(await act(staff, b, requestIdOf(req))) })
})
