import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { BadRequest, handle, int, readJson, requestIdOf, text } from '@/lib/api'
import { newDoorSecret } from '@/lib/events/store'
import { qrSvg } from '@/lib/events/qr'
import { siteUrl } from '@/lib/payments'

export const dynamic = 'force-dynamic'

const ID = /^[0-9a-f-]{36}$/

/**
 * A door link for helpers without Studio accounts: it checks tickets in for
 * this event only, until it expires or is revoked. The link (and its QR code)
 * is shown once, now; only its hash is kept.
 */
export const POST = handle('admin.events.door_links.create', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  if (!ID.test(params.id)) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  const body = await readJson(req, 2_000)
  const label = text(body.label, 'Name', { max: 60, required: true })!
  const { data: event, error: ee } = await staff.supabase.from('events').select('id, starts_at, ends_at, status').eq('id', params.id).maybeSingle()
  if (ee) throw ee
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  if (event.status === 'cancelled') throw new BadRequest('This event is cancelled.')
  // Until 12 hours after the event (its end, or its start when no end is set) unless asked otherwise.
  const hours = body.hours === '' || body.hours == null ? null : int(body.hours, 'Hours', { min: 1, max: 24 * 14 })
  const expiresAt = hours
    ? new Date(Date.now() + hours * 3_600_000)
    : new Date(new Date(event.ends_at ?? event.starts_at).getTime() + 12 * 3_600_000)
  if (expiresAt.getTime() <= Date.now()) throw new BadRequest('This event is over. Give the link a number of hours.')

  const { secret, hash } = newDoorSecret()
  const { data, error } = await staff.supabase.from('event_door_links').insert({
    tenant_id: staff.tenant.tenantId, event_id: event.id, label, token_hash: hash, expires_at: expiresAt.toISOString(), created_by: staff.userId,
  }).select('id, label, expires_at').single()
  if (error) throw error
  await audit({ tenantId: staff.tenant.tenantId, action: 'door_link.created', entityType: 'event', entityId: event.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { label, expiresAt: data.expires_at } })
  const url = `${siteUrl(req).replace(/\/$/, '')}/door/${secret}`
  return NextResponse.json({ link: data, url, qr: await qrSvg(url) }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
})

/** Revokes a door link: { id }. Phones holding it stop working on their next scan. */
export const PUT = handle('admin.events.door_links.revoke', async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { staff, denied } = await requirePermission('events.manage')
  if (denied) return denied
  const body = await readJson(req, 1_000)
  const linkId = text(body.id, 'Door link', { max: 40, required: true })!
  if (!ID.test(params.id) || !ID.test(linkId)) throw new BadRequest('Door link not found.')
  const { data, error } = await staff.supabase.from('event_door_links').update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId).eq('event_id', params.id).is('revoked_at', null).select('label').maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: 'Door link not found, or already revoked.' }, { status: 404 })
  await audit({ tenantId: staff.tenant.tenantId, action: 'door_link.revoked', entityType: 'event', entityId: params.id,
    actor: { type: 'user', userId: staff.userId }, requestId: requestIdOf(req), metadata: { label: data.label } })
  return NextResponse.json({ ok: true })
})
