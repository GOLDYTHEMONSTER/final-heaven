import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { BadRequest, handle, readJson, text } from '@/lib/api'
import { toMinor } from '@/lib/money'

export const dynamic = 'force-dynamic'

const METHODS = ['bank_transfer', 'cash', 'payment_link', 'other']

/**
 * Records an offline payment (bank transfer, cash, a payment link) against an
 * unpaid order. The database function re-checks payments.record for the
 * order's tenant, requires the exact order total and a note, and writes the
 * audit entry. Phase 2 adds a second approver for this.
 */
export const POST = handle('admin.orders.record_payment', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('payments.record')
  if (denied) return denied

  const body = await readJson(req, 4_000)
  const orderNumber = text(body.orderNumber, 'Order number', { max: 40, required: true })!
  const method = text(body.method, 'Payment method', { max: 20, required: true })!
  const note = text(body.note, 'Note', { max: 500, required: true })!
  const amount = text(typeof body.amount === 'number' ? String(body.amount) : body.amount, 'Amount', { max: 20, required: true })!
  if (!METHODS.includes(method)) throw new BadRequest(`Payment method must be one of: ${METHODS.join(', ')}.`)

  const { data: order, error: orderError } = await staff.supabase.from('orders').select('currency')
    .eq('order_number', orderNumber).eq('tenant_id', staff.tenant.tenantId).maybeSingle()
  if (orderError) throw orderError
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  let amountMinor: number
  try {
    amountMinor = toMinor(amount, order.currency)
  } catch {
    throw new BadRequest('Enter the amount as a number, e.g. 24999.90.')
  }

  const { data: paymentId, error } = await staff.supabase.rpc('record_manual_payment', {
    p_order_number: orderNumber, p_amount_minor: amountMinor, p_currency: order.currency, p_method: method, p_note: note,
  })
  if (error) throw error
  return NextResponse.json({ paymentId }, { status: 201 })
})
