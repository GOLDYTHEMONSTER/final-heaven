import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle, readJson, text } from '@/lib/api'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

export const GET = handle('admin.orders.list', async () => {
  const { staff, denied } = await requirePermission('orders.read')
  if (denied) return denied

  const [orders, transitions] = await Promise.all([
    staff.supabase.from('orders').select('*').eq('tenant_id', staff.tenant.tenantId)
      .order('created_at', { ascending: false }).limit(100),
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
 * Changes fulfilment status only. The database enforces the transition policy
 * (409 with its message on an invalid move), records the order event and the
 * audit entry, and refuses "confirmed" until payment is verified.
 */
export const PUT = handle('admin.orders.update', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('orders.update')
  if (denied) return denied

  const body = await readJson(req)
  const orderNumber = text(body.orderNumber, 'Order number', { max: 40, required: true })!
  const status = text(body.status, 'Status', { max: 30, required: true })!

  const { data, error } = await staff.supabase
    .from('orders')
    .update({ status })
    .eq('order_number', orderNumber)
    .eq('tenant_id', staff.tenant.tenantId)
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  return NextResponse.json({ order: data })
})
