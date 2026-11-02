import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { BadRequest, handle, readJson, text } from '@/lib/api'

export const dynamic = 'force-dynamic'

const ID = /^[0-9a-f-]{36}$/

/**
 * Staff actions on ticket orders and tickets (the database checks permissions
 * and writes the audit log):
 *   { action: 'cancel', order, reason, refunded }  voids the order's tickets; `refunded` (needs
 *                                                  refunds.approve) records the refund made in Flutterwave
 *   { action: 'undo_check_in', ticket }            a check-in made by mistake
 */
export const POST = handle('admin.events.orders', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  if (!ID.test(params.id)) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const body = await readJson(req, 2_000)

  if (body.action === 'cancel') {
    const order = text(body.order, 'Order', { max: 40, required: true })!
    if (!ID.test(order)) throw new BadRequest('Order not found.')
    const reason = text(body.reason, 'Reason', { max: 300, required: true })!
    const { error } = await staff.supabase.rpc('cancel_ticket_order', { p_order: order, p_reason: reason, p_refunded: body.refunded === true })
    if (error?.code === '42501') return NextResponse.json({ error: 'You don’t have permission to do that.' }, { status: 403 })
    if (error?.code === 'P0002') return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    if (error) throw error
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'undo_check_in') {
    const ticket = text(body.ticket, 'Ticket', { max: 40, required: true })!
    if (!ID.test(ticket)) throw new BadRequest('Ticket not found.')
    const { error } = await staff.supabase.rpc('undo_check_in', { p_ticket: ticket })
    if (error?.code === '42501') return NextResponse.json({ error: 'You don’t have permission to do that.' }, { status: 403 })
    if (error?.code === 'P0002') return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    if (error) throw error
    return NextResponse.json({ ok: true })
  }

  throw new BadRequest('Unknown action.')
})
