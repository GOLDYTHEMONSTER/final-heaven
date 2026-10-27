import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { BadRequest, handle, int, money, readJson, text } from '@/lib/api'
import { UUID, oneOf } from '@/lib/shipping/admin'

export const dynamic = 'force-dynamic'

const KINDS = ['freight_recovery', 'logistics_reserve', 'platform_revenue', 'promo_subsidy', 'unfunded_freight'] as const

/** Ledger entries, newest first (shipping.read or finance.read; RLS allows either). */
export const GET = handle('admin.shipping.ledger.list', async (req: NextRequest) => {
  const auth = await requirePermission('shipping.read')
  const { staff, denied } = auth.denied ? await requirePermission('finance.read') : auth
  if (denied) return denied
  const q = new URL(req.url).searchParams
  const page = int(q.get('page') ?? '1', 'Page', { min: 1, max: 10_000 })
  let query = staff.supabase.from('shipping_ledger')
    .select('id, occurred_at, kind, amount, currency, product_id, reason, memo, reversal_of, actor_type, order:orders(order_number), shipment:freight_shipments(reference), campaign:clearance_campaigns(name)', { count: 'exact' })
    .eq('tenant_id', staff.tenant.tenantId)
  const kind = q.get('kind')
  if (kind) query = query.eq('kind', oneOf(kind, KINDS, 'Kind'))
  for (const [param, column] of [['shipment', 'shipment_id'], ['campaign', 'campaign_id'], ['order', 'order_id']] as const) {
    const v = q.get(param)
    if (v) { if (!UUID.test(v)) throw new BadRequest(`Unknown ${param}.`); query = query.eq(column, v) }
  }
  const { data, count, error } = await query.order('id', { ascending: false }).range((page - 1) * 100, page * 100 - 1)
  if (error) throw error
  return NextResponse.json({ entries: data ?? [], total: count ?? 0, page, can: { adjust: staff.can('finance.adjust') } }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/** A manual adjustment with its reason (finance.adjust). The key makes a double submit harmless. */
export const POST = handle('admin.shipping.ledger.adjust', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('finance.adjust')
  if (denied) return denied
  const b = await readJson(req, 4_000)
  const sign = b.direction === 'decrease' ? -1 : 1
  const amount = money(b.amount, 'Amount')
  if (!amount) throw new BadRequest('Enter an amount.')
  const ref = (v: unknown, field: string) => { if (v == null || v === '') return null; if (typeof v !== 'string' || !UUID.test(v)) throw new BadRequest(`Unknown ${field}.`); return v }
  const { data, error } = await staff.supabase.rpc('adjust_shipping_ledger', { p_tenant: staff.tenant.tenantId, p: {
    kind: oneOf(b.kind, KINDS, 'Kind'), amount: sign * amount, memo: text(b.memo, 'Reason', { max: 500, required: true }),
    key: text(b.key, 'Request key', { max: 80, required: true }), order_id: ref(b.orderId, 'order'), shipment_id: ref(b.shipmentId, 'shipment'),
    campaign_id: ref(b.campaignId, 'campaign'),
  } })
  if (error) throw error
  return NextResponse.json({ id: data, duplicate: data == null })
})
