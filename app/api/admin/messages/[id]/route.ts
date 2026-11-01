import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { handle } from '@/lib/api'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One message's thread: the message, staff's replies, and, when the customer's
 * email matches, their orders (number, date, status and total only). Requires
 * customers.read; the orders also need orders.read, as the orders list does.
 */
export const GET = handle('admin.messages.thread', async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('customers.read')
  if (denied) return denied
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })

  const tenantId = staff.tenant.tenantId
  const { data: message, error } = await staff.supabase.from('contact_messages').select('*').eq('id', params.id).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw error
  if (!message) return NextResponse.json({ error: 'Message not found.' }, { status: 404 })

  const canSeeOrders = staff.can('orders.read')
  const [replies, orders] = await Promise.all([
    staff.supabase.from('support_replies').select('id, body, author_email, created_at').eq('message_id', params.id).eq('tenant_id', tenantId).order('created_at'),
    canSeeOrders
      // The address is matched whole, letter case aside: % and _ would otherwise be wildcards.
      ? staff.supabase.from('orders').select('order_number, created_at, status, total, currency').eq('tenant_id', tenantId)
        .ilike('email', String(message.email).replace(/[\\%_]/g, '\\$&')).order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (replies.error) throw replies.error
  if (orders.error) throw orders.error

  return NextResponse.json({
    message, replies: replies.data ?? [], orders: orders.data ?? [], canSeeOrders, canReply: staff.can('customers.update'),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
