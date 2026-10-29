import { NextResponse } from 'next/server'
import { getStaffContext } from '@/lib/auth'
import { handle } from '@/lib/api'
import { studioLink } from '@/lib/admin/paths'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
// Table not there yet (code deployed before the database update): say so instead of failing.
const missing = (e: { code?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202')

/**
 * The live activity feed for the signed-in staff member: recent events, how
 * many are unread, and the counts behind the nav badges. RLS limits each
 * event to staff holding the permission it names, so different roles see
 * different feeds from the same table.
 */
export const GET = handle('admin.activity', async () => {
  const staff = await getStaffContext()
  if (!staff) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const tenant = staff.tenant.tenantId
  const db = staff.supabase

  const [items, seen, toFulfil, openMessages] = await Promise.all([
    db.from('activity_feed').select('id, occurred_at, kind, title, detail, link')
      .eq('tenant_id', tenant).order('occurred_at', { ascending: false }).limit(40),
    db.from('activity_seen').select('last_seen_at').eq('tenant_id', tenant).eq('user_id', staff.userId).maybeSingle(),
    staff.can('orders.read')
      ? db.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).in('status', ['confirmed', 'processing'])
      : null,
    staff.can('customers.read')
      ? db.from('contact_messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant).eq('status', 'open')
      : null,
  ])
  if (missing(items.error)) {
    return NextResponse.json({ items: [], lastSeenAt: null, unread: 0, available: false,
      badges: { ordersToFulfil: toFulfil?.count ?? null, openMessages: openMessages?.count ?? null } }, { headers: NO_STORE })
  }
  if (items.error) throw items.error
  if (seen.error) throw seen.error
  if (toFulfil?.error) throw toFulfil.error
  if (openMessages?.error) throw openMessages.error

  const lastSeenAt: string | null = seen.data?.last_seen_at ?? null
  const seenMs = lastSeenAt ? Date.parse(lastSeenAt) : 0
  const rows = (items.data ?? []).map((r) => ({ ...r, link: studioLink(r.link) }))
  return NextResponse.json({
    items: rows,
    lastSeenAt,
    available: true,
    unread: rows.filter((r) => Date.parse(r.occurred_at) > seenMs).length,
    badges: { ordersToFulfil: toFulfil?.count ?? null, openMessages: openMessages?.count ?? null },
  }, { headers: NO_STORE })
})

/** Marks everything up to now as seen, for this staff member only. */
export const POST = handle('admin.activity.seen', async () => {
  const staff = await getStaffContext()
  if (!staff) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { error } = await staff.supabase.rpc('mark_activity_seen', { p_tenant: staff.tenant.tenantId })
  if (error && !missing(error)) throw error
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
})
