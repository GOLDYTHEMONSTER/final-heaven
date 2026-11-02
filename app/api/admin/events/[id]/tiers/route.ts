import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, readJson, requestIdOf, text } from '@/lib/api'
import { readTier } from '@/lib/events/admin'

export const dynamic = 'force-dynamic'

const ID = /^[0-9a-f-]{36}$/

/** Adds a ticket tier to an event. */
export const POST = handle('admin.events.tiers.create', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  if (!ID.test(params.id)) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const tier = readTier(await readJson(req, 4_000))
  // RLS and the (tenant_id, event_id) foreign key keep the tier in this tenant's event.
  const { data, error } = await staff.supabase.from('ticket_types').insert({ ...tier, tenant_id: staff.tenant.tenantId, event_id: params.id }).select('id').single()
  if (error?.code === '23503') return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: 'ticket_type.created', entityType: 'event', entityId: params.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { name: tier.name, price: tier.price, capacity: tier.capacity } })
  return NextResponse.json({ tier: data }, { status: 201 })
})

/** Edits a tier: name, price, capacity, order or on sale. Tickets already sold keep the price they were bought at. */
export const PUT = handle('admin.events.tiers.update', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  const body = await readJson(req, 4_000)
  const tierId = text(body.id, 'Ticket', { max: 40, required: true })!
  if (!ID.test(params.id) || !ID.test(tierId)) throw new BadRequest('Ticket not found.')
  const tier = readTier(body)
  const { data, error } = await staff.supabase.from('ticket_types').update(tier).eq('id', tierId).eq('event_id', params.id).select('id').maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'ticket_type.updated', entityType: 'event', entityId: params.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { tier: tierId, name: tier.name, price: tier.price, capacity: tier.capacity, active: tier.active } })
  return NextResponse.json({ ok: true })
})
