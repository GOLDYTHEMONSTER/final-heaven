import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { BadRequest, handle, readJson, text } from '@/lib/api'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

const STATUSES = ['pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']
const PAYMENT_STATUSES = ['unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded', 'unverified']

/** Orders for the staff member's tenant. Optional filters: q (order/tracking number or email), status, payment, email. */
export const GET = handle('admin.orders.list', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('orders.read')
  if (denied) return denied

  const params = new URL(req.url).searchParams
  let query = staff.supabase.from('orders').select('*').eq('tenant_id', staff.tenant.tenantId)

  const status = params.get('status')
  if (status) {
    if (!STATUSES.includes(status)) throw new BadRequest('Unknown status filter.')
    query = query.eq('status', status)
  }
  const payment = params.get('payment')
  if (payment) {
    if (!PAYMENT_STATUSES.includes(payment)) throw new BadRequest('Unknown payment filter.')
    query = query.eq('payment_status', payment)
  }
  const email = params.get('email')
  if (email) query = query.ilike('email', email.trim().slice(0, 254).replace(/[%_]/g, ''))
  const q = (params.get('q') ?? '').trim().slice(0, 100)
  if (q) {
    // Restrict to safe characters so the value can't inject PostgREST filter syntax.
    const safe = q.replace(/[^A-Za-z0-9@.+\-]/g, '')
    if (safe) query = query.or(`order_number.ilike.*${safe}*,tracking_number.ilike.*${safe}*,email.ilike.*${safe}*`)
  }

  const [orders, transitions] = await Promise.all([
    query.order('created_at', { ascending: false }).limit(100),
    staff.supabase.from('order_status_transitions').select('from_status, to_status, requires_payment'),
  ])
  if (orders.error) throw orders.error
  if (transitions.error) throw transitions.error

  return NextResponse.json({
    orders: orders.data || [],
    // The database's transition policy, so the UI only offers valid moves.
    transitions: transitions.data || [],
    can: { update: staff.can('orders.update'), recordPayment: staff.can('payments.record') },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/**
 * Changes fulfilment status and/or the courier shipment reference. The
 * database enforces the transition policy (409 with its message on an invalid
 * move), records the order event and audit entry, and refuses "confirmed"
 * until payment is verified.
 */
export const PUT = handle('admin.orders.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('orders.update')
  if (denied) return denied

  const body = await readJson(req)
  const orderNumber = text(body.orderNumber, 'Order number', { max: 40, required: true })!
  const updates: Record<string, string | null> = {}
  if ('status' in body) updates.status = text(body.status, 'Status', { max: 30, required: true })
  if ('shippingCarrier' in body) updates.shipping_carrier = text(body.shippingCarrier, 'Courier', { max: 80 })
  if ('shippingReference' in body) updates.shipping_reference = text(body.shippingReference, 'Shipment reference', { max: 120 })
  if (!Object.keys(updates).length) throw new BadRequest('Nothing to update.')

  const { data, error } = await staff.supabase
    .from('orders')
    .update(updates)
    .eq('order_number', orderNumber)
    .eq('tenant_id', staff.tenant.tenantId)
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  return NextResponse.json({ order: data })
})
