import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { BadRequest, handle, readJson, text } from '@/lib/api'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

const STATUSES = ['ordered', 'processing', 'shipped', 'delivered', 'cancelled']

export const GET = handle('admin.orders.list', async () => {
  const { admin, denied } = await requireAdmin()
  if (denied) return denied

  const { data, error } = await admin.supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return NextResponse.json({ orders: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const PUT = handle('admin.orders.update', async (req: NextRequest) => {
  const { admin, denied } = await requireAdmin()
  if (denied) return denied

  const body = await readJson(req)
  const orderNumber = text(body.orderNumber, 'Order number', { max: 40, required: true })!
  const status = text(body.status, 'Status', { max: 20, required: true })!
  if (STATUSES.indexOf(status) === -1) throw new BadRequest(`Status must be one of: ${STATUSES.join(', ')}.`)

  const { data: existing, error: fetchErr } = await admin.supabase
    .from('orders')
    .select('timeline')
    .eq('order_number', orderNumber)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!existing) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  const now = new Date().toISOString()
  const newEvent = { status, date: now.slice(0, 10), time: now.slice(11, 16), description: `Status updated to ${status}` }
  const timeline = Array.isArray(existing.timeline) ? [...existing.timeline, newEvent] : [newEvent]

  const { data, error } = await admin.supabase
    .from('orders')
    .update({ status, timeline, updated_at: now })
    .eq('order_number', orderNumber)
    .select()
    .single()
  if (error) throw error

  return NextResponse.json({ order: data })
})
