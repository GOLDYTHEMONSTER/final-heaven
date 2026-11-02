import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf } from '@/lib/api'
import { canMove, readEvent } from '@/lib/events/admin'
import { EVENT_COLUMNS, TIER_COLUMNS } from '@/lib/events/store'
import type { EventStatus } from '@/lib/events'

export const dynamic = 'force-dynamic'

const ID = /^[0-9a-f-]{36}$/

/** Everything on an event's Studio page: details, tiers with seats, orders and door links. */
export const GET = handle('admin.events.get', async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  if (!ID.test(params.id)) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const db = staff.supabase
  const { data: event, error } = await db.from('events').select(EVENT_COLUMNS).eq('id', params.id).eq('tenant_id', staff.tenant.tenantId).maybeSingle()
  if (error) throw error
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const [tiers, seats, orders, links] = await Promise.all([
    db.from('ticket_types').select(TIER_COLUMNS).eq('event_id', event.id).order('sort').order('price'),
    db.rpc('ticket_availability', { p_event: event.id }),
    db.from('ticket_orders').select('id, order_number, name, email, phone, total, discount, promo_code, status, payment_status, capacity_shortfall, cancel_reason, created_at, tickets(id, code, status, checked_in_at, ticket_type_id)')
      .eq('event_id', event.id).order('created_at', { ascending: false }).limit(1000),
    db.from('event_door_links').select('id, label, expires_at, revoked_at, checkins, last_used_at, created_at').eq('event_id', event.id).order('created_at', { ascending: false }),
  ])
  for (const r of [tiers, seats, orders, links]) if (r.error) throw r.error
  return NextResponse.json({
    event, tiers: tiers.data, seats: seats.data, orders: orders.data, doorLinks: links.data,
    can: { refund: staff.can('refunds.approve'), checkIn: staff.can('events.checkin') },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/** Edits an event's details, or its status: { status: 'published' | 'cancelled' | 'draft' } or { sales_paused }. */
export const PUT = handle('admin.events.update', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  if (!ID.test(params.id)) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const body = await readJson(req, 12_000)
  const db = staff.supabase
  const { data: current, error: ce } = await db.from('events').select('id, slug, status').eq('id', params.id).eq('tenant_id', staff.tenant.tenantId).maybeSingle()
  if (ce) throw ce
  if (!current) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  const update: Record<string, unknown> = readEvent(body, { partial: true })
  if ('sales_paused' in body) {
    if (typeof body.sales_paused !== 'boolean') throw new BadRequest('Say whether sales are paused.')
    update.sales_paused = body.sales_paused
  }
  if ('status' in body) {
    const to = body.status as EventStatus
    if (!['draft', 'published', 'cancelled'].includes(to)) throw new BadRequest('Unknown status.')
    if (!canMove(current.status, to)) throw new BadRequest('A cancelled event can’t be reopened. Make a new one.')
    if (to === 'published') {
      const { count, error } = await db.from('ticket_types').select('id', { head: true, count: 'exact' }).eq('event_id', current.id).eq('active', true)
      if (error) throw error
      if (!count) throw new BadRequest('Add at least one ticket before publishing.')
    }
    update.status = to
  }
  if (!Object.keys(update).length) throw new BadRequest('Nothing to change.')

  const { data, error } = await db.from('events').update(update).eq('id', current.id).select('id, slug, status').single()
  if (error?.code === '23505') return NextResponse.json({ error: 'Another event already uses that address.' }, { status: 409 })
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: update.status && update.status !== current.status ? `event.${update.status}` : 'event.updated',
    entityType: 'event', entityId: data.slug, actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { fields: Object.keys(update) } })
  return NextResponse.json({ event: data })
})

/** Deletes a draft that never sold anything. */
export const DELETE = handle('admin.events.delete', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  if (!ID.test(params.id)) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const { data, error } = await staff.supabase.from('events').delete().eq('id', params.id).eq('tenant_id', staff.tenant.tenantId).eq('status', 'draft').select('slug').maybeSingle()
  if (error?.code === '23503') return NextResponse.json({ error: 'This event has had buyers, so it’s kept. Cancel it instead.' }, { status: 409 })
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Only draft events can be deleted.' }, { status: 409 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'event.deleted', entityType: 'event', entityId: data.slug,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req) })
  return NextResponse.json({ ok: true })
})
