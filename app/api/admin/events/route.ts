import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf } from '@/lib/api'
import { readEvent } from '@/lib/events/admin'

export const dynamic = 'force-dynamic'

/** Events, newest first, with tickets sold and checked in and the money taken. */
export const GET = handle('admin.events.list', async () => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  const tenantId = staff.tenant.tenantId
  const [events, orders, tickets] = await Promise.all([
    staff.supabase.from('events').select('id, slug, title, starts_at, venue, status, sales_paused').eq('tenant_id', tenantId).order('starts_at', { ascending: false }).limit(100),
    staff.supabase.from('ticket_orders').select('event_id, total').eq('tenant_id', tenantId).eq('status', 'confirmed').eq('payment_status', 'paid').limit(10_000),
    staff.supabase.from('tickets').select('event_id, status').eq('tenant_id', tenantId).neq('status', 'void').limit(50_000),
  ])
  if (events.error) throw events.error
  if (orders.error) throw orders.error
  if (tickets.error) throw tickets.error
  const sum = new Map<string, { sold: number; inside: number; revenue: number }>()
  const at = (id: string) => sum.get(id) ?? sum.set(id, { sold: 0, inside: 0, revenue: 0 }).get(id)!
  for (const t of tickets.data ?? []) { const s = at(t.event_id); s.sold += 1; if (t.status === 'checked_in') s.inside += 1 }
  for (const o of orders.data ?? []) at(o.event_id).revenue += Number(o.total)
  return NextResponse.json({
    events: (events.data ?? []).map((e) => ({ ...e, ...(sum.get(e.id) ?? { sold: 0, inside: 0, revenue: 0 }) })),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/** A new event, as a draft. Tiers are added on its page; publishing puts it on sale. */
export const POST = handle('admin.events.create', async (req: NextRequest) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  if (!staff.tenant.storeId) throw new BadRequest('This business has no store yet.')
  const input = readEvent(await readJson(req, 12_000))
  const { data, error } = await staff.supabase.from('events').insert({
    ...input, tenant_id: staff.tenant.tenantId, store_id: staff.tenant.storeId, status: 'draft', created_by: staff.userId,
  }).select('id, slug').single()
  if (error?.code === '23505') return NextResponse.json({ error: 'Another event already uses that address.' }, { status: 409 })
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: 'event.created', entityType: 'event', entityId: data.slug,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { title: input.title, startsAt: input.starts_at } })
  return NextResponse.json({ event: data }, { status: 201 })
})
